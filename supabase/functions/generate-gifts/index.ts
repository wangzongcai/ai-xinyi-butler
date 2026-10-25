// generate-gifts：生成礼物建议
// 调用方必须携带用户自己的 JWT（Authorization: Bearer <access_token>）。
// 用 fetch 调 DeepSeek REST API（OpenAI 兼容）生成礼物建议，30 秒超时 + 失败重试 1 次。
// DeepSeek API Key 从环境变量 DEEPSEEK_API_KEY 读取，只存服务端，不下发客户端、不入库。
// 固定返回 4 条（spec 功能 7：不可调），每条带名称、推荐理由与电商搜索关键词。
import "@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "@supabase/server";

const DEEPSEEK_URL = "https://api.deepseek.com/chat/completions";
const DEEPSEEK_MODEL = "deepseek-chat";
const TIMEOUT_MS = 30_000;
const MAX_ATTEMPTS = 2; // 初试 + 失败重试 1 次
const GIFT_COUNT = 4; // 固定 4 条，第一版不可调（spec）

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

interface GiftInput {
  relationship?: string;
  traits?: string[];
  scene?: string;
  festivalName?: string;
}

// M8-02：Prompt 设计——礼物与对方特征强相关、推荐理由合理、每条给电商搜索关键词。
function buildPrompt(input: GiftInput): string {
  const traits = (input.traits ?? []).filter(Boolean).slice(0, 10);
  const hasTraits = traits.length > 0;
  const relationship = input.relationship?.trim() || "在乎的人";
  const sceneText =
    input.scene === "festival"
      ? (input.festivalName ? `节日：${input.festivalName}` : "节日")
      : input.scene === "anniversary"
        ? "纪念日"
        : "生日";

  // 有特征时给特征清单并明确要求贴合；无特征时转为围绕场景推通用礼物。
  if (hasTraits) {
    return [
      `请为「${relationship}」推荐 ${GIFT_COUNT} 个适合 ${sceneText} 的礼物，打算在电商平台购买。`,
      `对方的特点：\n${traits.map((t) => `- ${t}`).join("\n")}`,
      "",
      "要求：",
      `1. 恰好 ${GIFT_COUNT} 个礼物；`,
      "2. 礼物要贴合对方特点：从特点出发做需求推理，而不是照搬关键词。例如对方「爱养花」，别直接送「花」，而应想到他可能浇水易忘，推荐「自动浇水器」。围绕特点背后的真实需求来选，推荐理由合理、不牵强；",
      "3. 如果某个特点推不出自然的礼物，不要硬凑，改为选一个稳妥通用的礼物；",
      "4. 每个礼物都要给一个用于电商搜索的简短关键词（常见叫法，便于搜到，如「电热毯」「露营灯」）；",
      "5. 四条尽量避免同类重复。",
      "",
      "只输出 JSON 对象，key 用 gifts，值为对象数组（含 name、reason、keyword 三个字段）：",
      `{"gifts":[{"name":"...","reason":"...","keyword":"..."}]}`,
    ].join("\n");
  }

  return [
    `请为「在乎的人」推荐 ${GIFT_COUNT} 个适合 ${sceneText} 的礼物，在电商平台购买送给对方，该联系人暂无更多特征信息。`,
    "",
    "要求：",
    `1. 恰好 ${GIFT_COUNT} 个礼物；`,
    `2. 围绕「${sceneText}」这个场合推通用、稳妥、不出错的礼物，不必强行关联任何特点；`,
    "3. 每个礼物都要给一个用于电商搜索的简短关键词（常见叫法，便于搜到，如「电热毯」「露营灯」）；",
    "4. 四条尽量覆盖不同价位与品类，避免同类重复。",
    "",
    "只输出 JSON 对象，key 用 gifts，值为对象数组（含 name、reason、keyword 三个字段）：",
    `{"gifts":[{"name":"...","reason":"...","keyword":"..."}]}`,
  ].join("\n");
}

interface GiftItem {
  name: string;
  reason: string;
  keyword: string;
}

/** 请求一次 DeepSeek，成功返回解析后的礼物数组；失败抛错。 */
async function requestGifts(apiKey: string, prompt: string): Promise<GiftItem[]> {
  const body = {
    model: DEEPSEEK_MODEL,
    messages: [
      { role: "system", content: "你是一位贴心的礼物顾问，熟悉电商选品。你只输出合法 JSON。" },
      { role: "user", content: prompt },
    ],
    temperature: 0.8,
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
  const parsed = JSON.parse(content) as { gifts?: unknown };
  const list = parsed.gifts;
  if (!Array.isArray(list)) throw new Error("DeepSeek 返回缺少 gifts 数组");
  return list
    .filter((x): x is GiftItem => Boolean(x) && typeof x === "object")
    .map((g) => ({
      name: String((g as GiftItem).name ?? "").trim(),
      reason: String((g as GiftItem).reason ?? "").trim(),
      keyword: String((g as GiftItem).keyword ?? "").trim(),
    }))
    .filter((g) => g.name.length > 0);
}

export default {
  fetch: withSupabase({ auth: "user" }, async (req, ctx) => {
    if (req.method !== "POST") {
      return Response.json({ message: "仅支持 POST" }, { status: 405 });
    }

    let input: GiftInput;
    try {
      input = (await req.json()) as GiftInput;
    } catch {
      return Response.json({ message: "请求体不是合法 JSON" }, { status: 400 });
    }

    // 联系人场景但没有特征时不生成，交由前端引导填写特征（M8-03）。
    if (input.scene !== "festival" && !(input.traits ?? []).some((t) => t.trim())) {
      return Response.json(
        { code: "no_traits", message: "该联系人还没有特征，建议先填写特征描述" },
        { status: 400 },
      );
    }

    const apiKey = Deno.env.get("DEEPSEEK_API_KEY");
    if (!apiKey) {
      console.error("generate-gifts: 缺少 DEEPSEEK_API_KEY");
      return Response.json({ message: "服务端缺少 DeepSeek 配置" }, { status: 500 });
    }

    const prompt = buildPrompt(input);
    let lastError: unknown = null;
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      try {
        const gifts = await requestGifts(apiKey, prompt);
        // M8-05：固定 4 条，不足则原样返回，前端会给出提示；多余截断。
        return Response.json({ gifts: gifts.slice(0, GIFT_COUNT) });
      } catch (e) {
        lastError = e;
        console.warn(`generate-gifts 第 ${attempt + 1} 次尝试失败`, e);
      }
    }
    console.error("generate-gifts 最终失败", lastError);
    return Response.json({ message: "生成礼物建议失败，请稍后再试" }, { status: 502 });
  }),
};