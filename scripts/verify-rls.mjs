// =====================================================================
// RLS / 墓碑 / 级联 黑盒校验（M12-01）
//
// 用法（在仓库根目录）：
//   $env:SUPABASE_URL="https://xxx.supabase.co"
//   $env:SUPABASE_ANON_KEY="eyJ..."
//   $env:TEST_A_EMAIL="a@example.com"
//   $env:TEST_A_PASSWORD="..."
//   $env:TEST_B_EMAIL="b@example.com"
//   $env:TEST_B_PASSWORD="..."
//   node scripts/verify-rls.mjs
//
// 需要先在 Supabase 里注册两个测试账号（邮箱+密码）。
// 校验项：
//   1. A 写入的行 B 读不到
//   2. B 改/删 A 的行影响 0 行
//   3. B 伪造 user_id=A 插入被拒
//   4. A 删除 person → 子表级联、墓碑表写入 person 与子表墓碑
//   5. 墓碑表只读（B 看不到 A 的墓碑，客户端不能伪造）
// =====================================================================

const URL = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_ANON_KEY;
const users = {
  A: { email: process.env.TEST_A_EMAIL, password: process.env.TEST_A_PASSWORD },
  B: { email: process.env.TEST_B_EMAIL, password: process.env.TEST_B_PASSWORD },
};

if (!URL || !KEY || !users.A.email || !users.B.email) {
  console.error('缺少环境变量：SUPABASE_URL / SUPABASE_ANON_KEY / TEST_A_* / TEST_B_*');
  process.exit(1);
}

let failures = 0;

function check(name, ok, detail = '') {
  const mark = ok ? 'PASS' : 'FAIL';
  if (!ok) failures += 1;
  console.log(`[${mark}] ${name}${detail ? ` —— ${detail}` : ''}`);
}

async function signIn({ email, password }) {
  const res = await fetch(`${URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`登录失败(${email}): ${JSON.stringify(data)}`);
  return { token: data.access_token, userId: data.user.id };
}

function rest(token, path, init = {}) {
  return fetch(`${URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: KEY,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });
}

async function upsertPerson(token, row) {
  return rest(token, 'person?on_conflict=id', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
    body: JSON.stringify(row),
  });
}

async function main() {
  const A = await signIn(users.A);
  const B = await signIn(users.B);
  console.log(`A=${A.userId}\nB=${B.userId}\n`);

  const personId = crypto.randomUUID();
  const anniversaryId = crypto.randomUUID();
  const now = new Date().toISOString();

  // 1) A 写入
  const created = await upsertPerson(A.token, {
    id: personId,
    user_id: A.userId,
    name: 'RLS 校验对象',
    relationship: '测试',
    created_at: now,
    updated_at: now,
    origin_device_id: crypto.randomUUID(),
  });
  check('A 可以写入自己的 person', created.ok, `${created.status} ${await created.text()}`);

  // 2) B 读不到
  const readByB = await rest(B.token, `person?id=eq.${personId}&select=id`);
  const readRows = await readByB.json();
  check('B 读不到 A 的行', Array.isArray(readRows) && readRows.length === 0, JSON.stringify(readRows));

  // 3) B 改/删 A 的行
  const updateByB = await rest(B.token, `person?id=eq.${personId}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({ name: '被 B 改了' }),
  });
  const updated = await updateByB.json();
  check('B 改不动 A 的行', Array.isArray(updated) && updated.length === 0, JSON.stringify(updated));

  const deleteByB = await rest(B.token, `person?id=eq.${personId}`, {
    method: 'DELETE',
    headers: { Prefer: 'return=representation' },
  });
  const deleted = await deleteByB.json();
  check('B 删不掉 A 的行', Array.isArray(deleted) && deleted.length === 0, JSON.stringify(deleted));

  // 4) B 伪造 user_id=A 插入
  const forged = await upsertPerson(B.token, {
    id: crypto.randomUUID(),
    user_id: A.userId,
    name: '伪造',
    relationship: '伪造',
    created_at: now,
    updated_at: now,
  });
  check('B 伪造 user_id 写入被拒', !forged.ok, `status=${forged.status}`);

  // 5) 子表：A 写入 anniversary 后删除 person，验证级联与墓碑
  const childRes = await rest(A.token, 'anniversary?on_conflict=id', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
    body: JSON.stringify({
      id: anniversaryId,
      user_id: A.userId,
      person_id: personId,
      name: '生日',
      date: '08-08',
      calendar: 'solar',
      created_at: now,
      updated_at: now,
    }),
  });
  check('A 可以写入子表', childRes.ok, `${childRes.status} ${await childRes.text()}`);

  const delPerson = await rest(A.token, `person?id=eq.${personId}`, { method: 'DELETE' });
  check('A 删除 person 成功', delPerson.ok, `status=${delPerson.status}`);

  const childAfter = await rest(A.token, `anniversary?id=eq.${anniversaryId}&select=id`);
  const childRows = await childAfter.json();
  check('person 删除后子表被级联', Array.isArray(childRows) && childRows.length === 0, JSON.stringify(childRows));

  const tombstones = await rest(
    A.token,
    `sync_tombstone?or=(and(table_name.eq.person,row_id.eq.${personId}),and(table_name.eq.anniversary,row_id.eq.${anniversaryId}))&select=table_name,row_id`,
  );
  const tombRows = await tombstones.json();
  const hasPerson = tombRows.some((r) => r.table_name === 'person' && r.row_id === personId);
  const hasChild = tombRows.some((r) => r.table_name === 'anniversary' && r.row_id === anniversaryId);
  check('person 删除写入墓碑', hasPerson, JSON.stringify(tombRows));
  check('子表级联删除也写入墓碑', hasChild, JSON.stringify(tombRows));

  // 6) 墓碑只读：B 看不到 A 的墓碑，且不能插入
  const tombByB = await rest(B.token, `sync_tombstone?select=row_id`);
  const tombByBRows = await tombByB.json();
  check('B 看不到 A 的墓碑', Array.isArray(tombByBRows) && tombByBRows.length === 0, JSON.stringify(tombByBRows));

  const forgeTomb = await rest(B.token, 'sync_tombstone', {
    method: 'POST',
    body: JSON.stringify({
      user_id: A.userId,
      table_name: 'person',
      row_id: crypto.randomUUID(),
    }),
  });
  check('客户端不能伪造墓碑', !forgeTomb.ok, `status=${forgeTomb.status}`);

  // 7) 复活守卫：已删除的行再写入应被静默丢弃
  const resurrect = await upsertPerson(A.token, {
    id: personId,
    user_id: A.userId,
    name: '复活尝试',
    relationship: '测试',
    created_at: now,
    updated_at: new Date(Date.now() + 1000).toISOString(),
  });
  const resurrectRows = await resurrect.json().catch(() => []);
  check(
    '已彻底删除的行不能被写回（复活守卫）',
    resurrect.ok && Array.isArray(resurrectRows) && resurrectRows.length === 0,
    `${resurrect.status} ${JSON.stringify(resurrectRows)}`,
  );

  console.log(`\n失败项：${failures}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
