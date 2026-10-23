import { router, useLocalSearchParams } from 'expo-router';
import Placeholder from '../../src/components/Placeholder';
import NavButton from '../../src/components/NavButton';

export default function PersonScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();

  return (
    <Placeholder title="对象页" hint={`展示对象的姓名、关系、纪念日与特征。当前对象 id：${id}`}>
      <NavButton label="编辑对象" onPress={() => router.push(`/person/${id}/edit`)} />
      <NavButton label="写几句祝福、挑几件礼物" onPress={() => router.push(`/content/${id}`)} />
      <NavButton label="做一张贺卡" onPress={() => router.push(`/card/${id}`)} />
    </Placeholder>
  );
}