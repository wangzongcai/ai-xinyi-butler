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
    // 新增的日子必须立刻重排：否则要等下次进入前台才排期，期间既不推送、也写不进心意记录。
    // 这里等重排完成再返回，避免用户马上去看历史页时记录还没写进去。
    try {
      const { rescheduleAll } = await import('../../src/notifications/scheduler');
      await rescheduleAll();
    } catch {
      // 重排失败不影响对象保存本身，下次启动/回前台会再排
    }
    router.back();
  }

  return <PersonForm onSubmit={handleSave} submitLabel="保存并添加" />;
}