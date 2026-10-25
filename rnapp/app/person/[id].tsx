// =====================================================================
// 对象页：基础资料 + 内联心意内容（祝福语 / 礼物建议 / 贺卡入口）
// 2026-10-25 改造：祝福语与礼物原先只在「准备心意」页展示，现直接内联在本页，
// 进页即按设置自动生成（有缓存则先展示缓存），不再需要额外跳转。
// =====================================================================
import { useCallback, useMemo, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, Alert, ActivityIndicator, Pressable } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { colors, fonts } from '../../src/theme';
import { Person, getPerson, softDeletePerson } from '../../src/data/personRepository';
import { Anniversary, listAnniversariesByPerson } from '../../src/data/anniversaryRepository';
import { listTraitsByPerson } from '../../src/data/traitRepository';
import { formatMonthDay, nextOccurrenceDays } from '../../src/utils/calendar';
import { useSync } from '../../src/sync/SyncContext';
import { useSettings } from '../../src/settings/SettingsContext';
import { usePrepareContent } from '../../src/hooks/usePrepareContent';
import BlessingPanel from '../../src/components/BlessingPanel';
import AiActionsSection from '../../src/components/AiActionsSection';
import CardPreview from '../../src/components/CardPreview';

type Data = {
  person: Person;
  anniversaries: Anniversary[];
  traits: string[];
};

export default function PersonScreen() {
  // card：从历史页点进来时带上的贺卡 id。有它就固定展示这一张，
  // 不按对象「最新内容」重新选，也不触发生成。
  const { id, card } = useLocalSearchParams<{ id: string; card?: string }>();
  const [data, setData] = useState<Data | null>(null);
  // 区分「加载中」与「不存在」（被删/已恢复）
  const [notFound, setNotFound] = useState(false);
  // 远端数据落库后 dataVersion 自增，本页随之重读
  const { dataVersion } = useSync();
  const { blessingCount, giftEnabled, cardEnabled, platform, settingsLoaded } = useSettings();

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
      // 从编辑页返回时数据可能已变化，重新聚焦即刷新
      setNotFound(false);
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
    // dataVersion 在回调体内不参与计算，只作为「远端数据已落库」的触发信号
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, dataVersion]);

  // 每次回到本页（含从编辑页返回）都重读，避免显示旧数据
  useFocusEffect(load);

  // 生成场景：有名为「生日」的纪念日按生日语气，否则按纪念日语气
  const scenario = useMemo(
    () => ({
      sceneKind: 'contact' as const,
      scene: (data?.anniversaries.some((a) => a.name === '生日') ? 'birthday' : 'anniversary') as
        | 'birthday'
        | 'anniversary',
      relationship: data?.person.relationship ?? '',
      traits: data?.traits ?? [],
      personId: id ?? null,
      festivalCode: null,
    }),
    [data, id],
  );

  // 资料与设置都读到最终值后才发起生成，否则空特征会被误判成「没有特征」
  const hook = usePrepareContent(
    scenario,
    blessingCount,
    giftEnabled,
    Boolean(data) && settingsLoaded,
  );

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
            .then(() => {
              // M6-04：对象删除后取消其所有未触发的推送（重排即剔除）
              void import('../../src/notifications/scheduler').then((m) => m.rescheduleAll());
              router.back();
            })
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

        {/* 祝福语（内联，进页即生成，有缓存先展示缓存） */}
        <BlessingPanel
          hook={hook}
          headerLabel="祝福语"
          onGoEdit={() => router.push(`/person/${person.id}/edit`)}
          // 从历史记录进来是「看」：不重新生成、也不就地编辑，内容固定
          readOnly={Boolean(card)}
        />

        {/* 礼物建议 + 电子贺卡入口（开关在组件内部生效） */}
        <View style={styles.actionsSection}>
          <AiActionsSection
            hook={hook}
            platform={platform}
            giftEnabled={giftEnabled}
            cardEnabled={cardEnabled}
            onOpenCard={
              hook.prepareId ? () => router.push(`/card/${hook.prepareId}`) : () => {}
            }
            // 只有从历史记录进来（带 card 参数）才把那张卡摆成一张图片：
            // 纯展示、不可点、没有编辑入口，也不再出「生成电子贺卡」按钮。
            // 从「联系人」Tab 正常进入时不传，保留原来的「生成电子贺卡」入口
            // （进贺卡页出图、编辑、保存、分享）。
            cardSlot={card ? <CardPreview prepareId={card} /> : undefined}
          />
        </View>

        {/* 纪念日（生日也在这里，由用户自己添加名为「生日」的一条） */}
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
                  {a.name}　{formatMonthDay(a.date, a.calendar)}
                </Text>
                <View style={styles.cardSide}>
                  <Text style={styles.pill}>{nextOccurrenceDays(a.date, a.calendar)} 天后</Text>
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

        {/* 操作按钮（祝福与礼物已内联在本页，故不再需要「准备心意」入口） */}
        <View style={styles.actions}>
          <Pressable
            style={({ pressed }) => [styles.btn, styles.btnGhost, pressed && styles.pressed]}
            onPress={() => router.push(`/person/${person.id}/edit`)}
          >
            <Text style={styles.btnGhostText}>编辑对象</Text>
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

  actionsSection: { marginTop: 22, marginBottom: 22 },

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
  btnGhost: { backgroundColor: colors.paper2, borderWidth: 1, borderColor: colors.line },
  btnGhostText: { color: colors.ink2, fontSize: 15 },
  btnDanger: { backgroundColor: colors.paper2, borderWidth: 1, borderColor: colors.rose },
  btnDangerText: { color: colors.camelliaDeep, fontSize: 15 },
});
