// =====================================================================
// expo-media-library 的运行时取用口（2026-10-25，Expo Go 兼容）
//
// Expo Go 的 Android 二进制里没有 SDK 57 的新相册模块 ExpoMediaLibraryNext，
// 静态 `import * as MediaLibrary from 'expo-media-library'` 会在模块初始化阶段
// 直接抛错，整个 bundle 加载失败（表现为整屏红字，且栈顶指向引用它的页面）。
// 与 notificationsModule 同一套做法：取不到就返回 null，上层降级。
// =====================================================================

export type MediaLibraryModule = typeof import('expo-media-library');

// Metro 打包器会注入 require；这里显式声明，避免依赖 Node 类型
declare const require: (id: string) => unknown;

let cached: MediaLibraryModule | null = null;
let resolved = false;

/** 取 expo-media-library；当前环境不支持时返回 null（只会真正尝试一次）。 */
export function getMediaLibrary(): MediaLibraryModule | null {
  if (!resolved) {
    resolved = true;
    try {
      // 必须用 require 而不是静态 import：静态 import 的抛错发生在模块初始化，
      // 调用方无从捕获，整个 bundle 直接失败。
      cached = require('expo-media-library') as MediaLibraryModule;
    } catch (e) {
      cached = null;
      // 用 log 而不是 warn：warn/error 会被 LogBox 弹成浮层挡住点击，
      // 而「Expo Go 没有这个原生模块」是预期内的环境差异。
      console.log(
        '[media-library] 当前环境没有相册原生模块（Expo Go 常见），存相册功能已跳过：',
        e instanceof Error ? e.message : e,
      );
    }
  }
  return cached;
}
