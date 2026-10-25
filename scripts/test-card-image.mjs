// =====================================================================
// 本地出图测试：直接调火山方舟 Seedream，把不同场景的贺卡背景图存到 test_pic/
// 与 Edge Function 共用 supabase/functions/generate-card-image/prompt.ts，
// 线上提示词改了什么，这里就测什么。
//
// 用法（PowerShell，Key 只放在进程环境变量里，不落文件、不进仓库）：
//   $env:ARK_API_KEY = "ark-..."
//   node scripts/test-card-image.mjs
// =====================================================================
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildPrompt } from "../supabase/functions/generate-card-image/prompt.ts";

const ARK_URL = "https://ark.cn-beijing.volces.com/api/v3/images/generations";
const ARK_MODEL = "doubao-seedream-5-0-flash-260915";
const CARD_SIZE = "1728x2304";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = join(ROOT, "test_pic");

/** 每个用例就是一个真实的贺卡场景。 */
const CASES = [
  { name: "01-春节", input: { scene: "festival", festivalCode: "spring_festival", festivalName: "春节", relationship: "妈妈" } },
  { name: "02-中秋", input: { scene: "festival", festivalCode: "mid_autumn", festivalName: "中秋节", relationship: "长辈" } },
  { name: "03-圣诞", input: { scene: "festival", festivalCode: "christmas", festivalName: "圣诞节", relationship: "朋友" } },
  { name: "04-端午", input: { scene: "festival", festivalCode: "dragon_boat", festivalName: "端午节" } },
  { name: "05-生日", input: { scene: "birthday", relationship: "女朋友" } },
  { name: "06-结婚纪念日", input: { scene: "anniversary", anniversaryName: "结婚纪念日", relationship: "妻子" } },
];

const apiKey = process.env.ARK_API_KEY;
if (!apiKey) {
  console.error("缺少 ARK_API_KEY：先 $env:ARK_API_KEY = \"ark-...\" 再运行");
  process.exit(1);
}

async function generate(input) {
  const prompt = buildPrompt(input);
  const resp = await fetch(ARK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: ARK_MODEL,
      prompt,
      response_format: "url",
      size: CARD_SIZE,
      stream: false,
      watermark: false,
    }),
    signal: AbortSignal.timeout(120_000),
  });
  const text = await resp.text();
  if (!resp.ok) throw new Error(`Seedream ${resp.status}: ${text.slice(0, 300)}`);
  const data = JSON.parse(text);
  const url = data.data?.[0]?.url;
  if (!url) throw new Error(`返回缺少图片地址：${text.slice(0, 300)}`);
  const img = await fetch(url, { signal: AbortSignal.timeout(120_000) });
  if (!img.ok) throw new Error(`下载图片失败 ${img.status}`);
  const type = img.headers.get("content-type") ?? "";
  const ext = type.includes("png") ? "png" : "jpg";
  return { prompt, buffer: Buffer.from(await img.arrayBuffer()), ext };
}

await mkdir(OUT_DIR, { recursive: true });

for (const c of CASES) {
  const startedAt = Date.now();
  try {
    const { prompt, buffer, ext } = await generate(c.input);
    const file = join(OUT_DIR, `${c.name}.${ext}`);
    await writeFile(file, buffer);
    console.log(`✅ ${c.name}  ${Math.round((Date.now() - startedAt) / 1000)}s  ${(buffer.length / 1024 / 1024).toFixed(2)}MB  -> ${file}`);
    console.log(`   prompt: ${prompt.replace(/\n/g, " ").slice(0, 120)}…`);
  } catch (e) {
    console.error(`❌ ${c.name} 失败：${e instanceof Error ? e.message : e}`);
  }
  // 顺序跑，避免瞬间并发触发方舟限流
  await new Promise((r) => setTimeout(r, 1500));
}
