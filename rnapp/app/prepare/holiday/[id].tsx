// =====================================================================
// 心意准备页 · 节日（M7-05 / M7-06）
// 进入：提醒页节日条目 / 通用节日推送深链。顶部提供联系人选择器，
// 默认「不指定收件人」生成节日通用祝福；选中某位联系人后生成时引用其特征。
// =====================================================================
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { colors, fonts } from '../../../src/theme';
import { getFestival } from '../../../src/settings/festivals';
import { listPersons } from '../../../src/data/personRepository';
import { listTraitsByPerson } from '../../../src/data/traitRepository';
import { useSettings } from '../../../src/settings/SettingsContext';
import { usePrepareContent } from '../../../src/hooks/usePrepareContent';
import BlessingPanel from '../../../src/components/BlessingPanel';
import AiActionsSection from '../../../src/components/AiActionsSection';
import ContactSelector, {
  type SelectablePerson,
} from '../../../src/components/ContactSelector';

export default function PrepareHolidayScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const festival = getFestival(id as string);

  const { blessingCount, giftEnabled, cardEnabled, platform, settingsLoaded } = useSettings();
  const [persons, setPersons] = useState<SelectablePerson[]>([]);
  const [recipientId, setRecipientId] = useState<string | null>(null);
  // 选中收件人的特征
  const [recipientTraits, setRecipientTraits] = useState<string[]>([]);
  const [recipientRel, setRecipientRel] = useState('');
  // 收件人的关系 / 特征是否已读完：未读完就生成会用到空值
  const [recipientLoading, setRecipientLoading] = useState(false);

  // 加载联系人列表供选择器使用
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const list = await listPersons();
      if (!cancelled) {
        setPersons(list.map((p) => ({ id: p.id, name: p.name, relationship: p.relationship })));
      }
    })().catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  // 切换收件人：加载其关系与特征，供生成更贴合的内容。
  // 读取期间置 recipientLoading，避免用空关系 / 空特征先生成一版
  const changeRecipient = useCallback((personId: string | null) => {
    setRecipientId(personId);
    setRecipientTraits([]);
    setRecipientRel('');
    if (!personId) {
      setRecipientLoading(false);
      return;
    }
    setRecipientLoading(true);
    (async () => {
      try {
        const p = (await listPersons()).find((x) => x.id === personId);
        if (p) {
          setRecipientRel(p.relationship);
          const t = await listTraitsByPerson(personId);
          setRecipientTraits(t.map((x) => x.content));
        }
      } catch {
        // 读取失败按「不指定收件人」的内容生成，不阻塞页面
      } finally {
        setRecipientLoading(false);
      }
    })();
  }, []);

  const scenario = useMemo(
    () => ({
      sceneKind: 'holiday' as const,
      scene: 'festival' as const,
      festivalName: festival?.name,
      relationship: recipientId ? recipientRel : '',
      traits: recipientId ? recipientTraits : [],
      personId: recipientId,
      festivalCode: id as string,
    }),
    [festival?.name, recipientId, recipientRel, recipientTraits, id],
  );

  const hook = usePrepareContent(
    scenario,
    blessingCount,
    giftEnabled,
    settingsLoaded && !recipientLoading,
  );

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.body}>
        <View style={styles.headBlock}>
          <Text style={styles.name}>{festival?.name ?? '节日'}</Text>
          <Text style={styles.rule}>{festival?.calculationRule}</Text>
        </View>

        {/* 联系人选择器：默认「不指定收件人」 */}
        <View style={styles.selectorWrap}>
          <ContactSelector persons={persons} value={recipientId} onChange={changeRecipient} />
        </View>

        <View style={styles.blessingWrap}>
          <BlessingPanel
            hook={hook}
            headerLabel="祝福语"
            onGoEdit={recipientId ? () => router.push(`/person/${recipientId}/edit`) : undefined}
          />
        </View>

        <View style={styles.actions}>
          <AiActionsSection
            hook={hook}
            platform={platform}
            giftEnabled={giftEnabled}
            cardEnabled={cardEnabled}
            onOpenCard={
              hook.prepareId ? () => router.push(`/card/${hook.prepareId}`) : () => {}
            }
          />
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  body: { paddingHorizontal: 22, paddingVertical: 20, paddingBottom: 48 },
  headBlock: { marginBottom: 16 },
  name: { fontFamily: fonts.hand, fontSize: 28, color: colors.ink },
  rule: { fontSize: 13, color: colors.ink2, marginTop: 6 },
  selectorWrap: { marginBottom: 22 },
  blessingWrap: { marginTop: 4 },
  actions: { marginTop: 28 },
});