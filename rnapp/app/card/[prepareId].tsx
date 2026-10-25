// =====================================================================
// 贺卡页（M9-05 ~ M9-11）
// 入口：对象页 / 节日准备页的「生成电子贺卡」，携带 prepareId。
// 能力：AI 背景图（失败降级）、切换/重新生成祝福、称呼编辑、
//       可选署名、导出 3:4 JPEG、保存相册、系统分享。
// =====================================================================
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import { colors, fonts, radius } from '../../src/theme';
import { useSettings } from '../../src/settings/SettingsContext';
import { getPerson, type Person } from '../../src/data/personRepository';
import { listTraitsByPerson } from '../../src/data/traitRepository';
import { listAnniversariesByPerson } from '../../src/data/anniversaryRepository';
import {
  getPrepareById,
  savePrepare,
  setPrepareBackgroundPath,
  setPrepareBackgroundUrl,
  setPrepareSelectedIndex,
  type PrepareRecord,
} from '../../src/data/prepareRepository';
import { generateBlessings, generateCardImage } from '../../src/lib/aiClient';
import { signedBackgroundUrl } from '../../src/lib/backgroundStorage';
import {
  fallbackColorFor,
  pickAnniversaryName,
  sceneContextFor,
  sceneLabel,
  type CardSceneContext,
} from '../../src/lib/cardScenes';
import { CardView, type BackgroundState } from '../../src/components/CardView';
import { captureCard, saveCardToLibrary, shareCard } from '../../src/lib/exportCard';
// 称呼与日期文案与对象页的贺卡预览共用同一份实现
import { defaultSalutation, todayText } from '../../src/lib/cardDefaults';

