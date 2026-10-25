// =====================================================================
// 本地通知排期引擎（M6-02 / M6-03 / M6-04 / M6-06）
// 依据 spec 功能 3、4：
//   * 把三类日子统一排期——对象的生日/纪念日、指向性节日（按关系匹配）、
//     通用节日；只对「已关注」的节日排期；
//   * 从提前天数（全局 0~30，改后重排）起，到日子当天，每天在「推送时间」
//     （默认 9:00，可自定义）各推一次；
//   * 对象删除/日子过去后取消：本引擎每次跑都是「先清空全部、再按数据库最新
//     重建」，删除或过期自然从结果中消失，天然满足 M6-04；
//   * 与心意记录接通：给对象日子（纪念日、关联到对象的指向性节日）写一条
//     历史（一日子一条，幂等）；通用节日不进历史。
// 排期采用一次性 DATE 触发逐日部署，避免跨平台的可重复触发差异。
// =====================================================================
import { listPersons } from '../data/personRepository';
import { listAnniversariesByPerson } from '../data/anniversaryRepository';
import { getSettings } from '../data/settingsRepository';
import { upsertHistory } from '../data/historyRepository';
import { FESTIVALS, festivalDate } from '../settings/festivals';
import { festivalMatch } from '../services/festivalMatch';
import { formatMonthDay, nextOccurrenceDate } from '../utils/calendar';
import { ensureAndroidChannel } from './permissions';
import { getNotifications } from './notificationsModule';

/** 排期只覆盖「未来 LOOKAHEAD_DAYS 天」内的日子；重排会滚动前移，保证不漏长期日子。 */
const LOOKAHEAD_DAYS = 45;

const DAY_MS = 24 * 3600 * 1000;

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** 某天的推送时刻（按设置里的自定义时间，默认 9:00） */
function atReminderTime(d: Date, hour: number, minute: number): Date {
  const t = startOfDay(d);
  t.setHours(hour, minute, 0, 0);
  return t;
}

