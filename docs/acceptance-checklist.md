# 验收清单（对照 spec 功能 1～11）

> 生成时间：2026-10-25（M11-03）。走查人：AI 自查（代码层）。
> 状态说明：✅ 代码走查确认实现与 spec 一致；⚠️ 需真机执行后回填结论；❌ 未实现 / 有问题。
> 真机结论一栏由小康实测后回填，本文档只记录证据来源，不替代真机验收。

## 功能 1 心意对象管理

| 验收项 | 结论 | 依据 |
| --- | --- | --- |
| 新增 / 查看 / 编辑 / 删除对象 | ✅ | `app/person/new.tsx`、`app/person/[id].tsx`、`app/person/[id]/edit.tsx` |
| 关系可自由输入任意文字 | ✅ | `components/PersonForm.tsx`（文本输入，无预设限定） |
| 一个对象多个自定义名称的纪念日 | ✅ | `components/PersonForm.tsx`、`data/anniversaryRepository.ts` |
| 纪念日只填月日、每年重复、公农历切换 | ✅ | `components/DateField.tsx`、`utils/calendar.ts` |
| 日期内联输入 + −/＋ 加减 | ✅ | `components/DateField.tsx`（无弹层） |
| 无日期对象可创建、不推送、可手动生成 | ✅ | `notifications/scheduler.ts` 只遍历纪念日；对象页内联生成 |
| 删除二次确认 + 30 天回收站 + 超期清除 | ✅ | `app/person/[id].tsx`、`app/recycle-bin.tsx`、`data/personRepository.ts#purgeExpiredRecycled` |
| 保存后重开 App 数据不丢失 | ✅ | 每账号 SQLite 库（`db/client.ts`） |
| 真机：删除 → 恢复 → 超期清除全流程 | ⚠️ | 待真机 |

## 功能 2 特征描述

| 验收项 | 结论 | 依据 |
| --- | --- | --- |
| 增 / 改 / 删特征，最多 10 条、每条 50 字 | ✅ | `components/PersonForm.tsx`、`data/traitRepository.ts` |
| 生成内容至少一条引用特征 | ⚠️ | Prompt 已强制要求（`supabase/functions/generate-*/`），需实际生成核对 |

## 功能 3 主动提醒

| 验收项 | 结论 | 依据 |
| --- | --- | --- |
| 提前天数起每天推一次，当天再推一次 | ✅ | `notifications/scheduler.ts`（逐日 DATE 触发） |
| 推送时间可自定义（默认 9:00） | ✅ | `settings/reminder.tsx`、`scheduler.ts` |
| 点通知进入对象页 / 节日准备页 | ✅ | `app/_layout.tsx` 通知响应 |
| 日子过去 / 对象删除后不再推送 | ✅ | 每次重排即清空重建（`rescheduleAll`） |
| 提醒页列出全部日子与已关注节日、倒计时排序、当天显示「今天」 | ✅ | `app/(tabs)/index.tsx` |
| 提醒页顶部明信片用真实数据（最近一个日子） | ✅ | 同上 `nearest` 由 personDays + festivalDays 计算，无样例数据 |
| 通知权限关闭时温和提示 | ✅ | `app/(tabs)/index.tsx` banner |
| 真机：到点弹通知、深链跳转 | ⚠️ | 2026-10-24 已在 Android 模拟器 + debug APK 验证过一次，当前打包版本待复验 |

## 功能 4 提前提醒天数

| 验收项 | 结论 | 依据 |
| --- | --- | --- |
| 0～30 可调、默认 3 | ✅ | `settings/reminder.tsx`、`data/settingsRepository.ts` |
| 修改后全部重排生效 | ✅ | `SettingsContext` → `rescheduleAll` |

## 功能 5 祝福文案（默认三条）

| 验收项 | 结论 | 依据 |
| --- | --- | --- |
| 进对象页即生成、有缓存先展示 | ✅ | `hooks/usePrepareContent.ts`、`components/BlessingPanel.tsx` |
| 逐条复制 / 换一批 / 手动编辑 | ✅ | `BlessingPanel.tsx`、`lib/clipboard.ts` |
| 无网络时提示「当前无网络，联网后可生成心意内容」并展示对象信息 | ✅ | `lib/network.ts`、`BlessingPanel.tsx`（M11-01 本轮补齐） |
| 生成失败 / 超时：重试 + 按关系类型的预置祝福 | ✅ | `BlessingPanel.tsx`、`content/fallbackBlessings.ts` |
| 真机：断网 → 提示 → 联网重试成功 | ⚠️ | 待真机 |

## 功能 6 祝福数量

