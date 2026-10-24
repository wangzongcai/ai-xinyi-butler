import { router } from 'expo-router';
import PersonForm, { type PersonFormValues } from '../../src/components/PersonForm';
import { createPerson } from '../../src/data/personRepository';
import { createAnniversary } from '../../src/data/anniversaryRepository';
import { createTrait } from '../../src/data/traitRepository';

export default function NewPersonScreen() {
  async function handleSave({
    name,
    relationship,
    birthday,
    anniversaries,
    traits,
  }: PersonFormValues) {
    // 先保存对象拿到 id，再逐个写纪念日与特征
    const person = await createPerson({ name, relationship, birthday });
    for (const a of anniversaries) {
      await createAnniversary({ personId: person.id, name: a.name, date: a.date });
    }
    for (const t of traits) {
      await createTrait({ personId: person.id, content: t.content });
    }
    router.back();
  }

  return <PersonForm onSubmit={handleSave} submitLabel="保存并添加" />;
}