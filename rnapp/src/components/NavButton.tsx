import { Pressable, Text, StyleSheet } from 'react-native';
import { colors } from '../theme';

type Props = { label: string; onPress: () => void };

export default function NavButton({ label, onPress }: Props) {
  return (
    <Pressable style={({ pressed }) => [styles.btn, pressed && styles.pressed]} onPress={onPress}>
      <Text style={styles.text}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.rose,
    backgroundColor: colors.paper2,
    minHeight: 42,
    paddingHorizontal: 16,
    paddingVertical: 11,
    marginTop: 12,
  },
  pressed: { opacity: 0.7 },
  text: { color: colors.camellia, fontSize: 14.5, fontWeight: '600' },
});