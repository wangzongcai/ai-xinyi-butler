# AI 心意管家 — 第一版任务清单

> 依据：constitution.md、spec.md、plan.md、data-model.md
> 已拍板决策：本机数据库 expo-sqlite（每账号一库）+ 云端 Supabase PostgreSQL 实时双向同步；路由 expo-router；AI 走 Supabase Edge Functions 调 DeepSeek；春节/中秋等农历节日用农历库计算；底部 4 Tab 为提醒 / 联系人 / 历史 / 设置。
> App 工程位置：`rnapp/`（路由在 `rnapp/app/`，非路由代码在 `rnapp/src/`，配色字体令牌在 `rnapp/src/theme.ts`）。
> 里程碑编号与顺序：M1 页面骨架 → M2 Supabase 集成 + 用户登录 → M3 联系人管理 → M4 设置页面 → M5 通用节日 → M6 提醒与推送 → M7 AI 祝福语生成 → M8 礼物建议 → M9 电子贺卡 → M10 历史记录 → M11 离线处理与收尾 → M12 云同步。
> 范围纪律：本清单不包含 spec「以后再做」剩余 11 项（原第 10 条「多设备同步」已按小康决策提前到第一版，见里程碑十二）；任何新增需求须先经小康同意。
> 2026-10-25 变更（小康拍板）：M7～M9 按参考图重写——AI 改走 Supabase Edge Functions；新增心意准备页 `/prepare/*`；祝福持久化到 `prepare` 表；贺卡改为 AI 背景图 + JPEG + 水印/日期 + 分享（spec 功能 8 已同步）；新增首次 AI 隐私提示与礼物/贺卡区域全局开关；礼物数量、平台与未安装处理仍严格按 spec 执行。详细见各里程碑段首说明、spec.md 功能 8、plan.md 第七节。

---

## 里程碑一：搭页面骨架（第一个里程碑）

> 验收标准：App 能启动，底部 3 个 Tab（首页 / 心意记录 / 设置）能切换，每个 Tab 一个页面，页面内有文字清晰表明当前是哪个页面。

### M1-01 初始化 Expo 项目并接入 expo-router
- 做什么：在 `rnapp/` 创建 Expo（React Native）托管工程，安装并配置 expo-router，建立目录结构，先读 `rnapp/AGENTS.md` 了解注意事项。
- 涉及文件：`rnapp/package.json`、`rnapp/app/_layout.tsx`、`rnapp/app.json`。
- 完成后用户能看到：App 在手机/模拟器上正常启动，不报错，进入一个空白首页。

### M1-02 底部 Tab 骨架：提醒 / 联系人 / 历史 / 设置
- 做什么：用 expo-router 的 Tabs 建立底部 4 个 Tab，Tab 名严格为「提醒」「联系人」「历史」「设置」（2026-10-23 由 3 Tab 改版）；提醒页放「近日心意」占位，联系人页放对象列表与添加入口，历史/设置各放占位内容。
- 涉及文件：`rnapp/app/(tabs)/index.tsx`、`rnapp/app/(tabs)/contacts.tsx`、`rnapp/app/(tabs)/history.tsx`、`rnapp/app/(tabs)/settings.tsx`、`rnapp/app/(tabs)/_layout.tsx`、`rnapp/src/theme.ts`。
- 完成后用户能看到：底部出现 4 个 Tab，点击可切换，分别为「提醒」「联系人」「历史」「设置」，当前 Tab 有高亮态。

### M1-03 栈内页面占位与跳转通路
- 做什么：按 plan 路由结构创建对象页、新增对象页、编辑对象页、心意内容页、贺卡页、回收站页、登录页的占位页，并在首页/设置页放入口按钮验证跳转与返回。
- 涉及文件：`rnapp/app/person/new.tsx`、`rnapp/app/person/[id].tsx`、`rnapp/app/person/[id]/edit.tsx`、`rnapp/app/person/[id].tsx`、`rnapp/app/prepare/holiday/[id].tsx`、`rnapp/app/card/[prepareId].tsx`、`rnapp/app/recycle-bin.tsx`、`rnapp/app/login.tsx`。
- 完成后用户能看到：点入口能进入对应空白页，页内文字标明页面名，左上角返回能回到来源页。
- 依赖：M1-02。非本里程碑验收必需，可与 M2 前期任务并行。

---

## 里程碑二：Supabase 集成 + 用户登录（spec 功能 11）

> 前置条件（外部）：短信通道、微信开放平台资质、Apple Developer 账号。未就绪前可先做 UI 与邮箱流程（见文末待确认 3）。
> 本里程碑与本地数据完全解耦，可与 M3/M4 并行推进。

### M2-01 初始化 Supabase Auth
- 做什么：创建 Supabase 项目并接入 supabase-js，令牌存储用 expo-secure-store；完成登录态监听。
- 涉及文件：`rnapp/src/auth/supabase.ts`、`rnapp/src/auth/AuthContext.tsx`、`rnapp/app.json`（scheme）。
- 完成后用户能看到：无直接界面；App 具备调用登录接口的能力。
- 依赖：M1-01。

### M2-02 登录页界面（强制登录门禁）
- 做什么：登录页采用邮箱 + 密码表单（邮箱、密码、「开始使用」、忘记密码与注册入口）；点注册进入注册态（邮箱、密码、确认密码、「注册」、「← 返回登录」）；未登录时只能停留在登录/注册页，不能进入其他页面；页面说明「登录后心意数据随账号同步，换机重装可找回」。
- 涉及文件：`rnapp/app/login.tsx`。
- 完成后用户能看到：打开 App 未登录时直接落在登录页；注册或登录成功后进入首页。
- 依赖：M2-01、M1-02。

### M2-03 手机号 + 验证码登录（后续接入）
- 做什么：实现验证码下发、输入校验、登录/注册成功后保存会话；无网络时提示需要联网。
- 涉及文件：登录页手机号表单、`rnapp/src/auth/*.ts`。
- 完成后用户能看到：输手机号能收到验证码，输入正确后登录成功；无网时有联网提示。
- 依赖：M2-02、短信通道就绪。

### M2-04 邮箱 + 密码注册/登录
- 做什么：实现邮箱 + 密码注册、登录与会话保存；注册即登录，无需邮箱验证码；密码至少 6 位。
- 涉及文件：登录页、`rnapp/src/auth/*.ts`。
- 完成后用户能看到：新邮箱可直接注册并进入 App；退出后可用同一邮箱和密码重新登录。
- 依赖：M2-02。可与 M2-03 并行。

### M2-05 第三方登录：微信
- 做什么：接入微信登录，登录成功后建立 Supabase 会话。
- 涉及文件：`rnapp/src/auth/wechat.ts`、登录页。
- 完成后用户能看到：点「使用微信登录」可完成授权并登录。
- 依赖：M2-02、微信开放平台资质。

### M2-06 第三方登录：Apple（iOS）
- 做什么：iOS 接入 Sign in with Apple，登录成功后建立 Supabase 会话。
- 涉及文件：`rnapp/src/auth/apple.ts`、登录页。
- 完成后用户能看到：iOS 上点「使用 Apple 登录」可完成授权并登录。
- 依赖：M2-02、Apple Developer 账号。可与 M2-05 并行。

### M2-07 登录态保持、账号区展示与退出登录
- 做什么：重新打开 App 保持登录；设置页「账号管理」页显示账号（邮箱掩码或第三方昵称）、「退出登录」与「注销账号」（调 delete-account，二次确认）；退出后回到登录页，本机该账号缓存保留、重新登录继续同步；注销后云端数据由外键级联清空、本机该账号库删除；本机展示信息缓存在 auth_cache（SecureStore）。
- 涉及文件：`rnapp/app/(tabs)/settings.tsx`、`rnapp/app/settings/account.tsx`、`rnapp/src/auth/AuthContext.tsx`、`rnapp/src/data/authCache.ts`。
- 完成后用户能看到：账号管理页显示账号，可退出登录或注销账号；杀进程重开仍是登录态；退出后数据一条不少。
- 依赖：M2-03/M2-04/M2-05/M2-06 中至少一种登录方式可用（账号区 UI 骨架可随 M1-02 先行）。

### M2-08 找回密码（公网静态落地页）
- 做什么：登录页「忘记密码？」改为输入邮箱发送重置邮件；邮件链接打开公网静态页 `web/index.html` 设置新密码，改完回 App 登录。**不依赖 App 深链**。
  - 页面单文件零依赖：解析链接里的 `#access_token=…&type=recovery`，调 `PUT /auth/v1/user` 改密码。
  - 托管在 GitHub Pages，`.github/workflows/pages.yml` 在 `web/**` 变动时自动发布。
  - Supabase → Authentication → URL Configuration：Site URL 指向该页面，Redirect URLs 加通配。
- 涉及文件：`web/index.html`、`.github/workflows/pages.yml`、`rnapp/app/login.tsx`、`rnapp/src/auth/AuthContext.tsx`、`rnapp/src/auth/supabase.ts`。
- 完成后用户能看到：点「忘记密码？」输入邮箱 → 收到邮件 → 点链接在网页上设新密码 → 用新密码登录。
- 依赖：M2-04；邮件通道需能投递（当前卡在 Resend 域名验证，见 plan.md 7.5）。

---

## 里程碑三：联系人管理（心意对象管理，spec 功能 1、2）

> 「联系人管理」即 spec 的「心意对象管理」。本里程碑同时打好全项目的本地数据库底座（M3-01/M3-02 建全部五张表与 Repository，供 M4～M10 使用）。

### M3-01 接入 expo-sqlite 并建库建表
- 做什么：安装 expo-sqlite，按 data-model.md 建 person、anniversary、trait、settings、history 五张表（含 CHECK、唯一索引、外键与级联策略），写入 settings 默认行（提前提醒天数 3、祝福文案数量 3、电商平台 淘宝）。
- 涉及文件：`rnapp/src/db/client.ts`、`rnapp/src/db/schema.sql`（或等价的建表脚本）。
- 完成后用户能看到：无直接界面；App 启动后数据库文件被创建，重开不报错（为后续页面提供存储）。
- 依赖：M1-01。

### M3-02 数据访问层（Repository 接口）
- 做什么：为五张表各写一个 Repository，封装增删改查；UI 只允许通过 Repository 读写，不直接碰 SQLite，为未来 Supabase 实现预留同一接口。
- 涉及文件：`rnapp/src/data/personRepository.ts`、`anniversaryRepository.ts`、`traitRepository.ts`、`settingsRepository.ts`、`historyRepository.ts`。
- 完成后用户能看到：无直接界面；后续所有页面的数据都经由这一层。
- 依赖：M3-01。

