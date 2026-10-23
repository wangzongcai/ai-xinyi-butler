# 项目规则

开始任何工作之前，都要完整阅读项目里的 constitution.md，后续所有工作都不能违反其中的原则。

## App 工程位置

- 手机 App（Expo / React Native）工程在根目录下的 `rnapp/` 文件夹内，不要忘记这个位置。
- 进入 rnapp 目录后：`npx expo start` 启动开发服务器（Expo Go 扫码预览，局域网默认）。
- 路由按 expo-router 文件路由组织在 `rnapp/app/`，非路由代码放在 `rnapp/src/`；配色/字体令牌在 `rnapp/src/theme.ts`。
- 常用命令：`npx expo install <pkg>` 装依赖、`npx tsc --noEmit` 类型检查、`npx expo-doctor` 诊断。
- 开发前先读 `rnapp/AGENTS.md`（Expo 相关注意事项）。
