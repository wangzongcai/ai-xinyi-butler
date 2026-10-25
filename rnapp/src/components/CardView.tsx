// =====================================================================
// 电子贺卡渲染组件（M9-03 / M9-04 / M9-10）
// 结构：AI 背景图 + 客户端叠加的称呼、祝福文字、日期、可选署名、App 水印。
// 背景图加载或生成失败时降级为「场景背景色 + 装饰光斑 + 文字」，保证仍可预览与导出。
// 导出时由父页用 captureRef 截取本组件根节点，比例固定 3:4。
// =====================================================================
import { forwardRef, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, StyleSheet, Text, View } from 'react-native';
import { fonts } from '../theme';

/** 贺卡宽高比：竖版 3:4（spec 功能 8）。 */
export const CARD_ASPECT_RATIO = 3 / 4;
/** App 水印默认文字（spec 功能 8）。 */
export const CARD_WATERMARK = 'AI 心意管家';

export type BackgroundState = 'loading' | 'loaded' | 'error';

export type CardViewProps = {
  /** AI 背景图 URL；为空时直接用降级背景 */
  backgroundUrl: string | null;
  /** 降级背景色 */
  fallbackColor: string;
  /** 对象称呼，如「亲爱的妈妈」；为空则不显示 */
  salutation: string;
  /** 祝福正文 */
  blessing: string;
  /** 生成当天日期，如「2026年10月25日」 */
  dateText: string;
  /** 署名；null / 空串表示匿名（不显示） */
  signature: string | null;
  /** 场景短标签，如「生日快乐」「中秋节」 */
  occasion?: string;
  /** 背景图状态回调（导出前需等待 loaded / error） */
  onBackgroundState?: (state: BackgroundState) => void;
};

export const CardView = forwardRef<View, CardViewProps>(function CardView(
  { backgroundUrl, fallbackColor, salutation, blessing, dateText, signature, occasion, onBackgroundState },
  ref,
) {
  const [imageFailed, setImageFailed] = useState(false);
  const [imageLoading, setImageLoading] = useState(Boolean(backgroundUrl));
  const callbackRef = useRef(onBackgroundState);
  callbackRef.current = onBackgroundState;

  useEffect(() => {
    setImageFailed(false);
    setImageLoading(Boolean(backgroundUrl));
    // 只有真正有图时才上报加载中；无图时由父页决定是否在生成中
    if (backgroundUrl) callbackRef.current?.('loading');
  }, [backgroundUrl]);

  const showImage = Boolean(backgroundUrl) && !imageFailed;

  // 正文越长字号越小，避免长祝福溢出贺卡
  const len = blessing.length;
  const blessingFontSize = len > 260 ? 13.5 : len > 200 ? 14.5 : len > 140 ? 16 : len > 90 ? 18 : 20;
  const blessingLineHeight = Math.round(blessingFontSize * 1.75);

  return (
    <View
      ref={ref}
      collapsable={false}
      style={[styles.card, { backgroundColor: fallbackColor }]}
    >
      {showImage ? (
        <Image
          key={backgroundUrl ?? 'none'}
          source={{ uri: backgroundUrl as string }}
          style={StyleSheet.absoluteFill}
          resizeMode="cover"
          onLoad={() => {
            setImageLoading(false);
            callbackRef.current?.('loaded');
          }}
          onError={() => {
            setImageLoading(false);
            setImageFailed(true);
            callbackRef.current?.('error');
          }}
        />
      ) : null}

      {/* 降级背景的装饰光斑（图片加载成功时被图片盖住） */}
      {!showImage ? (
        <>
          <View style={[styles.blob, styles.blobTop]} />
          <View style={[styles.blob, styles.blobBottom]} />
        </>
      ) : null}

      {/* 压暗遮罩：保证任何背景上文字都可读 */}
      <View style={styles.scrim} />
      <View style={styles.scrimBottom} />

      <View style={styles.content}>
        <View style={styles.head}>
          {occasion ? <Text style={styles.occasion}>{occasion}</Text> : null}
          {salutation ? <Text style={styles.salutation}>{salutation}</Text> : null}
        </View>

        <View style={styles.body}>
          <Text
            style={[
              styles.blessing,
              { fontSize: blessingFontSize, lineHeight: blessingLineHeight },
            ]}
          >
            {blessing}
          </Text>
        </View>

        <View style={styles.foot}>
          {signature ? <Text style={styles.signature}>{signature}</Text> : null}
          <View style={styles.footRow}>
            <Text style={styles.date}>{dateText}</Text>
            <Text style={styles.watermark}>{CARD_WATERMARK}</Text>
          </View>
        </View>
      </View>

      {/* 背景图加载中的轻提示（导出前不可用） */}
      {imageLoading ? (
        <View style={styles.loadingOverlay} pointerEvents="none">
          <ActivityIndicator color="#FFF6F2" />
        </View>
      ) : null}
    </View>
  );
});

export default CardView;

const styles = StyleSheet.create({
  card: {
    width: '100%',
    aspectRatio: CARD_ASPECT_RATIO,
    overflow: 'hidden',
  },
  blob: {
    position: 'absolute',
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.10)',
  },
  blobTop: { width: 220, height: 220, top: -70, right: -60 },
  blobBottom: { width: 180, height: 180, bottom: -50, left: -50, backgroundColor: 'rgba(255,255,255,0.07)' },

  scrim: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(40,22,22,0.24)',
  },
  scrimBottom: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '52%',
    backgroundColor: 'rgba(32,16,16,0.30)',
  },

  content: {
    flex: 1,
    paddingHorizontal: 26,
    paddingTop: 30,
    paddingBottom: 24,
    justifyContent: 'space-between',
  },
  head: { alignItems: 'center' },
  occasion: {
    fontFamily: fonts.ui,
    fontSize: 11,
    letterSpacing: 4,
    color: 'rgba(255,246,242,0.82)',
    marginBottom: 10,
  },
  salutation: {
    fontFamily: fonts.hand,
    fontSize: 22,
    color: '#FFF8F4',
    textAlign: 'center',
    textShadowColor: 'rgba(30,10,10,0.45)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6,
  },

  body: { flex: 1, justifyContent: 'center', paddingVertical: 18 },
  blessing: {
    fontFamily: fonts.hand,
    color: '#FFF8F4',
    textAlign: 'center',
    textShadowColor: 'rgba(30,10,10,0.40)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6,
  },

  foot: { alignItems: 'flex-end' },
  signature: {
    fontFamily: fonts.hand,
    fontSize: 14,
    color: 'rgba(255,248,244,0.95)',
    marginBottom: 8,
    textShadowColor: 'rgba(30,10,10,0.40)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  footRow: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },
  date: { fontFamily: fonts.ui, fontSize: 10.5, color: 'rgba(255,248,244,0.82)' },
  watermark: {
    fontFamily: fonts.ui,
    fontSize: 10.5,
    letterSpacing: 1,
    color: 'rgba(255,248,244,0.78)',
  },

  loadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(30,16,16,0.18)',
  },
});
