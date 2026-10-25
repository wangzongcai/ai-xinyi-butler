// =====================================================================
// 历史页（提醒 Tab 之外的心意记录，M10）
// M10-01 列表 + 三态筛选（全部 / 未送 / 已送 / 已过期，均为真实数据）
// M10-02 标记「已送祝福」；M10-03 「已过期」由 Repository 读取时派生
// M10-04 删除单条（二次确认，误删不可恢复）
// 2026-10-25：原为写死的样例数据占位页，本版起全部读本机库（随账号同步）。
// =====================================================================
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import PageHeader from '../../src/components/PageHeader';
import { colors, fonts, radius } from '../../src/theme';
import {
  deleteHistory,
  listHistoryRows,
  updateHistoryStatus,
  type HistoryRow,
  type HistoryStatus,
} from '../../src/data/historyRepository';
import { useSync } from '../../src/sync/SyncContext';

const FILTERS = ['全部', '未送', '已送', '已过期'] as const;
type Filter = (typeof FILTERS)[number];

/** 公历 YYYY-MM-DD →「10月26日」 */
function formatYmd(ymd: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!m) return ymd;
  return `${Number(m[2])}月${Number(m[3])}日`;
}

/** 状态胶囊样式：未送偏暖、已送用山茶色、已过期用灰褐 */
function pillStyle(status: HistoryStatus) {
  if (status === '未送') return [styles.pill, styles.pillUnsents];
  if (status === '已过期') return [styles.pill, styles.pillExpired];
  return [styles.pill];
}

