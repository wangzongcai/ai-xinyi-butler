import { router, useLocalSearchParams } from 'expo-router';
import Placeholder from '../../src/components/Placeholder';
import NavButton from '../../src/components/NavButton';

export default function ContentScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();

  return (
    <Placeholder title="心意内容页" hint={`这里将生成祝福文案与 4 条礼物建议。当前对象 id：${id}`}>
      <NavButton label="把祝福做成贺卡" onPress={() => router.push(`/card/${id}`)} />
    </Placeholder>
  );
}