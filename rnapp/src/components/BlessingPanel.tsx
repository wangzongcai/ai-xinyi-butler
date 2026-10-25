// =====================================================================
// 祝福语区域渲染组件（M7 共用，供联系人 / 节日准备页复用）
// 负责：隐私同意卡、加载态、无特征提示、失败兜底 + 重试、逐条复制 / 就地编辑。
// 数据的生成与持久化由父页的 usePrepareContent hook 管，本组件只管展示与交互。
// =====================================================================
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { UsePrepareContent } from '../hooks/usePrepareContent';
import { copyText } from '../lib/clipboard';
import { OFFLINE_TIP } from '../lib/network';
import { colors, fonts, radius } from '../theme';

export default function BlessingPanel({
  hook,
  headerLabel,
  onGoEdit,
  readOnly = false,
}: {
  hook: UsePrepareContent;
  /** 区块标题，如「祝福语」 */
  headerLabel?: string;
  /** 无特征时「去编辑」的回调；不传则不显示该按钮 */
  onGoEdit?: () => void;
  /**
   * 只读模式（2026-10-25）：从历史记录进入时用。
   * 内容按已保存的固定展示——不显示「重新生成 / 换一批」，也不允许就地编辑，
   * 只保留复制。避免在「看记录」的场景里又把内容改掉。
   */
  readOnly?: boolean;
}) {
  const {
    consentVisible,
    approveConsent,
    blessStatus,
    blessings,
    blessError,
    blessOffline,
    cached,
    regenerate,
    editBlessing,
  } = hook;

  const [editing, setEditing] = useState<number | null>(null);
  const [draft, setDraft] = useState('');

  const finishEdit = (index: number) => {
    const text = draft.trim();
    setEditing(null);
    if (text) editBlessing(index, text);
  };

  const copy = (text: string) => {
    copyText(text)
      .then(() => Alert.alert('已复制', '这条祝福已复制到剪贴板，可以粘贴发送了。'))
      .catch(() => Alert.alert('复制失败', '请稍后再试。'));
  };

  // 首次 AI 使用隐私提示
  if (consentVisible) {
    return (
      <View style={styles.consentCard}>
        <Text style={styles.consentTitle}>使用 AI 生成内容</Text>
        <Text style={styles.consentBody}>
          为了让祝福和礼物更贴合对方，联网生成时会把你们的关系和对方特征等必要描述
          发给大模型，仅用于本次生成，不用于训练，也不向第三方提供。一次同意，之后不再询问。
        </Text>
        <Pressable style={styles.primaryBtn} onPress={approveConsent}>
          <Text style={styles.primaryBtnText}>我同意，开始生成</Text>
        </Pressable>
      </View>
    );
  }

  // 加载中（idle 也在内：父页数据未就绪时同样按加载态展示，避免闪出空列表）
  if (blessStatus === 'loading' || blessStatus === 'idle') {
    return (
      <View style={styles.loadingWrap}>
        <ActivityIndicator size="large" color={colors.camellia} />
        <Text style={styles.loadingText}>正在为你斟酌措辞…</Text>
      </View>
    );
  }

  // 无特征：引导先填
  if (blessStatus === 'notraits') {
    return (
      <View style={styles.notraits}>
        <Ionicons name="information-circle-outline" size={26} color={colors.ink3} />
        <Text style={styles.notraitsText}>建议先填写对方的特征描述，才能生成更贴心的祝福。</Text>
        {onGoEdit ? (
          <Pressable style={styles.ghostBtn} onPress={onGoEdit}>
            <Text style={styles.ghostBtnText}>去编辑特征</Text>
          </Pressable>
        ) : null}
      </View>
    );
  }

  // 失败兜底：断网（M11-01）与其它失败共用同一块，只是提示与按钮文案不同
  if (blessStatus === 'error') {
    const traitsText = hook.scenario.traits.filter(Boolean).join('、');
    return (
      <View style={styles.errorWrap}>
        {blessOffline ? (
          <View style={styles.offlineCard}>
            <Ionicons name="cloud-offline-outline" size={24} color={colors.ink3} />
            <View style={styles.offlineMain}>
              <Text style={styles.offlineText}>{OFFLINE_TIP}</Text>
              {/* spec 功能 5：无网时同时展示对象信息，方便先手动写祝福 */}
              <Text style={styles.offlineInfo}>
                {hook.scenario.personId
                  ? `对象：${hook.scenario.relationship || '关系未填写'}${
                      traitsText ? ` · 特征：${traitsText}` : ''
                    }`
                  : `场景：${hook.scenario.festivalName ?? '通用节日'}`}
              </Text>
            </View>
          </View>
        ) : (
          <Text style={styles.errorText}>生成失败了：{blessError ?? '请稍后再试'}</Text>
        )}
        <Pressable style={styles.primaryBtn} onPress={regenerate}>
          <Text style={styles.primaryBtnText}>{blessOffline ? '联网后重试' : '重试'}</Text>
        </Pressable>
        <Text style={styles.fallbackTitle}>
          先给你一些可按关系类型复用的通用祝福（当前按「对方关系」匹配）：
        </Text>
        <View style={styles.list}>
          {blessings.map((b, i) => (
            <BlessingItem
              key={i}
              index={i}
              text={b}
              editing={editing === i}
              draft={draft}
              readOnly={readOnly}
              onStartEdit={() => {
                setEditing(i);
                setDraft(b);
              }}
              onDraftChange={setDraft}
              onFinishEdit={() => finishEdit(i)}
              onCopy={() => copy(b)}
            />
          ))}
        </View>
      </View>
    );
  }

  // 正常（ready / cached）
  return (
    <View>
      <View style={styles.headRow}>
        <Text style={styles.sectionTitle}>{headerLabel ?? '祝福语'}</Text>
        {readOnly ? null : (
          <Pressable style={styles.regenerateBtn} onPress={regenerate} hitSlop={6}>
            <Ionicons name="refresh" size={15} color={colors.camellia} />
            <Text style={styles.regenerateText}>{cached ? '重新生成' : '换一批'}</Text>
          </Pressable>
        )}
      </View>
      {cached ? (
        <Text style={styles.cachedNote}>
          {readOnly
            ? '以下是你之前准备好的内容，可直接复制。'
            : '以下为你上次准备好的内容，可直接复制或编辑。'}
        </Text>
      ) : null}
      <View style={styles.list}>
        {blessings.map((b, i) => (
          <BlessingItem
            key={i}
            index={i}
            text={b}
            editing={editing === i}
            draft={draft}
            readOnly={readOnly}
            onStartEdit={() => {
              setEditing(i);
              setDraft(b);
            }}
            onDraftChange={setDraft}
            onFinishEdit={() => finishEdit(i)}
            onCopy={() => copy(b)}
          />
        ))}
      </View>
    </View>
  );
}

