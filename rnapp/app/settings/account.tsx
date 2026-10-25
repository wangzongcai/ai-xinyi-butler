import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useAuth } from '../../src/auth/AuthContext';
import { avatarText, providerLabel } from '../../src/auth/account';
import { describeAuthError } from '../../src/auth/errors';
import { colors, fonts } from '../../src/theme';

export default function AccountSettingsScreen() {
  const { account, signOut, deleteAccount } = useAuth();
  const [busy, setBusy] = useState(false);

  function handleSignOut() {
    Alert.alert('退出登录', '退出后需要重新登录才能使用。本机缓存不会删除，重新登录后继续同步。', [
      { text: '取消', style: 'cancel' },
      {
        text: '退出',
        style: 'destructive',
        onPress: async () => {
          try {
            setBusy(true);
            await signOut();
          } catch {
            Alert.alert('退出失败', '请稍后再试');
          } finally {
            setBusy(false);
          }
        },
      },
    ]);
  }

  function handleDeleteAccount() {
    Alert.alert(
      '注销账号',
      '将永久删除这个登录账号，云端与本机的心意数据都会一并删除，此操作无法撤销。',
      [
        { text: '取消', style: 'cancel' },
        {
          text: '继续注销',
          style: 'destructive',
          onPress: () => confirmFinal(),
        },
      ],
    );
  }

  function confirmFinal() {
    Alert.alert('最后确认', '账号一旦注销将无法恢复，确定继续吗？', [
      { text: '再想想', style: 'cancel' },
      {
        text: '确认注销',
        style: 'destructive',
        onPress: async () => {
          try {
            setBusy(true);
            await deleteAccount();
            // 账号删除并退出后，路由守卫会自动回到登录页
          } catch (err) {
            Alert.alert('注销失败', describeAuthError(err));
          } finally {
            setBusy(false);
          }
        },
      },
    ]);
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.profileCard}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{account ? avatarText(account.provider) : '信'}</Text>
        </View>
        <Text style={styles.name}>{account ? account.displayName : '已登录'}</Text>
        <Text style={styles.sub}>
          {account ? `已通过${providerLabel(account.provider)}登录` : '心意管家账号'}
        </Text>
      </View>

      <Pressable style={styles.btnSignOut} onPress={handleSignOut} disabled={busy}>
        <Text style={styles.btnSignOutText}>退出登录</Text>
      </Pressable>

      <Text style={styles.dangerTitle}>危险操作</Text>
      <View style={styles.dangerCard}>
        <Text style={styles.dangerName}>注销账号</Text>
        <Text style={styles.dangerHint}>永久删除登录账号，操作不可撤销</Text>
        <Pressable style={styles.btnDelete} onPress={handleDeleteAccount} disabled={busy}>
          {busy ? (
            <ActivityIndicator size="small" color="#FCF4F4" />
          ) : (
            <Text style={styles.btnDeleteText}>注销账号</Text>
          )}
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  content: { padding: 22, gap: 14 },

  profileCard: {
    backgroundColor: colors.paper2,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 14,
    paddingVertical: 24,
    alignItems: 'center',
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.roseTint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontFamily: fonts.hand, fontSize: 26, color: colors.camellia },
  name: { fontSize: 17, fontWeight: '600', color: colors.ink, marginTop: 12 },
  sub: { fontSize: 12.5, color: colors.ink2, marginTop: 4 },

  btnSignOut: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.rose,
    backgroundColor: colors.paper2,
    minHeight: 46,
  },
  btnSignOutText: { color: colors.camellia, fontSize: 15, fontWeight: '600' },

  dangerTitle: { fontSize: 12.5, color: colors.ink3, marginTop: 8, marginLeft: 2 },
  dangerCard: {
    borderWidth: 1,
    borderColor: colors.rose,
    borderRadius: 14,
    backgroundColor: colors.paper2,
    padding: 16,
  },
  dangerName: { fontSize: 15, color: colors.ink, fontWeight: '600' },
  dangerHint: { fontSize: 12.5, color: colors.ink2, marginTop: 4 },
  btnDelete: {
    marginTop: 14,
    minHeight: 44,
    borderRadius: 11,
    backgroundColor: colors.camelliaDeep,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnDeleteText: { color: '#FCF4F4', fontSize: 15, fontWeight: '600' },
});
