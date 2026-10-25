// =====================================================================
// 礼物建议区域组件（M8-04）
// 每条含礼物名称、简短推荐理由与「去看看」按钮（M8-06：按所选平台跳转
// 淘宝/京东，未安装回退浏览器）。数量固定 4 条，第一版不可调（M8-05）。
// 数据加载与失败重试的逻辑由父页（准备页）接管，本组件只做展示。
// =====================================================================
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { GiftSuggest } from '../lib/aiClient';
import { colors, radius } from '../theme';

export default function GiftList({
  gifts,
  onOpenSearch,
}: {
  gifts: GiftSuggest[];
  onOpenSearch: (gift: GiftSuggest) => void;
}) {
  if (gifts.length === 0) {
    return <Text style={styles.empty}>暂时没有礼物建议，点「换一批」试试。</Text>;
  }
  return (
    <View style={styles.list}>
      {gifts.map((g, i) => (
        <View key={`${g.name}-${i}`} style={styles.card}>
          <View style={styles.cardHead}>
            <Text style={styles.index}>{i + 1}</Text>
            <Text style={styles.name}>{g.name}</Text>
          </View>
          <Text style={styles.reason}>{g.reason}</Text>
          {g.keyword ? <Text style={styles.keyword}>搜索关键词：{g.keyword}</Text> : null}
          <Pressable
            style={({ pressed }) => [styles.btn, pressed && styles.btnPressed]}
            onPress={() => onOpenSearch(g)}
            hitSlop={6}
          >
            <Ionicons name="cart-outline" size={15} color={colors.gold} />
            <Text style={styles.btnText}>去看看</Text>
          </Pressable>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: 10 },
  empty: { fontSize: 13, color: colors.ink2, lineHeight: 20, paddingVertical: 6 },
  card: {
    backgroundColor: colors.paper2,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    padding: 14,
  },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  index: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.gold,
    color: '#FCF4F4',
    textAlign: 'center',
    lineHeight: 22,
    fontSize: 12.5,
    fontWeight: '700',
    overflow: 'hidden',
  },
  name: { fontSize: 15.5, fontWeight: '600', color: colors.ink, flexShrink: 1 },
  reason: { fontSize: 13, color: colors.ink2, marginTop: 6, lineHeight: 19 },
  keyword: { fontSize: 12, color: colors.ink3, marginTop: 6 },
  btn: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 10,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: '#F8F0DC',
  },
  btnPressed: { opacity: 0.7 },
  btnText: { color: colors.gold, fontSize: 13, fontWeight: '600' },
});