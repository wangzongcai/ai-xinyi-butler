import { useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { router } from 'expo-router';
import PageHeader from '../../src/components/PageHeader';
import { colors, fonts } from '../../src/theme';
import { Person, listPersons } from '../../src/data/personRepository';
import { listAnniversariesByPerson } from '../../src/data/anniversaryRepository';
import { daysUntilNextOccurrenceOf } from '../../src/utils/nextOccurrence';

// 联系人行数据：对象 + 其「最近日子」（距今天数最小的一项）
type Row = {
  person: Person;
  /** 最近一次纪念日；无任何纪念日时为 null（不显示倒计时） */
  nearest: { name: string; date: string; days: number } | null;
};

// 把「YYYY-MM-DD」格式化为「M月D日」
function formatMonthDay(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  void y;
  return `${m}月${d}日`;
}

export default function ContactsScreen() {
  const [rows, setRows] = useState<Row[] | null>(null);

  // 异步加载：列出全部未删除对象，并为每个对象算最近日子倒计时
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const persons = await listPersons();
      const result = await Promise.all(
        persons.map(async (person) => {
          const anniversaries = await listAnniversariesByPerson(person.id);
          // 「最近日子」从 生日(若填) + 各纪念日 的下一次发生里取距今天数最小者
          let best: Row['nearest'] = null;
          const consider = (name: string, date: string): void => {
            const days = daysUntilNextOccurrenceOf(date);
            if (!best || days < best.days) {
              best = { name, date, days };
            }
          };
          if (person.birthday) consider('生日', person.birthday);
          for (const a of anniversaries) consider(a.name, a.date);
          return { person, nearest: best };
        }),
      );
      if (!cancelled) setRows(result);
    })().catch(() => {
      if (!cancelled) setRows([]);
    });
    return () => {
      cancelled = true;
    };
  }, []);

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
            {rows.map(({ person, nearest }) => (
              <Pressable
                key={person.id}
                style={styles.row}
                onPress={() => router.push(`/person/${person.id}`)}
              >
                <View>
                  <Text style={styles.rowName}>{person.name}</Text>
                  <Text style={styles.rowMeta}>
                    {person.relationship}
                    {nearest ? ` ， ${nearest.name} ${formatMonthDay(nearest.date)}` : ''}
                  </Text>
                </View>
                {nearest ? (
                  <View style={styles.rowSide}>
                    <Text style={[styles.pill, nearest.days === 0 && styles.pillWarm]}>
                      {nearest.days === 0 ? '今天' : `${nearest.days} 天`}
                    </Text>
                  </View>
                ) : null}
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
  rowName: { fontFamily: fonts.hand, fontSize: 18, color: colors.ink },
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
  rowAdd: { color: colors.camellia, fontSize: 14 },
  plus: { fontSize: 18, marginRight: 6 },
});