import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { colors, fonts, radius } from '../theme';
import AnniversariesEditor, {
  AnniversaryDraft,
} from './person/AnniversariesEditor';
import TraitsEditor, { TraitDraft } from './person/TraitsEditor';

/** 保存时提交给父级的数据 */
export type PersonFormValues = {
  name: string;
  relationship: string;
  /** 生日，YYYY-MM-DD；空字符串会转成 null（允许无日期对象） */
  birthday: string | null;
  /** 纪念日（已过滤空条目：名称与日期需齐全） */
  anniversaries: AnniversaryDraft[];
  /** 特征（已过滤空条目） */
  traits: TraitDraft[];
};

type Props = {
  initialName?: string;
  initialRelationship?: string;
  initialBirthday?: string | null;
  initialAnniversaries?: AnniversaryDraft[];
  initialTraits?: TraitDraft[];
  /** 传入后表单会调用它完成保存；返回则插入后执行 onSaved */
  onSubmit: (values: PersonFormValues) => Promise<void>;
  /** 超时由父级处理，这里只负责忙碌态 */
  submitLabel?: string;
};

/** 校验 YYYY-MM-DD 格式（不校验真实存在，保证宽松；空串视为空） */
export function isValidDateString(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s.trim());
}

// 新增页与编辑页共用的对象表单：姓名/关系/生日 + 纪念日编辑器 + 特征编辑器
export default function PersonForm({
  initialName = '',
  initialRelationship = '',
  initialBirthday = null,
  initialAnniversaries = [],
  initialTraits = [],
  onSubmit,
  submitLabel = '保存',
}: Props) {
  const [name, setName] = useState(initialName);
  const [relationship, setRelationship] = useState(initialRelationship);
  const [birthday, setBirthday] = useState(initialBirthday ?? '');
  const [anniversaries, setAnniversaries] = useState(initialAnniversaries);
  const [traits, setTraits] = useState(initialTraits);
  const [busy, setBusy] = useState(false);

  async function handleSave() {
    const trimmedName = name.trim();
    if (!trimmedName) {
      Alert.alert('请填写姓名', '姓名是必填项。');
      return;
    }

    // 过滤空条目：纪念日需名称+日期齐全；特征需非空
    const filledAnniversaries = anniversaries.filter(
      (a) => a.name.trim() && a.date.trim(),
    );
    const filledTraits = traits.filter((t) => t.content.trim());

    if (filledAnniversaries.some((a) => !isValidDateString(a.date))) {
      Alert.alert('日期格式不正确', '请按 YYYY-MM-DD 填写，例如 2020-05-20。');
      return;
    }
    if (filledTraits.some((t) => t.content.trim().length > 50)) {
      Alert.alert('字数超限', '每条特征最多 50 字。');
      return;
    }

    const trimmed = birthday.trim();
    const values: PersonFormValues = {
      name: trimmedName,
      relationship: relationship.trim(),
      birthday: trimmed ? trimmed : null,
      anniversaries: filledAnniversaries.map((a) => ({
        id: a.id,
        name: a.name.trim(),
        date: a.date.trim(),
      })),
      traits: filledTraits.map((t) => ({ id: t.id, content: t.content.trim() })),
    };

    try {
      setBusy(true);
      await onSubmit(values);
    } catch (err) {
      Alert.alert('保存失败', err instanceof Error ? err.message : '请稍后再试');
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.block}>
        <Text style={styles.blockTitle}>基本信息</Text>
        <Text style={styles.label}>姓名 *</Text>
        <TextInput
          style={styles.input}
          value={name}
          onChangeText={setName}
          placeholder="要记住的人的名字"
          placeholderTextColor={colors.ink3}
        />
        <Text style={styles.label}>与我的关系</Text>
        <TextInput
          style={styles.input}
          value={relationship}
          onChangeText={setRelationship}
          placeholder="如家人、挚友、重要客户（可自由填写）"
          placeholderTextColor={colors.ink3}
        />
        <Text style={styles.label}>生日（可留空）</Text>
        <TextInput
          style={styles.input}
          value={birthday}
          onChangeText={setBirthday}
          placeholder="YYYY-MM-DD，如 1990-05-20"
          placeholderTextColor={colors.ink3}
          autoCorrect={false}
        />
        <Text style={styles.birthHint}>留空也能保存，这类对象不会收到推送。</Text>
      </View>

      <View style={styles.block}>
        <AnniversariesEditor value={anniversaries} onChange={setAnniversaries} />
      </View>

      <View style={styles.block}>
        <TraitsEditor value={traits} onChange={setTraits} />
      </View>

      <Pressable
        style={({ pressed }) => [styles.saveBtn, (pressed || busy) && styles.saveBtnPressed]}
        onPress={handleSave}
        disabled={busy}
      >
        {busy ? (
          <ActivityIndicator size="small" color="#FCF4F4" />
        ) : (
          <Text style={styles.saveText}>{submitLabel}</Text>
        )}
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  content: { padding: 22, gap: 16 },
  block: {
    backgroundColor: colors.paper2,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    padding: 16,
    gap: 8,
  },
  blockTitle: { fontFamily: fonts.hand, fontSize: 18, color: colors.ink, marginBottom: 4 },
  label: { fontSize: 13.5, color: colors.ink2, marginTop: 6 },
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
  birthHint: { fontSize: 12, color: colors.ink3 },
  saveBtn: {
    minHeight: 48,
    borderRadius: radius.md,
    backgroundColor: colors.camelliaDeep,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveBtnPressed: { opacity: 0.85 },
  saveText: { color: '#FCF4F4', fontSize: 16, fontWeight: '600' },
});