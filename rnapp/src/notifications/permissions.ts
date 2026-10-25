// =====================================================================
// 通知权限与通道（M6-01）
// 依据 spec 功能 3：每天定时主动推送提醒（时间可自定义，默认 9:00），前提是拿到系统通知权限。
//   * 前台展示行为必须用 setNotificationHandler 指定，否则通知触发时不会弹出；
//   * Android 本地通知必须挂在某个通知渠道上才能弹出，这里创建 'default' 渠道；
//   * 权限结果回写 settings.notification_permission，供「提醒页通知未开提示」读取。
// 未来 Supabase 实现保留同一对外函数。
// 2026-10-25：改为经 notificationsModule 取模块。Expo Go 缺原生模块时
// getNotifications() 返回 null，本文件所有能力降级为「无通知」，不阻塞启动。
// =====================================================================
import { Platform } from 'react-native';
import { getSettings, updateSettings } from '../data/settingsRepository';
import { getNotifications, type NotificationsModule } from './notificationsModule';

const Notifications = getNotifications();

// 前台展示行为：App 在前台时收到本机通知也要弹出横幅/进通知栏。
// 必须提前注册，否则通知触发时不会展示。放在模块顶部随首次 import 生效。
if (Notifications) {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

/** 规范化后的通知权限：granted / denied / undetermined（provisional 视为 granted）。 */
export type NotifPermission = 'granted' | 'denied' | 'undetermined';

function normalize(
  perm: Awaited<ReturnType<NotificationsModule['getPermissionsAsync']>>,
): NotifPermission {
  if (perm.status === 'granted') return 'granted';
  if (perm.status === 'denied') return 'denied';
  return 'undetermined';
}

/**
 * Android 通知渠道。本地定时通知必须挂在具体渠道上才能弹出。
 * iOS 无渠道概念，直接跳过。
 */
export async function ensureAndroidChannel(): Promise<void> {
  if (Platform.OS !== 'android' || !Notifications) return;
  try {
    await Notifications.setNotificationChannelAsync('default', {
      name: '心意提醒',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#FE6D73',
    });
  } catch {
    // 个别模拟器/系统限制下渠道创建失败不阻塞后续排期
  }
}

// 同一次运行内是否已主动请求过权限。
// 启动（登录前）与登录后 bootstrap 都会判断是否需要请求，没有这个标记会在
// 用户刚点完「不允许」后立刻又弹一次。
let requestedThisSession = false;

export function hasRequestedThisSession(): boolean {
  return requestedThisSession;
}

/** 权限对账结果：区分系统真实状态与本地缓存，供启动逻辑决定是否主动请求。 */
export type PermissionSnapshot = {
  /** 写库后的本地状态（用户主动关闭时保持 denied，即使系统仍授权） */
  stored: NotifPermission;
  /** 系统真实权限状态 */
  system: NotifPermission;
  /**
   * 系统是否还允许再次弹出授权框。
   * 注意：Android 13+ 首次安装尚未请求时，getPermissionsAsync 返回的是 denied，
   * 但 canAskAgain 为 true —— 这时必须主动请求，不能只看 status。
   */
  canAskAgain: boolean;
};

/**
 * 读取当前系统通知权限并把结果写回本地缓存（settings.notification_permission）。
 * 不弹授权框，仅查询；供启动时对账「提醒页通知未开提示」的状态。
 *
 * 本地与系统状态的关系：
 *   * 系统仍 granted、但本地记为 denied = 用户主动在设置页关过推送，保持 denied；
 *   * 其余情况以系统权限为准（系统撤销通知权限会同步成 denied）。
 */
export async function syncPermission(): Promise<PermissionSnapshot> {
  const current = await getSettings().catch(() => null);

  // 环境不支持通知（如 Expo Go）：保持本地记录原值，不请求、不改写
  if (!Notifications) {
    const stored = current?.notificationPermission ?? 'denied';
    return { stored, system: stored, canAskAgain: false };
  }

  const raw = await Notifications.getPermissionsAsync();
  const system = normalize(raw);
  const canAskAgain = raw.canAskAgain ?? true;

  const userTurnedOff = system === 'granted' && current?.notificationPermission === 'denied';
  const stored: NotifPermission = userTurnedOff ? 'denied' : system;

  if (current?.notificationPermission !== stored) {
    await updateSettings({ notificationPermission: stored }).catch(() => {});
  }
  return { stored, system, canAskAgain };
}

/**
 * 请求系统通知授权（Android 13+ 会弹 POST_NOTIFICATIONS 授权框）。
 * 授权成功才可能真正弹出通知 → 随后重排全部提醒；结果统一写回本地缓存。
 */
export async function requestPermission(): Promise<NotifPermission> {
  requestedThisSession = true;
  // 环境不支持通知：不弹框，直接按「没有权限」返回
  if (!Notifications) return 'denied';
  await ensureAndroidChannel();
  const perm = normalize(await Notifications.requestPermissionsAsync());
  await updateSettings({ notificationPermission: perm }).catch(() => {});
  if (perm === 'granted') {
    // 授权成功后才真正具备弹出能力，此刻再重排
    const { rescheduleAll } = await import('./scheduler');
    await rescheduleAll();
  }
  return perm;
}