export default function CardScreen() {
  const { prepareId } = useLocalSearchParams<{ prepareId: string }>();
  const { cardSignature, signatureText, blessingCount } = useSettings();

  const cardRef = useRef<View | null>(null);

  const [record, setRecord] = useState<PrepareRecord | null>(null);
  const [person, setPerson] = useState<Person | null>(null);
  const [traits, setTraits] = useState<string[]>([]);
  const [anniversaryNames, setAnniversaryNames] = useState<string[]>([]);
  /** 离今天最近的纪念日名称，用于让背景图贴合具体纪念日（生日场景为空）。 */
  const [anniversaryName, setAnniversaryName] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [notFound, setNotFound] = useState(false);

  const [blessings, setBlessings] = useState<string[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [salutation, setSalutation] = useState('');

  const [backgroundUrl, setBackgroundUrl] = useState<string | null>(null);
  const [bgState, setBgState] = useState<BackgroundState>('loading');

  /** 防止开发环境 StrictMode 下重复请求同一张背景图（白扣一次额度）。 */
  const generationStartedRef = useRef<string | null>(null);

  const [regenerating, setRegenerating] = useState(false);
  const [exporting, setExporting] = useState<'save' | 'share' | null>(null);

  // ---------------- 读取 prepare 记录与关联资料 ----------------
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!prepareId) {
        setNotFound(true);
        setLoaded(true);
        return;
      }
      const rec = await getPrepareById(prepareId);
      if (cancelled) return;
      if (!rec) {
        setNotFound(true);
        setLoaded(true);
        return;
      }
      setRecord(rec);
      setBlessings(rec.blessings);
      setSelectedIndex(
        rec.blessings.length > 0
          ? Math.max(0, Math.min(rec.blessings.length - 1, rec.selectedIndex))
          : 0,
      );
      setBackgroundUrl(rec.backgroundUrl);

      let names: string[] = [];
      let nearestAnniversaryName: string | null = null;
      let loadedPerson: Person | null = null;
      if (rec.personId) {
        const p = await getPerson(rec.personId);
        if (cancelled) return;
        if (p) {
          loadedPerson = p;
          setPerson(p);
          setSalutation(defaultSalutation(p));
          const [traitRows, anniversaries] = await Promise.all([
            listTraitsByPerson(rec.personId),
            listAnniversariesByPerson(rec.personId),
          ]);
          if (cancelled) return;
          names = anniversaries.map((a) => a.name);
          nearestAnniversaryName = pickAnniversaryName(anniversaries);
          setTraits(traitRows.map((t) => t.content));
          setAnniversaryNames(names);
          setAnniversaryName(nearestAnniversaryName);
        }
      }
      // 背景图：优先用云端路径换签名地址（重装/换机后原图直接回来），
      // 换不到再看本机缓存；两者都没有才调用 AI 生成。
      let hasBackground = false;
      if (rec.backgroundPath) {
        const signed = await signedBackgroundUrl(rec.backgroundPath);
        if (cancelled) return;
        if (signed) {
          hasBackground = true;
          setBackgroundUrl(signed);
          // 顺手更新本机缓存：离线下次进入仍能显示
          void setPrepareBackgroundUrl(rec.id, signed);
        }
      }
      if (!hasBackground && rec.backgroundUrl) {
        hasBackground = true;
        setBackgroundUrl(rec.backgroundUrl);
      }
      if (!hasBackground && rec.backgroundPath) {
        // 有路径但取不到图（多半断网）：走降级背景，允许用户重试
        setBgState('error');
      }

      // 先放行页面渲染（显示降级背景），再在后台生成背景图，避免空等 30 秒
      setLoaded(true);

      // M9-05：已有背景图（云端路径或本机缓存）时直接复用，不重复调用 AI
      if (!hasBackground && generationStartedRef.current !== rec.id) {
        generationStartedRef.current = rec.id;
        const ctx = sceneContextFor(rec.scene, rec.festivalCode, names);
        try {
          const result = await generateCardImage({
            scene: ctx.scene,
            prepareId: rec.id,
            festivalCode: ctx.festivalCode,
            festivalName: ctx.festivalName,
            anniversaryName: nearestAnniversaryName,
            relationship: loadedPerson?.relationship,
          });
          if (cancelled) return;
          setBackgroundUrl(result.imageUrl);
          void setPrepareBackgroundUrl(rec.id, result.imageUrl);
          // 记下云端路径：这条会同步，换机登录后据此取回同一张图
          if (result.backgroundPath) void setPrepareBackgroundPath(rec.id, result.backgroundPath);
        } catch {
          // M9-10：生成失败降级为场景纯色背景，贺卡仍可编辑与导出
          if (!cancelled) setBgState('error');
        }
      }
    })().catch(() => {
      if (!cancelled) {
        setNotFound(true);
        setLoaded(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [prepareId]);

  // ---------------- 场景上下文与降级配色 ----------------
  const sceneContext = useMemo<CardSceneContext>(
    () =>
      sceneContextFor(record?.scene ?? 'contact', record?.festivalCode ?? null, anniversaryNames),
    [record, anniversaryNames],
  );

  const fallbackColor = useMemo(() => fallbackColorFor(sceneContext), [sceneContext]);
  const occasion = useMemo(() => sceneLabel(sceneContext), [sceneContext]);

  // ---------------- 背景图手动重试（M9-10） ----------------
  const relationship = person?.relationship ?? '';

  const retryBackground = useCallback(async () => {
    if (!record) return;
    setBgState('loading');
    try {
      const result = await generateCardImage({
        scene: sceneContext.scene,
        prepareId: record.id,
        festivalCode: sceneContext.festivalCode,
        festivalName: sceneContext.festivalName,
        anniversaryName,
        relationship,
      });
      setBackgroundUrl(result.imageUrl);
      // background_url 只存本机、不参与同步；background_path 才随账号同步
      void setPrepareBackgroundUrl(record.id, result.imageUrl);
      if (result.backgroundPath) void setPrepareBackgroundPath(record.id, result.backgroundPath);
    } catch {
      // 失败只降级，不打断用户：贺卡仍可预览与导出
      setBgState('error');
    }
  }, [record, sceneContext, anniversaryName, relationship]);

  // ---------------- 祝福切换 / 重新生成 ----------------
  const switchTo = useCallback(
    (index: number) => {
      if (index < 0 || index >= blessings.length) return;
      setSelectedIndex(index);
      if (record) void setPrepareSelectedIndex(record.id, index);
    },
    [blessings.length, record],
  );

  const regenerateBlessing = useCallback(async () => {
    if (!record || regenerating) return;
    setRegenerating(true);
    try {
      const count = Math.max(1, Math.min(5, blessingCount));
      const { blessings: list } = await generateBlessings({
        relationship,
        traits,
        scene:
          record.scene === 'holiday'
            ? 'festival'
            : sceneContext.scene === 'birthday'
              ? 'birthday'
              : 'anniversary',
        festivalName: sceneContext.festivalName ?? undefined,
        count,
      });
      if (list.length === 0) throw new Error('返回内容为空');
      const saved = await savePrepare(
        { scene: record.scene, personId: record.personId, festivalCode: record.festivalCode },
        list,
        0,
      );
      setBlessings(list);
      setSelectedIndex(0);
      setRecord({ ...record, id: saved.id, blessings: list, selectedIndex: 0 });
      Alert.alert('已重新生成', '贺卡文字已更新，背景图保持不变。');
    } catch (e) {
      Alert.alert('重新生成失败', e instanceof Error ? e.message : '请稍后再试。');
    } finally {
      setRegenerating(false);
    }
  }, [record, regenerating, blessingCount, relationship, traits, sceneContext]);

  // ---------------- 导出 / 保存 / 分享 ----------------
  const exportToFile = useCallback(async (): Promise<string | null> => {
    if (bgState === 'loading') {
      Alert.alert('稍等片刻', '背景图还在生成中，完成后就能导出了。');
      return null;
    }
    try {
      return await captureCard(cardRef);
    } catch (e) {
      Alert.alert('导出失败', e instanceof Error ? e.message : '请稍后再试。');
      return null;
    }
  }, [bgState]);

  const handleSave = useCallback(async () => {
    if (exporting) return;
    setExporting('save');
    try {
      const uri = await exportToFile();
      if (!uri) return;
      const result = await saveCardToLibrary(uri);
      if (result.ok) {
        Alert.alert('已保存', '贺卡已保存到系统相册。');
        return;
      }
      if (result.reason === 'permission') {
        Alert.alert('需要相册权限', '请在系统设置中允许「心意管家」保存照片。', [
          { text: '取消', style: 'cancel' },
          { text: '去设置', onPress: () => void Linking.openSettings() },
        ]);
        return;
      }
      if (result.reason === 'unavailable') {
        // Expo Go 没有相册原生模块：引导改用“分享”，系统面板里同样能存到相册
        Alert.alert('当前环境不支持直接存相册', '请点「分享」，在系统面板里选择保存到相册。');
        return;
      }
      Alert.alert('保存失败', result.message ?? '请稍后再试。');
    } finally {
      setExporting(null);
    }
  }, [exporting, exportToFile]);

  const handleShare = useCallback(async () => {
    if (exporting) return;
    setExporting('share');
    try {
      const uri = await exportToFile();
      if (!uri) return;
      const result = await shareCard(uri);
      if (!result.ok) {
        Alert.alert('分享失败', result.message ?? '请稍后再试。');
      }
    } finally {
      setExporting(null);
    }
  }, [exporting, exportToFile]);

  // ---------------- 渲染 ----------------
  if (notFound) {
    return (
      <View style={styles.centerWrap}>
        <Text style={styles.notFoundTitle}>这张贺卡找不到了</Text>
        <Text style={styles.notFoundHint}>
          它可能对应的祝福内容已被替换或删除。回到对象页重新生成一张吧。
        </Text>
      </View>
    );
  }

  if (!loaded || !record) {
    return (
      <View style={styles.centerWrap}>
        <ActivityIndicator color={colors.camellia} />
      </View>
    );
  }

  const currentBlessing = blessings[selectedIndex] ?? '';
  // 署名：开关关闭则匿名；开启但未填写时保持匿名，并在下方提示去设置页填写（M9-04）
  const signature = cardSignature ? signatureText?.trim() || null : null;
  const busy = exporting !== null;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.body}>
      {/* 贺卡预览：外层圆角只用于展示，导出截取内层直角视图 */}
      <View style={styles.cardFrame}>
        <CardView
          ref={cardRef}
          backgroundUrl={backgroundUrl}
          fallbackColor={fallbackColor}
          salutation={salutation.trim()}
          blessing={currentBlessing}
          dateText={todayText()}
          signature={signature}
          occasion={occasion}
          onBackgroundState={setBgState}
        />
      </View>

      {/* 背景图状态 */}
      {bgState === 'loading' ? (
        <Text style={styles.statusHint}>正在为这张贺卡绘制背景…</Text>
      ) : null}
      {/* 背景已生成时也允许换一张：调整提示词后旧图会一直命中本机缓存 */}
      {bgState === 'loaded' ? (
        <Pressable style={styles.retryBtn} onPress={() => void retryBackground()}>
          <Text style={styles.retryText}>换一张背景</Text>
        </Pressable>
      ) : null}
      {bgState === 'error' ? (
        <View style={styles.errorRow}>
          <Text style={styles.errorText}>
            背景图没有生成成功，已使用默认背景。贺卡文字与导出不受影响。
          </Text>
          <Pressable style={styles.retryBtn} onPress={() => void retryBackground()}>
            <Text style={styles.retryText}>重试背景</Text>
          </Pressable>
        </View>
      ) : null}

      {/* 称呼 */}
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>对象称呼</Text>
        <TextInput
          style={styles.input}
          value={salutation}
          onChangeText={setSalutation}
          placeholder="如「亲爱的妈妈」"
          placeholderTextColor={colors.ink3}
          maxLength={20}
        />
        <Text style={styles.sectionHint}>显示在贺卡顶部，可以按你的习惯修改。</Text>
      </View>

      {/* 祝福切换 */}
      <View style={styles.section}>
        <View style={styles.sectionHead}>
          <Text style={styles.sectionLabel}>祝福语</Text>
          <Text style={styles.counter}>
            {blessings.length > 0 ? `${selectedIndex + 1} / ${blessings.length}` : '暂无'}
          </Text>
        </View>
        {blessings.length > 1 ? (
          <View style={styles.switcher}>
            <Pressable
              style={[styles.switchBtn, selectedIndex <= 0 && styles.switchDisabled]}
              onPress={() => switchTo(selectedIndex - 1)}
              disabled={selectedIndex <= 0}
              hitSlop={6}
            >
              <Ionicons name="chevron-back" size={18} color={colors.ink2} />
            </Pressable>
            <View style={styles.dots}>
              {blessings.map((_, i) => (
                <Pressable
                  key={i}
                  onPress={() => switchTo(i)}
                  hitSlop={6}
                  style={[styles.dot, i === selectedIndex && styles.dotActive]}
                />
              ))}
            </View>
            <Pressable
              style={[
                styles.switchBtn,
                selectedIndex >= blessings.length - 1 && styles.switchDisabled,
              ]}
              onPress={() => switchTo(selectedIndex + 1)}
              disabled={selectedIndex >= blessings.length - 1}
              hitSlop={6}
            >
              <Ionicons name="chevron-forward" size={18} color={colors.ink2} />
            </Pressable>
          </View>
        ) : null}

        <Pressable
          style={[styles.ghostBtn, regenerating && styles.btnDisabled]}
          onPress={() => void regenerateBlessing()}
          disabled={regenerating}
        >
          <Ionicons
            name="refresh"
            size={16}
            color={regenerating ? colors.ink3 : colors.camellia}
          />
          <Text style={[styles.ghostBtnText, regenerating && styles.btnTextDisabled]}>
            {regenerating ? '正在重新生成…' : '重新生成祝福'}
          </Text>
        </Pressable>
        <Text style={styles.sectionHint}>重新生成只替换文字，背景图保持不变。</Text>
      </View>

      {/* 署名说明 */}
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>署名</Text>
        <Text style={styles.sectionHint}>
          {cardSignature
            ? signature
              ? `当前署名：${signature}`
              : '已开启署名，但还没填写署名文字；可在设置 - 贺卡设置中填写。'
            : '当前为匿名贺卡。可在设置 - 贺卡设置中开启署名。'}
        </Text>
      </View>

      {/* 导出操作 */}
      <View style={styles.actions}>
        <Pressable
          style={[styles.primaryBtn, (busy || bgState === 'loading') && styles.btnDisabled]}
          onPress={() => void handleSave()}
          disabled={busy || bgState === 'loading'}
        >
          {exporting === 'save' ? (
            <ActivityIndicator color="#FCF4F4" />
          ) : (
            <Ionicons name="download-outline" size={18} color="#FCF4F4" />
          )}
          <Text style={styles.primaryBtnText}>保存到相册</Text>
        </Pressable>
        <Pressable
          style={[styles.secondaryBtn, (busy || bgState === 'loading') && styles.btnDisabled]}
          onPress={() => void handleShare()}
          disabled={busy || bgState === 'loading'}
        >
          {exporting === 'share' ? (
            <ActivityIndicator color={colors.camelliaDeep} />
          ) : (
            <Ionicons name="share-social-outline" size={18} color={colors.camelliaDeep} />
          )}
          <Text style={styles.secondaryBtnText}>分享</Text>
        </Pressable>
      </View>
      <Text style={styles.footNote}>
        导出为竖版 3:4 JPEG（1080 × 1440），右下角带「AI 心意管家」水印。
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  body: { paddingHorizontal: 22, paddingVertical: 18, paddingBottom: 44 },
  centerWrap: {
    flex: 1,
    backgroundColor: colors.paper,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 30,
  },
  notFoundTitle: { fontFamily: fonts.hand, fontSize: 20, color: colors.ink },
  notFoundHint: {
    fontSize: 13.5,
    color: colors.ink2,
    marginTop: 10,
    lineHeight: 20,
    textAlign: 'center',
  },

  cardFrame: {
    borderRadius: radius.xl,
    overflow: 'hidden',
    backgroundColor: colors.paper2,
    shadowColor: colors.shadow,
    shadowOpacity: 0.18,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },

  statusHint: { fontSize: 12.5, color: colors.ink3, marginTop: 10, textAlign: 'center' },
  errorRow: { marginTop: 12, gap: 8 },
  errorText: { fontSize: 12.5, color: colors.ink2, lineHeight: 19 },
  retryBtn: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: colors.camellia,
    borderRadius: radius.sm,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  retryText: { fontSize: 12.5, color: colors.camelliaDeep },

  section: {
    marginTop: 18,
    backgroundColor: colors.paper2,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    padding: 14,
  },
  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionLabel: { fontFamily: fonts.hand, fontSize: 15, color: colors.ink },
  sectionHint: { fontSize: 12, color: colors.ink3, marginTop: 8, lineHeight: 18 },
  counter: { fontSize: 12.5, color: colors.ink3 },

  input: {
    marginTop: 10,
    backgroundColor: colors.paper,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.sm,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 14.5,
    color: colors.ink,
  },

  switcher: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
    marginTop: 14,
  },
  switchBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.paper,
  },
  switchDisabled: { opacity: 0.35 },
  dots: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.line },
  dotActive: { backgroundColor: colors.camellia, width: 18 },

  ghostBtn: {
    marginTop: 14,
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: colors.camellia,
    borderRadius: radius.sm,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  ghostBtnText: { fontSize: 13, color: colors.camelliaDeep },
  btnDisabled: { opacity: 0.45 },
  btnTextDisabled: { color: colors.ink3 },

  actions: { flexDirection: 'row', gap: 12, marginTop: 22 },
  primaryBtn: {
    flex: 1,
    minHeight: 48,
    borderRadius: radius.md,
    backgroundColor: colors.camellia,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  primaryBtnText: { color: '#FCF4F4', fontSize: 15, fontWeight: '600' },
  secondaryBtn: {
    flex: 0.7,
    minHeight: 48,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.camellia,
    backgroundColor: colors.paper2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  secondaryBtnText: { color: colors.camelliaDeep, fontSize: 15, fontWeight: '600' },
  footNote: {
    fontSize: 11.5,
    color: colors.ink3,
    marginTop: 12,
    lineHeight: 17,
    textAlign: 'center',
  },
});
