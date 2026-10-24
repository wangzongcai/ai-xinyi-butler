import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import {
  TRAIT_MAX_LENGTH,
  TRAIT_MAX_PER_PERSON,
} from '../../data/traitRepository';
import { colors, fonts, radius } from '../../theme';

/** 表单中的一条特征草稿；id 存在表示已有记录（编辑回填时才有） */
export type TraitDraft = { id?: string; content: string };

type Props = {
  value: TraitDraft[];
  onChange: (items: TraitDraft[]) => void;
};

// 特征编辑器：增/改/删，每条 <=50 字、每对象最多 10 条。超限在 UI 层直接阻止并提示。
export default function TraitsEditor({ value, onChange }: Props) {
  function add() {
    if (value.length >= TRAIT_MAX_PER_PERSON) {
      Alert.alert('已达上限', `每个对象最多 ${TRAIT_MAX_PER_PERSON} 条特征。`);
      return;
    }
    onChange([...value, { content: '' }]);
  }

  function update(index: number, text: string) {
    // 超长由数据层也校验，但这里先拦：直接截断到上限并提示
    if (text.length > TRAIT_MAX_LENGTH) {
      Alert.alert('字数超限', `每条特征最多 ${TRAIT_MAX_LENGTH} 字。`);
      onChange(value.map((item, i) => (i === index ? { ...item, content: text.slice(0, TRAIT_MAX_LENGTH) } : item)));
      return;
    }
    onChange(value.map((item, i) => (i === index ? { ...item, content: text } : item)));
  }

  function remove(index: number) {
    onChange(value.filter((_, i) => i !== index));
  }

  const remaining = TRAIT_MAX_PER_PERSON - value.length;

  return (
    <View style={styles.wrap}>
      <View style={styles.secHeader}>
        <Text style={styles.secTitle}>特征</Text>
        <Pressable style={({ pressed }) => [styles.addBtn, pressed && styles.pressed]} onPress={add}>
          <Text style={styles.addText}>＋ 添加特征</Text>
        </Pressable>
      </View>
      <Text style={styles.hint}>
        {remaining > 0
          ? `最多 ${TRAIT_MAX_PER_PERSON} 条，每条 ${TRAIT_MAX_LENGTH} 字。还可添加 ${remaining} 条。`
          : `已达上限 ${TRAIT_MAX_PER_PERSON} 条。`}
      </Text>

      {value.length === 0 ? (
        <Text style={styles.empty}>还没有特征，可描述 ta 的喜好或近况。</Text>
      ) : null}

      {value.map((item, index) => (
        <View key={index} style={styles.card}>
          <TextInput
            style={styles.input}
            value={item.content}
            onChangeText={(t) => update(index, t)}
            placeholder="如：爱养花，今年刚退休"
            placeholderTextColor={colors.ink3}
            multiline
          />
          <View style={styles.cardFoot}>
            <Text style={styles.count}>{item.content.length}/{TRAIT_MAX_LENGTH}</Text>
            <Pressable style={styles.del} onPress={() => remove(index)}>
              <Text style={styles.delText}>删除</Text>
            </Pressable>
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 12 },
  secHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
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
  hint: { fontSize: 12.5, color: colors.ink3 },
  empty: { fontSize: 13, color: colors.ink3, fontStyle: 'italic' },
  card: {
    gap: 8,
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
    minHeight: 56,
    textAlignVertical: 'top',
  },
  cardFoot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  count: { fontSize: 12, color: colors.ink3 },
  del: { borderRadius: 8 },
  delText: { color: colors.camelliaDeep, fontSize: 13.5, fontWeight: '600' },
});