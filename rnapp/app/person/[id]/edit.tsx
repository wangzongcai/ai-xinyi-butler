import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import PersonForm, { type PersonFormValues } from '../../../src/components/PersonForm';
import { getPerson, updatePerson } from '../../../src/data/personRepository';
import {
  listAnniversariesByPerson,
  replaceAnniversaries,
} from '../../../src/data/anniversaryRepository';
import {
  createTrait,
  deleteTrait,
  listTraitsByPerson,
  updateTrait,
} from '../../../src/data/traitRepository';
import { colors } from '../../../src/theme';
import type { AnniversaryDraft } from '../../../src/components/person/AnniversariesEditor';
import type { TraitDraft } from '../../../src/components/person/TraitsEditor';

type Loaded = {
  name: string;
  relationship: string;
  anniversaries: AnniversaryDraft[];
  traits: TraitDraft[];
};

export default function EditPersonScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [initial, setInitial] = useState<Loaded | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const person = await getPerson(id);
        if (!person) throw new Error('对象不存在或已删除');
        const [anniversaries, traits] = await Promise.all([
          listAnniversariesByPerson(id),
          listTraitsByPerson(id),
        ]);
        if (!alive) return;
        setInitial({
          name: person.name,
          relationship: person.relationship,
          anniversaries: anniversaries.map((a) => ({
            id: a.id,
            name: a.name,
            date: a.date,
            calendar: a.calendar,
          })),
          traits: traits.map((t) => ({ id: t.id, content: t.content })),
        });
      } catch {
        if (alive) {
          // 加载失败：退回到对象页
          router.back();
        }
      }
    })();
    return () => {
      alive = false;
    };
  }, [id]);

  async function handleSave({ name, relationship, anniversaries, traits }: PersonFormValues) {
    const personId = id;
    // 1) 对象本身（生日已并入纪念日，不再写 person.birthday）
    await updatePerson(personId, { name, relationship });
    // 2) 纪念日整体替换（含新增与已有）
    await replaceAnniversaries(personId, anniversaries);
    // 3) 特征同步：按 id 区分 新增 / 更新 / 删除
    const existing = await listTraitsByPerson(personId);
    const keepIds = new Set(traits.filter((t) => t.id).map((t) => t.id!));
    for (const existingTrait of existing) {
      if (!keepIds.has(existingTrait.id)) {
        await deleteTrait(personId, existingTrait.id);
      }
    }
    for (const t of traits) {
      if (t.id) {
        await updateTrait(t.id, t.content);
      } else {
        await createTrait({ personId, content: t.content });
      }
    }
    // 4) 回对象页
    router.replace(`/person/${personId}`);
  }

  if (!initial) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={colors.camellia} />
      </View>
    );
  }

  return (
    <PersonForm
      initialName={initial.name}
      initialRelationship={initial.relationship}
      initialAnniversaries={initial.anniversaries}
      initialTraits={initial.traits}
      onSubmit={handleSave}
      submitLabel="保存修改"
    />
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    backgroundColor: colors.paper,
    alignItems: 'center',
    justifyContent: 'center',
  },
});