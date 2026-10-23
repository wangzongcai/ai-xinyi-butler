import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SettingBlock, Stepper } from '../../src/components/settings-ui';
import { useSettings } from '../../src/settings/SettingsContext';
import { colors } from '../../src/theme';

export default function BlessingSettingsScreen() {
  const { blessingCount, setBlessingCount } = useSettings();

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <SettingBlock
        label="每次祝福语数量"
        hint="进入心意内容页时，按这个数量为你生成祝福文案，可调 1 到 5 条。"
      >
        <View style={styles.stepperLine}>
          <Stepper value={blessingCount} min={1} max={5} onChange={setBlessingCount} />
          <Text style={styles.unit}>{blessingCount} 条</Text>
        </View>
      </SettingBlock>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  content: { padding: 22, gap: 14 },
  stepperLine: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  unit: { fontSize: 15, color: colors.ink2 },
});