### M3-03 日期计算工具：下一次发生日期
- 做什么：实现 spec 日期计算规则——纪念日（生日也按纪念日记录）只记「月-日」(MM-DD)、每年重复，按「下一次发生日期」倒计时，今年的日子已过则自动指向明年同一天；每个日期带公历/农历标记，农历先换算成对应公历日再算（第一版不支持闰月）；输出距今天数。
- 涉及文件：`rnapp/src/utils/nextOccurrence.ts`（纯公历月日计算）、`rnapp/src/utils/calendar.ts`（MM-DD 解析/格式化、公历农历换算，日期库 date-fns）。
- 完成后用户能看到：无直接界面；对象列表/详情上显示的「还有 N 天」由它算出。
- 依赖：M1-01。可与 M3-01、M3-02 并行。

### M3-04 新增对象页：姓名、关系
- 做什么：实现表单——姓名（必填）、与我的关系（文本框自由输入，不限预设选项）；生日不单独成项，由用户以纪念日形式记录；保存写入 person 表。
- 涉及文件：`rnapp/app/person/new.tsx`、对应表单组件。
- 完成后用户能看到：能新增一位对象，只填姓名也能保存；保存后回到首页能看到该对象；重开 App 数据不丢失。
- 依赖：M3-02。

### M3-05 新增/编辑对象页：多个纪念日
- 做什么：一个对象可添加多个纪念日（生日也按纪念日记录，用户可自己命名成「生日」），每个有用户自定义名称（如「结婚纪念日」「相识五周年」）和日期（月日、每年重复、公历/农历可选），写入 anniversary 表。
- 涉及文件：`rnapp/app/person/new.tsx`、`rnapp/app/person/[id]/edit.tsx`、纪念日子表单组件（日期选择内联在页面中，不用弹层：可直接输入月和日，也可用 −/＋ 加减长按连续调整，无年份输入；切换公历/农历时保留数字只改变解释）。
- 完成后用户能看到：可「＋ 添加一个纪念日」并为每个纪念日起名、选日期；对象页上能看到全部纪念日。
- 依赖：M3-04。

### M3-06 特征管理（最多 10 条、每条最多 50 字）
- 做什么：在新增/编辑表单中添加特征条目的增、改、删，写入 trait 表；数量上限 10、每条长度上限 50，超限阻止并提示。
- 涉及文件：特征子表单组件、`rnapp/src/data/traitRepository.ts`（计数与长度校验）。
- 完成后用户能看到：可添加特征；到第 10 条后不能再加；超过 50 字有提示；已有特征可改可删。
- 依赖：M3-04。可与 M3-05 并行。

### M3-07 对象页（只读详情）
- 做什么：展示姓名、关系与全部纪念日（含「还有 N 天」倒计时）、全部特征。
- 涉及文件：`rnapp/app/person/[id].tsx`。
- 完成后用户能看到：点首页对象进入对象页，信息完整、倒计时正确；无日期对象也能正常打开。
- 依赖：M3-04、M3-03。

### M3-08 编辑对象
- 做什么：对象页提供编辑入口，表单回填现有数据，保存更新 person/anniversary/trait。
- 涉及文件：`rnapp/app/person/[id]/edit.tsx`（与新增页共用表单组件）。
- 完成后用户能看到：修改姓名、关系、日期、纪念日、特征后保存，返回对象页看到新内容。
- 依赖：M3-05、M3-06、M3-07。

### M3-09 删除对象：二次确认 + 软删除
- 做什么：对象页点删除先弹二次确认，并明示「删除后保留 30 天，期间可恢复，超期彻底清除」；确认后写删除时间（软删除），对象从首页消失。
- 涉及文件：`rnapp/app/person/[id].tsx`、确认弹窗组件、`rnapp/src/data/personRepository.ts`。
- 完成后用户能看到：删除时看到二次确认和 30 天说明；确认后首页不再显示该对象。
- 依赖：M3-07。

### M3-10 回收站页：保留 30 天、恢复、超期清除
- 做什么：列出删除时间在 30 天内的对象与剩余天数；可一键恢复（清除删除时间）；启动或定时检查时把超过 30 天的对象彻底清除并级联其 anniversary、trait（history 记录按 data-model 建议保留、对象 id 置空）。
- 涉及文件：`rnapp/app/recycle-bin.tsx`、`rnapp/src/db/cleanup.ts`、`rnapp/src/data/personRepository.ts`。
- 完成后用户能看到：设置页进入回收站能看到刚删的对象和「还剩 N 天」；点恢复后对象回到首页。
- 依赖：M3-09、M4-02（设置页入口就位）。

### M3-11 联系人页：心意对象列表
- 做什么：联系人 Tab 列出全部未删除对象，显示姓名、关系、最近一个日子与倒计时；底部放「添加一位想记住的人」入口；无日期对象显示但不带倒计时。
- 涉及文件：`rnapp/app/(tabs)/contacts.tsx`。
- 完成后用户能看到：所有对象按列表展示，入口可跳到新增对象页。
- 依赖：M3-04、M3-03。M3-05/M3-08 完成后纪念日也纳入倒计时。

---

## 里程碑四：设置页面（spec 功能 4、6、7 的设置部分）

### M4-01 设置读写与默认值
- 做什么：通过 settingsRepository 读写提前提醒天数（0～30，默认 3）、祝福文案数量（1～5，默认 3）、电商平台（淘宝/京东，默认淘宝）、贺卡署名（默认关）、12 个节日关注状态（默认全开）；把现有 `SettingsContext` 的内存态替换为持久化。
- 涉及文件：`rnapp/src/data/settingsRepository.ts`、`rnapp/src/settings/SettingsContext.tsx`。
- 完成后用户能看到：无直接界面；为设置页和后续生成/推送提供配置，重开 App 设置不丢。
- 依赖：M3-01（建表时已含默认行）。可与 M3-04 之后的任务并行。

### M4-02 设置主页与二级页
- 做什么：设置主页按分组列表呈现（提醒 / 心意内容 / 通用 / 账号管理高亮入口）与「回收站」入口；二级页——提醒设置（提前天数步进器 0～30、固定 09:00 展示）、推送通知开关（M6 接系统权限）、祝福语设置（步进器 1～5）、礼物设置（固定 4 条说明 + 平台分段）、贺卡设置（署名开关）、节日设置（12 个节日按公历/农历分组的关注开关，顶部显示已关注数量）；修改即时保存，全局生效。
- 涉及文件：`rnapp/app/(tabs)/settings.tsx`、`rnapp/app/settings/reminder.tsx`、`blessing.tsx`、`gift.tsx`、`card.tsx`、`festivals.tsx`、`rnapp/src/components/settings-ui.tsx`。
- 完成后用户能看到：设置主页各项摘要（如「提前3天 · 09:00」「每次3条」「署名关」「已关注12个」）随二级页操作联动；重开 App 设置仍在；能从设置页进回收站与账号管理。
- 依赖：M4-01。账号管理页随 M2-07 已落地。

---

## 里程碑五：通用节日（spec 功能 9 的数据与匹配）

> 说明：本里程碑先完成节日数据、计算规则与关系匹配（可独立验证）；节日的推送接入统一在 M6 排期引擎完成后生效（M6-06）。

### M5-01 内置节日数据与农历日期
- 做什么：用农历库计算并内置 12 个节日（元旦、春节、元宵节、情人节、妇女节、母亲节、父亲节、端午节、七夕、中秋节、重阳节、圣诞节）未来 10 年的日期表，同时写明计算规则（如母亲节为 5 月第二个周日）作为兜底；按 data-model 提供 festivals/festival_dates 数据。清单已由 `rnapp/src/settings/festivals.ts` 定义。
- 涉及文件：`rnapp/src/data/festivals.ts`、`rnapp/src/settings/festivals.ts`、农历库（具体库见待确认 4）。
- 完成后用户能看到：无直接界面；调试视图中 12 个节日未来 10 年日期齐全正确。
- 依赖：M3-01。可较早并行开发。

### M5-02 指向性节日的关系关键词匹配
- 做什么：母亲节匹配关系含「母亲/妈妈」的对象、父亲节匹配含「父亲/爸爸」的对象、妇女节匹配女性家人、情人节匹配伴侣；具体词表按待确认 5 执行；没匹配到对象则该节日不推送。
- 涉及文件：`rnapp/src/services/festivalMatch.ts`。
- 完成后用户能看到：无直接界面；匹配结果决定后续推送对象。
- 依赖：M5-01、M3-02。

### M5-03 12 个节日日期核对
- 做什么：逐一核对 12 个节日日期与内置日期表一致；推送接入与推送验证在 M6-06 完成后执行。
- 涉及文件：`rnapp/src/data/festivals.ts`、测试用例。
- 完成后用户能看到：走查无偏差（以验收用例为准）。
- 依赖：M5-01；推送部分依赖 M6-02。

---

## 里程碑六：提醒与推送（spec 功能 3、4）

> 实施进度（2026-10-24）：M6-01~M6-08 代码已全部落地（依赖 expo-notifications@~57.0.24，app.json 已加配置插件）；`npx tsc --noEmit`、lint、expo-doctor 均通过。**已在 Android 模拟器 + 本地 debug APK 上跑通**：权限弹窗授权、渠道创建、9:00 精确闹钟到点弹通知、点通知深链进心意内容页均验证通过；验证中修掉「精确闹钟权限缺失导致提醒最多推迟 1 小时」和「冷启动被上次通知带偏」两个问题。详见 plan.md 7.8 / 7.8.1。
> 补充（2026-10-24，按小康要求）：推送时间已从写死的 9:00 改为可自定义（默认仍 09:00），设置页可调时/分并带「1 分钟后」等测试快捷键，改完自动重排。详见 plan.md 7.8.2。
> 遗留（M6-09 待做）：Android 13+ 需引导用户开启「闹钟和提醒」权限，计划在提醒设置页加入口。
> 补充修复（2026-10-25，历史页为空）：① 新增 / 编辑 / 恢复对象后立即 `await rescheduleAll()`（原先要等下次启动，历史与推送都不生效）；② `rescheduleAll` 改为先写历史再判断通知权限，启动逻辑在用户拒绝通知时也执行重排——关推送不再意味着历史永远为空。详见 plan.md 7.13。
> 补充修复（2026-10-25，Expo Go 兼容）：新增 `src/notifications/notificationsModule.ts` 作为唯一取模块口，Expo Go 缺 `ExpoTopicSubscriptionModule` 时降级为「无通知」而不是整屏报错；历史写入不受影响。Expo Go 仅用于看界面与数据流，推送验证仍需 APK。详见 plan.md 7.14。

