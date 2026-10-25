// =====================================================================
// 联系人选择器（M7-05 / M7-06）
// 节日准备页顶部：列出全部未删除联系人，默认选中「不指定收件人」。
// 选中某位联系人后，生成时引用该联系人的特征并写入 prepare 记录；
// 保持「不指定收件人」时生成节日通用祝福。
// =====================================================================
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius } from '../theme';

export type SelectablePerson = {
  id: string;
  name: string;
  relationship: string;
};

/** 「不指定收件人」的固定选项。 */
export const NO_RECIPIENT = '';

export default function ContactSelector({
  persons,
  value,
  onChange,
}: {
  persons: SelectablePerson[];
  value: string | null;
  onChange: (personId: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const selected =
    persons.find((p) => p.id === value) ?? null;

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>收件人</Text>
      <Pressable style={styles.current} onPress={() => setOpen((o) => !o)}>
        <Text style={[styles.currentText, !selected && styles.currentMuted]}>
          {selected ? selected.name : '不指定收件人'}
        </Text>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={16} color={colors.ink3} />
      </Pressable>

      {open ? (
        <View style={styles.panel}>
          {/* 不指定收件人 */}
          <Pressable
            style={styles.option}
            onPress={() => {
              onChange(null);
              setOpen(false);
            }}
          >
            <Text style={[styles.optionText, value == null && styles.optionActive]}>不指定收件人</Text>
            {value == null ? <Ionicons name="checkmark" size={16} color={colors.camellia} /> : null}
          </Pressable>
          <View style={styles.divider} />
          <ScrollView style={styles.optionList} nestedScrollEnabled>
            {persons.map((p) => {
              const on = p.id === value;
              return (
                <Pressable
                  key={p.id}
                  style={styles.option}
                  onPress={() => {
                    onChange(p.id);
                    setOpen(false);
                  }}
                >
                  <View style={styles.optionMain}>
                    <Text style={[styles.optionText, on && styles.optionActive]}>{p.name}</Text>
                    {p.relationship ? (
                      <Text style={styles.optionMeta}>{p.relationship}</Text>
                    ) : null}
                  </View>
                  {on ? <Ionicons name="checkmark" size={16} color={colors.camellia} /> : null}
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: colors.paper2,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    padding: 14,
  },
  label: { fontSize: 12.5, color: colors.ink3, marginBottom: 6 },
  current: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  currentText: { fontSize: 16, fontWeight: '600', color: colors.ink },
  currentMuted: { color: colors.ink3, fontWeight: '400' },
  panel: {
    marginTop: 8,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    paddingTop: 4,
    maxHeight: 260,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    paddingHorizontal: 2,
  },
  optionMain: { flexDirection: 'row', alignItems: 'baseline', gap: 8, flexShrink: 1 },
  optionText: { fontSize: 15, color: colors.ink },
  optionActive: { color: colors.camellia, fontWeight: '600' },
  optionMeta: { fontSize: 12, color: colors.ink3 },
  divider: { height: 1, backgroundColor: colors.line, marginVertical: 2 },
  optionList: { flexGrow: 0 },
});