export default function HistoryScreen() {
  const [filter, setFilter] = useState<Filter>('全部');
  // null = 加载中；空数组表示确实没有记录，两者展示不同
  const [rows, setRows] = useState<HistoryRow[] | null>(null);
  // 远端数据落库后 dataVersion 自增，本页随之重读
  const { dataVersion } = useSync();

  const load = useCallback(async () => {
    try {
      setRows(await listHistoryRows());
    } catch {
      setRows([]);
    }
  }, []);

  // Tab 页常驻不卸载，用 useFocusEffect 保证从对象页/贺卡页返回时是最新状态
  useFocusEffect(
    useCallback(() => {
      void load();
      // dataVersion 只作为「远端数据已落库」的触发信号，不参与查询
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [load, dataVersion]),
  );

  const markSent = useCallback(
    (id: string) => {
      updateHistoryStatus(id, '已送')
        .then(load)
        .catch(() => Alert.alert('操作失败', '请稍后重试。'));
    },
    [load],
  );

  const remove = useCallback(
    (row: HistoryRow) => {
      Alert.alert('删除这条记录？', `「${row.name}」删除后不可恢复。`, [
        { text: '取消', style: 'cancel' },
        {
          text: '删除',
          style: 'destructive',
          onPress: () => {
            deleteHistory(row.id)
              .then(load)
              .catch(() => Alert.alert('删除失败', '请稍后重试。'));
          },
        },
      ]);
    },
    [load],
  );

  const loading = rows === null;
  const counts: Record<Filter, number> = {
    全部: rows?.length ?? 0,
    未送: rows?.filter((r) => r.status === '未送').length ?? 0,
    已送: rows?.filter((r) => r.status === '已送').length ?? 0,
    已过期: rows?.filter((r) => r.status === '已过期').length ?? 0,
  };
  const visible = (rows ?? []).filter((r) => filter === '全部' || r.status === filter);

  return (
    <View style={styles.screen}>
      <PageHeader title="历史" subtitle="看看哪些心意送达，哪些还欠着" />
      <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
        {/* 分段筛选 */}
        <View style={styles.seg}>
          {FILTERS.map((f) => (
            <Pressable
              key={f}
              style={[styles.segBtn, filter === f && styles.segBtnOn]}
              onPress={() => setFilter(f)}
            >
              <Text style={[styles.segText, filter === f && styles.segTextOn]}>{f}</Text>
              {!loading && counts[f] > 0 ? (
                <Text style={[styles.segCount, filter === f && styles.segCountOn]}>{counts[f]}</Text>
              ) : null}
            </Pressable>
          ))}
        </View>

        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.camellia} />
          </View>
        ) : visible.length === 0 ? (
          <Text style={styles.empty}>
            {counts.全部 === 0
              ? '还没有心意记录。对象的生日 / 纪念日，或匹配到对象的节日，进入未来 45 天后会自动记下（通用节日不记），送出祝福后回来标记一下。'
              : `没有「${filter}」的记录。`}
          </Text>
        ) : (
          <View style={styles.list}>
            {visible.map((r) => {
              // 记录可能已与对象解绑（对象被彻底清除时 person_id 置空），这种就不跳转
              const canOpen = Boolean(r.personId);
              return (
              <Pressable
                key={r.id}
                style={({ pressed }) => [styles.card, pressed && canOpen && styles.cardPressed]}
                // 把这条记录对应的贺卡 id 一起带过去：对象页直接展示那张固定贺卡，
                // 不会再按「当前对象的最新内容」生成或换一张
                onPress={
                  canOpen
                    ? () =>
                        router.push(
                          `/person/${r.personId}${r.prepareId ? `?card=${r.prepareId}` : ''}`,
                        )
                    : undefined
                }
                disabled={!canOpen}
              >
                <View style={styles.cardTop}>
                  <View style={styles.cardMain}>
                    <Text style={styles.rowName}>{r.name}</Text>
                    <Text style={styles.rowMeta} numberOfLines={1}>
                      {r.personName ? `${r.personName} · ` : ''}
                      {formatYmd(r.date)}
                    </Text>
                  </View>
                  <Text style={pillStyle(r.status)}>{r.status}</Text>
                  {canOpen ? (
                    <Ionicons name="chevron-forward" size={14} color={colors.ink3} />
                  ) : null}
                </View>
                <View style={styles.cardActions}>
                  {r.status !== '已送' ? (
                    <Pressable
                      style={({ pressed }) => [styles.actionBtn, pressed && styles.pressed]}
                      onPress={() => markSent(r.id)}
                      hitSlop={6}
                    >
                      <Text style={styles.actionDone}>标记已送</Text>
                    </Pressable>
                  ) : null}
                  <Pressable
                    style={({ pressed }) => [styles.actionBtn, pressed && styles.pressed]}
                    onPress={() => remove(r)}
                    hitSlop={6}
                  >
                    <Text style={styles.actionDanger}>删除</Text>
                  </Pressable>
                </View>
              </Pressable>
              );
            })}
          </View>
        )}

        <Text style={styles.note}>
          每个日子只记一条，重复提醒不重复记录；日子过去未标记的会自动变成「已过期」。
        </Text>
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
  segBtn: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 4,
    borderRadius: 9,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 4,
  },
  segBtnOn: {
    backgroundColor: colors.paper2,
    shadowOpacity: 0.12,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
  },
  segText: { fontSize: 13.5, color: colors.ink2 },
  segTextOn: { color: colors.camellia, fontWeight: '600' },
  segCount: { fontSize: 11, color: colors.ink3 },
  segCountOn: { color: colors.camelliaDeep },

  center: { paddingVertical: 40, alignItems: 'center' },
  empty: { fontSize: 13, color: colors.ink2, lineHeight: 21, paddingVertical: 14 },

  list: { gap: 10 },
  card: {
    backgroundColor: colors.paper2,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cardPressed: { backgroundColor: colors.roseTint },
  cardMain: { flex: 1 },
  rowName: { fontFamily: fonts.hand, fontSize: 16, color: colors.ink },
  rowMeta: { fontSize: 12.5, color: colors.ink2, marginTop: 2 },
  pill: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 999,
    fontSize: 12,
    backgroundColor: colors.roseTint,
    color: colors.camelliaDeep,
    overflow: 'hidden',
  },
  pillUnsents: { backgroundColor: colors.camelliaTint, color: '#8F4E55' },
  pillExpired: { backgroundColor: '#EDE6DC', color: '#7C7365' },

  cardActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 16,
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
  actionBtn: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.sm,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  pressed: { opacity: 0.7 },
  actionDone: { fontSize: 12.5, color: colors.camelliaDeep, fontWeight: '600' },
  actionDanger: { fontSize: 12.5, color: colors.ink3 },

  note: { fontSize: 12.5, color: colors.ink3, marginTop: 16 },
});