### M6-01 通知权限与通道
- 做什么：接入 expo-notifications，请求系统通知权限；缓存通知权限状态（对应 settings 的通知权限状态字段，建议值 granted/denied/undetermined）。
- 涉及文件：`rnapp/src/notifications/permissions.ts`、`rnapp/src/data/settingsRepository.ts`。
- 完成后用户能看到：首次需要推送时弹出系统授权弹窗；授权结果可被设置/首页读取。
- 依赖：M4-01。

### M6-02 本地通知排期引擎
- 做什么：统一排期三类日子——对象的生日/纪念日、指向性节日（按 M5-02 匹配结果）、通用节日：只对「已关注」的节日排期；按全局提前提醒天数，从临近期开始每天在「推送时间」（默认 9:00，可自定义）推一次，日子当天再推一次（含当天共推一次）；通知内容携带对象 id 与日子信息（通用节日带节日参数）。
- 涉及文件：`rnapp/src/notifications/scheduler.ts`。
- 完成后用户能看到：到达排期时间（可先用调试日期验证）手机收到通知，标题是对应日子或节日。
- 依赖：M6-01、M4-01、M3-03、M5-01、M5-02。

### M6-03 改提前天数后全部重排
- 做什么：设置页修改提前提醒天数（0～30）后，取消所有已排期通知并按新值统一重新计算、重新排期（对所有心意对象和通用节日统一生效）。
- 涉及文件：`rnapp/app/(tabs)/settings.tsx`、`rnapp/src/notifications/scheduler.ts`。
- 完成后用户能看到：改完设置，后续通知时间全部按新天数走（调试模式下可核对排期列表）。
- 依赖：M6-02、M4-02。

### M6-04 对象删除/日子过去后取消推送
- 做什么：对象软删除、或日子已过时，取消对应未触发的通知；无日期对象从不排期；指向性节日无匹配对象不推送。
- 涉及文件：`rnapp/src/notifications/scheduler.ts`、对象删除流程。
- 完成后用户能看到：删除对象后不再收到它的通知。
- 依赖：M6-02、M3-09。

### M6-05 通知深链：点开进入对象页
- 做什么：配置通知响应路由，点开通知直接打开对应对象的**对象页**（`rnapp/app/person/[id].tsx`；2026-10-25 由 `/content/[id]` → `/prepare/contact/[id]` → `/person/[id]` 两次调整，祝福语与礼物已内联在对象页）；通用节日打开节日准备页（`rnapp/app/prepare/holiday/[code].tsx`）。
- 涉及文件：`rnapp/app/_layout.tsx`（通知响应）、`rnapp/app/person/[id].tsx`、`rnapp/app/prepare/holiday/[id].tsx`。
- 完成后用户能看到：从通知点进 App，直接落到对应的心意内容页，而不是首页。
- 依赖：M6-02、M1-03。

### M6-06 推送与心意记录、节日内容接通
- 做什么：触发推送的同时为生日、纪念日及「关联到对象的节日」写 history（按对象 id + 日子名称唯一，一日子一条，记在对应对象名下）；通用节日不写历史、推送一条节日通用文案。
- 涉及文件：`rnapp/src/notifications/scheduler.ts`、`rnapp/src/data/historyRepository.ts`。
- 完成后用户能看到：收到推送后，心意记录库出现对应日子的一条「未送」记录（页面在 M10 展示）；通用节日推送不产生记录。
- 依赖：M6-02、M3-02。

### M6-07 提醒页：自己记录的日子 + 已关注节日
- 做什么：提醒 Tab 上半部分列出所有对象记录的纪念日（生日也按纪念日记录），下半部分列出已关注的通用节日（与设置页开关一致），都按倒计时从近到远排列，当天显示「今天」；对象行点击进入对应对象的对象页 `/person/[id]`（2026-10-25 由 `/prepare/contact/[id]` 调整），节日行进入 `/prepare/holiday/[code]`；此列表在通知权限关闭时作为备用入口始终可用。
- 涉及文件：`rnapp/app/(tabs)/index.tsx`、日期查询逻辑。
- 完成后用户能看到：提醒页按倒计时列出自己记录的日子和已关注节日，右侧显示「还有 N 天 / 今天」。
- 依赖：M3-11、M3-03、M5-01。可与 M6-02 并行。

### M6-08 通知权限关闭时的温和提示
- 做什么：权限非 granted 时，提醒页「近日心意」附近显示温和文案（如「通知没开，早上九点我就提醒不到你了」）与「打开通知」按钮，点击引导去系统设置。
- 涉及文件：`rnapp/app/(tabs)/index.tsx`。
- 完成后用户能看到：关掉系统通知后，首页出现提示与按钮；开启后提示消失。
- 依赖：M6-01、M6-07。

---

## 里程碑七：AI 祝福语生成（spec 功能 5、6）（已完成 ✅ 2026-10-25）

> 本里程碑已完成：generate-blessings Edge Function + 准备页（联系人/节日）祝福语区域 + 私有同意 + 缓存持久化 + 数量设置 + 复制 + 编辑 + 失败兜底重试均已落地并对接。M7-01～M7-12 全部实现。

> **2026-10-25 修正（小康反馈「点开对象页看不到祝福语和礼物」）**：联系人场景的祝福语 / 礼物建议改为**内联在对象页 `/person/[id]`**，`/prepare/contact/[id]` 路由删除，通知深链与提醒页改为直达对象页；同时修掉 `usePrepareContent` 的「首帧空特征误判」缺陷（该缺陷让准备页永久停在「先填特征」，一条内容都不生成）。详见 M7-13。

> 依据 2026-10-25 小康拍板（图片 M7-01～M7-10）：
> - AI 代理直接落为 **Supabase Edge Function**（`supabase/functions/generate-blessings`），由 Deno `fetch` 调 DeepSeek REST API，API Key 只存服务端；不再另起独立代理工程。
> - 原「心意内容页」改为 **心意准备页**：`/prepare/contact/[id]`（联系人）与 `/prepare/holiday/[id]`（节日）。
> - 祝福语**持久化保留**：退出页面再进入展示上次结果（新增 `prepare` 表，见 data-model 3.9）；点「重新生成 / 换一批」替换当前内容。
> - 字段沿用现有 `settings` 表（图片中的 `user_settings.blessing_count` 映射为 `settings.blessing_count`，默认 3、范围 1～5）。

### M7-01 编写 Edge Function generate-blessings
- 做什么：在 `supabase/functions/generate-blessings/index.ts` 编写 Deno Edge Function，用 `fetch` 调 DeepSeek REST API 生成祝福语；**30 秒超时 + 失败重试 1 次**；鉴权沿用 `withSupabase({ auth: 'user' })`（与 delete-account 一致）；DeepSeek API Key 从环境变量读取，不入库、不下发客户端。
- 接口约定：入参 `{ relationship, traits[], scene: 'birthday'|'anniversary'|'festival', festivalName?, count }`；出参 `{ blessings: string[] }`。
- 涉及文件：`supabase/functions/generate-blessings/index.ts`、`supabase/functions/.env.example`。
- 完成后用户能看到：无独立页面；函数返回祝福语数组，供前端调用。
- 依赖：M2-01（Supabase 项目已 link）。

### M7-02 祝福语 Prompt 设计
- 做什么：设计祝福生成 Prompt——每条明确引用联系人的特征描述（如「爱养花」「今年刚退休」）；按场景（生日 / 纪念日 / 节日）区分语气与结构；读起来像真人手写，条与条之间不重复。
- 涉及文件：`supabase/functions/generate-blessings/`（Prompt 常量 / 模板）。
- 完成后用户能看到：生成的祝福内容各不相同，且至少一条直接引用联系人特征。
- 依赖：M7-01。

### M7-03 traits 为空的提示
- 做什么：联系人没有任何特征时，函数不生成祝福，返回明确状态；前端在祝福区域显示「建议先填写特征描述，才能生成更贴心的祝福」并提供跳转编辑联系人的入口。
- 涉及文件：`supabase/functions/generate-blessings/index.ts`、`rnapp/app/person/[id].tsx`。
- 完成后用户能看到：未填特征的联系人进入准备页时看到提示，而不是空白或报错。
- 依赖：M7-01、M7-04。

### M7-04 对象页内联祝福语区域（2026-10-25 由「准备页」改为对象页）
- 做什么：祝福语直接内联在**对象页** `/person/[id]`（`BlessingPanel`）。进页即生成默认 3 条（数量读 `settings.blessing_count`），生成期间显示加载动画与提示文字（如「正在为你斟酌措辞…」）；已有 prepare 缓存时直接展示上次结果。联系人列表 / 提醒页 / 推送通知都直达对象页，不再有 `/prepare/contact/[id]`。
- 涉及文件：`rnapp/app/person/[id].tsx`、`rnapp/src/hooks/usePrepareContent.ts`、`rnapp/src/components/BlessingPanel.tsx`、`rnapp/src/lib/aiClient.ts`。
- 完成后用户能看到：从联系人列表 / 提醒页 / 通知点进对象页，看到加载动画后出现 3 条祝福。
- 依赖：M7-01、M3-07、M4-01。

### M7-05 心意准备页（节日）— 顶部联系人选择器
- 做什么：搭建 `/prepare/holiday/[id]` 页面；顶部提供联系人选择器（下拉列表或底部弹出），列出全部未删除联系人，默认选中「不指定收件人」；下方为祝福语区域。
- 涉及文件：`rnapp/app/prepare/holiday/[id].tsx`、联系人选择器组件。
- 完成后用户能看到：从提醒页的节日条目进入节日准备页，顶部有选择器且默认「不指定收件人」。
- 依赖：M7-04、M3-11、M5-01。

### M7-06 联系人选择器行为
- 做什么：选中某位联系人后，生成时引用该联系人的特征，并在准备记录里写入 `person_id`；保持「不指定收件人」时生成节日通用祝福；关注了节日但关系里没有匹配联系人（如关注母亲节但没有「妈妈」）时，选择器仍可手动选人，默认只生成通用祝福。
- 涉及文件：`rnapp/app/prepare/holiday/[id].tsx`、祝福调用逻辑。
- 完成后用户能看到：母亲节选中「妈妈」后生成引用妈妈特征的祝福；不选则生成通用祝福。
- 依赖：M7-05、M5-02。

