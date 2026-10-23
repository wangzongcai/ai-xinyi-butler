// delete-account：删除当前登录用户自己的账号
// 调用方必须携带用户自己的 JWT（Authorization: Bearer <access_token>）。
// 业务数据（心意对象等）都在本机，服务端只删 auth.users 里的身份。
import "@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "@supabase/server";

export default {
  // auth: 'user' 会用项目 JWKS 校验 JWT，并把 caller 身份放进 ctx.userClaims
  fetch: withSupabase({ auth: "user" }, async (req, ctx) => {
    if (req.method !== "POST") {
      return Response.json({ message: "仅支持 POST" }, { status: 405 });
    }

    // 只允许删自己：用户 id 只从已验证的 JWT 里取，绝不接受请求体传 id
    const userId = ctx.userClaims?.id;
    if (!userId) {
      return Response.json({ message: "未登录或登录已过期" }, { status: 401 });
    }

    const { error } = await ctx.supabaseAdmin.auth.admin.deleteUser(userId);
    if (error) {
      console.error("delete-account 失败", { userId, message: error.message });
      return Response.json({ message: "删除账号失败，请稍后再试" }, { status: 500 });
    }

    return Response.json({ ok: true, userId });
  }),
};