function BlessingItem({
  index,
  text,
  editing,
  draft,
  readOnly,
  onStartEdit,
  onDraftChange,
  onFinishEdit,
  onCopy,
}: {
  index: number;
  text: string;
  editing: boolean;
  draft: string;
  readOnly: boolean;
  onStartEdit: () => void;
  onDraftChange: (t: string) => void;
  onFinishEdit: () => void;
  onCopy: () => void;
}) {
  return (
    <View style={styles.item}>
      <Text style={styles.itemIndex}>{index + 1}</Text>
      {editing ? (
        <TextInput
          style={styles.input}
          value={draft}
          onChangeText={onDraftChange}
          multiline
          autoFocus
        />
      ) : (
        <Text style={styles.itemText}>{text}</Text>
      )}
      <View style={styles.itemActions}>
        <Pressable style={styles.actionBtn} onPress={onCopy} hitSlop={6}>
          <Ionicons name="copy-outline" size={16} color={colors.ink2} />
          <Text style={styles.actionText}>复制</Text>
        </Pressable>
        {readOnly ? null : editing ? (
          <Pressable style={styles.actionBtn} onPress={onFinishEdit} hitSlop={6}>
            <Ionicons name="checkmark" size={16} color={colors.camelliaDeep} />
            <Text style={[styles.actionText, styles.actionDone]}>完成</Text>
          </Pressable>
        ) : (
          <Pressable style={styles.actionBtn} onPress={onStartEdit} hitSlop={6}>
            <Ionicons name="create-outline" size={16} color={colors.ink2} />
            <Text style={styles.actionText}>编辑</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  consentCard: {
    backgroundColor: colors.paper2,
    borderWidth: 1,
    borderColor: colors.rose,
    borderRadius: radius.xl,
    padding: 18,
  },
  consentTitle: { fontFamily: fonts.hand, fontSize: 17, color: colors.ink },
  consentBody: { fontSize: 13, color: colors.ink2, lineHeight: 21, marginTop: 8 },
  primaryBtn: {
    marginTop: 14,
    backgroundColor: colors.camellia,
    borderRadius: radius.md,
    alignItems: 'center',
    paddingVertical: 12,
  },
  primaryBtnText: { color: '#FCF4F4', fontSize: 14.5, fontWeight: '600' },

  loadingWrap: { alignItems: 'center', paddingVertical: 34 },
  loadingText: { color: colors.ink2, marginTop: 12, fontSize: 13.5 },

  notraits: {
    backgroundColor: colors.camelliaTint,
    borderWidth: 1,
    borderColor: colors.rose,
    borderRadius: radius.md,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  notraitsText: { flex: 1, fontSize: 13.5, color: colors.ink2, lineHeight: 20 },
  ghostBtn: {
    borderWidth: 1,
    borderColor: colors.camellia,
    borderRadius: radius.sm,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  ghostBtnText: { color: colors.camelliaDeep, fontSize: 12.5 },

  errorWrap: { gap: 10 },
  errorText: { fontSize: 13, color: colors.camelliaDeep, lineHeight: 19 },
  offlineCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: colors.paper2,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    padding: 14,
  },
  offlineMain: { flex: 1 },
  offlineText: { fontSize: 13.5, color: colors.ink, lineHeight: 20 },
  offlineInfo: { fontSize: 12.5, color: colors.ink3, lineHeight: 19, marginTop: 4 },
  fallbackTitle: { fontSize: 12.5, color: colors.ink3, marginTop: 6 },

  headRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  sectionTitle: { fontFamily: fonts.hand, fontSize: 17, color: colors.ink },
  regenerateBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, padding: 4 },
  regenerateText: { fontSize: 13, color: colors.camellia },
  cachedNote: { fontSize: 12, color: colors.ink3, marginBottom: 8 },

  list: { gap: 10 },
  item: {
    backgroundColor: colors.paper2,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    padding: 14,
  },
  itemIndex: {
    position: 'absolute',
    top: -10,
    left: 14,
    backgroundColor: colors.camellia,
    color: '#FCF4F4',
    width: 20,
    height: 20,
    borderRadius: 10,
    textAlign: 'center',
    lineHeight: 20,
    fontSize: 11.5,
    fontWeight: '700',
    overflow: 'hidden',
  },
  itemText: { fontSize: 15, color: colors.ink, lineHeight: 23 },
  input: {
    fontSize: 15,
    color: colors.ink,
    lineHeight: 22,
    backgroundColor: colors.paper,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 10,
    minHeight: 72,
  },
  itemActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 16,
    marginTop: 10,
  },
  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  actionText: { fontSize: 12.5, color: colors.ink2 },
  actionDone: { color: colors.camelliaDeep, fontWeight: '600' },
});