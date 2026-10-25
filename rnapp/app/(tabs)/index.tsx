// =====================================================================
// 提醒页（提醒 Tab）
// 上半部分：自己设置的日子（对象的纪念日），按倒计时从近到远排列；
// 下半部分：通用节日（与「设置 - 节日设置」里已关注的节日一致），同样按倒计时排列。
// 通知权限关闭时保留「近日心意」作为备用入口（本页本身就是该入口）。
// =====================================================================
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import PageHeader from '../../src/components/PageHeader';
import { colors, fonts, radius } from '../../src/theme';
import { listPersons } from '../../src/data/personRepository';
import { listAnniversariesByPerson } from '../../src/data/anniversaryRepository';
import { useSettings } from '../../src/settings/SettingsContext';
import { useSync } from '../../src/sync/SyncContext';
import { FESTIVALS, festivalDate, type Festival } from '../../src/settings/festivals';
import { formatMonthDay, nextOccurrenceDays } from '../../src/utils/calendar';

// 对象的一条日子（纪念日；生日也按纪念日记录）
type PersonDay = {
  key: string;
  personId: string;
  personName: string;
  relationship: string;
  dayName: string;
  dateText: string;
  days: number;
};

// 一个已关注节日的下次发生日期
type FestivalDay = {
  id: string;
  name: string;
  ruleText: string;
  dateText: string;
  days: number;
};

/** 公历 YYYY-MM-DD →「9月2日」 */
function formatYmd(ymd: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!m) return ymd;
  return `${Number(m[2])}月${Number(m[3])}日`;
}

/** 节日副标题里的规则文案：农历写「农历八月十五」，规则日写「5 月第二个周日」，公历节日不重复日期 */
function festivalRuleText(festival: Festival): string {
  const rule = festival.calculationRule ?? '';
  if (festival.kind === 'lunar') return rule.replace('对应公历日期', '');
  if (festival.kind === 'rule') return rule;
  return '';
}

/**
 * 节日距今天的「下一次发生」天数：依次尝试今年与明年，取第一个未过去的日子。
 * 农历节日里 festivalDate 的年份参数就是农历年，同样适用。
 */
function festivalDaysUntil(
  festivalId: string,
  ref: Date = new Date(),
): { date: string; days: number } | null {
  const today = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate());
  for (let year = today.getFullYear(); year <= today.getFullYear() + 1; year++) {
    const date = festivalDate(festivalId, year);
    if (!date) continue;
    const [y, m, d] = date.split('-').map(Number);
    const target = new Date(y, m - 1, d);
    const days = Math.round((target.getTime() - today.getTime()) / 86400000);
    if (days >= 0) return { date, days };
  }
  return null;
}

/** 取名字首字做圆形图标 */
function initial(name: string): string {
  return name.trim().charAt(0) || '心';
}

/** 倒计时胶囊文案 */
function countdownText(days: number): string {
  return days === 0 ? '今天' : `还有 ${days} 天`;
}

