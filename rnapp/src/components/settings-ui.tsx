import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import type { ReactNode } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme';

// 二级页里的说明块
export function SettingBlock({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <View style={blockStyles.wrap}>
      <Text style={blockStyles.label}>{label}</Text>
      {hint ? <Text style={blockStyles.hint}>{hint}</Text> : null}
      <View style={blockStyles.control}>{children}</View>
    </View>
  );
}

const blockStyles = StyleSheet.create({
  wrap: {
    backgroundColor: colors.paper2,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 14,
    padding: 16,
  },
  label: { fontSize: 15, color: colors.ink, fontWeight: '600' },
  hint: { fontSize: 12.5, color: colors.ink2, marginTop: 6, lineHeight: 19 },
  control: { marginTop: 14 },
});

// 步进器
export function Stepper({
  value,
  min,
  max,
  onChange,
}: {
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}) {
  return (
    <View style={stepperStyles.row}>
      <Pressable
        style={[stepperStyles.btn, value <= min && stepperStyles.btnOff]}
        disabled={value <= min}
        onPress={() => onChange(value - 1)}
        hitSlop={6}
      >
        <Ionicons name="remove" size={20} color={value <= min ? colors.ink3 : colors.camellia} />
      </Pressable>
      <Text style={stepperStyles.value}>{value}</Text>
      <Pressable
        style={[stepperStyles.btn, value >= max && stepperStyles.btnOff]}
        disabled={value >= max}
        onPress={() => onChange(value + 1)}
        hitSlop={6}
      >
        <Ionicons name="add" size={20} color={value >= max ? colors.ink3 : colors.camellia} />
      </Pressable>
    </View>
  );
}

const stepperStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 10,
    backgroundColor: colors.paper,
  },
  btn: { width: 44, height: 40, alignItems: 'center', justifyContent: 'center' },
  btnOff: { opacity: 0.4 },
  value: { minWidth: 56, textAlign: 'center', fontSize: 17, fontWeight: '600', color: colors.ink },
});

// 分段选择
export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <View style={segStyles.wrap}>
      {options.map((opt) => {
        const on = opt.value === value;
        return (
          <Pressable
            key={opt.value}
            style={[segStyles.btn, on && segStyles.btnOn]}
            onPress={() => onChange(opt.value)}
          >
            <Text style={[segStyles.text, on && segStyles.textOn]}>{opt.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const segStyles = StyleSheet.create({
  wrap: { flexDirection: 'row', backgroundColor: colors.roseTint, borderRadius: 12, padding: 4 },
  btn: { flex: 1, paddingVertical: 9, borderRadius: 9, alignItems: 'center' },
  btnOn: { backgroundColor: colors.paper2 },
  text: { fontSize: 14, color: colors.ink2 },
  textOn: { color: colors.camellia, fontWeight: '600' },
});

// 开关行
export function SwitchRow({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint?: string;
  value: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <View style={switchStyles.row}>
      <View style={switchStyles.texts}>
        <Text style={switchStyles.label}>{label}</Text>
        {hint ? <Text style={switchStyles.hint}>{hint}</Text> : null}
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ false: colors.line, true: colors.rose }}
        thumbColor={value ? colors.camellia : colors.paper2}
      />
    </View>
  );
}

const switchStyles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  texts: { flex: 1 },
  label: { fontSize: 15, color: colors.ink },
  hint: { fontSize: 12.5, color: colors.ink2, marginTop: 3, lineHeight: 18 },
});