### M7-07 内容保留与重新生成（持久化）
- 做什么：每次成功生成后写入 `prepare` 表（场景、收件人、节日、祝福列表、选中下标）；退出页面再进入先读缓存展示上次结果；点「重新生成 / 换一批」重新请求并**替换**当前显示、同步更新缓存。按「同收件人 + 同场景 + 同节日」保留最近一条，重复进入覆盖更新。
- 涉及文件：`rnapp/app/person/[id].tsx`、`rnapp/app/prepare/holiday/[id].tsx`、`rnapp/src/data/prepareRepository.ts`、`rnapp/src/db/schema.ts`。
- 完成后用户能看到：退出再进入仍看到上次的祝福；点重新生成后内容替换为新的一批。
- 依赖：M7-04、M3-01（新增 prepare 表）。

### M7-08 祝福语数量读取设置
- 做什么：每次生成读取 `settings.blessing_count`（默认 3，范围 1～5）；设置页修改后，下次生成条数随之变化；已缓存的历史内容不追溯改动。
- 涉及文件：祝福调用逻辑、`rnapp/src/data/settingsRepository.ts`。
- 完成后用户能看到：把数量改为 1 或 5 后，下次重新生成的条数与设置一致。
- 依赖：M4-01、M7-04。

### M7-09 一键复制祝福语
- 做什么：用 `expo-clipboard` 将任意一条祝福全文复制到系统剪贴板，复制后给出轻提示。
- 涉及文件：`rnapp/src/lib/clipboard.ts`、`rnapp/app/person/[id].tsx`、`rnapp/app/prepare/holiday/[id].tsx`。
- 完成后用户能看到：点复制后粘贴到聊天软件，内容完整无丢失。
- 依赖：M7-04。

### M7-10 首次 AI 使用隐私提示
- 做什么：首次进入需要 AI 生成的页面时，弹出简要隐私提示（说明仅上传关系、特征等必要描述），用户同意后写入本地（`settings.privacy_consent_at`），之后不再弹出；不同意则不发起生成。
- 涉及文件：`rnapp/src/lib/privacyConsent.ts`、`rnapp/app/person/[id].tsx`、`rnapp/app/prepare/holiday/[id].tsx`、`rnapp/src/data/settingsRepository.ts`。
- 完成后用户能看到：首次使用 AI 功能出现隐私提示，同意后不再出现。
- 依赖：M7-04。

### M7-11 手动编辑祝福（spec 功能 5）
- 做什么：每条祝福支持就地编辑，编辑后可复制、也可在贺卡页选用；编辑结果随 prepare 缓存保存。
- 涉及文件：`rnapp/app/person/[id].tsx`、`rnapp/app/prepare/holiday/[id].tsx`、`rnapp/src/data/prepareRepository.ts`。
- 完成后用户能看到：改完文案后复制 / 做贺卡，用的是改过的文字。
- 依赖：M7-04、M7-07。

### M7-12 生成失败 / 超时：重试 + 预置兜底祝福
- 做什么：请求失败或超时显示「重试」按钮；同时展示按关系类型（家人 / 朋友 / 客户）划分的预置通用祝福作为兜底，可直接复制（无网络的提示统一在 M11-01 处理）。
- 涉及文件：`rnapp/app/person/[id].tsx`、`rnapp/app/prepare/holiday/[id].tsx`、`rnapp/src/content/fallbackBlessings.ts`。
- 完成后用户能看到：服务异常时看到重试按钮和家人 / 朋友 / 客户三类预置祝福，可直接复制。
- 依赖：M7-04。

### M7-13 对象页内联 + 就绪判定修复（2026-10-25 新增）
- 做什么：
  1. `usePrepareContent` 增加 `ready` 参数——关系 / 特征 / 设置未读到最终值时不发起任何生成。修掉「首帧闭包把空特征判成没有特征、进入 notraits 后永不重算」的缺陷（原实现下，同意隐私之后每次进准备页都一条内容都不生成）。
  2. 祝福语与礼物建议内联到对象页 `/person/[id]`，移除「准备心意」跳转按钮；进页即生成，有缓存先展示缓存。
  3. 路由收敛：删除 `app/prepare/contact/[id].tsx`，通知深链与提醒页列表项改为 `/person/[id]`。
  4. 节日准备页切换收件人时加 `recipientLoading`，避免用空关系 / 空特征先生成一版。
  5. `SettingsContext` 增加 `settingsLoaded`；`BlessingPanel` 的隐私同意文案按「已上云」口径更正。
  6. 礼物先查会话级内存缓存、再查本机 `gift_suggestion`（随账号同步），避免每次进对象页都扣一次 AI（2026-10-25 第二轮已改为持久化，见 M12-14）。
- 涉及文件：`rnapp/src/hooks/usePrepareContent.ts`、`rnapp/app/person/[id].tsx`、`rnapp/app/prepare/holiday/[id].tsx`、`rnapp/app/prepare/_layout.tsx`、`rnapp/app/_layout.tsx`、`rnapp/app/(tabs)/index.tsx`、`rnapp/src/settings/SettingsContext.tsx`、`rnapp/src/components/BlessingPanel.tsx`。
- 完成后用户能看到：点开「测试人员」对象页，直接就出现祝福语与 4 条礼物建议，不需要点任何按钮；退出再进走缓存。
- 依赖：M7-04、M8-04、M4-01。

---

## 里程碑八：礼物建议（spec 功能 7）（已完成 ✅ 2026-10-25）

> 本里程碑已完成：generate-gifts Edge Function + 礼物建议区域 UI + 固定 4 条 + 淘宝/京东「去看看」 + 未安装回退浏览器搜索 + 礼物区域全局开关（含关闭后不再发起请求）均已落地并对接。M8-01～M8-08 全部实现。

> 依据 2026-10-25 小康拍板（图片 M8-01～M8-08）：
> - 礼物模块**按 spec 执行**——固定 4 条不可调、平台仅淘宝 / 京东、未安装回退浏览器搜索页。图片 M8-05/06/07 中「数量可调、拼多多 / 亚马逊、应用商店引导」**不纳入第一版**（拼多多 / 亚马逊属 spec「以后再做」第 7 条）。
> - 礼物区域**全局开关**按图片 M8-08 加入（`settings.gift_enabled`）。

### M8-01 编写 Edge Function generate-gifts
- 做什么：在 `supabase/functions/generate-gifts/index.ts` 编写 Deno Edge Function，用 `fetch` 调 DeepSeek REST API 生成礼物建议；**30 秒超时 + 失败重试 1 次**；鉴权同 generate-blessings；Key 仅服务端。
- 接口约定：入参 `{ relationship, traits[], scene, festivalName? }`；出参 `{ gifts: [{ name, reason, keyword }] }`，固定 4 条。
- 涉及文件：`supabase/functions/generate-gifts/index.ts`、`supabase/functions/.env.example`。
- 完成后用户能看到：无独立页面；函数返回礼物建议数组。
- 依赖：M7-01。

### M8-02 礼物 Prompt 设计
- 做什么：设计礼物生成 Prompt——与联系人特征强相关（如「爱养花」→ 园艺相关礼物）、推荐理由合理不牵强；每条给出用于电商搜索的关键词。
- 涉及文件：`supabase/functions/generate-gifts/`（Prompt 常量 / 模板）。
- 完成后用户能看到：生成的礼物建议贴合特征描述，理由合理。
- 依赖：M8-01。

### M8-03 traits 为空的提示
- 做什么：联系人无特征时不生成礼物建议，返回明确状态；前端礼物区域显示「建议先填写特征描述」的提示。
- 涉及文件：`supabase/functions/generate-gifts/index.ts`、`rnapp/app/person/[id].tsx`。
- 完成后用户能看到：未填特征时礼物区域显示提示而非空白建议。
- 依赖：M8-01、M8-04。

### M8-04 礼物建议区域 UI
- 做什么：在心意准备页（联系人 / 节日）实现礼物建议区域：每条包含礼物名称、简短推荐理由与「去看看」按钮；联系人场景与指定收件人时生成个性化建议，节日「不指定收件人」时生成通用建议。
- 涉及文件：`rnapp/src/components/GiftList.tsx`、`rnapp/app/person/[id].tsx`、`rnapp/app/prepare/holiday/[id].tsx`。
- 完成后用户能看到：准备页展示礼物建议列表（名称 + 推荐理由 + 去看看）。
- 依赖：M8-01、M7-04。

### M8-05 礼物数量固定 4 条（按 spec）
- 做什么：礼物建议固定 4 条，不读取、不跟随设置变化；设置页维持「固定 4 条」的说明文案。
- 涉及文件：`supabase/functions/generate-gifts/index.ts`、`rnapp/app/settings/gift.tsx`。
- 完成后用户能看到：无论设置如何，礼物建议始终 4 条。
- 依赖：M8-01、M4-02。

### M8-06 「去看看」电商跳转：淘宝 / 京东
- 做什么：按 `settings.ecommerce_platform`（默认淘宝，可切京东）用 `expo-linking` 优先唤起对应电商 App 的搜索结果页，搜索词与该条建议的关键词一致。
- 涉及文件：`rnapp/src/lib/ecommerceLink.ts`、`rnapp/src/components/GiftList.tsx`。
- 完成后用户能看到：点「去看看」唤起所选平台并显示该礼物的搜索结果。
- 依赖：M8-04、M4-02。

### M8-07 未安装回退浏览器搜索页
- 做什么：目标电商 App 未安装或唤起失败时，回退打开浏览器搜索页（**不是**应用商店引导）；无浏览器可用时给轻提示。
- 涉及文件：`rnapp/src/lib/ecommerceLink.ts`。
- 完成后用户能看到：未安装淘宝 / 京东时，点「去看看」在浏览器打开对应搜索结果页。
- 依赖：M8-06。

### M8-08 内容开关生效（礼物区域）
- 做什么：`settings.gift_enabled`（默认开）关闭后，心意准备页隐藏礼物建议区域，也不发起礼物生成请求；设置页提供全局开关。
- 涉及文件：`rnapp/app/person/[id].tsx`、`rnapp/app/prepare/holiday/[id].tsx`、`rnapp/app/settings/gift.tsx`、`rnapp/src/data/settingsRepository.ts`。
- 完成后用户能看到：关闭礼物建议后，准备页不再显示礼物区域。
- 依赖：M8-04、M4-02。

