// =====================================================================
// 云同步状态页（M12）
// 展示同步状态、上次同步时间、待同步条数，提供「立即同步」。
// 数据随账号同步到云端，换机/重装登录即可恢复。
// =====================================================================
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../../src/auth/AuthContext';
import { useSync } from '../../src/sync/SyncContext';
import { colors, fonts } from '../../src/theme';

function formatTime(iso: string | null): string {
  if (!iso) return '尚未同步';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '尚未同步';
  const pad = (n: number) => `${n}`.padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function phaseText(phase: string, bootstrapping: boolean): string {
  if (bootstrapping) return '正在恢复数据…';
  switch (phase) {
    case 'syncing':
      return '同步中…';
    case 'offline':
      return '暂时离线，稍后自动重试';
    case 'error':
      return '同步遇到问题';
    case 'blocked':
      return '等待确认合并';
    default:
      return '已同步';
  }
}

export default function SyncSettingsScreen() {
  const { account } = useAuth();
  const {
    phase,
    bootstrapping,
    lastSyncedAt,
    pending,
    deadLetters,
    error,
    legacy,
    conflict,
    syncNow,
    resolveConflict,
  } = useSync();

  const busy = phase === 'syncing' || bootstrapping;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.card}>
        <Text style={styles.statusLabel}>同步状态</Text>
        <Text style={styles.statusValue}>{phaseText(phase, bootstrapping)}</Text>
        <View style={styles.metaRow}>
          <Text style={styles.metaKey}>上次同步</Text>
          <Text style={styles.metaValue}>{formatTime(lastSyncedAt)}</Text>
        </View>
        <View style={styles.metaRow}>
          <Text style={styles.metaKey}>待同步</Text>
          <Text style={styles.metaValue}>{pending} 条</Text>
        </View>
        {deadLetters > 0 ? (
          <View style={styles.metaRow}>
            <Text style={styles.metaKey}>无法上传</Text>
            <Text style={styles.metaValue}>{deadLetters} 条（数据异常，已留存待处理）</Text>
          </View>
        ) : null}
        <View style={styles.metaRow}>
          <Text style={styles.metaKey}>当前账号</Text>
          <Text style={styles.metaValue} numberOfLines={1}>
            {account?.displayName ?? '已登录'}
          </Text>
        </View>
      </View>

      {conflict ? (
        <View style={styles.warnCard}>
          <Text style={styles.warnTitle}>本机与云端都有数据</Text>
          <Text style={styles.warnText}>
            本机 {conflict.localRows} 条、云端 {conflict.cloudRows} 条。合并时会按更新时间取较新的记录。
          </Text>
          <Pressable style={styles.primaryBtn} onPress={resolveConflict}>
            <Text style={styles.primaryText}>按更新时间合并</Text>
          </Pressable>
        </View>
      ) : null}

      {error ? (
        <View style={styles.errorCard}>
          <Text style={styles.errorTitle}>同步提示</Text>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}

      {legacy ? (
        <View style={styles.noticeCard}>
          <Text style={styles.noticeTitle}>已迁入本机旧数据</Text>
          <Text style={styles.noticeText}>
            {legacy.persons} 位对象、{legacy.anniversaries} 条纪念日、{legacy.traits} 条特征、
            {legacy.history} 条心意记录、{legacy.prepares} 份祝福内容已归入当前账号并上传云端。
          </Text>
        </View>
      ) : null}

      <Pressable
        style={[styles.primaryBtn, busy && styles.primaryBtnDisabled]}
        onPress={syncNow}
        disabled={busy}
      >
        {busy ? (
          <ActivityIndicator size="small" color="#FCF4F4" />
        ) : (
          <Text style={styles.primaryText}>立即同步</Text>
        )}
      </Pressable>

      <Text style={styles.footnote}>
        对象、纪念日、特征、设置、心意记录、祝福内容与贺卡背景图都会同步。通知权限与隐私同意属于本机状态，不会同步。
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  content: { padding: 22, gap: 14, paddingBottom: 40 },

  card: {
    backgroundColor: colors.paper2,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 14,
    padding: 16,
  },
  statusLabel: { fontSize: 12.5, color: colors.ink3 },
  statusValue: {
    fontFamily: fonts.hand,
    fontSize: 24,
    color: colors.ink,
    marginTop: 6,
    marginBottom: 10,
  },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, gap: 12 },
  metaKey: { fontSize: 13.5, color: colors.ink2 },
  metaValue: { fontSize: 13.5, color: colors.ink, flexShrink: 1, textAlign: 'right' },

  warnCard: {
    borderWidth: 1,
    borderColor: '#E5D6AA',
    backgroundColor: '#FBF4E2',
    borderRadius: 14,
    padding: 16,
    gap: 8,
  },
  warnTitle: { fontSize: 15, fontWeight: '600', color: colors.ink },
  warnText: { fontSize: 13, color: colors.ink2, lineHeight: 19 },

  errorCard: {
    borderWidth: 1,
    borderColor: colors.rose,
    backgroundColor: colors.paper2,
    borderRadius: 14,
    padding: 16,
    gap: 6,
  },
  errorTitle: { fontSize: 14, fontWeight: '600', color: colors.camelliaDeep },
  errorText: { fontSize: 12.5, color: colors.ink2, lineHeight: 18 },

  noticeCard: {
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.paper2,
    borderRadius: 14,
    padding: 16,
    gap: 6,
  },
  noticeTitle: { fontSize: 14, fontWeight: '600', color: colors.ink },
  noticeText: { fontSize: 12.5, color: colors.ink2, lineHeight: 18 },

  primaryBtn: {
    minHeight: 46,
    borderRadius: 12,
    backgroundColor: colors.camellia,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  primaryBtnDisabled: { opacity: 0.6 },
  primaryText: { color: '#FCF4F4', fontSize: 15, fontWeight: '600' },

  footnote: {
    marginTop: 8,
    fontSize: 12,
    color: colors.ink3,
    lineHeight: 18,
    textAlign: 'center',
    fontFamily: fonts.ui,
  },
});
