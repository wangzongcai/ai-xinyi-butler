import { useState } from 'react';
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
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../src/auth/AuthContext';
import { describeAuthError } from '../src/auth/errors';
import { colors, fonts } from '../src/theme';

type Mode = 'login' | 'register';

const EMAIL_PATTERN = /^\S+@\S+\.\S+$/;
const MIN_PASSWORD_LENGTH = 6;

export default function LoginScreen() {
  const { signInWithPassword, signUpWithPassword } = useAuth();

  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  function toggleMode() {
    setMode((value) => (value === 'login' ? 'register' : 'login'));
    setError(null);
    setNotice(null);
  }

  async function handleSubmit() {
    if (busy) return;

    const emailValue = email.trim();
    if (!EMAIL_PATTERN.test(emailValue)) {
      setError('请输入正确的邮箱地址');
      return;
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`密码至少 ${MIN_PASSWORD_LENGTH} 位`);
      return;
    }

    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      if (mode === 'login') {
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

  function handleForgotPassword() {
    Alert.alert('找回密码', '邮件服务尚未配置，暂时无法通过邮件重置密码。请先重新注册或联系管理员。');
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
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              returnKeyType="done"
              onSubmitEditing={handleSubmit}
            />

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
                {busy ? '请稍候…' : mode === 'login' ? '开始使用' : '注册并登录'}
              </Text>
            </Pressable>

            {mode === 'register' ? (
              <Text style={styles.hint}>注册即可使用，无需邮箱验证</Text>
            ) : null}

            <View style={styles.links}>
              <Pressable onPress={handleForgotPassword} hitSlop={8}>
                <Text style={styles.linkMuted}>忘记密码？</Text>
              </Pressable>
              <Pressable onPress={toggleMode} hitSlop={8} disabled={busy}>
                <Text style={styles.link}>
                  {mode === 'login' ? '还没有账号？注册' : '已有账号？登录'}
                </Text>
              </Pressable>
            </View>
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
  hint: { fontSize: 12, color: colors.ink3, textAlign: 'center', marginTop: 10 },

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
  linkMuted: { fontSize: 13, color: colors.ink2 },
  link: { fontSize: 13, color: colors.camellia },

  footnote: {
    marginTop: 32,
    fontSize: 12,
    color: colors.ink3,
    textAlign: 'center',
  },
});
