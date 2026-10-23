import { useState } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet } from 'react-native';
import PageHeader from '../../src/components/PageHeader';
import { colors, fonts } from '../../src/theme';

const FILTERS = ['全部', '未送', '已送', '已过期'] as const;

export default function HistoryScreen() {
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>('全部');

  return (
    <View style={styles.screen}>
      <PageHeader title="心意记录" subtitle="看看哪些送达，哪些还欠着" />
      <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
        {/* 分段筛选（占位，里程碑五接数据） */}
        <View style={styles.seg}>
          {FILTERS.map((f) => (
            <Pressable key={f} style={[styles.segBtn, filter === f && styles.segBtnOn]} onPress={() => setFilter(f)}>
              <Text style={[styles.segText, filter === f && styles.segTextOn]}>{f}</Text>
            </Pressable>
          ))}
        </View>

        <View style={styles.list}>
          <View style={styles.row}>
            <View>
              <Text style={styles.rowName}>2026 妈妈生日</Text>
              <Text style={styles.rowMeta}>妈妈 ， 10月26日</Text>
            </View>
            <View style={styles.rowSide}>
              <Text style={[styles.pill, styles.pillWarm]}>未送</Text>
            </View>
          </View>
          <View style={styles.row}>
            <View>
              <Text style={styles.rowName}>2026 父亲节</Text>
              <Text style={styles.rowMeta}>爸爸 ， 6月21日</Text>
            </View>
            <View style={styles.rowSide}>
              <Text style={styles.pill}>已送</Text>
            </View>
          </View>
          <View style={styles.row}>
            <View>
              <Text style={styles.rowName}>2025 老徐结婚纪念</Text>
              <Text style={styles.rowMeta}>老徐 ， 9月12日</Text>
            </View>
            <View style={styles.rowSide}>
              <Text style={[styles.pill, styles.pillExpired]}>已过期</Text>
            </View>
          </View>
        </View>

        <Text style={styles.note}>每个日子只记一条，重复提醒不重复记录；日子过去未标记的会自动变成「已过期」。</Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  body: { flex: 1 },
  bodyContent: { paddingHorizontal: 22, paddingBottom: 28, paddingTop: 6 },
  seg: {
    flexDirection: 'row',
    backgroundColor: colors.roseTint,
    borderRadius: 12,
    padding: 4,
    marginBottom: 16,
  },
  segBtn: { flex: 1, paddingVertical: 8, paddingHorizontal: 4, borderRadius: 9, alignItems: 'center' },
  segBtnOn: { backgroundColor: colors.paper2, shadowOpacity: 0.12, shadowRadius: 3, shadowOffset: { width: 0, height: 1 } },
  segText: { fontSize: 13.5, color: colors.ink2 },
  segTextOn: { color: colors.camellia, fontWeight: '600' },
  list: { borderTopWidth: 1, borderTopColor: colors.line },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 2,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  rowName: { fontFamily: fonts.hand, fontSize: 16, color: colors.ink },
  rowMeta: { fontSize: 12.5, color: colors.ink2 },
  rowSide: { marginLeft: 'auto', alignItems: 'flex-end' },
  pill: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 999,
    fontSize: 12,
    backgroundColor: colors.roseTint,
    color: colors.camelliaDeep,
    overflow: 'hidden',
  },
  pillWarm: { backgroundColor: colors.camelliaTint, color: '#8F4E55' },
  pillExpired: { backgroundColor: '#EDE6DC', color: '#7C7365' },
  note: { fontSize: 12.5, color: colors.ink3, marginTop: 16 },
});