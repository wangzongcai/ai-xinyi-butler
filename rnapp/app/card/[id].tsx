import { useLocalSearchParams } from 'expo-router';
import Placeholder from '../../src/components/Placeholder';

export default function CardScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();

  return (
    <Placeholder
      title="贺卡页"
      hint={`这里将展示竖版 3:4 的贺卡预览并导出 PNG。当前对象 id：${id}`}
    />
  );
}