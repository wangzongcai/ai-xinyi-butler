import { View, Text, ScrollView, Pressable, StyleSheet, Alert } from 'react-native';
import { router } from 'expo-router';
import PageHeader from '../../src/components/PageHeader';
import { useAuth } from '../../src/auth/AuthContext';
import { avatarText, providerLabel } from '../../src/auth/account';
import { colors, fonts } from '../../src/theme';

export default function SettingsScreen() {
  const { account, loading, signOut } = useAuth();

  // 退出只清除账号身份，本机心意数据一条不动
  function handleSignOut() {
    Alert.alert('退出登录', '退出后回到游客状态，本机心意数据不会删除。', [
      { text: '取消', style: 'cancel' },
      {
        text: '退出',
        style: 'destructive',
        onPress: async () => {
          try {
            await signOut();
          } catch {
            Alert.alert('退出失败', '请稍后再试');
          }
        },
      },
    ]);
  }

  return (
    <View style={styles.screen}>
      <PageHeader title="设置" subtitle="提醒与生成的偏好" />
      <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
        {/* 占位设置项（里程碑三接数据） */}
        <View style={styles.setting}>
          <View style={styles.settingRow}>
            <View style={styles.settingLabel}>
              <Text style={styles.k}>提前提醒天数</Text>
              <Text style={styles.h}>全局生效 ， 0 表示只在当天</Text>
            </View>
            <View style={styles.stepper}>
              <Text style={styles.stepperBtn}>−</Text>
              <Text style={styles.stepperV}>3 天</Text>
              <Text style={styles.stepperBtn}>＋</Text>
            </View>
          </View>
        </View>

        <View style={styles.setting}>
          <View style={styles.settingRow}>
            <View style={styles.settingLabel}>
              <Text style={styles.k}>每次生成祝福</Text>
              <Text style={styles.h}>可调 1 到 5 条</Text>
            </View>
            <View style={styles.stepper}>
              <Text style={styles.stepperBtn}>−</Text>
              <Text style={styles.stepperV}>3 条</Text>
              <Text style={styles.stepperBtn}>＋</Text>
            </View>
          </View>
        </View>

        <View style={styles.setting}>
          <Text style={[styles.k, { marginBottom: 10 }]}>礼物「去看看」跳转平台</Text>
          <View style={styles.seg}>
            <View style={[styles.segBtn, styles.segBtnOn]}>
              <Text style={[styles.segText, styles.segTextOn]}>淘宝</Text>
            </View>
            <View style={styles.segBtn}>
              <Text style={styles.segText}>京东</Text>
            </View>
          </View>
        </View>

        {/* 账号 */}
        <Text style={styles.secT}>账号</Text>
        <View style={styles.account}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{account ? avatarText(account.provider) : '客'}</Text>
          </View>
          <View style={styles.info}>
            <Text style={styles.infoMain}>
              {loading ? '正在恢复登录状态…' : account ? account.displayName : '未登录'}
            </Text>
            <Text style={styles.infoSub}>
              {account
                ? `已通过${providerLabel(account.provider)}登录 · 心意数据仍只存在这台设备`
                : '登录后，心意数据仍只存在这台设备'}
            </Text>
          </View>
        </View>
        {account ? (
          <Pressable style={[styles.btnGhost, { marginTop: 14 }]} onPress={handleSignOut}>
            <Text style={styles.btnGhostText}>退出登录</Text>
          </Pressable>
        ) : (
          <Pressable
            style={[styles.btnGhost, { marginTop: 14 }]}
            onPress={() => router.push('/login')}
          >
            <Text style={styles.btnGhostText}>登录或注册</Text>
          </Pressable>
        )}

        {/* 其他 */}
        <Text style={styles.secT}>其他</Text>
        <View style={styles.list}>
          <Pressable style={styles.row} onPress={() => router.push('/recycle-bin')}>
            <View>
              <Text style={styles.rowName}>回收站</Text>
              <Text style={styles.rowMeta}>已删除对象保留 30 天可恢复</Text>
            </View>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  body: { flex: 1 },
  bodyContent: { paddingHorizontal: 22, paddingBottom: 28, paddingTop: 6 },
  setting: { paddingVertical: 15, borderBottomWidth: 1, borderBottomColor: colors.line },
  settingRow: { flexDirection: 'row', alignItems: 'center' },
  settingLabel: { flex: 1 },
  k: { fontSize: 15, color: colors.ink },
  h: { fontSize: 12.5, color: colors.ink2, marginTop: 2 },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 8,
    backgroundColor: colors.paper2,
  },
  stepperBtn: { width: 36, textAlign: 'center', fontSize: 19, color: colors.camellia, paddingVertical: 6 },
  stepperV: { minWidth: 52, textAlign: 'center', fontSize: 14, fontWeight: '600', color: colors.ink },
  seg: { flexDirection: 'row', backgroundColor: colors.roseTint, borderRadius: 12, padding: 4 },
  segBtn: { flex: 1, paddingVertical: 8, borderRadius: 9, alignItems: 'center' },
  segBtnOn: { backgroundColor: colors.paper2 },
  segText: { fontSize: 13.5, color: colors.ink2 },
  segTextOn: { color: colors.camellia, fontWeight: '600' },
  secT: { fontFamily: fonts.hand, fontSize: 17, color: colors.ink, marginTop: 24, marginBottom: 8 },
  account: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 6 },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.roseTint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontFamily: fonts.hand, fontSize: 18, color: colors.camellia },
  info: { flex: 1 },
  infoMain: { fontSize: 14.5, color: colors.ink },
  infoSub: { fontSize: 12, color: colors.ink2 },
  btnGhost: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.rose,
    backgroundColor: colors.paper2,
    minHeight: 42,
    paddingHorizontal: 16,
    paddingVertical: 11,
  },
  btnGhostText: { color: colors.camellia, fontSize: 14.5, fontWeight: '600' },
  list: { borderTopWidth: 1, borderTopColor: colors.line },
  row: { paddingVertical: 14, paddingHorizontal: 2, borderBottomWidth: 1, borderBottomColor: colors.line },
  rowName: { fontFamily: fonts.hand, fontSize: 15, color: colors.ink },
  rowMeta: { fontSize: 12.5, color: colors.ink2 },
});