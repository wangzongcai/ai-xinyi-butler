import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { colors, radius } from '../theme';
import {
  CalendarKind,
  formatMonthDay,
  maxDayInMonth,
  parseMonthDay,
  toMonthDayString,
} from '../utils/calendar';

// =====================================================================
// 日期选择字段（直接内嵌在页面里，不弹窗）：
//   - 月 / 日 可以直接输入数字，也可以用「− / ＋」加减（长按连续调整）
//   - 可在公历 / 农历之间切换；只记月日、每年重复，所以没有年份
//   - 每次改动立即写回父级，不存在「点了确定才生效」的丢失问题
// 值为 'MM-DD' 字符串；allowClear 时显示「清除」。
// =====================================================================

// 长按连续调整：按下立即走一步，停顿 450ms 后每 90ms 走一步
function useRepeatPress(action: () => void) {
  const actionRef = useRef(action);
  // 用 effect 同步最新回调，避免渲染期写 ref
  useEffect(() => {
    actionRef.current = action;
  }, [action]);
  const delayRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stop = useCallback(() => {
    if (delayRef.current) {
      clearTimeout(delayRef.current);
      delayRef.current = null;
    }
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const start = useCallback(() => {
    stop();
    actionRef.current();
    delayRef.current = setTimeout(() => {
      intervalRef.current = setInterval(() => actionRef.current(), 90);
    }, 450);
  }, [stop]);

  useEffect(() => stop, [stop]);

  return { start, stop };
}

/** 把输入框文本转成数字；空串或非数字返回 NaN */
function parseNumber(text: string): number {
  if (!text.trim()) return NaN;
  const n = Number.parseInt(text, 10);
  return Number.isFinite(n) ? n : NaN;
}

type UnitRowProps = {
  /** 「月」或「日」 */
  label: string;
  /** 输入框里的数字文本 */
  text: string;
  onChangeText: (text: string) => void;
  onBlur: () => void;
  onStep: (delta: number) => void;
  atMin: boolean;
  atMax: boolean;
};

// 一行「月 − [ 5 ] ＋」：数字可直接输入，也可加减（长按连续调整）
function UnitRow({ label, text, onChangeText, onBlur, onStep, atMin, atMax }: UnitRowProps) {
  // 不真正禁用 Pressable：到边界时只是不变化，确保 onPressOut 一定触发、能停掉长按计时
  const minus = useRepeatPress(() => onStep(-1));
  const plus = useRepeatPress(() => onStep(1));

  return (
    <View style={styles.unitRow}>
      <Text style={styles.unitLabel}>{label}</Text>

      <Pressable
        onPressIn={minus.start}
        onPressOut={minus.stop}
        style={({ pressed }) => [
          styles.stepBtn,
          pressed && styles.stepBtnPressed,
          atMin && styles.stepBtnDim,
        ]}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={`${label}减一`}
      >
        <Text style={styles.stepSymbol}>−</Text>
      </Pressable>

      <TextInput
        style={styles.unitInput}
        value={text}
        onChangeText={onChangeText}
        onBlur={onBlur}
        keyboardType="number-pad"
        returnKeyType="done"
        maxLength={2}
        selectTextOnFocus
        textAlign="center"
        placeholder="—"
        placeholderTextColor={colors.ink3}
        accessibilityLabel={label}
      />

      <Pressable
        onPressIn={plus.start}
        onPressOut={plus.stop}
        style={({ pressed }) => [
          styles.stepBtn,
          pressed && styles.stepBtnPressed,
          atMax && styles.stepBtnDim,
        ]}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={`${label}加一`}
      >
        <Text style={styles.stepSymbol}>＋</Text>
      </Pressable>
    </View>
  );
}

export type DateFieldProps = {
  /** 'MM-DD'；空串表示未选择 */
  value: string;
  onChange: (value: string) => void;
  calendar: CalendarKind;
  onCalendarChange: (calendar: CalendarKind) => void;
  /** 当前值显示在标题右侧时用不到，保留以兼容旧调用 */
  placeholder?: string;
  /** 是否允许清空 */
  allowClear?: boolean;
};

export default function DateField({
  value,
  onChange,
  calendar,
  onCalendarChange,
  allowClear = false,
}: DateFieldProps) {
  const parsed = parseMonthDay(value, calendar);
  const [monthText, setMonthText] = useState(parsed ? String(parsed.month) : '');
  const [dayText, setDayText] = useState(parsed ? String(parsed.day) : '');
  // 用户正在输入时不要被外部值覆盖，否则每敲一个数字就被重置
  const editingRef = useRef(false);

  // 外部值变化（编辑页回填、清除）时同步草稿
  useEffect(() => {
    if (editingRef.current) return;
    const p = parseMonthDay(value, calendar);
    setMonthText(p ? String(p.month) : '');
    setDayText(p ? String(p.day) : '');
  }, [value, calendar]);

  // 按历法与月份把「日」收进合法范围
  function clampDay(day: number, month: number, cal: CalendarKind): number {
    return Math.min(maxDayInMonth(month, cal), Math.max(1, day));
  }

  /** 立即把草稿写回父级；月日任一没填完整就先不提交 */
  function commitDraft(nextMonthText: string, nextDayText: string) {
    const mRaw = parseNumber(nextMonthText);
    const dRaw = parseNumber(nextDayText);
    if (!Number.isFinite(mRaw) || !Number.isFinite(dRaw)) return;
    const month = Math.min(12, Math.max(1, mRaw));
    const day = clampDay(dRaw, month, calendar);
    onChange(toMonthDayString(month, day));
  }

  /** 没有值时，加减从今天开始，避免出现 0 月 0 日 */
  function baseMonthDay(): { month: number; day: number } {
    const now = new Date();
    return parseMonthDay(value, calendar) ?? { month: now.getMonth() + 1, day: now.getDate() };
  }

  function handleMonthText(text: string) {
    const cleaned = text.replace(/[^0-9]/g, '');
    editingRef.current = true;
    setMonthText(cleaned);
    commitDraft(cleaned, dayText);
  }

  function handleDayText(text: string) {
    const cleaned = text.replace(/[^0-9]/g, '');
    editingRef.current = true;
    setDayText(cleaned);
    commitDraft(monthText, cleaned);
  }

  // 失焦时规范化：把越界数字夹回合法范围，并补全缺省的另一半
  function commitTexts() {
    editingRef.current = false;
    const base = baseMonthDay();
    const mRaw = parseNumber(monthText);
    const dRaw = parseNumber(dayText);
    const month = Number.isFinite(mRaw) ? Math.min(12, Math.max(1, mRaw)) : base.month;
    const day = Number.isFinite(dRaw)
      ? clampDay(dRaw, month, calendar)
      : clampDay(base.day, month, calendar);
    setMonthText(String(month));
    setDayText(String(day));
    onChange(toMonthDayString(month, day));
  }

  function stepMonth(delta: number) {
    editingRef.current = false;
    const base = baseMonthDay();
    const mRaw = parseNumber(monthText);
    const dRaw = parseNumber(dayText);
    const month = Math.min(12, Math.max(1, (Number.isFinite(mRaw) ? mRaw : base.month) + delta));
    const day = clampDay(Number.isFinite(dRaw) ? dRaw : base.day, month, calendar);
    setMonthText(String(month));
    setDayText(String(day));
    onChange(toMonthDayString(month, day));
  }

  function stepDay(delta: number) {
    editingRef.current = false;
    const base = baseMonthDay();
    const mRaw = parseNumber(monthText);
    const dRaw = parseNumber(dayText);
    const month = Number.isFinite(mRaw) ? Math.min(12, Math.max(1, mRaw)) : base.month;
    const maxDay = maxDayInMonth(month, calendar);
    const current = Number.isFinite(dRaw) ? dRaw : base.day;
    // 到边界后循环：1 号再减回到当月最后一天，月末再加回到 1 号
    let day = current + delta;
    if (day < 1) day = maxDay;
    if (day > maxDay) day = 1;
    setMonthText(String(month));
    setDayText(String(day));
    onChange(toMonthDayString(month, day));
  }

  function switchCalendar(next: CalendarKind) {
    if (next === calendar) return;
    const md = parseMonthDay(value, calendar) ?? baseMonthDay();
    // 换历法后月份天数上限不同（农历最多 30 天），把「日」收进范围
    const day = clampDay(md.day, md.month, next);
    onCalendarChange(next);
    if (value) {
      onChange(toMonthDayString(md.month, day));
    }
    setMonthText(String(md.month));
    setDayText(String(day));
  }

  function clearValue() {
    editingRef.current = false;
    setMonthText('');
    setDayText('');
    onChange('');
  }

  const summary = parsed ? formatMonthDay(value, calendar) : '未选择';
  const month = parseNumber(monthText);
  const day = parseNumber(dayText);
  const activeMonth = Number.isFinite(month) ? Math.min(12, Math.max(1, month)) : baseMonthDay().month;
  const activeDay = Number.isFinite(day) ? day : baseMonthDay().day;
  const atMonthMin = activeMonth <= 1;
  const atMonthMax = activeMonth >= 12;
  const atDayMin = activeDay <= 1;
  const atDayMax = activeDay >= maxDayInMonth(activeMonth, calendar);

  return (
    <View style={styles.wrap}>
      {/* 顶部：当前日期 + 清除 */}
      <View style={styles.header}>
        <Text style={[styles.summary, !parsed && styles.summaryEmpty]}>{summary}</Text>
        {allowClear && value ? (
          <Pressable
            onPress={clearValue}
            style={({ pressed }) => [styles.clearBtn, pressed && styles.pressed]}
            accessibilityRole="button"
          >
            <Text style={styles.clearText}>清除</Text>
          </Pressable>
        ) : null}
      </View>

      {/* 公历 / 农历 */}
      <View style={styles.segment}>
        {(['solar', 'lunar'] as const).map((kind) => {
          const active = calendar === kind;
          return (
            <Pressable
              key={kind}
              onPress={() => switchCalendar(kind)}
              style={({ pressed }) => [
                styles.segmentItem,
                active && styles.segmentItemActive,
                pressed && styles.pressed,
              ]}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
            >
              <Text style={[styles.segmentText, active && styles.segmentTextActive]}>
                {kind === 'solar' ? '公历' : '农历'}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <UnitRow
        label="月"
        text={monthText}
        onChangeText={handleMonthText}
        onBlur={commitTexts}
        onStep={stepMonth}
        atMin={atMonthMin}
        atMax={atMonthMax}
      />
      <UnitRow
        label="日"
        text={dayText}
        onChangeText={handleDayText}
        onBlur={commitTexts}
        onStep={stepDay}
        atMin={atDayMin}
        atMax={atDayMax}
      />

      <Text style={styles.hint}>
        {calendar === 'lunar'
          ? '按农历计算，每年重复；暂不支持闰月。'
          : '按公历计算，每年重复。'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 10,
    backgroundColor: colors.paper2,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    padding: 14,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  summary: { fontSize: 15, color: colors.ink, fontWeight: '600' },
  summaryEmpty: { color: colors.ink3, fontWeight: '400' },

  clearBtn: { paddingHorizontal: 8, paddingVertical: 4 },
  clearText: { fontSize: 13, color: colors.camelliaDeep },
  pressed: { opacity: 0.6 },

  // 公历 / 农历
  segment: {
    flexDirection: 'row',
    alignSelf: 'flex-start',
    backgroundColor: colors.paper,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 999,
    padding: 3,
  },
  segmentItem: {
    minWidth: 72,
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 999,
    alignItems: 'center',
  },
  segmentItemActive: { backgroundColor: colors.camelliaDeep },
  segmentText: { fontSize: 13.5, color: colors.ink2 },
  segmentTextActive: { color: '#FCF4F4', fontWeight: '600' },

  // 加减行
  unitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  unitLabel: { fontSize: 16, color: colors.ink2, width: 24 },
  unitInput: {
    flex: 1,
    minHeight: 44,
    borderRadius: 10,
    backgroundColor: colors.paper,
    borderWidth: 1,
    borderColor: colors.line,
    fontSize: 20,
    color: colors.ink,
    paddingVertical: 6,
    fontVariant: ['tabular-nums'],
  },
  stepBtn: {
    width: 46,
    height: 44,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.roseTint,
  },
  stepBtnPressed: { backgroundColor: colors.camelliaTint },
  stepBtnDim: { opacity: 0.35 },
  stepSymbol: { fontSize: 20, color: colors.camelliaDeep },

  hint: { fontSize: 12, color: colors.ink3 },
});