---

## 里程碑九：电子贺卡（spec 功能 8）

> 依据 2026-10-25 小康拍板（图片 M9-01～M9-11）：贺卡**按图片方案执行并同步修改 spec**——AI 生成背景图（火山引擎方舟 Seedream 5.0）、客户端叠加祝福文字 / 联系人姓名 / 生成日期 / App 水印、导出 JPEG（3:4）、保存相册 + 系统分享；背景图加载或生成失败时降级为默认背景色 + 文字。
> 依赖：新增火山引擎方舟 API Key（环境变量，仅服务端）；`prepare` 表（M7-07）提供祝福与收件人上下文。
>
> **进度（2026-10-25）**：M9-01～M9-11 代码已完成并通过类型检查 / Expo Doctor；`generate-card-image` 已部署，`ARK_API_KEY` 已写入 Supabase 密钥。端到端生成待方舟账号解除 `SetLimitExceeded`（Safe Experience Mode 用量限制）后验证。

### M9-01 编写 Edge Function generate-card-image
- 做什么：在 `supabase/functions/generate-card-image/index.ts` 编写 Deno Edge Function，调用火山引擎方舟 Seedream 5.0 flash（模型 `doubao-seedream-5-0-flash-260915`）生成贺卡背景图；API Key 从环境变量读取；图片生成耗时较长，按 **30 秒超时 + 重试 1 次** 处理；返回图片 URL（2026-10-25 第二轮起还会把原图转存 Storage 并返回 `backgroundPath`，见 M12-14）。
- 接口约定：入参 `{ scene, festivalCode?, festivalName?, anniversaryName?, relationship? }`；出参 `{ imageUrl }`；图片尺寸固定为 3:4 竖版 `1728x2304`（2K 档）；关闭模型自带水印（`watermark: false`），App 水印由客户端叠加。
- 涉及文件：`supabase/functions/generate-card-image/index.ts`、`supabase/functions/.env.example`。
- 完成后用户能看到：无独立页面；函数返回背景图 URL。
- 依赖：M7-01；需小康提供火山引擎方舟 API Key。

### M9-02 场景 Prompt 模板
- 做什么：按场景（生日、纪念日、各节日）匹配视觉风格（生日有生日元素、母亲节温馨、春节年味等），统一 3:4 竖版；模板集中管理。
- Prompt 结构（2026-10-25 按小康反馈加强）：每个场景写全「主题 + 关键元素（具体物件）+ 光线氛围 + 配色 + 质感」五个维度，并固定「构图 + 必须避免」两段；12 个节日逐个定制，不再只给一句风格词。
- 贴合度增强：客户端把**离今天最近的纪念日名称**（排除「生日」）传给服务端，纪念日按名称匹配意象（结婚→戒指香槟、相识→旧照片两杯咖啡、恋爱→玫瑰剪影、毕业→旧书树影、宝宝→婴儿鞋）；`relationship` 额外决定情感基调（伴侣浪漫 / 长辈敬重 / 孩子童真 / 商务克制）；节日 / 纪念日名称再单独写一行 `【节日】` / `【纪念日】`，让模型二次确认场景。
- 提示词落在独立文件 `prompt.ts`（纯函数、不读环境变量），Edge Function 与本地出图脚本共用，避免测试与线上各写一套。本地验证：`$env:ARK_API_KEY=...` 后跑 `node scripts/test-card-image.mjs`，图输出到 `test_pic/`（已加入 .gitignore）。
- 涉及文件：`supabase/functions/generate-card-image/prompt.ts`、`supabase/functions/generate-card-image/index.ts`、`scripts/test-card-image.mjs`、`rnapp/src/lib/cardScenes.ts`、`rnapp/src/lib/aiClient.ts`、`rnapp/app/card/[prepareId].tsx`。
- 完成后用户能看到：不同场景生成的贺卡背景风格与节日 / 纪念日相符，画面层次与质感明显提升。
- 依赖：M9-01。

### M9-03 客户端贺卡组件
- 做什么：实现 `CardView`——AI 背景图 + 客户端叠加祝福文字、联系人称呼 / 姓名、生成当天日期、App 水印（默认文字「AI 心意管家」）。
- 涉及文件：`rnapp/src/components/CardView.tsx`、`rnapp/src/theme.ts`。
- 完成后用户能看到：贺卡预览包含祝福文字、联系人姓名、日期与水印，信息完整。
- 依赖：M9-01、M7-07。

### M9-04 署名显示逻辑
- 做什么：按 `settings.card_signature`（默认关）决定是否显示署名；开启时使用 `settings.signature_text`，为空则回落到账户信息或提示填写。
- 涉及文件：`rnapp/src/components/CardView.tsx`、`rnapp/app/settings/card.tsx`、`rnapp/src/data/settingsRepository.ts`。
- 完成后用户能看到：设置中开启署名并填写后，贺卡显示自己的署名。
- 依赖：M9-03、M4-02。

### M9-05 贺卡预览与导出页面
- 做什么：搭建 `/card/[prepareId]` 页面：从心意准备页「生成贺卡」进入，展示贺卡预览；提供切换祝福、重新生成、导出 / 保存 / 分享入口。
- 涉及文件：`rnapp/app/card/[prepareId].tsx`、`rnapp/app/person/[id].tsx`、`rnapp/app/prepare/holiday/[id].tsx`。
- 完成后用户能看到：准备页点「生成贺卡」进入贺卡预览页。
- 依赖：M9-03、M7-07。

### M9-06 切换祝福语
- 做什么：在贺卡预览页从 prepare 缓存的祝福列表中切换，贺卡文字即时更新，背景图不变。
- 涉及文件：`rnapp/app/card/[prepareId].tsx`。
- 完成后用户能看到：切换祝福后文字立即更新、背景不变。
- 依赖：M9-05。

### M9-07 重新生成祝福语
- 做什么：贺卡页可直接「重新生成祝福」，结果写回 prepare 缓存并更新贺卡文字，无需返回上一步。
- 涉及文件：`rnapp/app/card/[prepareId].tsx`、`rnapp/src/data/prepareRepository.ts`。
- 完成后用户能看到：在贺卡页重新生成后，文字更新为新内容。
- 依赖：M9-05、M7-07。

### M9-08 导出贺卡为 JPEG（3:4）
- 做什么：用 `captureRef` 将贺卡导出为 JPEG，固定 `1080x1440`（3:4，满足至少 2x 清晰度）；图片包含 App 水印。
- 涉及文件：`rnapp/src/lib/exportCard.ts`、`rnapp/app/card/[prepareId].tsx`。
- 完成后用户能看到：导出的图片为 3:4、清晰无明显锯齿，包含水印。
- 依赖：M9-03。

### M9-09 保存到相册 + 分享
- 做什么：用 `expo-media-library` 保存到系统相册（请求写入权限），用 `expo-sharing` 调起系统分享面板发送到聊天软件。
- 涉及文件：`rnapp/app/card/[prepareId].tsx`、`rnapp/src/lib/exportCard.ts`。
- 完成后用户能看到：贺卡可保存到相册，也可通过系统分享面板发给微信等，对方能正常查看。
- 依赖：M9-08。

### M9-10 远程图片降级
- 做什么：背景图加载失败或生成失败时，降级为默认背景色 + 文字，贺卡仍可正常预览与导出，不出现空白。
- 涉及文件：`rnapp/src/components/CardView.tsx`、`rnapp/src/lib/exportCard.ts`。
- 完成后用户能看到：背景图失败时贺卡仍显示文字内容。
- 依赖：M9-03。

### M9-11 内容开关生效（贺卡区域）
- 做什么：`settings.card_enabled`（默认开）关闭后，心意准备页隐藏「生成贺卡」入口与贺卡区域；设置页提供全局开关。
- 涉及文件：`rnapp/app/person/[id].tsx`、`rnapp/app/prepare/holiday/[id].tsx`、`rnapp/app/settings/card.tsx`、`rnapp/src/data/settingsRepository.ts`。
- 完成后用户能看到：关闭贺卡后，准备页不再显示贺卡入口 / 区域。
- 依赖：M9-05、M4-02。

---

## 里程碑十：历史记录（spec 功能 10）

> 说明：history 表与 Repository 已在 M3-01/M3-02 建好，M6-06 起随推送自动写入；本里程碑完成展示与操作。
> **实施进度（2026-10-25）**：M10-01～M10-04 已完成。历史页原先写死的「妈妈生日 / 父亲节 / 老徐结婚纪念」样例数据已全部删除，改为读本机库真实记录（随账号同步）。

### M10-01 心意记录页：列表与三态筛选
- 做什么：按时间排列展示记录（日子名称、对象、日期、状态），顶部分段「全部/未送/已送/已过期」可筛选。
- 涉及文件：`rnapp/app/(tabs)/history.tsx`、`rnapp/src/data/historyRepository.ts`（新增 `listHistoryRows()`：LEFT JOIN person 取对象姓名，避免页面里拼多表）。
- 完成后用户能看到：进入心意记录 Tab 能看到此前推送产生的记录列表，点分段只显示对应状态；点整条记录进入对应对象页（对象已被彻底清除、`person_id` 为空的记录不可点）。
- 依赖：M3-02（最好在 M6-06 之后，有真实数据可看）。
- 补充（2026-10-25）：整卡跳转是原任务漏做的交互，按小康反馈补上，不新增页面。点记录时把它对应的贺卡 id 以 `?card=<prepareId>` 带到对象页（`listHistoryRows()` 增列 `prepareId`），对象页**固定展示这一张**、祝福语只读（无「重新生成 / 换一批 / 编辑」，只留复制），不新建、不重新生成、不进编辑页；卡片上也没有单独的「查看贺卡」按钮。从「联系人」Tab 正常进入对象页时行为不变。详见 plan.md 7.15。

### M10-02 标记「已送祝福」
- 做什么：未送记录提供「标记已送」按钮，状态由「未送」改为「已送」并持久化。
- 涉及文件：`rnapp/app/(tabs)/history.tsx`、`rnapp/src/data/historyRepository.ts`。
- 完成后用户能看到：点标记后标签变成「已送」，重开 App 仍保持。
- 依赖：M10-01。

