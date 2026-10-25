import { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, ActivityIndicator, Pressable } from 'react-native';
import { colors, fonts } from '../src/theme';
import PageHeader from '../src/components/PageHeader';
import { useSync } from '../src/sync/SyncContext';
import {
  listRecycledPersons,
  restorePerson,
  purgeExpiredRecycled,
} from '../src/data/personRepository';

type Row = {
  id: string;
  name: string;
  relationship: string;
  remainingDays: number;
};

export default function RecycleBinScreen() {
  const [rows, setRows] = useState<Row[] | null>(null);
  // 远端数据（含墓碑）落库后 dataVersion 自增，本页随之重读
  const { dataVersion } = useSync();

  const load = useCallback(() => {
    let cancelled = false;
    (async () => {
      // 先把已超 30 天的一次性彻底清除（既定决策）
      await purgeExpiredRecycled();
      const recycled = await listRecycledPersons();
      if (!cancelled) {
        setRows(
          recycled.map((r) => ({
            id: r.id,
            name: r.name,
            relationship: r.relationship,
            remainingDays: r.remainingDays,
          })),
        );
      }
    })().catch(() => {
      if (!cancelled) setRows([]);
    });
    return () => {
      cancelled = true;
    };
    // dataVersion 在回调体内不参与计算，只作为「远端数据已落库」的触发信号
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataVersion]);

  useEffect(load, [load]);

  // 恢复：重排提醒（恢复的对象要重新排期 / 补写心意记录），再刷新列表
  const handleRestore = useCallback(
    (id: string) => {
      restorePerson(id)
        .then(async () => {
          try {
            const { rescheduleAll } = await import('../src/notifications/scheduler');
            await rescheduleAll();
          } catch {
            // 重排失败不影响恢复本身
          }
          await load();
        })
        .catch(() => {});
    },
    [load],
  );

  const loading = rows === null;

  return (
    <View style={styles.screen}>
      <PageHeader title="回收站" subtitle="删除保留 30 天，超期彻底清除" />
      <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.camellia} />
          </View>
        ) : rows.length === 0 ? (
          <Text style={styles.empty}>回收站是空的。删除的对象会在这里保留 30 天，期间可恢复。</Text>
        ) : (
          <View style={styles.list}>
            {rows.map((row) => (
              <View key={row.id} style={styles.row}>
                <View style={styles.rowMain}>
                  <Text style={styles.rowName}>{row.name}</Text>
                  {row.relationship ? (
                    <Text style={styles.rowMeta}>{row.relationship}</Text>
                  ) : null}
                </View>
                <View style={styles.rowSide}>
                  <Text style={styles.remain}>还剩 {row.remainingDays} 天</Text>
                  <Pressable
                    style={({ pressed }) => [styles.restoreBtn, pressed && styles.pressed]}
                    onPress={() => handleRestore(row.id)}
                  >
                    <Text style={styles.restoreText}>恢复</Text>
                  </Pressable>
                </View>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  body: { flex: 1 },
  bodyContent: { paddingHorizontal: 22, paddingBottom: 28, paddingTop: 6 },
  center: { paddingVertical: 40, alignItems: 'center' },
  empty: { fontSize: 13.5, color: colors.ink2, lineHeight: 20, paddingVertical: 22 },
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
  rowMain: { flex: 1, minWidth: 0 },
  rowName: { fontFamily: fonts.hand, fontSize: 18, color: colors.ink },
  rowMeta: { fontSize: 12.5, color: colors.ink2, marginTop: 2 },
  rowSide: { alignItems: 'flex-end', gap: 4 },
  remain: { fontSize: 12, color: colors.ink3 },
  restoreBtn: {
    paddingHorizontal: 14,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: colors.camellia,
  },
  restoreText: { color: colors.paper, fontSize: 12.5 },
  pressed: { opacity: 0.7 },
});