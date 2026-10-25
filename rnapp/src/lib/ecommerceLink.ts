// =====================================================================
// 电商跳转工具（M8-06 / M8-07）
// 按设置里的平台（默认淘宝，可切京东）用 expo-linking 优先唤起对应电商 App
// 的搜索结果页；App 未安装或唤起失败时回退浏览器搜索页（不是应用商店）。
// 无浏览器可用时返回 false 由调用方给轻提示。
// =====================================================================
import * as Linking from 'expo-linking';
import type { ShopPlatform } from '../settings/SettingsContext';

/** 各平台 App 的打开方式定义。 */
const EC = {
  taobao: {
    label: '淘宝',
    appSearch: (q: string) =>
      // 淘宝 App 搜索页 Scheme：s.tb.cn/h5/m2/share-search?keyword=...
      `s.tb.cn://m.h5.m.taobao.com/awp/core/detail.htm?ft=t&suid=0&from=wxt&uid=&queryType=cat&keyword=${encodeURIComponent(q)}`,
    webSearch: (q: string) => `https://s.m.taobao.com/h5?q=${encodeURIComponent(q)}`,
  },
  jd: {
    label: '京东',
    appSearch: (q: string) => `openapp.jdmobile://virtual?params=${encodeURIComponent(JSON.stringify({ category: "jump", des: `search?keyword=${q}` }))}`,
    webSearch: (q: string) => `https://search.jd.com/Search?keyword=${encodeURIComponent(q)}&enc=utf-8`,
  },
} as const;

const WEB_NONE_TIP = '当前设备没有可用的浏览器，无法打开搜索结果页';

/**
 * 打开某平台对给定关键词的搜索结果页。
 * 优先尝试唤起 App（Linking.openURL 会因未安装而失败），失败后回退浏览器；
 * 回退也失败时返回 false（调用方据此给轻提示）。
 */
export async function openSearch(q: string, platform: ShopPlatform): Promise<boolean> {
  try {
    const cfg = EC[platform];

    // 1) 优先唤起 App
    const appOpened = await Linking.canOpenURL(cfg.appSearch(q)).then(
      (ok) => ok && Linking.openURL(cfg.appSearch(q)).then(() => true).catch(() => false),
      () => false,
    );
    if (appOpened) return true;

    // 2) 回退浏览器搜索页
    const webOk = await Linking.openURL(cfg.webSearch(q))
      .then(() => true)
      .catch(() => false);
    if (webOk) return true;

    return false;
  } catch {
    return false;
  }
}

/** 首页/详情用于兜底提示的文案。 */
export { WEB_NONE_TIP };