### M10-03 「已过期」自动标记（2026-10-25 改为读时派生）
- 做什么：读取记录时，把「日期已过且状态仍为『未送』」的记录在展示层派生为「已过期」，**不回写数据库**。原方案（启动时批量 UPDATE）已废弃：它会与用户手动「标记已送」互相覆盖，在多设备同步下还会造成无意义的时间戳推进。
- 涉及文件：`rnapp/src/data/historyRepository.ts`（`withDerivedStatus` / `todayString`）、`rnapp/app/(tabs)/history.tsx`。
- 完成后用户能看到：日子过去且没标记的记录自动显示「已过期」，把它标为「已送」后不会被系统改回去。
- 依赖：M10-01。可与 M10-02 并行。

### M10-04 删除单条记录
- 做什么：每条记录提供手动删除（**加二次确认**，见待确认 5，已按「误删不可恢复」处理），只删该条。
- 涉及文件：`rnapp/app/(tabs)/history.tsx`、`rnapp/src/data/historyRepository.ts`。
- 完成后用户能看到：删除后该条从列表消失，其余记录不受影响。
- 依赖：M10-01。

---

## 里程碑十一：离线处理与收尾

> **实施进度（2026-10-25）**：M11-01 代码完成；M11-02 / M11-03 已完成代码层走查并产出 `docs/acceptance-checklist.md`，真机结论待小康回填；M11-04 文档同步已随本轮完成。
> 顺带清理：删除废弃占位路由 `app/content/[id].tsx` 与随之无用的 `Placeholder` / `NavButton` 组件（无样例数据残留）。

### M11-01 生成场景的无网络提示
- 做什么：祝福文案与礼物建议场景检测无网络时不请求，显示文案「当前无网络，联网后可生成心意内容」，同时展示对象信息（关系、特征）。
- 实施方案（2026-10-25，不新增依赖）：断网时 `supabase.functions.invoke` 会立刻失败，按错误文案识别网络类失败（`src/lib/network.ts#isOfflineError`），在 `src/lib/aiClient.ts` 统一转成 spec 的固定文案；页面据 `blessOffline` / `giftOffline` 切换提示与「联网后重试」按钮。没有引入 expo-network / netinfo。
- 涉及文件：`rnapp/src/lib/network.ts`、`rnapp/src/lib/aiClient.ts`、`rnapp/src/hooks/usePrepareContent.ts`、`rnapp/src/components/BlessingPanel.tsx`、`rnapp/src/components/AiActionsSection.tsx`。
- 完成后用户能看到：断网进入心意内容页看到指定提示与对象信息，不出现空白或报错；恢复网络后可正常生成。
- 依赖：M7-02。

### M11-02 基础功能离线可用验证
- 做什么：断网状态下验证对象管理、提醒推送、历史记录等基础功能全部离线可用；登录操作给出联网提示；未登录用户需联网登录后才能进入（强制登录）。
- 涉及文件：全项目走查；`rnapp/app/login.tsx`（联网提示）。
- 完成后用户能看到：飞行模式下除生成/登录外一切照常。
- 依赖：M3、M6、M10 主线完成。可与 M11-01 并行。

### M11-03 对照 spec 验收标准逐条走查
- 做什么：按 spec 功能 1～11 的每条验收标准在真机过一遍，记录并修复问题。
- 涉及文件：全项目；已新增 `docs/acceptance-checklist.md` 记录结果（2026-10-25 完成代码层走查，✅ / ⚠️ 分开标注，真机项待回填）。
- 完成后用户能看到：每条验收标准均有通过证据。
- 依赖：M2～M10 全部完成。功能 7 / 8 / 11 中与「换机、重装、离线补传」相关的条目，验收结论以 M12-12 的记录为准，不重复执行。

### M11-04 宪法自检与文档同步
- 做了什么（2026-10-25）：① M10 历史页接真实数据 + 二次确认删除；② M11-01 断网提示落地；③ 删除废弃占位路由与组件；④ 产出 `docs/acceptance-checklist.md`；⑤ plan.md 增 7.12、tasks.md 与本清单同步；⑥ spec / data-model 无需改动（无新增功能、无表结构变化）。
- 涉及文件：spec.md、plan.md、data-model.md（如需）、`docs/acceptance-checklist.md`。
- 完成后用户能看到：四份文档与最终实现一致。
- 依赖：M11-03。

---

## 里程碑十二：云同步（spec 功能 11「数据同步」，2026-10-25）

> 实施进度（2026-10-25）：M12-00～M12-14 代码与文档已落地，`npx tsc --noEmit` 通过、`npx expo lint` 0 error（保留 4 条历史 warning）。
> **已完成**：三个远端迁移已 `supabase db push --linked` 应用（`migration list` 两侧一致，匿名 REST 访问业务表返回 `200 []`，RLS 生效）。
> **待办（需小康执行）**：① 真机跑 M12-12 端到端验收（卸载重装 → 登录 → 全部恢复为核心项）；② `node scripts/verify-rls.mjs` 双账号 RLS 校验（需先注册两个测试账号并设置 6 个环境变量，见脚本头部注释）。
> **APK（2026-10-25 18:26 最新重建）**：`D:\桌面文件存储1\心意管家-v1.0.0-test-20261025-1826.apk`（106.8 MB，含 M10 历史页真实数据、M11 断网提示、云同步与 7.13 历史页修复；纯 JS 改动、无新增原生依赖）。安装前建议先卸载旧包，否则本机旧测试数据会随首次同步重新上传到已清空的云端。

> 起因：小康反馈「卸载重装后登录原账号，之前的联系人没了」。
> 四项决策（小康拍板）：**实时双向同步** / 同步**全部业务数据**（person、anniversary、trait、settings、history、prepare；第二轮补充 gift 与贺卡背景图）/ 冲突**最新为准**（LWW by `updated_at`）/ 同设备换账号**每账号独立本地库**。
> 设计细节与四个评审修正见 plan.md 7.10、第二轮补强见 plan.md 7.11、data-model.md 第九节；服务端 SQL 见 `supabase/migrations/` 下三个迁移文件。
> 范围纪律：仅实现「数据跟着账号走」，不做共享、协作、版本历史。

### M12-00 前置修复（同步前的三个数据 bug）
- 做什么：① `replaceAnniversaries` 改为真 diff（原实现先删后查，必然查空，导致每次编辑纪念日都换 id）；② 「已过期」改为读时派生（见 M10-03），删掉 `markOverdueAsExpired`；③ 回收站 30 天边界改 `strftime('%Y-%m-%dT%H:%M:%fZ','now','-30 days')`（原来用 `datetime('now',...)` 与 `...Z` 格式比较，边界判错）。
- 涉及文件：`rnapp/src/data/anniversaryRepository.ts`、`rnapp/src/data/historyRepository.ts`、`rnapp/src/data/personRepository.ts`。
- 完成后用户能看到：编辑对象后纪念日 id 不变（贺卡引用不失效）；回收站里第 30 天的对象仍在、第 31 天才清除。
- 依赖：无（可最先做）。

### M12-01 服务端迁移：表 / RLS / 外键 / 墓碑 / 触发器
- 做什么：新建 `supabase/migrations/20261025120000_sync_schema.sql`——7 张表（person / anniversary / trait / history / prepare_record / user_settings / sync_tombstone）；每表 RLS `user_id = auth.uid()`；复合外键 `(user_id, person_id)` 与本地级联/置空行为一致；`AFTER DELETE` 写墓碑；`BEFORE INSERT OR UPDATE` 复活守卫 + 时钟钳制（`updated_at` 最多领先 `now()+5min`），并丢弃比旧值更旧的 UPDATE（LWW 的服务端一半）；加入 `supabase_realtime` publication。**不加 moddatetime 触发器**（会把「最新生效」变成「最后到达者生效」）。用 `supabase db push` 应用。后续两个迁移见 M12-13 / M12-14。
- 涉及文件：`supabase/migrations/20261025120000_sync_schema.sql`、`scripts/verify-rls.mjs`。
- 完成后用户能看到：无直接界面；双账号跑 `node scripts/verify-rls.mjs` 全通过（B 读不到/改不动/删不掉 A 的行，伪造 user_id 被拒，删 person 子表级联且墓碑已写）。
- 依赖：M2-01（Supabase 项目已 link）。

### M12-02 每账号本地库 + 库门禁 + 同步辅助表
- 做什么：库文件名改为 `xinyi_butler_<user_id>`，`setActiveUser` / `clearActiveUser` 负责切换；新增 `DatabaseGate` 放在 `AuthProvider` 与 `SettingsProvider` 之间（库未按当前账号打开前不渲染读库页面）；新增 `sync_meta` / `sync_outbox` / `sync_tombstone` 三张本机表；`settings` 增 `sync_updated_at`；旧单库 `xinyi_butler` 在「云端为空且本机库为空」时并入一次。
- 涉及文件：`rnapp/src/db/client.ts`、`rnapp/src/db/DatabaseGate.tsx`、`rnapp/src/db/schema.ts`、`rnapp/src/db/schema.sql`、`rnapp/app/_layout.tsx`。
- 完成后用户能看到：A/B 两个账号各用各的库，互相看不到数据；重装后首次登录不再读到别人的库。
- 依赖：M12-01。

### M12-03 写路径原子埋点 + 远端应用层
- 做什么：6 个 Repository 的写函数改为 `withExclusiveTransactionAsync`（业务写入 + `updated_at` + `enqueue` 同事务，`withTransactionAsync` 非独占会交错）；新增 `src/sync/` 的 `mappers.ts` / `outbox.ts` / `applyRemote.ts`——远端数据**直接写 SQL、不经过 Repository、不入 outbox**，从结构上杜绝回环。
- 涉及文件：`rnapp/src/data/*Repository.ts`、`rnapp/src/db/tx.ts`、`rnapp/src/sync/mappers.ts`、`rnapp/src/sync/outbox.ts`、`rnapp/src/sync/applyRemote.ts`。
- 完成后用户能看到：无直接界面；每次用户写入恰好产生一条合并后的 outbox 记录，同步应用数据不产生 outbox。
- 依赖：M12-02。

### M12-04 推送引擎
- 做什么：短事务读快照 → 网络 → 短事务**按精确 seq** ACK（不能按 table+row 删，否则会丢掉网络期间新产生的脏项）；推送顺序 person → 子表 → settings；错误分类（401/403 暂停并刷新会话；429/5xx/网络退避重试；400/404/5xx 永久错误进死信并暴露到同步页）；推送前检查本地墓碑，避免把已彻底删除的行写回云端。
- 涉及文件：`rnapp/src/sync/syncEngine.ts`。
- 完成后用户能看到：飞行模式新增对象 → 联网后自动补齐；推送中杀进程重开不丢不重。
- 依赖：M12-03。

