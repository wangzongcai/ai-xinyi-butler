import { useLocalSearchParams } from 'expo-router';
import Placeholder from '../../../src/components/Placeholder';

export default function EditPersonScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();

  return (
    <Placeholder
      title="编辑对象页"
      hint={`这里将回填并编辑对象的姓名、关系、生日、纪念日与特征。当前对象 id：${id}`}
    />
  );
}