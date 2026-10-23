import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../src/auth/AuthContext';
import { describeAuthError } from '../src/auth/errors';
import { colors, fonts } from '../src/theme';

type Mode = 'login' | 'register' | 'forgot';

const EMAIL_PATTERN = /^\S+@\S+\.\S+$/;
const MIN_PASSWORD_LENGTH = 6;

export default function LoginScreen() {
  const { signInWithPassword, signUpWithPassword, requestPasswordReset } = useAuth();

  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const isRegister = mode === 'register';
  const isForgot = mode === 'forgot';

  function goTo(next: Mode) {
    setMode(next);
    setError(null);
    setNotice(null);
    setPassword('');
    setConfirmPassword('');
  }

  function toggleMode() {
    goTo(isRegister ? 'login' : 'register');
  }

  async function handleSubmit() {
    if (busy) return;

    const emailValue = email.trim();
    if (!EMAIL_PATTERN.test(emailValue)) {
      setError('请输入正确的邮箱地址');
      return;
    }

    // 找回密码只发邮件，不需要校验密码
    if (isForgot) {
      setBusy(true);
      setError(null);
      setNotice(null);
      try {
        await requestPasswordReset(emailValue);
        setNotice('重置密码的邮件已发出，请到邮箱查收（没收到的话看看垃圾箱）');
      } catch (err) {
        setError(describeAuthError(err));
      } finally {
        setBusy(false);
      }
      return;
    }

    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`密码至少 ${MIN_PASSWORD_LENGTH} 位`);
      return;
    }
    if (isRegister && password !== confirmPassword) {
      setError('两次输入的密码不一致');
      return;
    }

    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      if (!isRegister) {
        await signInWithPassword(emailValue, password);
        // 登录态更新后，根路由守卫会自动切到首页
      } else {
        const { needsEmailConfirmation } = await signUpWithPassword(emailValue, password);
        if (needsEmailConfirmation) {
          setNotice('注册成功，请先到邮箱完成确认，再回来登录');
          setMode('login');
        }
        // 项目关闭邮箱确认时，注册即登录，守卫会自动切到首页
      }
    } catch (err) {
      setError(describeAuthError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        style={styles.screen}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          style={styles.body}
          contentContainerStyle={styles.bodyContent}
          keyboardShouldPersistTaps="handled"
        >
          {/* 印章式 Logo */}
          {isRegister ? (
            <View style={styles.heroCompact}>
              <Text style={styles.brand}>注册心意管家</Text>
              <Text style={styles.tagline}>注册即可使用，无需邮箱验证</Text>
            </View>
          ) : isForgot ? (
            <View style={styles.heroCompact}>
              <Text style={styles.brand}>找回密码</Text>
              <Text style={styles.tagline}>输入注册时的邮箱，我们会发一封重置密码的邮件给你</Text>
            </View>
          ) : (
            <View style={styles.hero}>
              <View style={styles.sealOuter}>
                <View style={styles.sealInner}>
                  <Text style={styles.sealTop}>心意管家</Text>
                  <Text style={styles.sealMain}>心意</Text>
                  <Text style={styles.sealBottom}>已备好</Text>
                </View>
              </View>
              <Text style={styles.brand}>心意管家</Text>
              <Text style={styles.tagline}>重要的人，和他们的日子，都替你记着。</Text>
              <Text style={styles.tagline}>日子到来之前，话、礼物、贺卡已替你备好。</Text>
            </View>
          )}

          <View style={styles.form}>
            <Text style={styles.label}>邮箱</Text>
            <TextInput
              style={styles.input}
              value={email}
              onChangeText={setEmail}
              editable={!busy}
              placeholder="you@example.com"
              placeholderTextColor={colors.ink3}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="email"
              returnKeyType="next"
            />

            {isForgot ? null : (
              <>
                <Text style={styles.label}>密码</Text>
                <TextInput
                  style={styles.input}
                  value={password}
                  onChangeText={setPassword}
                  editable={!busy}
                  placeholder={`至少 ${MIN_PASSWORD_LENGTH} 位`}
                  placeholderTextColor={colors.ink3}
                  secureTextEntry
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete={isRegister ? 'new-password' : 'current-password'}
                  returnKeyType={isRegister ? 'next' : 'done'}
                  onSubmitEditing={isRegister ? undefined : handleSubmit}
                />
              </>
            )}

            {isRegister ? (
              <>
                <Text style={styles.label}>确认密码</Text>
                <TextInput
                  style={styles.input}
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  editable={!busy}
                  placeholder="再次输入密码"
                  placeholderTextColor={colors.ink3}
                  secureTextEntry
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="new-password"
                  returnKeyType="done"
                  onSubmitEditing={handleSubmit}
                />
              </>
            ) : null}

            {error ? <Text style={styles.error}>{error}</Text> : null}
            {notice ? <Text style={styles.notice}>{notice}</Text> : null}

            <Pressable
              style={({ pressed }) => [
                styles.btnPrimary,
                busy && styles.btnDisabled,
                pressed && styles.pressed,
              ]}
              onPress={handleSubmit}
              disabled={busy}
            >
              <Text style={styles.btnPrimaryText}>
                {busy ? '请稍候…' : isForgot ? '发送重置邮件' : isRegister ? '注册' : '开始使用'}
              </Text>
            </Pressable>

            {isRegister || isForgot ? (
              <Pressable
                style={styles.backLogin}
                onPress={() => goTo('login')}
                hitSlop={8}
                disabled={busy}
              >
                <Text style={styles.link}>← 返回登录</Text>
              </Pressable>
            ) : (
              <View style={styles.links}>
                <Pressable onPress={() => goTo('forgot')} hitSlop={8} disabled={busy}>
                  <Text style={styles.linkMuted}>忘记密码？</Text>
                </Pressable>
                <Pressable onPress={toggleMode} hitSlop={8} disabled={busy}>
                  <Text style={styles.link}>还没有账号？注册</Text>
                </Pressable>
              </View>
            )}
          </View>

          <Text style={styles.footnote}>登录只识别身份，心意数据仍只存在这台设备。</Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  body: { flex: 1 },
  bodyContent: { flexGrow: 1, paddingHorizontal: 28, paddingTop: 44, paddingBottom: 28 },

  hero: { alignItems: 'center' },
  heroCompact: { alignItems: 'center', paddingTop: 24 },
  sealOuter: {
    width: 112,
    height: 112,
    borderRadius: 56,
    borderWidth: 1.5,
    borderColor: colors.camellia,
    backgroundColor: colors.paper2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sealInner: {
    width: 92,
    height: 92,
    borderRadius: 46,
    borderWidth: 1,
    borderColor: colors.rose,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sealTop: { fontSize: 9, color: colors.ink2, letterSpacing: 2 },
  sealMain: { fontFamily: fonts.hand, fontSize: 24, lineHeight: 30, color: colors.camellia },
  sealBottom: { fontSize: 9, color: colors.ink2, letterSpacing: 2 },

  brand: {
    fontFamily: fonts.hand,
    fontSize: 30,
    lineHeight: 38,
    color: colors.ink,
    marginTop: 20,
  },
  tagline: { fontSize: 13, color: colors.ink2, lineHeight: 21, textAlign: 'center' },

  form: { marginTop: 28 },
  label: { fontSize: 13, color: colors.ink2, marginBottom: 6, marginTop: 14 },
  input: {
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.paper2,
    paddingHorizontal: 14,
    fontSize: 15,
    color: colors.ink,
  },
  error: { fontSize: 13, color: colors.camelliaDeep, marginTop: 10, lineHeight: 19 },
  notice: { fontSize: 13, color: colors.teal, marginTop: 10, lineHeight: 19 },

  btnPrimary: {
    height: 50,
    borderRadius: 25,
    backgroundColor: colors.camellia,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 22,
  },
  btnPrimaryText: { color: '#FCF4F4', fontSize: 16, fontWeight: '600' },
  btnDisabled: { opacity: 0.6 },
  pressed: { opacity: 0.8 },

  links: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 16,
  },
  backLogin: { alignItems: 'center', marginTop: 20 },
  linkMuted: { fontSize: 13, color: colors.ink2 },
  link: { fontSize: 13, color: colors.camellia },

  footnote: {
    marginTop: 32,
    fontSize: 12,
    color: colors.ink3,
    textAlign: 'center',
  },
});
