// =====================================================================
// 已有电子贺卡展示（2026-10-25）
// 对象页用：把这张 prepare 记录里「已经生成过」的贺卡直接摆成一张图片，
// 纯展示、不可点——不进编辑页，也不调用任何 AI、不新建记录。
// 祝福文字来自 prepare，背景图只取已有缓存 / 云端签名地址，没有就用降级配色。
// 需要编辑 / 导出 / 分享时，仍走原来的「贺卡」入口（节日准备页等）。
// =====================================================================
import { useEffect, useState } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import { radius } from '../theme';
import { CardView, CARD_ASPECT_RATIO } from './CardView';
import { getPrepareById, type PrepareRecord } from '../data/prepareRepository';
import { getPerson } from '../data/personRepository';
import { listAnniversariesByPerson } from '../data/anniversaryRepository';
import { signedBackgroundUrl } from '../lib/backgroundStorage';
import { fallbackColorFor, sceneContextFor, sceneLabel } from '../lib/cardScenes';
import { defaultSalutation, todayText } from '../lib/cardDefaults';
import { useSettings } from '../settings/SettingsContext';

/**
 * 贺卡按 3:4 展示：内部固定用 360 宽渲染（与贺卡页同一套字号与间距），
 * 再整体缩放到底部可用宽度，放大后文字依然清晰、排版不走样。
 */
const BASE_WIDTH = 360;
/** 对象页左右各 22 的内边距，预览按剩余宽度铺满 */
const PAGE_PADDING = 22;
const MAX_WIDTH = 360;

type Props = {
  prepareId: string;
};

export default function CardPreview({ prepareId }: Props) {
  const dimensions = useWindowDimensions();
  const { cardSignature, signatureText } = useSettings();
  const [record, setRecord] = useState<PrepareRecord | null>(null);
  const [salutation, setSalutation] = useState('');
  const [anniversaryNames, setAnniversaryNames] = useState<string[]>([]);
  const [backgroundUrl, setBackgroundUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const rec = await getPrepareById(prepareId);
      if (cancelled || !rec) return;
      setRecord(rec);

      // 称呼与场景：节日卡用节日本身，联系人卡按纪念日名称判断生日 / 纪念日
      let names: string[] = [];
      if (rec.personId) {
        const p = await getPerson(rec.personId);
        if (cancelled) return;
        if (p) setSalutation(defaultSalutation(p));
        const anniversaries = await listAnniversariesByPerson(rec.personId);
        if (cancelled) return;
        names = anniversaries.map((a) => a.name);
        setAnniversaryNames(names);
      }

      // 背景图只复用已有：先按云端路径换签名地址，退回本机缓存；都没有就是降级配色
      if (rec.backgroundPath) {
        const signed = await signedBackgroundUrl(rec.backgroundPath);
        if (cancelled) return;
        if (signed) {
          setBackgroundUrl(signed);
          return;
        }
      }
      if (!cancelled) setBackgroundUrl(rec.backgroundUrl);
    })().catch(() => {
      // 读不到就保持隐藏，不影响对象页其它内容
    });
    return () => {
      cancelled = true;
    };
  }, [prepareId]);

  if (!record) return null;

  const ctx = sceneContextFor(record.scene, record.festivalCode, anniversaryNames);
  const blessing = record.blessings[record.selectedIndex] ?? record.blessings[0] ?? '';
  const signature = cardSignature ? signatureText?.trim() || null : null;

  // 铺满对象页可用宽度（上限 360，超过就按原尺寸居中），屏幕旋转/尺寸变化会跟着变
  const previewWidth = Math.max(
    200,
    Math.min(MAX_WIDTH, dimensions.width - PAGE_PADDING * 2),
  );
  const previewHeight = previewWidth / CARD_ASPECT_RATIO;
  const scale = previewWidth / BASE_WIDTH;

  return (
    <View style={styles.wrap}>
      <View
        style={[
          styles.frame,
          { width: previewWidth, height: previewHeight, borderRadius: radius.md },
        ]}
      >
        <View
          style={[
            styles.scaler,
            { height: BASE_WIDTH / CARD_ASPECT_RATIO, transform: [{ scale }] },
          ]}
        >
          <CardView
            backgroundUrl={backgroundUrl}
            fallbackColor={fallbackColorFor(ctx)}
            salutation={salutation}
            blessing={blessing}
            dateText={todayText()}
            signature={signature}
            occasion={sceneLabel(ctx)}
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', paddingVertical: 6 },
  frame: {
    overflow: 'hidden',
    // 与贺卡页同样的投影，视觉上像一张卡片摆在页面上
    shadowColor: '#5A2A2A',
    shadowOpacity: 0.16,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  // 用 360 宽渲染再整体缩放：字号、间距与真卡完全一致
  scaler: {
    width: BASE_WIDTH,
    transformOrigin: 'top left',
  },
});
