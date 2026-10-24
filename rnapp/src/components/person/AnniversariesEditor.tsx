import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { colors, fonts, radius } from '../../theme';
import type { CalendarKind } from '../../utils/calendar';
import DateField from '../DateField';

/** 表单中的一条纪念日草稿；id 存在表示这是已有记录（编辑回填时才有） */
export type AnniversaryDraft = {
  id?: string;
  name: string;
  /** MM-DD */
  date: string;
  calendar: CalendarKind;
};

type Props = {
  value: AnniversaryDraft[];
  onChange: (items: AnniversaryDraft[]) => void;
};

// 纪念日编辑器：可「＋添加一个纪念日」，每条有自定义名称 + 日期，可删除
export default function AnniversariesEditor({ value, onChange }: Props) {
  function add() {
    onChange([...value, { name: '', date: '', calendar: 'solar' }]);
  }

  function update(index: number, patch: Partial<AnniversaryDraft>) {
    onChange(value.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  }

  function remove(index: number) {
    onChange(value.filter((_, i) => i !== index));
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.secHeader}>
        <Text style={styles.secTitle}>纪念日</Text>
        <Pressable style={({ pressed }) => [styles.addBtn, pressed && styles.pressed]} onPress={add}>
          <Text style={styles.addText}>＋ 添加一个纪念日</Text>
        </Pressable>
      </View>

      {value.length === 0 ? (
        <Text style={styles.empty}>还没有纪念日，点右上角添加。</Text>
      ) : null}

      {value.map((item, index) => (
        <View key={index} style={styles.card}>
          <TextInput
            style={styles.input}
            value={item.name}
            onChangeText={(t) => update(index, { name: t })}
            placeholder="纪念日名称（如结婚纪念日）"
            placeholderTextColor={colors.ink3}
          />
          <DateField
            value={item.date}
            onChange={(date) => update(index, { date })}
            calendar={item.calendar}
            onCalendarChange={(calendar) => update(index, { calendar })}
            placeholder="点击选择日期"
            allowClear
          />
          <Pressable style={styles.del} onPress={() => remove(index)}>
            <Text style={styles.delText}>删除</Text>
          </Pressable>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 12 },
  secHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  secTitle: { fontFamily: fonts.hand, fontSize: 18, color: colors.ink },
  addBtn: {
    borderWidth: 1,
    borderColor: colors.rose,
    backgroundColor: colors.paper2,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  addText: { color: colors.camellia, fontSize: 13.5, fontWeight: '600' },
  pressed: { opacity: 0.7 },
  empty: { fontSize: 13, color: colors.ink3, fontStyle: 'italic' },
  card: {
    gap: 10,
    backgroundColor: colors.paper2,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    padding: 14,
  },
  input: {
    backgroundColor: colors.paper,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: colors.ink,
  },
  del: {
    alignSelf: 'flex-end',
    borderRadius: 8,
  },
  delText: { color: colors.camelliaDeep, fontSize: 13.5, fontWeight: '600' },
});