function toYmd(d: Date): string {
  const y = d.getFullYear();
  const m = `${d.getMonth() + 1}`.padStart(2, '0');
  const day = `${d.getDate()}`.padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function festivalNextDate(festivalId: string, today: Date, windowEnd: Date): Date | null {
  for (let y = today.getFullYear(); y <= today.getFullYear() + 1; y++) {
    const ymd = festivalDate(festivalId, y);
    if (!ymd) continue;
    const [yy, mm, dd] = ymd.split('-').map(Number);
    const d = new Date(yy, mm - 1, dd);
    if (d >= today && d <= windowEnd) return d;
  }
  return null;
}

// 一个待提醒的日子（实际要发通知的）。
type Reminder = {
  /** 日子当天（0 点），排期锚点 */
  dayDate: Date;
  title: string;
  body: string;
  data: Record<string, string>;
};

// 一条要写入心意记录的历史（一日子一条，幂等）。
type HistoryEntry = {
  personId: string;
  name: string;
  date: string;
};

type CollectResult = { reminders: Reminder[]; histories: HistoryEntry[] };

/** 收集未来 LOOKAHEAD_DAYS 内所有待提醒日子，以及随之要写的历史。 */
async function collectReminders(): Promise<CollectResult> {
  const settings = await getSettings();
  const followed = settings.followedFestivals;
  const today = startOfDay(new Date());
  const windowEnd = new Date(today.getTime() + LOOKAHEAD_DAYS * DAY_MS);
  const reminders: Reminder[] = [];
  const histories: HistoryEntry[] = [];

  const persons = await listPersons();

  // 1) 对象纪念日（含以纪念日记录的生日）
  for (const person of persons) {
    const anniversaries = await listAnniversariesByPerson(person.id);
    for (const a of anniversaries) {
      const dayDate = nextOccurrenceDate(a.date, a.calendar);
      if (!dayDate || dayDate > windowEnd) continue;
      reminders.push({
        dayDate,
        title: `${person.name}的${a.name}`,
        body: formatMonthDay(a.date, a.calendar), // 静态描述；倒计时由排期循环按具体日期追加
        data: { type: 'anniversary', personId: person.id, dayName: a.name },
      });
      histories.push({
        personId: person.id,
        name: `${dayDate.getFullYear()}年${person.name}${a.name}`,
        date: toYmd(dayDate),
      });
    }
  }

  // 2) 通用节日：只排期已关注的；不关联对象、不进历史
  for (const festival of FESTIVALS) {
    if (followed[festival.id] === false) continue; // 未关注不排期
    const dayDate = festivalNextDate(festival.id, today, windowEnd);
    if (!dayDate) continue;

    if (festival.type === 'general') {
      reminders.push({
        dayDate,
        title: `${festival.name} 快到了`,
        body: '把祝福、礼物和贺卡提前备好吧',
        data: { type: 'general', festivalId: festival.id },
      });
      continue;
    }

    // 3) 指向性节日：按关系匹配对象；至少匹配到一个才推送
    const matched = persons.filter((p) => festivalMatch(p.relationship, followed).includes(festival.id));
    if (matched.length === 0) continue;
    reminders.push({
      dayDate,
      title: `${festival.name} 快到了`,
      body: `${matched.map((m) => m.name).join('、')}，记得送上心意`,
      data: { type: 'targeted', personId: matched[0].id, festivalId: festival.id },
    });
    // 关联到对象的节日提醒进入历史（每个匹配对象记一条）
    for (const p of matched) {
      histories.push({
        personId: p.id,
        name: `${dayDate.getFullYear()}年${festival.name}`,
        date: toYmd(dayDate),
      });
    }
  }

  return { reminders, histories };
}

/**
 * 取消所有已排期通知（用于关闭推送或删除后清理）。
 */
export async function clearAllSchedules(): Promise<void> {
  const Notifications = getNotifications();
  if (!Notifications) return;
  await Notifications.cancelAllScheduledNotificationsAsync();
}

/**
 * 一键重排：清空已有排期，再按数据库/设置的「最新状态」重建。
 * 供 App 启动、回到前台、修改提前天数或推送时间、切换节日关注、删除对象后调用。
 */
export async function rescheduleAll(): Promise<void> {
  try {
    const Notifications = getNotifications();
    const settings = await getSettings();

    const advanceDays = Math.max(0, Math.min(30, settings.advanceDays));
    // 推送时刻可自定义（默认 9:00），改完会触发一次重排
    const remindHour = Math.max(0, Math.min(23, settings.reminderHour));
    const remindMinute = Math.max(0, Math.min(59, settings.reminderMinute));
    const today = startOfDay(new Date());
    const now = Date.now();
    const { reminders, histories } = await collectReminders();

    // M6-06：先写历史（幂等，一日子一条）。
    // 与通知权限解耦：用户关掉推送时排期会被清空，但历史页仍应看得到临近的日子。
    for (const h of histories) {
      await upsertHistory({ personId: h.personId, name: h.name, date: h.date });
    }

    // 权限被明确关闭时不保留任何排期（避免堆积后台计划），历史上面已写
    if (settings.notificationPermission === 'denied') {
      await Notifications?.cancelAllScheduledNotificationsAsync();
      return;
    }
    // 环境没有通知模块（Expo Go 缺原生模块）：历史已写，排期整体跳过
    if (!Notifications) return;
    await ensureAndroidChannel();
    await Notifications.cancelAllScheduledNotificationsAsync();

    // 再逐日部署：从 max(日子 - 提前天数, 今天) 到日子当天，每天到点各一次
    for (const r of reminders) {
      const firstT = Math.max(r.dayDate.getTime() - advanceDays * DAY_MS, today.getTime());
      const lastT = r.dayDate.getTime();
      for (let t = firstT; t <= lastT; t += DAY_MS) {
        const sd = new Date(t);
        const fireAt = atReminderTime(sd, remindHour, remindMinute);
        // 今天的时间点已经过了就跳过（系统也会丢弃过期触发，这里提前过滤掉日志噪音）
        if (fireAt.getTime() <= now) continue;
        const daysLeft = Math.max(0, Math.round((lastT - t) / DAY_MS));
        await Notifications.scheduleNotificationAsync({
          content: {
            title: r.title,
            body: daysLeft === 0 ? `${r.body} · 就是今天` : `${r.body} · 还有 ${daysLeft} 天`,
            sound: 'default',
            data: r.data,
          },
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.DATE,
            date: fireAt,
            channelId: 'default',
          },
        });
      }
    }
  } catch (e) {
    // 排期失败不上抛，避免阻塞登录/启动；开发阶段可见日志
    console.warn('[notifications] 排期失败：', e);
  }
}