### M12-05 拉取 + LWW + 墓碑 + 首次同步三态
- 做什么：全部同步业务表 + settings 分页拉取（每页 1000，任一页失败即中止且不进入删除逻辑）；先应用墓碑再应用业务行；LWW 统一用 `Date.parse()` 毫秒比较；业务键去重（history 的 `person_id+name`、prepare 的 `scene+person_id+festival_code`）；首次同步三态——云端空本机有 → 全部上传；云端有本机空 → 只拉取；两边都有 → 提示「本机 N 条 / 云端 M 条」让用户选「稍后 / 合并」，选填合并时按 **pull → 有条件 uploadAll → push → pull**（云端已有 settings 时不上传本机默认值），设置是否上传由持久标记 `sync_meta.settings_edited` 决定。
- 涉及文件：`rnapp/src/sync/syncEngine.ts`、`rnapp/src/sync/applyRemote.ts`。
- 完成后用户能看到：清数据重装登录，全部数据恢复；全新安装不会被本机默认 settings 覆盖云端设置。
- 依赖：M12-04。

### M12-06 Realtime 订阅（失效通知式）
- 做什么：单个 channel 订阅业务表（含 `user_settings`、`gift_suggestion`）的 INSERT/UPDATE + `sync_tombstone` 的 INSERT，`filter: user_id=eq.<uid>`；**不订阅 DELETE**（RLS 不作用于 DELETE，payload 只有主键拿不到 user_id）；事件只当失效通知，收到后重新拉取整行；`SUBSCRIBED`、回前台、token 刷新各补一次 `syncNow()`（Realtime 不重放断线事件）；`origin_device_id === 本机` 的行跳过；账号切换时先 `teardownRealtime()` 拆旧频道再按新 uid 重建。
- 涉及文件：`rnapp/src/sync/syncEngine.ts`、`rnapp/src/sync/SyncContext.tsx`。
- 完成后用户能看到：双设备约 2 秒内互见改动；自己的写不触发回环；切后台再回来能补齐。
- 依赖：M12-05。

### M12-07 设置页拆分同步
- 做什么：`settings` 按字段路由——可同步列写入时推进 `sync_updated_at` 并入队；`notification_permission` / `privacy_consent_at` 只写本机，不推进、不入队。云端 `user_settings` 不含这两列。
- 涉及文件：`rnapp/src/data/settingsRepository.ts`、`rnapp/src/sync/applyRemote.ts`。
- 完成后用户能看到：在 B 设备只改通知权限，不会覆盖 A 设备设的提前天数。
- 依赖：M12-03。

### M12-08 删除矩阵与复活守卫
- 做什么：软删除/恢复走 `deleted_at` 的 LWW；彻底删除与回收站超期 purge 走云端 DELETE → 墓碑（终态，永远优先，不比时间）；应用墓碑时本地硬删并记入 `sync_tombstone`，此后拒绝任何延迟到达的旧数据；`hardDeletePerson` 只删 person 一行（子表级联与子表墓碑由数据库自动完成）。
- 涉及文件：`rnapp/src/data/personRepository.ts`、`rnapp/src/sync/applyRemote.ts`、`supabase/migrations/20261025120000_sync_schema.sql`。
- 完成后用户能看到：一台设备彻底删除对象后，另一台设备的离线编辑不会让它复活。
- 依赖：M12-05、M12-01。

### M12-09 账号切换与注销
- 做什么：账号变化时关掉旧库、打开新库；切换时取消全部已排期通知（通知属系统级，不随库走）；注销账号经 delete-account 删除身份 → 云端外键级联清数据 → 客户端 `clearActiveUser()` + `deleteDatabaseAsync(dbNameFor(uid))`；账号页文案明确「退出不删本机缓存 / 注销会删云端与本机」。
- 涉及文件：`rnapp/src/auth/AuthContext.tsx`、`rnapp/app/settings/account.tsx`、`rnapp/src/db/client.ts`、`supabase/functions/delete-account/index.ts`。
- 完成后用户能看到：A→B→A 数据完整且互不可见；注销后云端与本机均清空，重新注册是干净账号。
- 依赖：M12-02、M12-05。

### M12-10 同步 UI 与页面刷新
- 做什么：设置页新增「云同步」入口（摘要显示待同步条数 / 同步中 / 离线 / 异常 / 已同步）；新增 `/settings/sync` 状态页（状态、上次同步时间、待同步条数、当前账号、冲突合并按钮、错误提示、旧数据迁移说明、「立即同步」）；引擎应用远端数据后递增 `dataVersion`，提醒页 / 联系人页 / 对象页 / 回收站订阅它重读；设置与提醒去抖重排。
- 涉及文件：`rnapp/app/(tabs)/settings.tsx`、`rnapp/app/settings/sync.tsx`、`rnapp/app/_layout.tsx`、`rnapp/app/(tabs)/index.tsx`、`rnapp/app/(tabs)/contacts.tsx`、`rnapp/app/person/[id].tsx`、`rnapp/app/recycle-bin.tsx`、`rnapp/src/sync/SyncContext.tsx`。
- 完成后用户能看到：当前页能实时看到另一台设备的改动；同步失败有可读提示，可手动重试。
- 依赖：M12-05、M12-06。

### M12-11 文档同步（宪法第 3 条）
- 做什么：spec.md（全局约定数据存储/隐私/网络、功能 11 增补数据同步与切换注销语义、移除「以后再做」多设备同步）；data-model.md（3.10～3.12 三张本机表、settings.sync_updated_at、第七节现状、新增第九节云同步设计）；plan.md（1.1/1.3/4.5/4.7/第五节/第七节 + 7.10）；tasks.md（本里程碑与任务总览）。
- 涉及文件：spec.md、data-model.md、plan.md、tasks.md。
- 完成后用户能看到：四份文档与实现一致，无「数据仅存本机」的旧表述残留。
- 依赖：M12-01～M12-10 代码完成。

### M12-12 端到端与混沌验收
- 做什么：双设备互见、断网新增后补传、推送中杀进程、设备时钟偏移（+1 小时/-1 小时）、超过 1000 行分页、两端同时生成同一天的 history、旧单库首次登录迁移、拉取中断不误删、4xx 进死信并在同步页可见。
- 涉及文件：无（验收）；问题修复回各自文件。
- 完成后用户能看到：上述场景逐条有通过证据。
- 依赖：M12-01～M12-14（含第二轮修复与新增能力）。

### M12-13 同步缺陷修复（第二轮，2026-10-25）
- 做什么：迁移推送后逐条走查恢复路径，修掉四处「恢复了但不完整」的缺陷——① 首次冲突合并顺序改为 pull 先行、有条件 uploadAll（原为本地覆盖云端）；② 设置判据由 outbox 改为持久标记 `sync_meta.settings_edited`（推送成功后 outbox 同样为空，重装会误判）；③ 贺卡切祝福 / 切背景不再推进 `prepare.updated_at`，新增 `setPrepareBackgroundPath` 专管路径；④ 本机硬删时同步写本机墓碑（person + anniversary + trait + gift），避免 pull 复活。另修：`cloudRowCount` 覆盖全部同步业务表 + settings；23505 按业务键查远端后取优（不再静默 ack）；401/PGRST301 先 `refreshSession()`；永久错误写本机 `sync_dead_letter` 并在同步页计数；Realtime 跳过本机 `origin_device_id`；`user_settings` 补订阅 UPDATE；换账号先拆旧频道；⑤ 新增 `LOCAL_TABLE` 映射（逻辑名 `gift` → 本地表 `gift_suggestion`），修掉重装后首同步 `no such table: gift` 导致整次同步中断、对象与历史都回不来的问题（plan.md 7.16）；⑥ 迁移 `20261025150000_tombstone_row_id_text.sql` 把 `sync_tombstone.row_id` 由 uuid 放宽为 text，并让墓碑 / 复活守卫触发器统一 `::text` 比较，修掉礼物建议推送时的 `operator does not exist: uuid = text`（plan.md 7.17）。
- 涉及文件：`rnapp/src/sync/{syncEngine,applyRemote,mappers}.ts`、`rnapp/src/sync/SyncContext.tsx`、`rnapp/src/data/{prepare,person,settings}Repository.ts`、`rnapp/src/db/{client,schema.ts,schema.sql}`、`rnapp/app/settings/sync.tsx`、`supabase/migrations/20261025120000_sync_schema.sql`。
- 完成后用户能看到：卸载重装登录后设置是云端那份而不是出厂默认；本机彻底删除的对象不会被一次同步拉回来；同步异常的行在同步页显示「无法上传 N 条」而不是无声消失。
- 依赖：M12-01～M12-11。

### M12-14 贺卡背景图上云 + 礼物建议持久化（2026-10-25，spec 已同步）
- 做什么：① 迁移 `20261025130000_card_backgrounds.sql`：`prepare_record.background_path` + 私有 Storage 桶 `card-backgrounds`（8 MB、仅 image/jpeg）与四条 owner policy（首段目录 = `auth.uid()`）。② `generate-card-image` 入参加 `prepareId`，出图后下载并以用户身份上传 `<uid>/<prepareId>.jpg`，返回 `backgroundPath`；失败只记日志不阻断出图。③ 客户端贺卡页优先 `createSignedUrl`（7 天）取回，成功则回填本机 `background_url` 缓存；「换一张背景」覆盖同路径。④ 迁移 `20261025140000_gift_suggestions.sql`：`gift_suggestion` 表 + 复合外键（person 删除级联）+ 墓碑表名补 `gift` + 触发器 + RLS + publication。⑤ 客户端新增 `giftRepository`（`giftId` 确定性主键、`listGifts`、`saveGifts` 按槽位原地覆盖），`usePrepareContent` 先读缓存再请求 AI。
- 涉及文件：`supabase/migrations/20261025130000_card_backgrounds.sql`、`supabase/migrations/20261025140000_gift_suggestions.sql`、`supabase/functions/generate-card-image/index.ts`、`rnapp/src/lib/{aiClient,backgroundStorage}.ts`、`rnapp/src/data/{giftRepository,prepareRepository}.ts`、`rnapp/src/hooks/usePrepareContent.ts`、`rnapp/app/card/[prepareId].tsx`、`rnapp/src/db/{schema.ts,schema.sql,client.ts}`、`rnapp/src/sync/mappers.ts`。
- 完成后用户能看到：贺卡背景图与 4 条礼物建议在换机或卸载重装登录后原样恢复，不必重新生成；点「换一批 / 换一张背景」才会重新请求并覆盖。
- 依赖：M12-05、M9-04、M8-02。

