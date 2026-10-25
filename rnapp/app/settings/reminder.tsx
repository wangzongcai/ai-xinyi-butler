import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SettingBlock, Stepper, SwitchRow, TimeStepper } from '../../src/components/settings-ui';
import { useSettings } from '../../src/settings/SettingsContext';
import { colors } from '../../src/theme';

export default function ReminderSettingsScreen() {
  const {
    remindDays,
    setRemindDays,
    pushEnabled,
    setPushEnabled,
    remindHour,
    remindMinute,
    remindTimeText,
    setRemindTime,
  } = useSettings();

  // 测试用快捷设置：直接跳到「现在 + N 分钟」，省得一层层点。
  const setAfterMinutes = (n: number) => {
    const t = new Date(Date.now() + n * 60 * 1000);
    setRemindTime(t.getHours(), t.getMinutes());
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <SettingBlock
        label="提前提醒天数"
        hint={`从提前的那天起，到日子当天，每天 ${remindTimeText} 提醒一次。设为 0 表示只在当天提醒；对所有对象和节日统一生效。`}
      >
        <View style={styles.stepperLine}>
          <Stepper value={remindDays} min={0} max={30} onChange={setRemindDays} />
          <Text style={styles.unit}>{remindDays === 0 ? '当天提醒' : `${remindDays} 天`}</Text>
        </View>
      </SettingBlock>

      <SettingBlock
        label="推送时间"
        hint={`每天在这个时间推送（按手机本地时区），当前 ${remindTimeText}。改完会自动重排已安排的提醒。`}
      >
        <TimeStepper hour={remindHour} minute={remindMinute} onChange={setRemindTime} />
        <View style={styles.quickRow}>
          <Pressable style={styles.quickBtn} onPress={() => setAfterMinutes(1)}>
            <Text style={styles.quickText}>1 分钟后</Text>
          </Pressable>
          <Pressable style={styles.quickBtn} onPress={() => setAfterMinutes(5)}>
            <Text style={styles.quickText}>5 分钟后</Text>
          </Pressable>
          <Pressable style={styles.quickBtn} onPress={() => setRemindTime(9, 0)}>
            <Text style={styles.quickText}>恢复 09:00</Text>
          </Pressable>
        </View>
      </SettingBlock>

      <SettingBlock
        label="推送通知"
        hint={`开启后，系统会询问是否允许通知；允许后每天 ${remindTimeText} 收到临近日子的提醒。`}
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
  quickRow: { flexDirection: 'row', gap: 10, marginTop: 16, flexWrap: 'wrap' },
  quickBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: colors.roseTint,
  },
  quickText: { fontSize: 13, color: colors.camellia },
});
