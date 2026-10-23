import { ScrollView, StyleSheet, Text } from 'react-native';
import { Segmented, SettingBlock } from '../../src/components/settings-ui';
import { useSettings } from '../../src/settings/SettingsContext';
import { colors } from '../../src/theme';

export default function GiftSettingsScreen() {
  const { platform, setPlatform } = useSettings();

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <SettingBlock
        label="礼物建议数量"
        hint="每次进入心意内容页，固定生成 4 条与对方特征相关的礼物建议，第一版不可调。"
      >
        <Text style={styles.fixed}>固定 4 条</Text>
      </SettingBlock>

      <SettingBlock
        label="「去看看」跳转平台"
        hint="点击礼物的「去看看」时，优先唤起对应电商 App，未安装则打开浏览器搜索页。"
      >
        <Segmented
          options={[
            { value: 'taobao', label: '淘宝' },
            { value: 'jd', label: '京东' },
          ]}
          value={platform}
          onChange={setPlatform}
        />
      </SettingBlock>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  content: { padding: 22, gap: 14 },
  fixed: { fontSize: 20, fontWeight: '700', color: colors.gold },
});
