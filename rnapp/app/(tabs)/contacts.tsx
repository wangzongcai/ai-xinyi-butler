import { useCallback, useState } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import PageHeader from '../../src/components/PageHeader';
import { colors, fonts } from '../../src/theme';
import { Person, listPersons } from '../../src/data/personRepository';
import { listAnniversariesByPerson } from '../../src/data/anniversaryRepository';
import { CalendarKind, formatMonthDay, nextOccurrenceDays } from '../../src/utils/calendar';
import { useSync } from '../../src/sync/SyncContext';

// 联系人行数据：对象 + 其所有的纪念日（生日也按纪念日记录）
type RowDay = {
  name: string;
  date: string;
  calendar: CalendarKind;
  days: number;
};

type Row = {
  person: Person;
  days: RowDay[]; // 该对象的所有纪念日列表
};

export default function ContactsScreen() {
  const [rows, setRows] = useState<Row[] | null>(null);
  // 远端数据落库后 dataVersion 自增，本页随之重读
  const { dataVersion } = useSync();

  // 异步加载：列出全部未删除对象，并为每个对象算所有日子的倒计时。
  // 用 useFocusEffect 而非 useEffect：Tab 页常驻不卸载，只在挂载时读库
  // 会导致新增/删除对象后回到本页仍显示旧数据。重新聚焦时静默刷新，不清空列表。
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        const persons = await listPersons();
        const result = await Promise.all(
          persons.map(async (person) => {
            const anniversaries = await listAnniversariesByPerson(person.id);
            // 收集所有重要日子：全部来自纪念日（生日也已按纪念日记录）
            const days: RowDay[] = [];
            for (const a of anniversaries) {
              days.push({
                name: a.name,
                date: a.date,
                calendar: a.calendar,
                days: nextOccurrenceDays(a.date, a.calendar),
              });
            }
            // 按天数排序：最近的放前面
            days.sort((a, b) => a.days - b.days);
            return { person, days };
          }),
        );
        if (!cancelled) setRows(result);
      })().catch(() => {
        if (!cancelled) setRows([]);
      });
      return () => {
        cancelled = true;
      };
      // dataVersion 在回调体内不参与计算，只作为「远端数据已落库」的触发信号
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [dataVersion]),
  );

  const loading = rows === null;

  return (
    <View style={styles.screen}>
      <PageHeader title="联系人" subtitle="记住每一位在乎的人" />
      <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
        <Text style={styles.secT}>
          重要的人 <Text style={styles.secTsmall}>点击进入</Text>
        </Text>

        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.camellia} />
          </View>
        ) : rows.length === 0 ? (
          <View style={styles.list}>
            <Text style={styles.empty}>还没有想记住的人，先从添加一位开始吧。</Text>
            <Pressable style={styles.row} onPress={() => router.push('/person/new')}>
              <Text style={styles.rowAdd}>
                <Text style={styles.plus}>＋ </Text>添加一位想记住的人
              </Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.list}>
            {rows.map(({ person, days }) => (
              <Pressable
                key={person.id}
                style={styles.row}
                onPress={() => router.push(`/person/${person.id}`)}
              >
                <View style={styles.rowMain}>
                  <Text style={styles.rowName}>
                    {person.name}
                    {person.relationship ? (
                      <Text style={styles.rowRelation}>　{person.relationship}</Text>
                    ) : null}
                  </Text>
                  {days.length > 0 ? (
                    <View style={styles.daysList}>
                      {days.map((d, idx) => (
                        <View key={idx} style={styles.dayRow}>
                          <Text style={styles.dayLabel} numberOfLines={1}>
                            {d.name} · {formatMonthDay(d.date, d.calendar)}
                          </Text>
                          <Text style={[styles.dayCount, d.days === 0 && styles.dayCountToday]}>
                            {d.days === 0 ? '今天' : `还有 ${d.days} 天`}
                          </Text>
                        </View>
                      ))}
                    </View>
                  ) : (
                    <Text style={styles.rowMeta}>暂无纪念日</Text>
                  )}
                </View>
              </Pressable>
            ))}
            <Pressable style={styles.row} onPress={() => router.push('/person/new')}>
              <Text style={styles.rowAdd}>
                <Text style={styles.plus}>＋ </Text>添加一位想记住的人
              </Text>
            </Pressable>
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
  secT: { fontFamily: fonts.hand, fontSize: 17, color: colors.ink, marginBottom: 8 },
  secTsmall: { fontSize: 12, color: colors.ink2, fontFamily: fonts.ui, marginLeft: 8 },
  center: { paddingVertical: 40, alignItems: 'center' },
  empty: { fontSize: 13.5, color: colors.ink2, paddingVertical: 22, lineHeight: 20 },
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
  rowMain: { flex: 1 },
  rowName: { fontFamily: fonts.hand, fontSize: 18, color: colors.ink },
  rowRelation: { fontFamily: fonts.ui, fontSize: 12.5, color: colors.ink2 },
  daysList: { flexDirection: 'column', gap: 4, marginTop: 4 },
  dayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  dayLabel: { fontSize: 12.5, color: colors.ink2, flexShrink: 1 },
  dayCount: { fontSize: 12, color: colors.camelliaDeep },
  dayCountToday: { color: '#8F4E55', fontWeight: '600' },
  rowMeta: { fontSize: 12.5, color: colors.ink2 },
  rowAdd: { color: colors.camellia, fontSize: 14 },
  plus: { fontSize: 18, marginRight: 6 },
});