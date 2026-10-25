// generate-card-image：生成电子贺卡的 AI 背景图（M9-01 / M9-02）
// 调用方必须携带用户自己的 JWT（Authorization: Bearer <access_token>）。
// 用 fetch 调火山引擎方舟 Seedream 5.0 flash，30 秒超时 + 失败重试 1 次。
// ARK_API_KEY 只存服务端环境变量，不下发客户端、不入库。
// 输出固定 3:4 竖版（1728x2304）。
//
// 背景图上云（2026-10-25）：方舟返回的临时 URL 会过期，生成后立即下载并以
// <user_id>/<prepare_id>.jpg 存进私有桶 card-backgrounds，返回 backgroundPath。
// 客户端把 path 写进 prepare_record（纳入同步），重装/换机靠签名 URL 直接取回原图。
// 提示词构建在 ./prompt.ts，与本地出图测试脚本共用同一份。
import "@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "@supabase/server";
import { buildPrompt, type CardInput } from "./prompt.ts";

const ARK_URL = "https://ark.cn-beijing.volces.com/api/v3/images/generations";
const ARK_MODEL = "doubao-seedream-5-0-flash-260915";
const TIMEOUT_MS = 30_000;
const DOWNLOAD_TIMEOUT_MS = 20_000; // 下载方舟图片再转存的超时
const MAX_ATTEMPTS = 2; // 初试 + 失败重试 1 次
const CARD_SIZE = "1728x2304"; // 3:4 竖版（Seedream 5.0 的 2K 档 3:4 参考尺寸）
const BUCKET = "card-backgrounds";

/** 请求体：提示词入参 + 用于确定存储路径的 prepareId。 */
type RequestInput = CardInput & { prepareId?: string };

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

interface ArkResponse {
  data?: { url?: string; b64_json?: string }[];
  error?: { code?: string; message?: string };
}

/** 请求一次 Seedream，成功返回图片 URL；失败抛错。 */
async function requestCardImage(apiKey: string, prompt: string): Promise<string> {
  const body = {
    model: ARK_MODEL,
    prompt,
    response_format: "url",
    size: CARD_SIZE,
    stream: false,
    // 关闭模型自带水印：贺卡的 App 水印由客户端叠加，服务端水印会压在画面上且位置不可控
    watermark: false,
  };
  const resp = await fetchWithTimeout(
    ARK_URL,
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

  const text = await resp.text().catch(() => "");
  if (!resp.ok) {
    throw new Error(`Seedream ${resp.status}: ${text.slice(0, 300)}`);
  }

  let data: ArkResponse;
  try {
    data = JSON.parse(text) as ArkResponse;
  } catch {
    throw new Error("Seedream 返回不是合法 JSON");
  }
  const url = data.data?.[0]?.url;
  if (!url || typeof url !== "string") {
    const detail = data.error?.message ? `：${data.error.message}` : "";
    throw new Error(`Seedream 返回缺少图片地址${detail}`);
  }
  return url;
}

export default {
  fetch: withSupabase({ auth: "user" }, async (req, ctx) => {
    if (req.method !== "POST") {
      return Response.json({ message: "仅支持 POST" }, { status: 405 });
    }

    let input: RequestInput;
    try {
      input = (await req.json()) as RequestInput;
    } catch {
      return Response.json({ message: "请求体不是合法 JSON" }, { status: 400 });
    }

    const apiKey = Deno.env.get("ARK_API_KEY");
    if (!apiKey) {
      console.error("generate-card-image: 缺少 ARK_API_KEY");
      return Response.json({ message: "服务端缺少火山方舟配置" }, { status: 500 });
    }

    const prompt = buildPrompt(input);
    // 记录关键入参，出图不对时便于判断是「没传对场景」还是「提示词不灵」
    console.log("generate-card-image 入参", JSON.stringify(input));
    const userId = ctx.userClaims?.id;
    let lastError: unknown = null;
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      try {
        const imageUrl = await requestCardImage(apiKey, prompt);

        // 转存到私有桶：路径 <uid>/<prepareId>.jpg，policy 按首段判归属。
        // 存失败不影响本次出图（客户端仍能用临时 URL 预览），但要记日志便于排查。
        let backgroundPath: string | null = null;
        if (userId && input.prepareId) {
          const path = `${userId}/${input.prepareId}.jpg`;
          try {
            const img = await fetchWithTimeout(imageUrl, {}, DOWNLOAD_TIMEOUT_MS);
            if (!img.ok) throw new Error(`下载方舟图片失败 ${img.status}`);
            const bytes = await img.blob();
            const { error } = await ctx.supabase.storage.from(BUCKET).upload(path, bytes, {
              contentType: "image/jpeg",
              // 覆盖写：「换一张背景」复用同一路径；缓存 0 秒避免 CDN 返回旧图
              upsert: true,
              cacheControl: "0",
            });
            if (error) throw new Error(error.message);
            backgroundPath = path;
          } catch (e) {
            console.error("generate-card-image 背景图转存失败", e);
          }
        }

        return Response.json({ imageUrl, backgroundPath });
      } catch (e) {
        lastError = e;
        console.warn(`generate-card-image 第 ${attempt + 1} 次尝试失败`, e);
        // 重试前稍等，避免瞬时限流被连续命中
        if (attempt < MAX_ATTEMPTS - 1) {
          await new Promise((resolve) => setTimeout(resolve, 800));
        }
      }
    }
    console.error("generate-card-image 最终失败", lastError);
    return Response.json({ message: "生成贺卡背景失败，请稍后再试" }, { status: 502 });
  }),
};
