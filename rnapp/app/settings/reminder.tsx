import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SettingBlock, Stepper, SwitchRow } from '../../src/components/settings-ui';
import { useSettings } from '../../src/settings/SettingsContext';
import { colors } from '../../src/theme';

export default function ReminderSettingsScreen() {
  const { remindDays, setRemindDays, pushEnabled, setPushEnabled } = useSettings();

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <SettingBlock
        label="提前提醒天数"
        hint="从提前的那天起，到日子当天，每天早上 9 点提醒一次。设为 0 表示只在当天提醒；对所有对象和节日统一生效。"
      >
        <View style={styles.stepperLine}>
          <Stepper value={remindDays} min={0} max={30} onChange={setRemindDays} />
          <Text style={styles.unit}>{remindDays === 0 ? '当天提醒' : `${remindDays} 天`}</Text>
        </View>
      </SettingBlock>

      <SettingBlock label="推送时间" hint="第一版固定为每天早上 9 点，后续会支持自定义时间。">
        <Text style={styles.fixedTime}>09:00</Text>
      </SettingBlock>

      <SettingBlock
        label="推送通知"
        hint="开启后，到点会收到临近日子的提醒通知。第一版只保存在本地，不向系统申请通知权限。"
      >
        <SwitchRow
          label="接收推送通知"
          value={pushEnabled}
          onChange={setPushEnabled}
        />
      </SettingBlock>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  content: { padding: 22, gap: 14 },
  stepperLine: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  unit: { fontSize: 15, color: colors.ink2 },
  fixedTime: { fontSize: 22, fontWeight: '700', color: colors.camelliaDeep },
});
