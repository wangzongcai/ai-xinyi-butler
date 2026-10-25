-- =====================================================================
-- 云同步服务端表结构（M12，2026-10-25）
--
-- 设计要点：
--   * 每行带 user_id（默认 auth.uid()）+ RLS，用户只能读写自己的数据。
--   * 业务外键与本地 SQLite 行为一致：person 删除时 anniversary/trait 级联，
--     history/prepare_record 的 person_id 置空保留。用复合外键 (user_id, person_id)
--     防止引用到别人的对象。
--   * 删除用墓碑表 sync_tombstone 表达（AFTER DELETE 触发器写入）：
--     Supabase Realtime 的 DELETE 事件在 RLS 下拿不到 user_id，不能用它做多租户同步。
--   * 复活守卫：已被彻底删除的行，任何延迟到达的旧数据都写不回来。
--   * 不加 moddatetime/now() 触发器覆盖 updated_at —— 那会把「最新生效」变成
--     「最后到达者生效」，离线旧编辑会盖掉新编辑。只做「客户端时钟最多领先 5 分钟」的钳制。
--   * 全部语句可重复执行（IF NOT EXISTS / DROP ... IF EXISTS / DO 块）。
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. 公共触发器函数
-- ---------------------------------------------------------------------

-- 记录服务端接收时间；并把客户端可能错乱的 updated_at 钳到「now + 5 分钟」。
-- 另外拒绝「更旧覆盖更新」：两台设备并发时，迟到但更旧的编辑不能盖掉新值。
-- 这是最后一道防线——客户端推送前已做 LWW，但推送在途期间别的设备可能已写入更新值。
create or replace function public.sync_touch_meta()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE' and new.updated_at is not null and old.updated_at is not null
     and new.updated_at < old.updated_at then
    return null;  -- 静默丢弃这次更旧的写入
  end if;
  new.server_received_at := now();
  if new.updated_at is null then
    new.updated_at := now();
  elsif new.updated_at > now() + interval '5 minutes' then
    new.updated_at := now() + interval '5 minutes';
  end if;
  return new;
end;
$$;

-- 物理删除时写墓碑（触发器以表所有者身份运行，绕过 RLS）
create or replace function public.sync_write_tombstone()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_table text;
begin
  v_table := case tg_table_name when 'prepare_record' then 'prepare' else tg_table_name end;
  insert into public.sync_tombstone (user_id, table_name, row_id, deleted_at)
  values (old.user_id, v_table, old.id, now())
  on conflict (user_id, table_name, row_id) do nothing;
  return old;
end;
$$;

-- 复活守卫：已彻底删除的行不允许再被插入/更新回来
create or replace function public.sync_block_resurrection()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_table text;
begin
  v_table := case tg_table_name when 'prepare_record' then 'prepare' else tg_table_name end;
  if exists (
    select 1 from public.sync_tombstone
    where user_id = new.user_id and table_name = v_table and row_id = new.id
  ) then
    return null;
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- 2. 业务表
-- ---------------------------------------------------------------------

create table if not exists public.person (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null,
  relationship text not null default '',
  -- 历史列：生日已并入 anniversary，仅为兼容旧数据保留
  birthday text,
  birthday_calendar text not null default 'solar' check (birthday_calendar in ('solar', 'lunar')),
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  origin_device_id uuid,
  server_received_at timestamptz not null default now(),
  -- 供子表复合外键引用
  unique (user_id, id)
);

