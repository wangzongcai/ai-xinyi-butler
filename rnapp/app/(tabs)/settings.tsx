import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import PageHeader from '../../src/components/PageHeader';
import { useSettings } from '../../src/settings/SettingsContext';
import { useSync } from '../../src/sync/SyncContext';
import { colors, fonts } from '../../src/theme';

type IconColor = 'camellia' | 'teal' | 'gold' | 'ink2';

const TINT: Record<IconColor, string> = {
  camellia: colors.roseTint,
  teal: '#E4EFEC',
  gold: '#F3E9D6',
  ink2: '#EEE2E1',
};

function SettingRow({
  icon,
  iconColor,
  label,
  value,
  to,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  iconColor: IconColor;
  label: string;
  value?: string;
  to?: string;
}) {
  const content = (
    <View style={styles.row}>
      <View style={[styles.iconWrap, { backgroundColor: TINT[iconColor] }]}>
        <Ionicons name={icon} size={18} color={colors[iconColor]} />
      </View>
      <Text style={styles.rowLabel}>{label}</Text>
      {value ? <Text style={styles.rowValue}>{value}</Text> : null}
      <Ionicons name="chevron-forward" size={17} color={colors.ink3} />
    </View>
  );
  if (!to) return content;
  return <Pressable onPress={() => router.push(to)}>{content}</Pressable>;
}

function Sep() {
  return <View style={styles.sep} />;
}

export default function SettingsScreen() {
  const {
    remindDays,
    remindTimeText,
    pushEnabled,
    setPushEnabled,
    blessingCount,
    platform,
    cardSignature,
    followedCount,
  } = useSettings();
  const { phase, pending } = useSync();

  // 入口右侧状态：待同步条数优先，其次同步中/离线
  const syncLabel =
    pending > 0
      ? `待同步${pending}条`
      : phase === 'syncing'
        ? '同步中…'
        : phase === 'offline'
          ? '离线'
          : phase === 'error'
            ? '同步异常'
            : '已同步';

  return (
    <View style={styles.screen}>
      <PageHeader title="设置" subtitle="按你的节奏，安排每一次提醒" />
      <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
        <Text style={styles.groupTitle}>提醒</Text>
        <View style={styles.group}>
          <SettingRow
            icon="alarm-outline"
            iconColor="camellia"
            label="提醒设置"
            value={`提前${remindDays}天 · ${remindTimeText}`}
            to="/settings/reminder"
          />
          <Sep />
          <View style={styles.row}>
            <View style={[styles.iconWrap, { backgroundColor: colors.roseTint }]}>
              <Ionicons name="notifications-outline" size={18} color={colors.camellia} />
            </View>
            <Text style={styles.rowLabel}>推送通知</Text>
            <Switch
              value={pushEnabled}
              onValueChange={setPushEnabled}
              trackColor={{ false: colors.line, true: colors.rose }}
              thumbColor={pushEnabled ? colors.camellia : colors.paper2}
            />
          </View>
        </View>

        <Text style={styles.groupTitle}>心意内容</Text>
        <View style={styles.group}>
          <SettingRow
            icon="mail-open-outline"
            iconColor="camellia"
            label="祝福语设置"
            value={`每次${blessingCount}条`}
            to="/settings/blessing"
          />
          <Sep />
          <SettingRow
            icon="gift-outline"
            iconColor="gold"
            label="礼物设置"
            value={platform === 'taobao' ? '淘宝' : '京东'}
            to="/settings/gift"
          />
          <Sep />
          <SettingRow
            icon="image-outline"
            iconColor="teal"
            label="贺卡设置"
            value={cardSignature ? '署名开' : '署名关'}
            to="/settings/card"
          />
        </View>

        <Text style={styles.groupTitle}>通用</Text>
        <View style={styles.group}>
          <SettingRow
            icon="cloud-done-outline"
            iconColor="teal"
            label="云同步"
            value={syncLabel}
            to="/settings/sync"
          />
          <Sep />
          <SettingRow
            icon="calendar-outline"
            iconColor="camellia"
            label="节日设置"
            value={`已关注${followedCount}个`}
            to="/settings/festivals"
          />
          <Sep />
          <SettingRow
            icon="trash-outline"
            iconColor="ink2"
            label="回收站"
            value="删除 30 天内可恢复"
            to="/recycle-bin"
          />
        </View>

        <Pressable
          style={styles.accountEntry}
          onPress={() => router.push('/settings/account')}
        >
          <View style={styles.row}>
            <View style={[styles.iconWrap, { backgroundColor: '#F8F0DC' }]}>
              <Ionicons name="person-circle-outline" size={18} color={colors.gold} />
            </View>
            <Text style={[styles.rowLabel, { color: colors.gold }]}>账号管理</Text>
            <Ionicons name="chevron-forward" size={17} color={colors.gold} />
          </View>
        </Pressable>

        <Text style={styles.footnote}>
          心意数据会随账号加密同步到云端，换机或重装后登录即可恢复；本机保留一份缓存，离线也能正常使用。
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  body: { flex: 1 },
  bodyContent: { paddingHorizontal: 22, paddingBottom: 28, paddingTop: 6 },

  groupTitle: {
    fontSize: 12.5,
    color: colors.ink3,
    marginTop: 20,
    marginBottom: 4,
    marginLeft: 2,
  },
  group: {
    backgroundColor: colors.paper2,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.line,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    minHeight: 54,
  },
  iconWrap: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowLabel: { fontSize: 15, color: colors.ink, flex: 1 },
  rowValue: { fontSize: 13, color: colors.ink3 },
  sep: { height: 1, backgroundColor: colors.line, marginLeft: 60 },

  accountEntry: {
    marginTop: 20,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E5D6AA',
    backgroundColor: '#FBF4E2',
    overflow: 'hidden',
  },

  footnote: {
    marginTop: 24,
    fontSize: 12,
    color: colors.ink3,
    textAlign: 'center',
    fontFamily: fonts.ui,
  },
});
