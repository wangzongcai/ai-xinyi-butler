import { useEffect, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { router } from 'expo-router';
import { useAuth } from '../src/auth/AuthContext';
import { avatarText, providerLabel } from '../src/auth/account';
import { describeAuthError } from '../src/auth/errors';
import { colors, fonts } from '../src/theme';

type Method = 'phone' | 'email';

type Phase = 'input' | 'code';

const EMAIL_PATTERN = /^\S+@\S+\.\S+$/;
const CN_MOBILE_PATTERN = /^1[3-9]\d{9}$/;

// 统一转成 Supabase 需要的 E.164 格式（本项目默认中国大陆手机号）
function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, '').replace(/^86/, '');
  if (!CN_MOBILE_PATTERN.test(digits)) return null;
  return `+86${digits}`;
}

export default function LoginScreen() {
  const { account, sendEmailOtp, verifyEmailOtp, sendPhoneOtp, verifyPhoneOtp, signOut } = useAuth();

  const [method, setMethod] = useState<Method | null>(null);
  const [phase, setPhase] = useState<Phase>('input');
  const [identifier, setIdentifier] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(0);

  // 重新获取验证码的倒计时
  useEffect(() => {
    if (countdown <= 0) return;
    const timer = setTimeout(() => setCountdown((value) => value - 1), 1000);
    return () => clearTimeout(timer);
  }, [countdown]);

  function chooseMethod(next: Method) {
    setMethod(next);
    setPhase('input');
    setIdentifier('');
    setCode('');
    setError(null);
    setNotice(null);
    setCountdown(0);
  }

  function resetMethod() {
    setMethod(null);
    setPhase('input');
    setIdentifier('');
    setCode('');
    setError(null);
    setNotice(null);
    setCountdown(0);
  }

  async function handleSend() {
    if (busy) return;
    const value = identifier.trim();

    if (method === 'email') {
      if (!EMAIL_PATTERN.test(value)) {
        setError('请输入正确的邮箱地址');
        return;
      }
    } else {
      if (!normalizePhone(value)) {
        setError('请输入正确的中国大陆手机号');
        return;
      }
    }

    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      if (method === 'email') {
        await sendEmailOtp(value);
        setNotice('验证码已发送，请到邮箱查收（若没看到，记得看一眼垃圾箱）');
      } else {
        await sendPhoneOtp(normalizePhone(value) as string);
        setNotice('验证码已发送，请留意短信');
      }
      setPhase('code');
      setCountdown(60);
    } catch (err) {
      setError(describeAuthError(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleVerify() {
    if (busy) return;
    const value = identifier.trim();
    const token = code.trim();

    if (!/^\d{6}$/.test(token)) {
      setError('请输入 6 位数字验证码');
      return;
    }

    setBusy(true);
    setError(null);
    try {
      if (method === 'email') {
        await verifyEmailOtp(value, token);
      } else {
        await verifyPhoneOtp(normalizePhone(value) as string, token);
      }
      // 登录成功后回到来源页（通常是设置页）
      if (router.canGoBack()) {
        router.back();
      } else {
        router.replace('/(tabs)/settings');
      }
    } catch (err) {
      setError(describeAuthError(err));
    } finally {
      setBusy(false);
    }
  }

  function handleGuest() {
    router.replace('/(tabs)');
  }

  async function handleSignOut() {
    try {
      await signOut();
      setNotice('已退出登录，回到游客状态');
    } catch (err) {
      setError(describeAuthError(err));
    }
  }

  function soonWechat() {
    Alert.alert('即将开放', '微信登录需要微信开放平台资质，资质就绪后接入。');
  }

  function soonApple() {
    Alert.alert('即将开放', 'Apple 登录仅用于 iOS，需要 Apple Developer 账号，账号就绪后接入。');
  }

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        style={styles.body}
        contentContainerStyle={styles.bodyContent}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.lead}>
          登录只是为了记住你的身份。心意数据永远留在本机，不会上传、不会随账号同步。
        </Text>

        {account ? (
          <View style={styles.account}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{avatarText(account.provider)}</Text>
            </View>
            <View style={styles.accountInfo}>
              <Text style={styles.accountMain}>{account.displayName}</Text>
              <Text style={styles.accountSub}>
                已通过{providerLabel(account.provider)}登录，心意数据仍只存在这台设备
              </Text>
            </View>
            <Pressable onPress={handleSignOut} hitSlop={8}>
              <Text style={styles.accountAction}>退出登录</Text>
            </Pressable>
          </View>
        ) : null}

        {method === null ? (
          <>
            <Text style={styles.secTitle}>选择登录方式</Text>

            <Pressable style={styles.method} onPress={() => chooseMethod('phone')}>
              <View style={styles.methodMain}>
                <Text style={styles.methodLabel}>手机号 + 验证码</Text>
                <Text style={styles.methodHint}>短信通道开通后可用</Text>
              </View>
              <Text style={styles.methodArrow}>›</Text>
            </Pressable>

            <Pressable style={styles.method} onPress={() => chooseMethod('email')}>
              <View style={styles.methodMain}>
                <Text style={styles.methodLabel}>邮箱 + 验证码</Text>
                <Text style={styles.methodHint}>现在就能使用</Text>
              </View>
              <Text style={styles.methodArrow}>›</Text>
            </Pressable>

            <Pressable style={styles.method} onPress={soonWechat}>
              <View style={styles.methodMain}>
                <Text style={styles.methodLabel}>使用微信登录</Text>
                <Text style={styles.methodHint}>需要微信开放平台资质，即将开放</Text>
              </View>
              <Text style={styles.methodArrow}>›</Text>
            </Pressable>

            <Pressable style={styles.method} onPress={soonApple}>
              <View style={styles.methodMain}>
                <Text style={styles.methodLabel}>使用 Apple 登录</Text>
                <Text style={styles.methodHint}>仅 iOS，即将开放</Text>
              </View>
              <Text style={styles.methodArrow}>›</Text>
            </Pressable>
          </>
        ) : (
          <View style={styles.panel}>
            <Text style={styles.panelTitle}>
              {method === 'email' ? '邮箱验证码登录' : '手机号验证码登录'}
            </Text>

            <TextInput
              style={[styles.input, phase === 'code' && styles.inputReadonly]}
              value={identifier}
              onChangeText={setIdentifier}
              editable={phase === 'input' && !busy}
              placeholder={method === 'email' ? '你的邮箱地址' : '你的手机号'}
              placeholderTextColor={colors.ink3}
              keyboardType={method === 'email' ? 'email-address' : 'phone-pad'}
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete={method === 'email' ? 'email' : 'tel'}
            />

            {phase === 'code' ? (
              <TextInput
                style={styles.input}
                value={code}
                onChangeText={setCode}
                placeholder="6 位验证码"
                placeholderTextColor={colors.ink3}
                keyboardType="number-pad"
                maxLength={6}
                autoFocus
                returnKeyType="done"
                onSubmitEditing={handleVerify}
              />
            ) : null}

            {error ? <Text style={styles.error}>{error}</Text> : null}
            {notice ? <Text style={styles.notice}>{notice}</Text> : null}

            <Pressable
              style={({ pressed }) => [
                styles.btnPrimary,
                busy && styles.btnDisabled,
                pressed && styles.pressed,
              ]}
              onPress={phase === 'input' ? handleSend : handleVerify}
              disabled={busy}
            >
              <Text style={styles.btnPrimaryText}>
                {busy ? '请稍候…' : phase === 'input' ? '获取验证码' : '登录'}
              </Text>
            </Pressable>

            {phase === 'code' ? (
              <Pressable
                style={styles.btnLinkWrap}
                onPress={handleSend}
                disabled={busy || countdown > 0}
              >
                <Text style={[styles.btnLink, countdown > 0 && styles.btnLinkDisabled]}>
                  {countdown > 0 ? `${countdown} 秒后可重新获取` : '重新获取验证码'}
                </Text>
              </Pressable>
            ) : null}

            <Pressable style={styles.btnLinkWrap} onPress={resetMethod} disabled={busy}>
              <Text style={styles.btnLink}>换一种登录方式</Text>
            </Pressable>
          </View>
        )}

        <Pressable
          style={({ pressed }) => [styles.btnGuest, pressed && styles.pressed]}
          onPress={handleGuest}
        >
          <Text style={styles.btnGuestText}>先不登录，游客进入</Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  body: { flex: 1 },
  bodyContent: { paddingHorizontal: 22, paddingTop: 16, paddingBottom: 32 },
  lead: { fontSize: 14, color: colors.ink2, lineHeight: 22 },

  account: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 20,
    padding: 14,
    borderRadius: 14,
    backgroundColor: colors.paper2,
    borderWidth: 1,
    borderColor: colors.line,
  },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.roseTint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontFamily: fonts.hand, fontSize: 18, color: colors.camellia },
  accountInfo: { flex: 1, minWidth: 0 },
  accountMain: { fontSize: 14.5, color: colors.ink },
  accountSub: { fontSize: 12, color: colors.ink2, marginTop: 2 },
  accountAction: { fontSize: 13, color: colors.camellia, fontWeight: '600' },

  secTitle: { fontFamily: fonts.hand, fontSize: 17, color: colors.ink, marginTop: 26, marginBottom: 8 },

  method: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 15,
    paddingHorizontal: 16,
    marginTop: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.paper2,
  },
  methodMain: { flex: 1, minWidth: 0 },
  methodLabel: { fontSize: 15, color: colors.ink },
  methodHint: { fontSize: 12, color: colors.ink2, marginTop: 2 },
  methodArrow: { fontSize: 22, color: colors.ink3 },

  panel: {
    marginTop: 22,
    padding: 16,
    borderRadius: 16,
    backgroundColor: colors.paper2,
    borderWidth: 1,
    borderColor: colors.line,
  },
  panelTitle: { fontFamily: fonts.hand, fontSize: 17, color: colors.ink, marginBottom: 12 },
  input: {
    minHeight: 46,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.paper,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    color: colors.ink,
    marginBottom: 12,
  },
  inputReadonly: { color: colors.ink2, backgroundColor: colors.paper2 },
  error: { fontSize: 13, color: colors.camelliaDeep, marginBottom: 8, lineHeight: 19 },
  notice: { fontSize: 13, color: colors.teal, marginBottom: 8, lineHeight: 19 },

  btnPrimary: {
    minHeight: 46,
    borderRadius: 12,
    backgroundColor: colors.camellia,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  btnPrimaryText: { color: '#FCF4F4', fontSize: 15, fontWeight: '600' },
  btnDisabled: { opacity: 0.6 },
  pressed: { opacity: 0.75 },

  btnLinkWrap: { alignItems: 'center', paddingVertical: 10, marginTop: 6 },
  btnLink: { fontSize: 13.5, color: colors.camellia },
  btnLinkDisabled: { color: colors.ink3 },

  btnGuest: {
    marginTop: 28,
    minHeight: 46,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.rose,
    backgroundColor: colors.paper2,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  btnGuestText: { color: colors.camellia, fontSize: 15, fontWeight: '600' },
});