create table if not exists public.anniversary (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  person_id uuid not null,
  name text not null,
  -- 只存「月-日」，每年重复；不能用 PG date 类型
  date text not null check (date ~ '^[0-9]{2}-[0-9]{2}$'),
  calendar text not null default 'solar' check (calendar in ('solar', 'lunar')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  origin_device_id uuid,
  server_received_at timestamptz not null default now(),
  foreign key (user_id, person_id) references public.person (user_id, id) on delete cascade
);

create table if not exists public.trait (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  person_id uuid not null,
  content text not null check (char_length(content) <= 50),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  origin_device_id uuid,
  server_received_at timestamptz not null default now(),
  foreign key (user_id, person_id) references public.person (user_id, id) on delete cascade
);

create table if not exists public.history (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  person_id uuid,
  name text not null,
  date text not null,
  status text not null default '未送' check (status in ('未送', '已送', '已过期')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  origin_device_id uuid,
  server_received_at timestamptz not null default now(),
  -- 对象彻底清除时保留记录，只把 person_id 置空（PG15+ 支持指定置空列）
  foreign key (user_id, person_id) references public.person (user_id, id)
    on delete set null (person_id)
);

-- 心意准备。表名避开 PG 关键字 prepare，本地仍叫 prepare（见 src/sync/mappers.ts）
create table if not exists public.prepare_record (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  scene text not null check (scene in ('contact', 'holiday')),
  person_id uuid,
  festival_code text,
  blessings jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  origin_device_id uuid,
  server_received_at timestamptz not null default now(),
  foreign key (user_id, person_id) references public.person (user_id, id)
    on delete set null (person_id)
);

-- 设置：每个用户一行。只存可同步字段；
-- notification_permission / privacy_consent_at 是本机状态，不上云。
create table if not exists public.user_settings (
  user_id uuid primary key references auth.users (id) on delete cascade,
  advance_days integer not null default 3 check (advance_days between 0 and 30),
  blessing_count integer not null default 3 check (blessing_count between 1 and 5),
  ecommerce_platform text not null default '淘宝' check (ecommerce_platform in ('淘宝', '京东')),
  card_signature boolean not null default false,
  festival_followed jsonb not null default '{}'::jsonb,
  reminder_hour integer not null default 9 check (reminder_hour between 0 and 23),
  reminder_minute integer not null default 0 check (reminder_minute between 0 and 59),
  gift_enabled boolean not null default true,
  card_enabled boolean not null default true,
  signature_text text,
  updated_at timestamptz not null default now(),
  origin_device_id uuid,
  server_received_at timestamptz not null default now()
);

-- 墓碑：彻底删除是终态，永久保留（只有 id + 时间，体积很小；清理会让离线设备复活数据）
create table if not exists public.sync_tombstone (
  user_id uuid not null references auth.users (id) on delete cascade,
  table_name text not null check (table_name in ('person', 'anniversary', 'trait', 'history', 'prepare')),
  row_id uuid not null,
  deleted_at timestamptz not null default now(),
  origin_device_id uuid,
  primary key (user_id, table_name, row_id)
);

-- ---------------------------------------------------------------------
-- 3. 索引与唯一约束
-- ---------------------------------------------------------------------

create index if not exists idx_person_user on public.person (user_id);
create index if not exists idx_person_user_updated on public.person (user_id, updated_at);
create index if not exists idx_anniversary_user on public.anniversary (user_id);
create index if not exists idx_anniversary_person on public.anniversary (user_id, person_id);
create index if not exists idx_trait_user on public.trait (user_id);
create index if not exists idx_trait_person on public.trait (user_id, person_id);
create index if not exists idx_history_user on public.history (user_id);
create index if not exists idx_history_person on public.history (user_id, person_id);
create index if not exists idx_prepare_user on public.prepare_record (user_id);
create index if not exists idx_tombstone_user on public.sync_tombstone (user_id);

-- 与本地业务键对齐：同一对象的同一天只有一条记录
create unique index if not exists uq_history_user_person_name
  on public.history (user_id, person_id, name) nulls not distinct;

-- 同一「场景 + 收件人 + 节日」只保留一条祝福内容
create unique index if not exists uq_prepare_key
  on public.prepare_record (user_id, scene, person_id, festival_code) nulls not distinct;

-- ---------------------------------------------------------------------
-- 4. 触发器
-- ---------------------------------------------------------------------

do $$
declare
  t text;
  business_tables text[] := array['person', 'anniversary', 'trait', 'history', 'prepare_record'];
begin
  foreach t in array business_tables
  loop
    execute format('drop trigger if exists trg_%s_touch_meta on public.%I', t, t);
    execute format(
      'create trigger trg_%s_touch_meta before insert or update on public.%I
         for each row execute function public.sync_touch_meta()', t, t);
    execute format('drop trigger if exists trg_%s_resurrection on public.%I', t, t);
    execute format(
      'create trigger trg_%s_resurrection before insert or update on public.%I
         for each row execute function public.sync_block_resurrection()', t, t);
    execute format('drop trigger if exists trg_%s_tombstone on public.%I', t, t);
    execute format(
      'create trigger trg_%s_tombstone after delete on public.%I
         for each row execute function public.sync_write_tombstone()', t, t);
  end loop;

  execute 'drop trigger if exists trg_user_settings_touch_meta on public.user_settings';
  execute 'create trigger trg_user_settings_touch_meta before insert or update on public.user_settings
             for each row execute function public.sync_touch_meta()';
end $$;

-- ---------------------------------------------------------------------
-- 5. RLS 与权限
-- ---------------------------------------------------------------------

do $$
declare
  t text;
  owned_tables text[] := array['person', 'anniversary', 'trait', 'history', 'prepare_record', 'user_settings'];
begin
  foreach t in array owned_tables
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_owner', t);
    execute format(
      'create policy %I on public.%I for all to authenticated
         using (user_id = (select auth.uid()))
         with check (user_id = (select auth.uid()))', t || '_owner', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end $$;

-- 墓碑只读：客户端不能伪造/清除墓碑（写入只由 SECURITY DEFINER 触发器完成）
alter table public.sync_tombstone enable row level security;
drop policy if exists sync_tombstone_owner on public.sync_tombstone;
create policy sync_tombstone_owner on public.sync_tombstone for select to authenticated
  using (user_id = (select auth.uid()));
revoke all on public.sync_tombstone from anon, authenticated;
grant select on public.sync_tombstone to authenticated;

-- ---------------------------------------------------------------------
-- 6. Realtime：把表加入 supabase_realtime publication
--    （config.toml 的 [realtime] 只影响本地；远端项目需在 Dashboard 开启 Realtime）
-- ---------------------------------------------------------------------

do $$
declare
  t text;
  realtime_tables text[] := array[
    'person', 'anniversary', 'trait', 'history', 'prepare_record', 'user_settings', 'sync_tombstone'
  ];
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array realtime_tables
    loop
      if not exists (
        select 1 from pg_publication_tables
        where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
      ) then
        execute format('alter publication supabase_realtime add table public.%I', t);
      end if;
    end loop;
  end if;
end $$;
