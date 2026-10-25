// =====================================================================
// 礼物区 + 贺卡入口（M8 / M9 共用区块）
// 礼物建议：仅在 settings.gift_enabled 为真时展示并请求（M8-08）；
// 「去看看」按所选平台跳转淘宝 / 京东（M8-06），未安装回退浏览器（M8-07）。
// 贺卡入口：仅在 settings.card_enabled 为真且有可用 prepareId 时展示（M9-11）。
// 渲染与否由父页按 settings 控制挂载；本组件内部只读开关不做请求的「隐藏」判断，
// 但为稳妥，若开关关掉且已请求也接受——父页只在开关开时才挂载它。
// =====================================================================
import type { ReactNode } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { UsePrepareContent } from '../hooks/usePrepareContent';
import type { GiftSuggest } from '../lib/aiClient';
import { openSearch, WEB_NONE_TIP } from '../lib/ecommerceLink';
import { OFFLINE_TIP } from '../lib/network';
import GiftList from './GiftList';
import { colors, fonts, radius } from '../theme';

export default function AiActionsSection({
  hook,
  platform,
  giftEnabled,
  cardEnabled,
  onOpenCard,
  cardSlot,
}: {
  hook: UsePrepareContent;
  /** 'taobao' | 'jd'，来自设置 */
  platform: 'taobao' | 'jd';
  /** settings.gift_enabled：关则隐藏礼物区且不展示（父页也不该挂载/请求） */
  giftEnabled: boolean;
  /** settings.card_enabled：关则隐藏贺卡入口 */
  cardEnabled: boolean;
  /** 点「生成电子贺卡」的回调（导航到 /card/[prepareId]） */
  onOpenCard: () => void;
  /**
   * 自定义贺卡区内容：从历史记录进对象页时传入预览卡（固定展示、只读），
   * 用来替换默认的「生成电子贺卡」按钮。未传则走原来的按钮。
   */
  cardSlot?: ReactNode;
}) {
  const { gifts, giftLoading, giftError, giftOffline, loadGifts, prepareId } = hook;

  const openGift = (gift: GiftSuggest) => {
    const keyword = gift.keyword || gift.name;
    openSearch(keyword, platform).then((ok) => {
      if (!ok) Alert.alert('无法打开', WEB_NONE_TIP);
    });
  };

  return (
    <View>
      {/* 礼物建议区域（M8-08：关则整区不渲染） */}
      {giftEnabled ? (
        <>
          <Text style={styles.sectionTitle}>礼物建议</Text>
          <Text style={styles.sectionHint}>根据对方的特点，给你 4 个参考方向。</Text>
          {giftLoading ? (
            <Text style={styles.muted}>正在为你挑选合适的礼物…</Text>
          ) : giftError && gifts === null ? (
            <View style={styles.giftError}>
              {/* M11-01：断网时用 spec 的固定文案，其它失败保留具体原因 */}
              <Text style={styles.muted}>
                {giftOffline ? OFFLINE_TIP : `礼物建议生成失败了：${giftError}`}
              </Text>
              <Pressable style={styles.retryBtn} onPress={() => void loadGifts(true)}>
                <Text style={styles.retryText}>{giftOffline ? '联网后重试' : '重试'}</Text>
              </Pressable>
            </View>
          ) : (
            <GiftList gifts={gifts ?? []} onOpenSearch={openGift} />
          )}
        </>
      ) : null}

      {/* 贺卡区（M9-11：关则隐藏）。
          有预备内容 prepareId 才可进贺卡页出图；从历史进来时父页传入预览卡，
          直接摆出那张卡，不再显示「生成」按钮。 */}
      {cardEnabled && (prepareId || cardSlot) ? (
        cardSlot ?? (
          <Pressable style={styles.cardBtn} onPress={onOpenCard}>
            <Ionicons name="image-outline" size={18} color="#FCF4F4" />
            <Text style={styles.cardBtnText}>生成电子贺卡</Text>
          </Pressable>
        )
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  sectionTitle: { fontFamily: fonts.hand, fontSize: 17, color: colors.ink, marginBottom: 2 },
  sectionHint: { fontSize: 12.5, color: colors.ink3, marginBottom: 10 },
  muted: { fontSize: 13, color: colors.ink2, lineHeight: 20 },
  giftError: { gap: 8 },
  retryBtn: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: colors.camellia,
    borderRadius: radius.sm,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  retryText: { color: colors.camelliaDeep, fontSize: 13 },
  cardBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 20,
    backgroundColor: colors.teal,
    borderRadius: radius.md,
    paddingVertical: 14,
  },
  cardBtnText: { color: '#FCF4F4', fontSize: 15, fontWeight: '600' },
});