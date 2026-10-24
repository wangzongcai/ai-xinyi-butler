import { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, Alert, ActivityIndicator, Pressable } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { colors, fonts } from '../../src/theme';
import { Person, getPerson, softDeletePerson } from '../../src/data/personRepository';
import { Anniversary, listAnniversariesByPerson } from '../../src/data/anniversaryRepository';
import { listTraitsByPerson } from '../../src/data/traitRepository';
import { daysUntilNextOccurrenceOf } from '../../src/utils/nextOccurrence';

// 「YYYY-MM-DD」→「M月D日」
function formatMonthDay(dateStr: string): string {
  const [, m, d] = dateStr.split('-').map(Number);
  return `${m}月${d}日`;
}

type Data = {
  person: Person;
  anniversaries: Anniversary[];
  traits: string[];
};

export default function PersonScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [data, setData] = useState<Data | null>(null);
  // 区分「加载中」与「不存在」（被删/已恢复）
  const [notFound, setNotFound] = useState(false);

  const load = useCallback(() => {
    if (!id) {
      setNotFound(true);
      return;
    }
    let cancelled = false;
    (async () => {
      const person = await getPerson(id);
      if (cancelled) return;
      if (!person) {
        setNotFound(true);
        return;
      }
      const [anniversaries, traits] = await Promise.all([
        listAnniversariesByPerson(id),
        listTraitsByPerson(id),
      ]);
      if (cancelled) return;
      setData({ person, anniversaries, traits: traits.map((t) => t.content) });
    })().catch(() => {
      if (!cancelled) setNotFound(true);
    });
    return () => {
      cancelled = true;
    };
  }, [id]);

  useEffect(load, [load]);

  // 删除：二次确认，明示回收站的 30 天规则
  const handleDelete = useCallback(() => {
    Alert.alert('删除这位对象？', '删除后保留 30 天，期间可恢复，超期彻底清除。', [
      { text: '取消', style: 'cancel' },
      {
        text: '删除',
        style: 'destructive',
        onPress: () => {
          if (!id) return;
          softDeletePerson(id)
            .then(() => router.back())
            .catch(() => Alert.alert('删除失败', '请稍后重试。'));
        },
      },
    ]);
  }, [id]);

  // 兜底：对象不存在（已删除/已恢复/无此数据）
  if (notFound) {
    return (
      <View style={styles.centerWrap}>
        <Text style={styles.notFoundTitle}>这个对象不存在了</Text>
        <Text style={styles.notFoundHint}>
          它可能已经被删除，或数据尚未同步。返回列表看看其他的人吧。
        </Text>
      </View>
    );
  }

  if (!data) {
    return (
      <View style={styles.centerWrap}>
        <ActivityIndicator color={colors.camellia} />
      </View>
    );
  }

  const { person, anniversaries, traits } = data;

  return (
    <View style={styles.screen}>
      <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
        {/* 姓名 + 关系 */}
        <View style={styles.headBlock}>
          <Text style={styles.name}>{person.name}</Text>
          {person.relationship ? (
            <Text style={styles.relationship}>{person.relationship}</Text>
          ) : null}
        </View>

        {/* 生日 */}
        <View style={styles.card}>
          <View style={styles.cardLabelRow}>
            <Text style={styles.cardLabel}>生日</Text>
          </View>
          {person.birthday ? (
            <View style={styles.cardRow}>
              <Text style={styles.cardValue}>{formatMonthDay(person.birthday)}</Text>
              <View style={styles.cardSide}>
                <Text style={styles.pill}>{daysUntilNextOccurrenceOf(person.birthday)} 天后</Text>
              </View>
            </View>
          ) : (
            <Text style={styles.cardEmpty}>未填写</Text>
          )}
        </View>

        {/* 纪念日 */}
        <View style={styles.card}>
          <View style={styles.cardLabelRow}>
            <Text style={styles.cardLabel}>纪念日</Text>
            <Text style={styles.cardCount}>{anniversaries.length} 个</Text>
          </View>
          {anniversaries.length === 0 ? (
            <Text style={styles.cardEmpty}>还没有纪念日</Text>
          ) : (
            anniversaries.map((a) => (
              <View key={a.id} style={styles.cardRow}>
                <Text style={styles.cardValue}>
                  {a.name}　{formatMonthDay(a.date)}
                </Text>
                <View style={styles.cardSide}>
                  <Text style={styles.pill}>{daysUntilNextOccurrenceOf(a.date)} 天后</Text>
                </View>
              </View>
            ))
          )}
        </View>

        {/* 特征 */}
        <View style={styles.card}>
          <View style={styles.cardLabelRow}>
            <Text style={styles.cardLabel}>特征</Text>
            <Text style={styles.cardCount}>{traits.length} 条</Text>
          </View>
          {traits.length === 0 ? (
            <Text style={styles.cardEmpty}>还没有特征</Text>
          ) : (
            <View style={styles.traitWrap}>
              {traits.map((t, i) => (
                <Text key={i} style={styles.traitChip}>
                  {t}
                </Text>
              ))}
            </View>
          )}
        </View>

        {/* 操作按钮 */}
        <View style={styles.actions}>
          <Pressable
            style={({ pressed }) => [styles.btn, styles.btnPrimary, pressed && styles.pressed]}
            onPress={() => router.push(`/person/${person.id}/edit`)}
          >
            <Text style={styles.btnPrimaryText}>编辑对象</Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [styles.btn, styles.btnDanger, pressed && styles.pressed]}
            onPress={handleDelete}
          >
            <Text style={styles.btnDangerText}>删除对象</Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  body: { flex: 1 },
  bodyContent: { paddingHorizontal: 22, paddingVertical: 20, paddingBottom: 40 },
  centerWrap: { flex: 1, backgroundColor: colors.paper, alignItems: 'center', justifyContent: 'center', padding: 30 },
  notFoundTitle: { fontFamily: fonts.hand, fontSize: 20, color: colors.ink },
  notFoundHint: { fontSize: 13.5, color: colors.ink2, marginTop: 10, lineHeight: 20, textAlign: 'center' },

  headBlock: { marginBottom: 18 },
  name: { fontFamily: fonts.hand, fontSize: 28, color: colors.ink },
  relationship: { fontSize: 14, color: colors.ink2, marginTop: 6 },

  card: {
    backgroundColor: colors.paper2,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: colors.line,
  },
  cardLabelRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  cardLabel: { fontFamily: fonts.hand, fontSize: 15, color: colors.ink },
  cardCount: { fontSize: 12, color: colors.ink3, marginLeft: 8 },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  cardValue: { fontSize: 14.5, color: colors.ink, flexShrink: 1 },
  cardSide: { marginLeft: 12 },
  pill: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 999, fontSize: 12, backgroundColor: colors.roseTint, color: colors.camelliaDeep, overflow: 'hidden' },
  cardEmpty: { fontSize: 13, color: colors.ink3, marginTop: 6 },

  traitWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  traitChip: {
    fontSize: 13,
    color: colors.camelliaDeep,
    backgroundColor: colors.camelliaTint,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    overflow: 'hidden',
  },

  actions: { marginTop: 8 },
  btn: { alignItems: 'center', justifyContent: 'center', borderRadius: 12, minHeight: 46, paddingHorizontal: 16, marginTop: 12 },
  pressed: { opacity: 0.7 },
  btnPrimary: { backgroundColor: colors.camellia },
  btnPrimaryText: { color: colors.paper, fontSize: 15, fontWeight: '600' },
  btnDanger: { backgroundColor: colors.paper2, borderWidth: 1, borderColor: colors.rose },
  btnDangerText: { color: colors.camelliaDeep, fontSize: 15 },
});