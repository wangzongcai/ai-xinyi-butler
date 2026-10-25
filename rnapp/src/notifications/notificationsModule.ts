// =====================================================================
// expo-notifications 的运行时取用口（2026-10-25）
//
// 背景：`expo-notifications` 的 index 会静态导入 topicSubscription，
// 而它在 Android 上直接 requireNativeModule('ExpoTopicSubscriptionModule')。
// Expo Go 的 Android 二进制里没有这个原生模块（只有本地通知那一套），
// 于是静态 `import * as Notifications from 'expo-notifications'` 在模块初始化
// 阶段就抛错，且是在渲染树之外抛的 —— 表现为整屏红字 / 白屏，App 根本起不来。
//
// 做法：全工程只在这里取模块，导入失败就返回 null，上层按「当前环境没有通知能力」
// 降级（历史记录、界面等照常）。正式 APK 里原生模块存在，行为与原先一致。
// =====================================================================

export type NotificationsModule = typeof import('expo-notifications');

// Metro 打包器会注入 require；这里显式声明，避免依赖 Node 类型
declare const require: (id: string) => unknown;

let cached: NotificationsModule | null = null;
let resolved = false;

/** 取 expo-notifications；当前环境不支持时返回 null（只会真正尝试一次）。 */
export function getNotifications(): NotificationsModule | null {
  if (!resolved) {
    resolved = true;
    try {
      // 必须用 require 而不是静态 import：静态 import 的抛错发生在模块初始化，
      // 调用方无从捕获，整个 bundle 直接失败。
      cached = require('expo-notifications') as NotificationsModule;
    } catch (e) {
      cached = null;
      // 用 log 而不是 warn：warn/error 会被 LogBox 弹成浮层挡住点击，
      // 而「Expo Go 没有这个原生模块」是预期内的环境差异，不值得打断用户。
      console.log(
        '[notifications] 当前环境没有通知原生模块（Expo Go 常见），通知相关功能已跳过：',
        e instanceof Error ? e.message : e,
      );
    }
  }
  return cached;
}
