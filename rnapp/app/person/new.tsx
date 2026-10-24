import { router } from 'expo-router';
import PersonForm, { type PersonFormValues } from '../../src/components/PersonForm';
import { createPerson } from '../../src/data/personRepository';
import { createAnniversary } from '../../src/data/anniversaryRepository';
import { createTrait } from '../../src/data/traitRepository';

export default function NewPersonScreen() {
  async function handleSave({ name, relationship, anniversaries, traits }: PersonFormValues) {
    // 先保存对象拿到 id，再逐个写纪念日与特征
    // 生日已并入纪念日（用户可自己添加名为「生日」的一条），不再单独写 person.birthday
    const person = await createPerson({ name, relationship });
    for (const a of anniversaries) {
      await createAnniversary({
        personId: person.id,
        name: a.name,
        date: a.date,
        calendar: a.calendar,
      });
    }
    for (const t of traits) {
      await createTrait({ personId: person.id, content: t.content });
    }
    router.back();
  }

  return <PersonForm onSubmit={handleSave} submitLabel="保存并添加" />;
}