| 验收项 | 结论 | 依据 |
| --- | --- | --- |
| 1～5 可调、默认 3，生成条数跟随 | ✅ | `settings/blessing.tsx`、`usePrepareContent` 传 `count` |
| 历史缓存不追溯改动 | ✅ | 缓存优先展示，只有「换一批」才重新生成 |

## 功能 7 礼物建议（固定 4 条）

| 验收项 | 结论 | 依据 |
| --- | --- | --- |
| 固定 4 条、与特征相关 | ✅ | `supabase/functions/generate-gifts/`、`components/GiftList.tsx` |
| 每条有「去看看」并跳对应平台搜索页 | ✅ | `lib/ecommerceLink.ts`、`GiftList.tsx` |
| 淘宝 / 京东切换生效 | ✅ | `settings/gift.tsx`、`AiActionsSection.tsx` |
| 未安装回退浏览器搜索页 | ✅ | `lib/ecommerceLink.ts` |
| 退出重进 / 重装登录仍看到上次 4 条 | ✅ | `data/giftRepository.ts`（随账号同步，M12-14） |
| 真机：跳转唤起淘宝 / 京东、回退浏览器 | ⚠️ | 待真机 |

## 功能 8 电子贺卡

| 验收项 | 结论 | 依据 |
| --- | --- | --- |
| 背景风格与场景匹配 | ✅ | `supabase/functions/generate-card-image/prompt.ts`、`lib/cardScenes.ts` |
| 祝福文字 / 对象称呼 / 日期 / 水印 | ✅ | `components/CardView.tsx` |
| 署名开关 | ✅ | `settings/card.tsx`、`CardView.tsx` |
| 导出 3:4 JPEG、保存相册、系统分享 | ✅ | `lib/exportCard.ts`、`app/card/[prepareId].tsx` |
| 背景图失败降级为默认色 + 文字 | ✅ | `CardView.tsx`、`exportCard.ts` |
| 背景图随账号保存、重装后取回同一张 | ✅ | `lib/backgroundStorage.ts`、`prepare_record.background_path`（M12-14） |
| 真机：出图、导出、分享到微信 | ⚠️ | 方舟账号额度解除后验证 |

## 功能 9 通用节日

| 验收项 | 结论 | 依据 |
| --- | --- | --- |
| 12 个节日默认全关注、可单独取消 | ✅ | `settings/festivals.ts`、`app/settings/festivals.tsx` |
| 关注的节日按提前天数推送 | ✅ | `scheduler.ts` |
| 指向性节日匹配关系，无匹配不推送 | ✅ | `services/festivalMatch.ts` |
| 通用节日推送不关联对象、不入历史 | ✅ | `scheduler.ts`（histories 只来自对象日子与指向性节日） |
| 节日日期与内置表一致 | ✅ | `data/__tests__/festivalVerify.mjs` 可复算 |

## 功能 10 心意记录

| 验收项 | 结论 | 依据 |
| --- | --- | --- |
| 按时间排列、三态筛选 | ✅ | `app/(tabs)/history.tsx`（M10-01 本轮接真实数据） |
| 每个日子只一条 | ✅ | 唯一索引 + `upsertHistory` 幂等 |
| 三种状态正确、已过期自动标记 | ✅ | 读取时派生（`historyRepository.ts#withDerivedStatus`） |
| 标记「已送」并持久化 | ✅ | `updateHistoryStatus` + outbox 同步（M10-02） |
| 可删除单条 | ✅ | `deleteHistory`，删除前二次确认（M10-04） |
| 真机：标记 / 重开保持 / 删除 | ⚠️ | 待真机 |

## 功能 11 用户账号

| 验收项 | 结论 | 依据 |
| --- | --- | --- |
| 未登录只能停留登录页 | ✅ | `app/_layout.tsx` 的 `Stack.Protected` |
| 邮箱 + 密码注册/登录，密码 ≥ 6 位 | ✅ | `app/login.tsx`、`src/auth/*` |
| 登录态保持 | ✅ | expo-secure-store 会话 |
| 找回密码（网页设新密码） | ✅ | `web/index.html`（需邮件通道可投递） |
| 换机 / 重装登录恢复全部数据 | ✅ | 云同步引擎（M12-05） |
| 离线新增联网后补传 | ✅ | outbox + `syncNow` |
| 两台设备同改以时间较晚为准 | ✅ | LWW（`syncEngine.ts`） |
| 注销二次确认、云端与本机均清除 | ✅ | `app/settings/account.tsx`、`delete-account` |
| 切换账号数据互不可见 | ✅ | 每账号独立库（`db/client.ts`） |
| 无网络时登录给出联网提示 | ✅ | `src/auth/errors.ts` |
| 真机：双设备互见、重装恢复、注销 | ⚠️ | 见 tasks.md M12-12 |
