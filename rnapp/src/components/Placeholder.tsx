import type { ReactNode } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, fonts } from '../theme';

type Props = { title: string; hint?: string; children?: ReactNode };

// 里程碑一里未实现的栈内页统一用这个占位容器：标明页面名 + 一句说明
export default function Placeholder({ title, hint, children }: Props) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>{title}</Text>
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.paper, padding: 22, paddingTop: 18 },
  title: { fontFamily: fonts.hand, fontSize: 22, color: colors.ink },
  hint: { fontSize: 14, color: colors.ink2, lineHeight: 22, marginTop: 8 },
});