---

## 依赖关系与并行说明

- **必须最先做**：M1-01 → M1-02（页面骨架），后续全部任务以它为底。
- **M2（登录）**：只依赖骨架，可与 M3/M4 完全并行；三种登录方式（M2-03/04/05/06）彼此独立，受外部资质约束的（微信/Apple/短信）不阻塞其他方式。
- **M3（联系人管理）**：M3-01 → M3-02 是全项目数据底座（五张表一次建齐）；M3-03 日期工具可并行；M3-04 依赖 Repository；M3-05 与 M3-06 并行；M3-07 依赖 M3-03/M3-04；M3-08 收束 M3-05/06/07；M3-09 → M3-10（回收站入口依赖 M4-02）；M3-11 依赖列表数据。
- **M4（设置页面）**：只需 M3-01 的 settings 表，可与 M3 中后段并行；账号区与 M2-07 合并。
- **M5（通用节日）**：M5-01 数据与农历计算可最早并行；M5-02 匹配依赖 M5-01 与数据层；推送接入统一在 M6-02/M6-06 生效。
- **M6（提醒与推送）**：依赖 M4（提前提醒天数）、M3-03（日期工具）、M5（节日数据与匹配）；M6-07 近日心意列表只依赖数据，可与排期引擎并行。
- **M7（AI 祝福语生成）**：M7-01 Edge Function 可最早并行；M7-04 是准备页与后续礼物 / 贺卡的共同底座；M7-07 依赖新增 prepare 表；M7-08 依赖 M4-01。
- **M8（礼物建议）**：依赖 M7-01（Edge Function 鉴权与调用方式）与 M7-04（准备页）；M8-06/07 依赖 M4-02 平台设置；M8-08 依赖 M4-02。
- **M9（电子贺卡）**：M9-01/02 依赖 M7-01 与火山引擎 Key；M9-03～M9-11 依赖 M7-07（prepare 缓存）与 M9-01；导出 / 分享依赖 M9-03。
- **M10（历史记录）**：表与写入在 M3/M6 已就绪，本里程碑做展示与操作，安排在贺卡之后收口。
- **M12（云同步）**：M12-01 与 M12-02 可并行；M12-03 → M12-04 → M12-05 必须顺序实现；M12-06 依赖引擎；M12-07/08 可在 M12-05 后并行；M12-09/10 收口；M12-00 可最先做。若想提前发版，「M12-05 完成」即已满足「换机不丢」（Realtime 只是加速）。
- **最后**：M11（离线处理与收尾）与 M12-11/12（文档与验收）必须在所有功能里程碑之后。

---

## 任务总览表

| 编号 | 一句话标题 |
| --- | --- |
| M1-01 | 初始化 Expo 项目并接入 expo-router |
| M1-02 | 底部 Tab 骨架：提醒 / 联系人 / 历史 / 设置 |
| M1-03 | 栈内页面占位与跳转通路 |
| M2-01 | 初始化 Supabase Auth |
| M2-02 | 登录页界面（强制登录门禁） |
| M2-03 | 手机号 + 验证码登录 |
| M2-04 | 邮箱 + 密码注册/登录 |
| M2-05 | 第三方登录：微信 |
| M2-06 | 第三方登录：Apple（iOS） |
| M2-07 | 登录态保持、账号区展示与退出登录 |
| M2-08 | 找回密码（公网静态落地页） |
| M3-01 | 接入 expo-sqlite 并建库建表 |
| M3-02 | 数据访问层（Repository 接口） |
| M3-03 | 日期计算工具：下一次发生日期 |
| M3-04 | 新增对象页：姓名、关系 |
| M3-05 | 新增/编辑对象页：多个纪念日 |
| M3-06 | 特征管理（最多 10 条、每条最多 50 字） |
| M3-07 | 对象页（只读详情） |
| M3-08 | 编辑对象 |
| M3-09 | 删除对象：二次确认 + 软删除 |
| M3-10 | 回收站页：保留 30 天、恢复、超期清除 |
| M3-11 | 联系人页：心意对象列表 |
| M4-01 | 设置读写与默认值 |
| M4-02 | 设置主页与二级页 |
| M5-01 | 内置节日数据与农历日期 |
| M5-02 | 指向性节日的关系关键词匹配 |
| M5-03 | 12 个节日日期核对 |
| M6-01 | 通知权限与通道 |
| M6-02 | 本地通知排期引擎 |
| M6-03 | 改提前天数后全部重排 |
| M6-04 | 对象删除/日子过去后取消推送 |
| M6-05 | 通知深链：点开进入对象页 |
| M6-06 | 推送与心意记录、节日内容接通 |
| M6-07 | 提醒页：自己记录的日子 + 已关注节日 |
| M6-08 | 通知权限关闭时的温和提示 |
| M7-01 | 编写 Edge Function generate-blessings |
| M7-02 | 祝福语 Prompt 设计 |
| M7-03 | traits 为空的提示 |
| M7-04 | 对象页内联祝福语区域（原「准备页」） |
| M7-05 | 心意准备页（节日）— 顶部联系人选择器 |
| M7-06 | 联系人选择器行为 |
| M7-07 | 内容保留与重新生成（持久化） |
| M7-08 | 祝福语数量读取设置 |
| M7-09 | 一键复制祝福语 |
| M7-10 | 首次 AI 使用隐私提示 |
| M7-11 | 手动编辑祝福（spec 功能 5） |
| M7-12 | 生成失败 / 超时：重试 + 预置兜底祝福 |
| M7-13 | 对象页内联祝福与礼物 + 就绪判定修复 |
| M8-01 | 编写 Edge Function generate-gifts |
| M8-02 | 礼物 Prompt 设计 |
| M8-03 | traits 为空的提示 |
| M8-04 | 礼物建议区域 UI |
| M8-05 | 礼物数量固定 4 条（按 spec） |
| M8-06 | 「去看看」电商跳转：淘宝 / 京东 |
| M8-07 | 未安装回退浏览器搜索页 |
| M8-08 | 内容开关生效（礼物区域） |
| M9-01 | 编写 Edge Function generate-card-image |
| M9-02 | 场景 Prompt 模板 |
| M9-03 | 客户端贺卡组件 |
| M9-04 | 署名显示逻辑 |
| M9-05 | 贺卡预览与导出页面 |
| M9-06 | 切换祝福语 |
| M9-07 | 重新生成祝福语 |
| M9-08 | 导出贺卡为 JPEG（3:4） |
| M9-09 | 保存到相册 + 分享 |
| M9-10 | 远程图片降级 |
| M9-11 | 内容开关生效（贺卡区域） |
| M10-01 | 心意记录页：列表与三态筛选 |
| M10-02 | 标记「已送祝福」 |
| M10-03 | 「已过期」自动标记 |
| M10-04 | 删除单条记录 |
| M11-01 | 生成场景的无网络提示 |
| M11-02 | 基础功能离线可用验证 |
| M11-03 | 对照 spec 验收标准逐条走查 |
| M11-04 | 宪法自检与文档同步 |
| M12-00 | 前置修复（纪念日 diff / 过期派生 / 回收站边界） |
| M12-01 | 服务端迁移：表 / RLS / 外键 / 墓碑 / 触发器 |
| M12-02 | 每账号本地库 + 库门禁 + 同步辅助表 |
| M12-03 | 写路径原子埋点 + 远端应用层 |
| M12-04 | 推送引擎 |
| M12-05 | 拉取 + LWW + 墓碑 + 首次同步三态 |
| M12-06 | Realtime 订阅（失效通知式） |
| M12-07 | 设置页拆分同步 |
| M12-08 | 删除矩阵与复活守卫 |
| M12-09 | 账号切换与注销 |
| M12-10 | 同步 UI 与页面刷新 |
| M12-11 | 文档同步（宪法第 3 条） |
| M12-12 | 端到端与混沌验收 |
| M12-13 | 同步缺陷修复（第二轮） |
| M12-14 | 贺卡背景图上云 + 礼物建议持久化 |

---

## 待小康确认（不自作主张）

1. **日期计算库**（已定 2026-10-25）：采用 `date-fns`，已写入 `rnapp/package.json`。
2. **外部资质与通道**（已定 2026-10-23）：第一版先实现邮箱 + 密码注册/登录（注册即用，无需邮箱验证码）；手机号、微信、Apple 待资质与账号到位后再加入。Gmail SMTP 仅在需要找回密码或邮件能力时再配置。
3. **农历库选型**（已定 2026-10-25）：采用 `lunar-typescript`，已写入 `rnapp/package.json`。
4. **节日匹配词表**：「女性家人」「伴侣」具体匹配哪些关系关键词（如女性家人是否含妈妈/奶奶/姐妹，伴侣是否含对象/老公/老婆），spec 只给了示例，需要你给一份词表或授权我拟定后给你审。
5. **历史记录删除确认**（已定 2026-10-25）：M10-04 加二次确认（误删不可恢复）；spec 未规定，如需去掉可随时改回单击删除。
6. **状态管理方案**（已按此执行）：React Context + 数据访问层，未引入重型方案；现有 AuthContext / SettingsContext / SyncContext。
7. **节日清单与关注**（已定 2026-10-23）：内置 12 个节日（新增元宵、端午、七夕、重阳，均按通用节日），默认全部关注，可在节日设置页取消关注。
8. **火山引擎方舟配置**（已定 2026-10-25）：使用模型 `doubao-seedream-5-0-flash-260915`，API Key 已写入 Supabase Edge Function 密钥；等账号控制台关闭「Safe Experience Mode」或调整用量限额后即可端到端验证。
9. **prepare 表命名**（已按 `prepare` 落地）：本地 `prepare` / 云端 `prepare_record`，字段见 data-model 3.9。
10. **App 水印文字**：贺卡默认水印按图片写「AI 心意管家」，是否需要改成正式产品名 / 域名 / 留空？
11. **署名文字字段**（已落地）：`settings.signature_text TEXT`（可空）已随 M9-04 加入并纳入同步。
12. **分享与「以后再做」末条**：M9-09 只用系统分享面板（expo-sharing），不直达指定聊天软件，因此 spec「以后再做」最后一条（把贺卡直接分享到指定聊天软件）仍保留；如你认为已覆盖，可移出以后再做清单。
