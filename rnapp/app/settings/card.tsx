import { ScrollView, StyleSheet } from 'react-native';
import { SettingBlock, SwitchRow } from '../../src/components/settings-ui';
import { useSettings } from '../../src/settings/SettingsContext';
import { colors } from '../../src/theme';

export default function CardSettingsScreen() {
  const { cardSignature, setCardSignature } = useSettings();

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <SettingBlock
        label="贺卡署名"
        hint="开启后，制作电子贺卡时可以填写你的署名，署名会显示在贺卡上；关闭则不显示署名，贺卡默认保持匿名。"
      >
        <SwitchRow
          label="在贺卡上署名"
          value={cardSignature}
          onChange={setCardSignature}
        />
      </SettingBlock>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  content: { padding: 22, gap: 14 },
});
