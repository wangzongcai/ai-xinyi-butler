import { ScrollView, StyleSheet, TextInput } from 'react-native';
import { SettingBlock, SwitchRow } from '../../src/components/settings-ui';
import { useSettings } from '../../src/settings/SettingsContext';
import { colors } from '../../src/theme';

export default function CardSettingsScreen() {
  const {
    cardSignature,
    setCardSignature,
    signatureText,
    setSignatureText,
    cardEnabled,
    setCardEnabled,
  } = useSettings();

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <SettingBlock
        label="贺卡区域"
        hint="关闭后，对象页与节日准备页将不再展示「生成电子贺卡」入口。"
      >
        <SwitchRow label="启用电子贺卡" value={cardEnabled} onChange={setCardEnabled} />
      </SettingBlock>

      <SettingBlock
        label="贺卡署名"
        hint="开启后，下方填写的署名会显示在贺卡上；关闭则不显示署名，贺卡默认保持匿名。"
      >
        <SwitchRow
          label="在贺卡上署名"
          value={cardSignature}
          onChange={setCardSignature}
        />
        {cardSignature ? (
          <TextInput
            style={styles.input}
            placeholder="输入你的署名，如「你的好友小雅」"
            placeholderTextColor={colors.ink3}
            value={signatureText ?? ''}
            onChangeText={setSignatureText}
          />
        ) : null}
      </SettingBlock>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  content: { padding: 22, gap: 14 },
  input: {
    marginTop: 12,
    backgroundColor: colors.paper,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: colors.ink,
  },
});