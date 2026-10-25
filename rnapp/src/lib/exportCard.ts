// =====================================================================
// 贺卡导出 / 保存 / 分享（M9-08 / M9-09）
// 用 captureRef 截取 CardView 根节点，固定导出 1080x1440（3:4）JPEG；
// 保存到系统相册用 expo-media-library，分享用 expo-sharing 调系统面板。
// 2026-10-25：相册模块改为经 mediaLibrary 运行时取用，Expo Go 缺原生模块时
// 存相册降级为「不可用」，分享照常（静态 import 会整屏崩，见 mediaLibrary.ts）。
// =====================================================================
import type { RefObject } from 'react';
import type { View } from 'react-native';
import { Platform } from 'react-native';
import { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import { getMediaLibrary } from './mediaLibrary';

/** 导出尺寸：竖版 3:4，1080x1440（设备像素比至少 2x 的清晰度，spec 功能 8）。 */
export const CARD_EXPORT_WIDTH = 1080;
export const CARD_EXPORT_HEIGHT = 1440;

/** 把贺卡视图截成 JPEG 临时文件，返回本地 URI。 */
export async function captureCard(ref: RefObject<View | null>): Promise<string> {
  const target = ref.current;
  if (!target) throw new Error('贺卡还没有准备好');
  return captureRef(target, {
    format: 'jpg',
    quality: 0.92,
    width: CARD_EXPORT_WIDTH,
    height: CARD_EXPORT_HEIGHT,
    result: 'tmpfile',
  });
}

export type SaveResult =
  | { ok: true }
  | { ok: false; reason: 'permission' | 'unavailable' | 'error'; message?: string };

/**
 * 保存到系统相册。iOS 请求「仅添加」权限；Android 10+ 写相册不需要读权限，
 * 因此 Android 上即使权限返回值不理想，也直接尝试写入（失败再如实返回）。
 * 当前环境没有相册原生模块（Expo Go）时返回 unavailable，由界面引导改用分享。
 */
export async function saveCardToLibrary(uri: string): Promise<SaveResult> {
  const MediaLibrary = getMediaLibrary();
  if (!MediaLibrary) return { ok: false, reason: 'unavailable' };
  try {
    const permission = await MediaLibrary.requestPermissionsAsync(true, ['photo']);
    if (!permission.granted && Platform.OS === 'ios') {
      return { ok: false, reason: 'permission' };
    }
    await MediaLibrary.Asset.create(uri);
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      reason: 'error',
      message: e instanceof Error ? e.message : '保存失败',
    };
  }
}

/** 调系统分享面板发送 JPEG；设备不支持分享时返回 unavailable。 */
export async function shareCard(uri: string): Promise<SaveResult> {
  try {
    if (!(await Sharing.isAvailableAsync())) {
      return { ok: false, reason: 'error', message: '当前设备不支持系统分享' };
    }
    await Sharing.shareAsync(uri, {
      mimeType: 'image/jpeg',
      dialogTitle: '分享电子贺卡',
      UTI: 'public.jpeg',
    });
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      reason: 'error',
      message: e instanceof Error ? e.message : '分享失败',
    };
  }
}
