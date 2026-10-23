import { View, Text, StyleSheet } from 'react-native';
import { colors, fonts } from '../theme';

type Props = {
  title: string;
  subtitle?: string;
  seal?: boolean;
};

// Tab 页自己的「头」，对应 prototype 里的 .head（标题 + 可选山茶印章）
export default function PageHeader({ title, subtitle, seal }: Props) {
  return (
    <View style={styles.head}>
      <View style={styles.titles}>
        <Text style={styles.title}>{title}</Text>
        {subtitle ? <Text style={styles.sub}>{subtitle}</Text> : null}
      </View>
      {seal ? (
        <View style={styles.seal}>
          <Text style={styles.sealText}>心</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 22,
    paddingTop: 14,
    paddingBottom: 10,
  },
  titles: { flex: 1, minWidth: 0 },
  title: { fontFamily: fonts.hand, fontSize: 19, lineHeight: 26, color: colors.ink },
  sub: { fontSize: 12, color: colors.ink2 },
  seal: {
    width: 40,
    height: 40,
    borderRadius: 7,
    backgroundColor: colors.camellia,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sealText: { fontFamily: fonts.hand, fontSize: 21, color: colors.paper, lineHeight: 26 },
});