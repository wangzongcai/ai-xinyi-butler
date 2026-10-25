// generate-blessings：生成祝福语
// 调用方必须携带用户自己的 JWT（Authorization: Bearer <access_token>）。
// 用 fetch 调 DeepSeek REST API（OpenAI 兼容）生成祝福文案，30 秒超时 + 失败重试 1 次。
// DeepSeek API Key 从环境变量 DEEPSEEK_API_KEY 读取，只存服务端，不下发客户端、不入库。
// 业务数据（特征等）仅取必要描述，随请求以临时文本传输，服务端不留存。
import "@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "@supabase/server";

const DEEPSEEK_URL = "https://api.deepseek.com/chat/completions";
const DEEPSEEK_MODEL = "deepseek-chat";
const TIMEOUT_MS = 30_000;
const MAX_ATTEMPTS = 2; // 初试 + 失败重试 1 次

// 带超时的 fetch：用 AbortController 在指定时长后中断请求。
async function fetchWithTimeout(url: string, init: RequestInit, ms: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

interface BlessingInput {
  relationship?: string;
  traits?: string[];
  scene?: "birthday" | "anniversary" | "festival";
  festivalName?: string;
  count?: number;
}

/** 场景到语气/结构的引导文案。 */
function sceneGuide(scene: string | undefined, festivalName: string | undefined): string {
  if (scene === "anniversary") return "纪念日，回忆共同经历、强调长久与珍视";
  if (scene === "festival") return `节日（${festivalName || "节日"}），应节、喜庆、温情`;
  return "生日，祝福快乐、健康、如意，温暖自然";
}

// M7-02：Prompt 设计——每条尽可能引用对方特征，读起来像真人手写，条与条不重复。
function buildPrompt(input: BlessingInput): string {
  const count = Math.max(1, Math.min(5, input.count ?? 3));
  const traits = (input.traits ?? []).filter(Boolean).slice(0, 10);
  const traitsText =
    traits.length > 0
      ? `对方的特点：\n${traits.map((t) => `- ${t}`).join("\n")}`
      : "（暂无对方特征，写通用而真诚的祝福即可）";
  const relationship = input.relationship?.trim() || "在乎的人";
  const guide = sceneGuide(input.scene, input.festivalName);

  return [
    `请为「${relationship}」写 ${count} 条祝福语，场景：${guide}。`,
    traitsText,
    "",
    "要求：",
    `1. 恰好输出 ${count} 条，一条不多一条不少；`,
    "2. 每条都语气自然、像真人手写，不空泛、不说套话；",
    "3. 条与条之间不要重复，尽量不同角度、不同侧重；",
    "4. 每条从对方特点中选取 1-2 个关键词，围绕其背后的含义与对生活的影响来写。例如对方「爱养花」，就写花自忙活给生活添的那份安静与甜意；对方「爱吃辣子鸡」，就从红红火火这类寓意切入。不可照搬原词，也不可生硬拼凑，要让心意顺着这些特点自然流出来；",
    "5. 如果提供了对方特点，至少有一条要自然地回应某个特点；",
    "6. 不要出现“祝愿年方”“某某敬上”之类的落款。",
    "",
    "只输出 JSON 对象，key 用 blessings，值为字符串数组：",
    `{"blessings":["...","..."]}`,
  ].join("\n");
}

/** 请求一次 DeepSeek，成功返回解析后的字符串数组；失败抛错。 */
async function requestBlessings(apiKey: string, prompt: string): Promise<string[]> {
  const body = {
    model: DEEPSEEK_MODEL,
    messages: [
      { role: "system", content: "你是一位很会写信的心意助手，用词温暖、自然、真诚。你只输出合法 JSON。" },
      { role: "user", content: prompt },
    ],
    temperature: 0.9,
    response_format: { type: "json_object" },
  };
  const resp = await fetchWithTimeout(
    DEEPSEEK_URL,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    },
    TIMEOUT_MS,
  );
  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`DeepSeek ${resp.status}: ${text.slice(0, 200)}`);
  }
  const data = (await resp.json()) as { choices?: { message?: { content?: string } }[] };
  const content = data.choices?.[0]?.message?.content ?? "";
  const parsed = JSON.parse(content) as { blessings?: unknown };
  const list = parsed.blessings;
  if (!Array.isArray(list)) throw new Error("DeepSeek 返回缺少 blessings 数组");
  return list.filter((x): x is string => typeof x === "string" && x.trim().length > 0);
}

export default {
  fetch: withSupabase({ auth: "user" }, async (req, ctx) => {
    if (req.method !== "POST") {
      return Response.json({ message: "仅支持 POST" }, { status: 405 });
    }

    let input: BlessingInput;
    try {
      input = (await req.json()) as BlessingInput;
    } catch {
      return Response.json({ message: "请求体不是合法 JSON" }, { status: 400 });
    }

    // M7-03：联系人场景但没有特征时不生成，交由前端引导填写特征。
    if (input.scene !== "festival" && !(input.traits ?? []).some((t) => t.trim())) {
      return Response.json(
        { code: "no_traits", message: "该联系人还没有特征，建议先填写特征描述" },
        { status: 400 },
      );
    }

    const apiKey = Deno.env.get("DEEPSEEK_API_KEY");
    if (!apiKey) {
      console.error("generate-blessings: 缺少 DEEPSEEK_API_KEY");
      return Response.json({ message: "服务端缺少 DeepSeek 配置" }, { status: 500 });
    }

    const prompt = buildPrompt(input);
    let lastError: unknown = null;
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      try {
        const blessings = await requestBlessings(apiKey, prompt);
        // 若模型返回多于请求条数，截断到 count 以免界面数量失控
        const count = Math.max(1, Math.min(5, input.count ?? 3));
        return Response.json({ blessings: blessings.slice(0, count) });
      } catch (e) {
        lastError = e;
        // 非网络/服务错误（如模型返回无法解析）也重试一次
        console.warn(`generate-blessings 第 ${attempt + 1} 次尝试失败`, e);
      }
    }
    console.error("generate-blessings 最终失败", lastError);
    return Response.json({ message: "生成祝福失败，请稍后再试" }, { status: 502 });
  }),
};