export default function ReminderScreen() {
  const { followedFestivals, followedCount, pushEnabled } = useSettings();
  // 远端数据落库后 dataVersion 自增，本页随之重读
  const { dataVersion } = useSync();
  // null = 加载中；用 useFocusEffect 保证从对象页/设置页返回时数据是最新的
  const [personDays, setPersonDays] = useState<PersonDay[] | null>(null);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        const persons = await listPersons();
        const groups = await Promise.all(
          persons.map(async (person) => {
            const list = await listAnniversariesByPerson(person.id);
            return list.map<PersonDay>((a) => ({
              key: `${person.id}:${a.id}`,
              personId: person.id,
              personName: person.name,
              relationship: person.relationship,
              dayName: a.name,
              dateText: formatMonthDay(a.date, a.calendar),
              days: nextOccurrenceDays(a.date, a.calendar),
            }));
          }),
        );
        if (!cancelled) {
          // 按天数排序：最近的放前面
          setPersonDays(groups.flat().sort((a, b) => a.days - b.days));
        }
      })().catch(() => {
        if (!cancelled) setPersonDays([]);
      });
      return () => {
        cancelled = true;
      };
      // dataVersion 在回调体内不参与计算，只作为「远端数据已落库」的触发信号
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [dataVersion]),
  );

  // 已关注的节日 → 下次发生日期与倒计时（与设置页的开关实时同步）
  const festivalDays = useMemo<FestivalDay[]>(() => {
    const list: FestivalDay[] = [];
    for (const festival of FESTIVALS) {
      if (!followedFestivals[festival.id]) continue;
      const next = festivalDaysUntil(festival.id);
      if (!next) continue;
      list.push({
        id: festival.id,
        name: festival.name,
        ruleText: festivalRuleText(festival),
        dateText: formatYmd(next.date),
        days: next.days,
      });
    }
    return list.sort((a, b) => a.days - b.days);
  }, [followedFestivals]);

  // 明信片：所有日子里最近的一个
  const nearest = useMemo(() => {
    if (personDays === null) return null;
    const candidates: {
      days: number;
      title: string;
      subtitle: string;
      personId: string | null;
      festivalId: string | null;
    }[] = [
      ...personDays.map((d) => ({
        days: d.days,
        title: `${d.personName}的${d.dayName}`,
        subtitle: d.dateText,
        personId: d.personId,
        festivalId: null,
      })),
      ...festivalDays.map((d) => ({
        days: d.days,
        title: d.name,
        subtitle: d.dateText,
        personId: null,
        festivalId: d.id,
      })),
    ];
    candidates.sort((a, b) => a.days - b.days);
    return candidates[0] ?? null;
  }, [personDays, festivalDays]);

  const loading = personDays === null;

  return (
    <View style={styles.screen}>
      <PageHeader title="提醒" subtitle="重要的日子，我会提前提醒你" />
      <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
        {/* 明信片：最近一个临近日子 */}
        {nearest ? (
          <View style={styles.postcard}>
            <View style={styles.tag}>
              <Text style={styles.tagText}>
                {nearest.days === 0 ? '就是 ' : '接下来 '}
                <Text style={styles.tagBold}>{countdownText(nearest.days)}</Text>
              </Text>
            </View>
            <Text style={styles.pcMain}>{nearest.title}</Text>
            <Text style={styles.pcSub}>{nearest.subtitle} · 把祝福、礼物和贺卡都提前备好</Text>
            {nearest.personId || nearest.festivalId ? (
              <Pressable
                style={[styles.btnPine, { marginTop: 16 }]}
                onPress={() =>
                  nearest.personId
                    ? router.push(`/person/${nearest.personId}`)
                    : nearest.festivalId
                      ? router.push(`/prepare/holiday/${nearest.festivalId}`)
                      : undefined
                }
              >
                <Text style={styles.btnPineText}>去准备</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}

        {/* 自己设置的日子 */}
        <Text style={styles.secT}>
          重要的人 <Text style={styles.secTsmall}>{personDays?.length ?? 0} 个日子</Text>
        </Text>
        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.camellia} />
          </View>
        ) : personDays.length === 0 ? (
          <Text style={styles.empty}>还没有记录日子，去联系人为在乎的人添一条纪念日吧。</Text>
        ) : (
          <View style={styles.list}>
            {personDays.map((d) => (
              <Pressable
                key={d.key}
                style={styles.cardRow}
                onPress={() => router.push(`/person/${d.personId}`)}
              >
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>{initial(d.personName)}</Text>
                </View>
                <View style={styles.rowMain}>
                  <Text style={styles.rowName}>{d.personName}</Text>
                  <Text style={styles.rowMeta} numberOfLines={1}>
                    {d.relationship ? `${d.relationship} · ` : ''}
                    {d.dayName} · {d.dateText}
                  </Text>
                </View>
                <Text style={[styles.pill, d.days === 0 && styles.pillToday]}>
                  {countdownText(d.days)}
                </Text>
              </Pressable>
            ))}
          </View>
        )}

        {/* 通用节日：与设置里已关注的一致 */}
        <Text style={styles.secT}>
          通用节日 <Text style={styles.secTsmall}>已关注 {followedCount} 个</Text>
        </Text>
        {festivalDays.length === 0 ? (
          <Text style={styles.empty}>还没有关注的节日，可在「设置 - 节日设置」里打开。</Text>
        ) : (
          <View style={styles.list}>
            {festivalDays.map((d) => (
              <Pressable
                key={d.id}
                style={styles.cardRow}
                onPress={() => router.push(`/prepare/holiday/${d.id}`)}
              >
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>{initial(d.name)}</Text>
                </View>
                <View style={styles.rowMain}>
                  <Text style={styles.rowName}>{d.name}</Text>
                  <Text style={styles.rowMeta} numberOfLines={1}>
                    {d.ruleText ? `${d.ruleText} · ` : ''}
                    {d.dateText}
                  </Text>
                </View>
                <Text style={[styles.pill, d.days === 0 && styles.pillToday]}>
                  {countdownText(d.days)}
                </Text>
              </Pressable>
            ))}
          </View>
        )}

        {/* 通知未开提示 */}
        {!pushEnabled ? (
          <View style={styles.banner}>
            <Text style={styles.bannerTxt}>通知没开，早上九点我就提醒不到你了。</Text>
            <Pressable
              style={[styles.btnPine, styles.btnSmall]}
              onPress={() => void Linking.openSettings()} // 已拒绝 → 引导去系统设置开启
            >
              <Text style={styles.btnPineText}>去设置</Text>
            </Pressable>
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  body: { flex: 1 },
  bodyContent: { paddingHorizontal: 22, paddingBottom: 28, paddingTop: 6 },

  postcard: {
    backgroundColor: colors.paper2,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.xl,
    padding: 20,
    paddingBottom: 18,
  },
  tag: {
    alignSelf: 'flex-start',
    backgroundColor: colors.camelliaTint,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  tagText: { fontSize: 12.5, color: '#8F4E55' },
  tagBold: { fontWeight: '600' },
  pcMain: { fontFamily: fonts.hand, fontSize: 26, lineHeight: 32, color: colors.ink, marginTop: 12 },
  pcSub: { fontSize: 13.5, color: colors.ink2, marginTop: 4 },
  btnPine: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    backgroundColor: colors.camellia,
    minHeight: 42,
    paddingHorizontal: 16,
    paddingVertical: 11,
  },
  btnPineText: { color: '#FCF4F4', fontSize: 14.5, fontWeight: '600' },
  btnSmall: { minHeight: 36, paddingVertical: 7, paddingHorizontal: 12 },

  secT: { fontFamily: fonts.hand, fontSize: 17, color: colors.ink, marginTop: 24, marginBottom: 8 },
  secTsmall: { fontSize: 12, color: colors.ink2, fontFamily: fonts.ui, marginLeft: 8 },
  center: { paddingVertical: 30, alignItems: 'center' },
  empty: { fontSize: 13, color: colors.ink2, lineHeight: 20, paddingVertical: 10 },

  list: { gap: 10 },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.paper2,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.camelliaTint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontFamily: fonts.hand, fontSize: 18, color: colors.camelliaDeep },
  rowMain: { flex: 1 },
  rowName: { fontFamily: fonts.hand, fontSize: 16, color: colors.ink },
  rowMeta: { fontSize: 12.5, color: colors.ink2, marginTop: 2 },
  pill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    fontSize: 12,
    backgroundColor: colors.roseTint,
    color: colors.camelliaDeep,
    overflow: 'hidden',
  },
  pillToday: { backgroundColor: colors.camelliaDeep, color: '#FCF4F4', fontWeight: '600' },

  banner: {
    backgroundColor: colors.roseTint,
    borderWidth: 1,
    borderColor: colors.rose,
    borderRadius: radius.md,
    padding: 12,
    paddingLeft: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 18,
  },
  bannerTxt: { flex: 1, fontSize: 13, color: colors.ink2 },
});
