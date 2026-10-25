# AI 心意管家 — 第一版技术计划

> 依据：spec.md（第一版功能规格）、constitution.md（项目宪法）
> 已确认决策：第一版本机用 expo-sqlite 做完整缓存，同时把心意数据按账号实时双向同步到 Supabase PostgreSQL（2026-10-25 由「仅本机」提级，见 7.10）；路由用 expo-router；AI 祝福文案/礼物建议走 Supabase Edge Functions 调 DeepSeek；春节/中秋日期用农历库计算。Supabase 启用 Auth（登录）与业务数据库；另部署 delete-account Edge Function（账号注销后端，见第七节）；文件存储用于贺卡背景图（私有桶 `card-backgrounds`，2026-10-25 启用）。登录为必需项，未登录只能停留在登录页。
> 拍板日期：2026-10-23。本计划不引入 spec 之外的任何新功能；所有数字、字段名、页面名均与 spec 保持一致。

---

## 一、技术选型（含关键决策点）

### 1.1 已确定的选型

| 层面 | 选型 | 说明 |
| --- | --- | --- |
| 前端框架 | React Native + Expo | 按既定方向，使用 Expo 托管工作流，降低原生配置成本 |
| 数据存储（第一版） | expo-sqlite（本机缓存，每账号一库）+ Supabase PostgreSQL（云端主副本） | **已定**；2026-10-25 按小康要求把多设备同步提前到第一版（见 7.10）。离线读写全走本地库，同步层在后台双向补齐；关系型约束（外键/唯一索引/CHECK）两端一致 |
| 路由 | expo-router | **已定**；基于文件的路由，深链支持好，点开通知直达「心意内容页」 |
| 登录认证 | Supabase Auth | 邮箱 + 密码（注册即用，无需邮箱验证码）；手机号 + 验证码、微信/Apple 后续加入；账号同时是云端数据的归属主体（`auth.uid()` + RLS） |
| AI 调用 | Supabase Edge Functions → DeepSeek | **已定**（2026-10-25 由「轻量代理」改为 Edge Functions，`generate-blessings` / `generate-gifts`）；API Key 只存服务端，App 仅传必要内容描述；沿用 delete-account 的 `withSupabase({ auth: 'user' })` 鉴权 |
| 贺卡背景图 | 火山引擎方舟 Seedream 5.0 flash | **已定**（2026-10-25 按小康拍板）；Edge Function `generate-card-image` 调用模型 `doubao-seedream-5-0-flash-260915`，固定输出 3:4 `1728x2304`，API Key 只存服务端，返回图片 URL；同时把原图转存私有 Storage 桶 `card-backgrounds`（路径 `<uid>/<prepareId>.jpg`）以便重装后取回；失败降级为默认背景色 + 文字 |
| 本地推送 | expo-notifications | 本地定时通知即可满足「每天定时（默认早上 9 点）」推送，无需服务端推送 |
| 贺卡导出 | captureRef + expo-media-library + expo-sharing | **已定**（2026-10-25）：`captureRef` 导出竖版 3:4 JPEG（至少 2x），保存到相册，并可通过系统分享面板发送 |
| 电商跳转 | expo-linking（系统 Linking） | 优先唤起淘宝/京东 App 的搜索 URL Scheme，未安装回退浏览器搜索页 |
| 日期计算 | date-fns 或 dayjs（二选一，仍待定） | 「下一次发生日期」倒计时、节日规则（如母亲节为 5 月第二个周日）计算 |
| 农历日期 | 农历库（具体库仍待定，如 lunar-typescript） | 计算春节（正月初一）、中秋节（八月十五）的公历日期 |

### 1.2 关键决策点（已拍板 / 待定）

**决策点 1：本机数据库选型 —— 已定：expo-sqlite（2026-10-23）**
- 对象、纪念日、特征、心意记录是典型的关系型数据（一个对象对多个纪念日/特征/历史），SQLite 的外键、唯一索引、CHECK 约束更合适，未来迁 Supabase（Postgres）模型差异最小。
- 已排除：AsyncStorage / MMKV（关联查询和「回收站 30 天」类筛选要手写）。

**决策点 2：AI 内容生成的调用方式 —— 已定：方案 A 轻量代理 + DeepSeek（2026-10-23）**
- spec 要求生成需联网，且「联网生成内容时仅传输必要的内容描述」。
- 部署轻量代理（可先用任意 Serverless/云函数，后续平滑换成 Supabase Edge Functions），由代理调用 **DeepSeek**；App 只把「关系、特征、节日类型、数量」等必要描述发给代理，DeepSeek API Key 不落客户端。
- 已排除：方案 B 客户端直连（Key 内置 App 有泄露风险）。

**决策点 3：路由方案 —— 已定：expo-router（2026-10-23）**
- 基于文件的路由，Expo 官方方向，深链支持好，点开通知直达「心意内容页」更方便。

**决策点 4：状态管理 —— 仍待小康拍板**
- 推荐：不引入重型方案，用 React Context + 数据访问层即可；如后续状态变复杂再评估 Zustand。

### 1.3 数据访问层与同步层（2026-10-25 已落地）

- 所有数据读写收敛到一个**数据访问层（Repository 接口）**：UI 只依赖接口，不直接碰 SQLite；UI 代码在接入云同步后**一行未改**。
- 每个写函数在同一个独占事务里完成「业务写入 + 写 `sync_outbox`」，因此同步逻辑不侵入业务代码，也不存在「写了一半没上报」的中间态。
- 云同步由独立的一层承担：`rnapp/src/sync/`（mappers / outbox / applyRemote / syncEngine / SyncContext）。云端应用远端数据时**直接写 SQL、不经过 Repository、不入 outbox**，从结构上杜绝回环。
- 本机按账号分库（`xinyi_butler_<user_id>`），`DatabaseGate` 保证库在按当前账号打开前不渲染任何读库页面；换账号时两个库互不可见。
- 与 spec 功能 11「数据同步」对齐；spec「以后再做」原第 10 条「多设备同步」已提前到第一版实现。

---

## 二、页面清单

> spec 明确提到的页面名（**对象页**、**心意内容页**）严格沿用；Tab 与页面名已经小康拍板（2026-10-23）：提醒 / 联系人 / 历史 / 设置。

| # | 页面 | 对应 spec 功能 | 主要内容 |
| --- | --- | --- | --- |
| 1 | **提醒页**（Tab） | 功能 3 | 最近日子明信片；上半部分为对象纪念日、下半部分为已关注通用节日，均按倒计时排列（通知权限关闭时的备用入口）；关闭通知权限时的温和开启提示 |
| 2 | **联系人页**（Tab） | 功能 1、2 | 心意对象列表入口（姓名、关系、最近日子与倒计时）与「添加一位想记住的人」入口 |
| 3 | 新增/编辑对象页 | 功能 1、2 | 姓名、与我的关系（自由输入）、纪念日（可多个，每个带自定义名称；生日也按纪念日记录）、特征描述（最多 10 条、每条最多 50 字） |
| 4 | **对象页** | 功能 1、2、5、6、7、8 | 单个对象的信息与特征展示；**祝福语、礼物建议与电子贺卡入口直接内联在本页**（2026-10-25 起，进页即按设置生成，有上次结果先展示上次结果）；编辑、删除入口 |
| 5 | 回收站页 | 功能 1 | 已删除对象保留 30 天，可恢复，超期彻底清除；删除时二次确认并明示 30 天规则 |
| 6 | **节日准备页** `/prepare/holiday/[id]`（2026-10-25 起只剩节日场景） | 功能 5、6、7 | 祝福文案（默认三条，范围 1～5 条）逐条复制、换一批、手动编辑；无网提示与按关系类型（家人/朋友/客户）划分的预置通用祝福兜底；4 条礼物建议及「去看看」跳转；顶部带联系人选择器（默认「不指定收件人」）；首次使用 AI 的隐私提示。联系人场景的内容已内联到对象页 |
| 7 | 贺卡页 `/card/[prepareId]` | 功能 8 | AI 背景图 + 祝福文字 + 对象称呼（取自姓名或关系，可修改）+ 生成日期 + App 水印；可切换/重新生成祝福；按设置决定是否署名；导出竖版 3:4 JPEG，保存相册 + 系统分享；背景图失败降级为默认背景色 + 文字 |
| 8 | **历史页**（Tab） | 功能 10 | 历史列表按时间排列，三种状态（未送/已送/已过期），可标记「已送祝福」、可删除单条 |
| 9 | 设置页 + 二级页（Tab） | 功能 4、6、7、9、11 | 分组列表：提醒设置（提前天数 0～30、09:00）、推送通知开关、祝福语设置（1～5 默认 3）、礼物设置（固定 4 条 + 淘宝/京东）、贺卡设置（署名开关）、节日设置（12 个节日关注开关）、账号管理（账号信息、退出登录、注销账号）、回收站入口 |
| 10 | 登录页 | 功能 11 | 邮箱 + 密码注册/登录（注册即用，无需邮箱验证码）；作为强制登录门禁，未登录不可进入其他页面 |

### Tab 结构（2026-10-23 已拍板）

底部 4 个 Tab：**提醒** / **联系人** / **历史** / **设置**。提醒页放「近日心意」与通知提示；对象列表与添加入口在联系人页；回收站与各设置二级页从设置页进入；对象页、心意内容页、贺卡页、新增/编辑对象页为栈内推送页面；登录页为全屏门禁页。未登录只能停留在登录页，登录后可访问全部页面。

---

## 三、路由和入口

### 3.1 路由结构（以 expo-router 文件路由为例）

```
app/
  (tabs)/
    index.tsx          → 提醒页（最近日子 +「近日心意」列表）
    contacts.tsx       → 联系人页（对象列表 + 添加入口）
    history.tsx        → 历史页
    settings.tsx       → 设置页（分组列表）
  settings/
    reminder.tsx       → 提醒设置（提前天数、09:00）
    blessing.tsx       → 祝福语设置（1～5）
    gift.tsx           → 礼物设置（固定 4 条 + 平台）
    card.tsx           → 贺卡设置（署名开关）
    festivals.tsx      → 节日设置（12 个关注开关）
    account.tsx        → 账号管理（退出登录、注销账号）
  person/
    new.tsx            → 新增对象页
    [id].tsx           → 对象页
    [id]/edit.tsx      → 编辑对象页
  prepare/
    _layout.tsx        → 心意准备栈（Stack 导航）
    contact/[id].tsx   → 心意准备页 · 联系人（id 为对象）
    holiday/[id].tsx   → 心意准备页 · 节日（id 为节日 code；顶部联系人选择器）
  card/[prepareId].tsx → 贺卡页（prepareId 指向心意准备记录）
  recycle-bin.tsx      → 回收站页
  login.tsx            → 登录页（未登录时的全屏门禁；含「登录 / 注册 / 找回密码」三种模式）
```

> 仓库根目录另有 `web/`：承载重置密码落地页，通过 GitHub Actions 发布到 GitHub Pages
> （`.github/workflows/pages.yml`）。它不属于 App 路由，是邮件链接跳转的公网页面。

### 3.2 入口设计

| 入口 | 目标 | 说明 |
| --- | --- | --- |
| 正常启动 | 提醒页（已登录）/ 登录页（未登录） | 未登录时强制登录，已登录默认落在「提醒」Tab |
| 登录页「忘记密码？」 | 登录页的找回模式 | 输入注册邮箱发送重置邮件；邮件链接打开公网静态页设置新密码，改完回 App 登录 |
| 设置页「退出登录」 | 登录页 | 退出后路由守卫自动回到登录页；本机该账号的缓存保留（重新登录继续同步） |
| 账号管理「注销账号」 | 登录页 | 经 delete-account 删除服务端身份后退出；云端数据随之级联清空，**本机该账号的库文件一并删除**（此操作不可撤销） |
| 点开推送通知 | 对应对象的**对象页** `/person/[id]` | 通知 payload 携带对象 id 与日子信息，深链直达；祝福语与礼物建议已内联在对象页（2026-10-25 由 `/content/[id]` → `/prepare/contact/[id]` → `/person/[id]`） |
| 提醒页「近日心意」列表项 | 对应对象的**对象页** | 通知关闭时的备用入口 |
| 对象页 | 页内直接展示祝福语 / 礼物建议 / 贺卡入口 | 无日期对象也可生成内容（不进推送）；原「准备心意」跳转按钮已移除 |
| 礼物建议「去看看」 | 淘宝/京东 | 优先 URL Scheme 唤起 App，未安装回退浏览器搜索页，搜索词与该条建议对应 |
| 通用节日推送 | 节日准备页 `/prepare/holiday/[code]`（可再选对象生成贺卡） | 通用节日不关联对象，推送一条节日通用文案 |

---

## 四、数据设计

> 以下为逻辑模型（中文字段名与 spec 用词一致）；落库时的英文列名在实现阶段映射。物理数据库已定 expo-sqlite。

### 4.1 心意对象（person）

| 字段 | 说明 |
| --- | --- |
| id | 主键 |
| 姓名 | 文本 |
| 关系 | 文本，用户自由输入，不限预设选项（如家人、挚友、重要客户） |
| 生日 | 历史列，生日已并入纪念日：旧值启动时迁移成名为「生日」的纪念日，之后清空、不再写入 |
| 生日历法 | 历史列，仅迁移时使用；新数据看纪念日的历法 |
| 删除时间 | 软删除标记：删除进回收站，保留 30 天可恢复，超期彻底清除 |
| 创建时间 / 更新时间 | 审计字段 |

### 4.2 纪念日（anniversary）

| 字段 | 说明 |
| --- | --- |
| id | 主键 |
| 对象 id | 外键 → 心意对象 |
| 名称 | 用户自定义（如「结婚纪念日」「相识五周年」） |
| 日期 | 月-日（MM-DD，每年重复，不存年份） |
| 历法 | 公历 / 农历（第一版不支持闰月），默认公历 |

一个对象可有多个纪念日（生日也按纪念日记录）；各纪念日统一按「下一次发生日期」计算倒计时（今年已过则指向明年同一天，农历日期先换算成对应公历日再算）。

### 4.3 特征（trait）

| 字段 | 说明 |
| --- | --- |
| id | 主键 |
| 对象 id | 外键 → 心意对象 |
| 内容 | 文本，每条最多 50 字；每个对象最多 10 条（约束在数据层+UI 双重校验） |

### 4.4 设置（settings，单行表或键值）

| 字段 | 说明 |
| --- | --- |
| 提前提醒天数 | 整数，0～30，默认 3（提前三天）；全局生效，修改后所有提醒（含已排期）重新计算 |
| 祝福文案数量 | 整数，1～5，默认 3 |
| 电商平台 | 枚举：淘宝（默认）/ 京东 |
| 通知权限状态 | 本地缓存系统权限状态，用于首页「近日心意」提示 |

### 4.5 心意记录（history）

| 字段 | 说明 |
| --- | --- |
| id | 主键 |
| 对象 id | 外键 → 心意对象 |
| 日子名称 | 如「2026 年妈妈生日」；按「日子」记一条，临近期间多次推送不产生多条 |
| 日期 | 该日子的发生日期 |
| 状态 | 三态：未送 / 已送 / 已过期（2026-10-25 起库内只存「未送/已送」，「已过期」读取时按「日期已过且未送」派生，不再回写） |

记录永久保留，可手动删除单条；关联到对象的节日提醒进入历史（记在对应对象名下），通用节日提醒不进入历史。

### 4.6 通用节日（内置数据，非用户表）

- 内置 12 个节日：**元旦、春节、元宵节、情人节、妇女节、母亲节、父亲节、端午节、七夕、中秋节、重阳节、圣诞节**（2026-10-23 由 8 个扩为 12 个）。
- 每个节日可在设置中关注/取消关注，默认全部关注，取消关注的不推送；关注状态存入 settings。
- 内置未来 10 年的节日日期表（随 App 打包的静态数据），并写明计算规则（如母亲节为 5 月第二个周日）作为日期表之外的兜底计算。
- 每个节日带「类型」标记：指向性节日（母亲节/父亲节/妇女节/情人节，按关系字段关键词匹配对象，无匹配不推送）或通用节日（元旦/春节/元宵节/端午节/七夕/中秋节/重阳节/圣诞节，不关联对象）。新增的 4 个农历节日全部按通用节日处理。

### 4.7 账号与登录状态（Supabase Auth + 本机轻量缓存）

- 账号体系由 Supabase Auth 承载：第一版为邮箱 + 密码（注册即用，无需邮箱验证码）；手机号 + 验证码、微信/Apple 后续接入。
- 本机缓存登录状态与用于展示的账号信息（登录方式、邮箱掩码）；业务数据**按账号分库**（`xinyi_butler_<user_id>`），云端按 `user_id` 归属并由 RLS 隔离（2026-10-25 变更，原为「不关联」）。
- 实现方式：令牌由 supabase-js 存入 expo-secure-store（分片存储，规避 Android 单值 2048 字节上限）；展示信息单独缓存在 SecureStore 的 `auth_cache` 中（见第七节）。
- 退出登录回到登录页，本机该账号的缓存保留、重新登录继续同步；切换账号使用另一个独立库，互不可见；注销账号同时删除云端数据（外键级联）与本机该账号库。
- 前置条件：短信通道、微信开放平台资质、Apple Developer 账号需小康提前准备。

### 4.8 不入库的内容

- 祝福文案**持久化到 `prepare` 表**（2026-10-25 拍板）：退出准备页再进入展示上次结果，点「重新生成 / 换一批」替换；供贺卡页按 `prepareId` 引用。
- 礼物建议**保留最近一批**到 `gift_suggestion` 表并随账号同步（2026-10-25 拍板，原设计为不持久化）；点「换一批」才重新请求并覆盖同一批槽位。
- AI 贺卡背景图**原图存云端**（私有 Storage 桶 `card-backgrounds`），`prepare.background_path` 记录路径并随账号同步；本机 `background_url` 只是签名 URL 缓存，会过期，不进同步。
- 贺卡导出为 JPEG（3:4）保存到系统相册或经系统分享面板发出，App 内不留存导出副本。

---

## 五、实施顺序（按里程碑 M1～M12，与 tasks.md 一致）

> 顺序以 tasks.md 为准；每阶段交付即可独立验证，前一阶段是后一阶段的依赖。详细任务（做什么 / 涉及文件 / 可见结果）见 tasks.md。

**M1 页面骨架**
Expo 项目初始化、expo-router、底部 4 个 Tab（提醒 / 联系人 / 历史 / 设置，2026-10-23 由 3 Tab 改版）可切换、各栈内页占位与跳转通路。后续一切以它为底。

**M2 Supabase 集成 + 用户登录（功能 11）**
Supabase Auth 接入；登录页（邮箱 + 密码注册/登录，注册即用、无需邮箱验证码）、强制登录门禁、登录态保持、设置页账号区展示与退出登录。本机业务数据按账号分库、云端按 `user_id` 归属（2026-10-25 起由 M12 接线；此前为「与账号不关联」）。手机号 + 验证码、微信/Apple 待外部条件具备后再加入。实施状态见第七节。

**M3 联系人管理（心意对象管理，功能 1、2）**
接入 expo-sqlite 建库建表（五张表一次建齐，含 settings 默认行与 history）、数据访问层（Repository 接口）、日期计算工具；对象/纪念日/特征的增删改查、10 条与 50 字上限校验、删除二次确认 + 软删除、回收站（30 天恢复/超期清除）、首页对象列表。

**M4 设置页面（功能 4、6、7、9、11 的设置部分）**
设置主页分组列表与二级页：提前提醒天数（0～30 默认 3）、推送开关、祝福数量（1～5 默认 3）、礼物固定 4 条 + 电商平台（淘宝/京东）、贺卡署名开关（默认关）、12 个节日关注开关（默认全开）；账号管理页（退出登录、注销账号）；回收站入口。设置项读写落到 settings 表。

**M5 通用节日（功能 9 的数据与匹配）**
用农历库计算 12 个内置节日（元旦、春节、元宵节、情人节、妇女节、母亲节、父亲节、端午节、七夕、中秋节、重阳节、圣诞节）未来 10 年的日期表与兜底计算规则；指向性节日的关系关键词匹配（无匹配不推送）；只对「已关注」的节日排期。节日的推送接入统一在 M6 生效。

**M6 提醒与推送（功能 3、4）**
每天早 9 点的本地通知排期（对象生日/纪念日 + 两类节日统一排期）、按提前天数从临近期到当天的多次推送、对象删除/日子过去后的取消、修改提前天数后全部重排、「近日心意」列表（未来 30 天）、通知权限引导与深链、推送与心意记录接通（一日子一条，通用节日不进历史）。

**M7 AI 祝福语生成（功能 5、6）**
部署轻量代理调用 DeepSeek；按对象关系+特征生成、数量随设置（默认三条）、逐条复制、换一批、手动编辑、失败重试、按关系类型（家人/朋友/客户）的预置通用祝福兜底（无网提示归 M11）。

**M8 礼物建议（功能 7）**
经代理调用 DeepSeek 生成固定 4 条与特征相关的礼物建议、「去看看」按所选平台（默认淘宝，可切京东）跳转：优先唤起电商 App、未安装回退浏览器搜索页。

**M9 电子贺卡（功能 8）**
经 `generate-card-image` 生成场景化 AI 背景图、从 prepare 缓存选祝福并可切换/重新生成、对象称呼（取自姓名或关系，可修改）、生成日期与 App 水印、按设置开关决定是否署名、导出竖版 3:4 JPEG 保存相册并可系统分享；背景图失败降级为默认背景色 + 文字。

**M10 历史记录（功能 10）**
历史表展示与操作：三态（未送/已送/已过期）、「已送祝福」标记、「已过期」读取时派生、单条删除（二次确认）。表与写入在 M3/M6 已就绪，本阶段收口展示。2026-10-25 已完成，页面全部读真实数据（原样例数据已删除），见 7.12。

**M11 离线处理与收尾**
生成场景无网络提示（「当前无网络，联网后可生成心意内容」并展示对象信息）、基础功能离线可用验证、对照 spec 验收标准走查（`docs/acceptance-checklist.md`）、宪法自检与文档同步。2026-10-25 已完成，见 7.12。

**M12 云同步（2026-10-25 新增，M12-00～M12-14）**
按账号实时双向同步，解决「卸载重装/换机后登录原账号数据没了」。详见 7.10、7.11 与 tasks.md 里程碑十二。

---

## 六、与 spec 的对齐自查

- 除按小康明确要求新增的 delete-account（账号注销后端，见第七节）外，未新增 spec 之外的功能；账号登录对应 spec 功能 11；「以后再做」清单中的其余各项均未纳入第一版计划。
- Supabase 启用 Auth（登录，功能 11）与业务数据库（云同步，2026-10-25 提级，见 7.10）；文件存储仅用于贺卡背景图（私有桶 `card-backgrounds`，见 7.11）。Edge Functions 现有 delete-account（账号注销，已纳入 spec 功能 11 与设置-账号管理入口）与 AI 生成三类（`generate-blessings` / `generate-gifts` / `generate-card-image`）。
- 已拍板选型：expo-sqlite、expo-router、轻量代理转发至 DeepSeek、农历库计算；仍待定：日期库（date-fns/dayjs）、农历库具体选型、状态管理方案。
- 关键数字均与 spec 一致：提前三天默认、0～30 天、1～5 条默认 3 条、礼物建议固定 4 条、特征最多 10 条每条 50 字、回收站 30 天、未来 30 天「近日心意」、12 个节日（默认全部关注）、未来 10 年日期表、每日推送时间可自定义（默认早 9 点）、竖版 3:4 JPEG（2026-10-25 由 PNG 改为 JPEG）。

---

## 七、实施进展与变更记录（2026-10-23）

> 本节记录计划落地后的实际状态，与第一～六节的规划不一致时以本节为准；未列出的里程碑仍按原计划待实施。

### 7.1 Supabase 项目与环境

- 项目：**xinyiapp**，Project Ref `kszmreeiuqplcanfuijr`，区域 ap-northeast-1（东京），免费版。
- JWT 签名：项目使用 ES256 非对称密钥（JWKS 含 `kid`），满足 `@supabase/server` 对 `auth: 'user'` 的校验要求。
- 本地工程：根目录 `supabase/` 由 `supabase init` 生成并已 `supabase link` 关联；Supabase CLI 2.121.0（npm 全局安装）。
- App 配置：`rnapp/.env.local` 保存 `EXPO_PUBLIC_SUPABASE_URL`、`EXPO_PUBLIC_SUPABASE_ANON_KEY`，已被 gitignore，不入库。

### 7.2 登录认证（M2-01、M2-02、M2-03、M2-04、M2-07）

已完成：
- 客户端依赖：`@supabase/supabase-js` + `expo-secure-store`（+ `react-native-url-polyfill`）。
- 令牌存储：SecureStore 按 1500 字符分片写入，规避 Android 单值 2048 字节限制。
- 登录态：AuthContext 负责启动恢复、`onAuthStateChange` 监听、前后台自动刷新；退出登录只清身份，不删除本机数据。
- 账号展示：本机只缓存掩码信息（`auth_cache`，存 SecureStore），不与业务表关联。
- 登录页：邮箱 + 密码注册/登录（注册即用，无需邮箱验证码，密码至少 6 位）；无网络时提示联网。
- 设置页账号区：显示掩码账号与退出登录（二次确认）。
- 强制登录（2026-10-23 按小康决定变更）：根路由使用 `Stack.Protected` 做登录守卫；未登录只能停留在登录页，退出登录后自动回到登录页；spec 功能 11 已同步改为强制登录。
- 登录方式变更（2026-10-23 按小康要求）：改为邮箱 + 密码，注册即登录、无需邮箱验证码；登录页按参考图简化为单页表单（邮箱、密码、「开始使用」/「注册并登录」、忘记密码与注册切换）；spec 功能 11 已同步。

状态与外部条件：
- 邮箱 + 密码：已打通；项目 `mailer_autoconfirm = true`，注册即返回会话、无需邮箱验证码；密码至少 6 位。已用临时账号验证注册与登录接口均返回会话。
- 找回密码：暂未开放（依赖邮件服务）。
- 手机号验证码：代码保留在 AuthContext；短信通道（Twilio）未配置，登录页暂不展示该入口。
- 微信 / Apple：登录页暂不展示，待微信开放平台资质与 Apple Developer 账号就绪后接入。

### 7.3 Edge Function：delete-account（spec 之外的新增）

- 位置：`supabase/functions/delete-account/index.ts`，已部署（version 1，ACTIVE）。
- 鉴权：`@supabase/server` 的 `withSupabase({ auth: 'user' })`，用项目 JWKS 校验 JWT；`config.toml` 中 `verify_jwt = true`。
- 行为：只删除当前登录用户自己的账号（用户 id 只取自已验证 JWT，不接受请求体传 id）；删 `auth.users` 身份后，云端业务数据由 `user_id` 外键级联清空；本机该账号库由客户端随后删除（2026-10-25 云同步后语义变更）。
- 环境变量：`supabase/functions/.env.example` 为模板；部署后平台自动注入 `SUPABASE_URL`、`SUPABASE_PUBLISHABLE_KEYS`、`SUPABASE_SECRET_KEYS`、`SUPABASE_JWKS`，仓库不保存真实 Key。
- 自测：无令牌调用返回 401；带用户令牌返回 `{"ok":true}`，随后该用户已不存在。
- 合规说明：账号注销已经小康确认纳入 spec 功能 11；App 端入口为「设置 → 账号管理 → 注销账号」（二次确认，2026-10-23 落地）。

### 7.4 新增依赖与验证结果

- App 依赖：`@supabase/supabase-js`、`expo-secure-store`、`react-native-url-polyfill`；开发工具 `eslint`、`eslint-config-expo`（`npx expo lint` 自动配置）。
- 验证：`npx tsc --noEmit` 通过、`npx expo lint` 通过、`npx expo-doctor` 21/21 通过、Android bundle 导出成功；Edge Function 端到端自测通过。
- 开发预览：`cd rnapp && npx expo start --lan`，Expo Go 扫码；手机需与电脑同一局域网。

### 7.5 仍待处理

1. 找回密码的页面与代码已完成，但**邮件实际投递仍受阻**：Supabase 已接 Resend 自定义 SMTP（`smtp.resend.com:465`，用户 `resend`），发件人是未验证域名的 `onboarding@resend.dev`。Resend 只允许该测试域名投递到 Resend 账号注册邮箱（`wangzongcai0103@gmail.com`），发给其他收件人一律 403 → Supabase 报 `Error sending recovery email`。**解决方式：在 Resend 验证自有域名，并把发件人改成该域名下的地址**；在此之前，找回密码只对 Gmail 测试账号可用。
2. 短信通道、微信开放平台资质、Apple Developer 账号到位后完成 M2-03 / M2-05 / M2-06。

### 7.6 4 Tab 改版与设置页重构（2026-10-23，按小康拍板）

- 底部导航由 3 Tab 改为 **4 Tab：提醒 / 联系人 / 历史 / 设置**；原首页拆为提醒页（近日心意）与联系人页（对象列表 + 添加入口），心意记录更名为历史。
- 设置页按参考图重做为分组列表 + 二级页：提醒设置（提前 0～30 天、固定 09:00）、推送通知开关、祝福语设置（1～5）、礼物设置（固定 4 条 + 淘宝/京东）、贺卡设置（署名开关，默认关）、节日设置（12 个节日关注开关，默认全开）、底部金色高亮「账号管理」。
- 账号管理页：账号卡片、退出登录、注销账号（两次确认，调 delete-account 成功后 signOut）。
- 规格变更（spec 已同步）：内置节日 8 → **12 个**（新增元宵节、端午节、七夕、重阳节，均按通用节日），节日可关注/取消关注；贺卡增加署名开关；功能 11 增加账号管理与注销账号。
- 已实现但暂为内存态：设置偏好与节日关注状态由 `SettingsContext` 承载（`rnapp/src/settings/`），M3 settings 表与 Repository 落地后替换为持久化；推送通知开关的系统权限对接在 M6-01。
- 「内容开关」「隐私说明」：2026-10-25 经小康重新拍板**纳入第一版**——首次 AI 使用隐私提示、礼物区域与贺卡区域全局开关，详见 7.9。

### 7.8 提醒与推送（M6，2026-10-24）

已完成（依据 tasks.md M6-01~M6-08）：
- 依赖：`expo-notifications@~57.0.24`（SDK 兼容版）；app.json 加入 `expo-notifications` 配置插件（color #FE6D73、defaultChannel default），为自定义构建声明 Android 13+ POST_NOTIFICATIONS 权限。
- M6-01 权限与通道：`rnapp/src/notifications/permissions.ts`——前台展示 handler（shouldShowBanner/List）、Android 'default' 渠道、`syncPermission`/`requestPermission`（授权成功自动重排），结果回写 settings.notification_permission。
- M6-02/03/04/06 排期引擎：`rnapp/src/notifications/scheduler.ts`——统一排期三类日子（对象纪念日、指向性节日按关系匹配、已关注通用节日）；从提前天数起至当天每天在「推送时间」各推一次（DATE 触发逐日部署，时间默认 9:00、可自定义，见 7.8.2）；每次「清空重排」天然取消删除/过期对象的通知（M6-04）；改提前天数/推送时间/切节日关注即重排（M6-03）；给对象日子写历史（一日子一条幂等），通用节日不进历史（M6-06）。
- M6-05 深链：`app/_layout.tsx` 登录后监听通知响应，点开进入对应对象的对象页 `/person/[id]`（2026-10-25 由 `/content/[id]` → `/prepare/contact/[id]` → `/person/[id]` 两次调整）；通用节日暂回落提醒页，M7 起进入 `/prepare/holiday/[code]`。
- M6-07/08：提醒页此前已列出自己记录的日子与已关注节日、按倒计时排列并显示「今天」；本次把「通知未开」横幅接通真实系统权限（已拒绝时引导 `Linking.openSettings`），设置页推送开关改调真实授权。
- 工具：`calendar.ts` 新增 `nextOccurrenceDate`（排期需具体日期锚点，与倒计时同源）。

验证：`npx tsc --noEmit` 通过、`npx expo lint` 0 错误、`npx expo-doctor` 21/21 通过、Android bundle 导出成功。

**真机（模拟器）验证已完成（2026-10-24，Android 模拟器 + debug APK）**：
- 构建与安装：本地 Gradle 打出 `app-debug.apk`（x86_64）并装到模拟器，App 登录后正常加载。
- M6-01：通知渠道 `default`（名称「心意提醒」，importance=4，含振动与 `#FE6D73` 灯色）已创建；`POST_NOTIFICATIONS` 弹窗授权成功，`notificationPermission` 回写 granted。
- M6-02/03：把模拟器时间拨到 09:00 前，可观察到两条精确闹钟（`RTC_WAKEUP`、`window=0`、`exactAllowReason=permission`）分别落在「提前 1 天」和「就是今天」。09:00 到点后通知栏实际弹出「TestM6的Birthday / 10月26日 · 还有 1 天」，应用在前台也正常展示（`setNotificationHandler` 生效）。改提前天数、改对象日期后回前台即重排，闹钟随之变化（M6-03）。
- M6-05：点开通知直接落到 `/content/{personId}` 心意内容页，对象 id 与通知 payload 一致。
- 两处验证中发现并修好的问题见 7.8.1。

#### 7.8.1 验证中修掉的两个真问题

1. **9 点提醒会被系统推迟最长 1 小时**：expo-notifications 在 Android 12+ 会先判断 `canScheduleExactAlarms()`，拿不到精确闹钟权限就退化成 `setAndAllowWhileIdle`（不精确闹钟，`window=+1h0m0s0ms`）。已在 `app.json` 的 `android.permissions` 与 `android/app/src/main/AndroidManifest.xml` 声明 `SCHEDULE_EXACT_ALARM`，声明后闹钟即为 `window=0` 的精确闹钟。
   - 遗留：Android 13+ 该权限默认不授予，需引导用户去「闹钟和提醒」打开。下一步在提醒设置页加一个「允许精确提醒」入口（点按跳 `android.settings.REQUEST_SCHEDULE_EXACT_ALARM`）。
2. **正常冷启动会被上次点过的通知带偏**：`getLastNotificationResponseAsync()` 会一直返回上一次的响应，导致之后每次冷启动都跳到心意内容页。已在 `app/_layout.tsx` 的 `handleData` 里处理完就调 `clearLastNotificationResponseAsync()`，响应只消费一次。

> 仍然成立的限制：SDK 57 起 expo-notifications 不在 Expo Go 内，日常调试通知必须用 development build（本地 `expo run:android` 或 EAS）。

#### 7.8.2 推送时间改为自定义（2026-10-24，按小康要求）

原来 spec 写死「每天早上 9 点」，测试提醒很不方便（只能等第二天）。本次把推送时间做成可配置，默认仍是 09:00：

- **数据**：settings 单行表新增 `reminder_hour`（0~23，默认 9）与 `reminder_minute`（0~59，默认 0）两列；`db/client.ts` 的迁移用 `hasColumn` 幂等补列，老库无需重建。
- **仓库/状态**：`settingsRepository` 读写这两个字段并做范围夹取；`SettingsContext` 暴露 `remindHour` / `remindMinute` / `remindTimeText`（HH:MM）与 `setRemindTime(h, m)`，写入后 `await` 持久化再触发 `rescheduleAll()`（顺带修掉原来「先重排、写库未完成」的竞态）。
- **排期**：`scheduler.ts` 的 `at9am` 改为 `atReminderTime(day, hour, minute)`；当天时间点已过则直接跳过（以前是被 expo 丢弃并打警告，现在提前过滤）。
- **界面**：提醒设置页「推送时间」由固定文本换成纯 JS 时间步进器（时 ±1、分 ±5，免装原生 datepicker），另加「1 分钟后 / 5 分钟后 / 恢复 09:00」三个快捷按钮方便验收；设置主页摘要同步显示当前时间。
- **验证（模拟器）**：点「1 分钟后」即时生效，`dumpsys alarm` 出现对应时刻的精确闹钟（`window=0 exactAllowReason=permission`），到点通知栏弹出「TestM6的Birthday / 10月25日 · 还有 1 天」；「恢复 09:00」后只剩明天 09:00 一条（当天已过的 09:00 正确跳过）。`npx tsc --noEmit`、`npx expo lint` 均通过。

### 7.7 找回密码：公网静态落地页（2026-10-23，按小康拍板）

- **方案**：不依赖 App 深链，也不依赖 `xinyibutler://` scheme。重置邮件里的链接指向一个公网静态页，用户在那里填新密码，改完回 App 登录。
- **页面**：[web/index.html](web/index.html)。单文件、零第三方依赖（只用 `fetch` 调 Supabase Auth REST），配色沿用 `rnapp/src/theme.ts` 的山茶 + 檀墨。解析链接 `#access_token=…&type=recovery`，调 `PUT /auth/v1/user` 改密码。
- **托管**：GitHub Pages（仓库为 public，免费且无需域名）。`.github/workflows/pages.yml` 在推送 `main` 且 `web/**` 变化时自动发布。
  线上地址：`https://wangzongcai.github.io/ai-xinyi-butler/`
  （Netlify 站点 `xinyi-butler-app` 也已创建，但该团队开启了账号级 SSO 保护，公网访问返回 401；擅自改账号安全设置超出授权范围，故改用 GitHub Pages。）
- **App 端**：登录页新增 `forgot` 模式（邮箱输入 → `resetPasswordForEmail`），`redirectTo` 取 `EXPO_PUBLIC_RESET_PASSWORD_URL`；`AuthContext` 新增 `requestPasswordReset`。
- **Supabase 侧需手动配置**（Dashboard → Authentication → URL Configuration）：Site URL 改为上述 Pages 地址，Redirect URLs 加入 `https://wangzongcai.github.io/ai-xinyi-butler/**`。未配置时 Supabase 会忽略 `redirectTo`，邮件链接无法跳转到新页面。
- **已知限制**：邮件投递仍受 Resend 域名限制（见 7.5 第 1 条）。

### 7.9 M7～M9 方案落地变更（2026-10-25，按小康拍板）

> 依据参考图 M7/M8/M9 与小康逐项确认，tasks.md 的 M7～M9 已重写；与第一～六节不一致处以本节为准。

1. **AI 调用改走 Supabase Edge Functions**：
   - `generate-blessings` 与 `generate-gifts`：Deno `fetch` 调 DeepSeek REST API，30 秒超时 + 失败重试 1 次；沿用 `withSupabase({ auth: 'user' })`；DeepSeek Key 只存 Edge Function 环境变量。
   - 新增 `generate-card-image`：调用火山引擎方舟 Seedream 5.0 flash（`doubao-seedream-5-0-flash-260915`）生成贺卡背景图，尺寸固定 3:4 `1728x2304`，返回图片 URL；Key 只存服务端；同样 30 秒超时 + 重试 1 次；关闭模型自带水印（`watermark: false`），App 水印由客户端叠加。
     > **Prompt 加强（2026-10-25，按小康反馈「画面朴素、不贴合节日与纪念日」）**：每个场景改为「主题 + 关键元素 + 光线氛围 + 配色 + 质感」五维描述，12 个节日逐个定制具体物件与色板；客户端额外传离今天最近的纪念日名称（不含姓名），服务端按「结婚 / 相识 / 恋爱 / 毕业 / 宝宝」等关键词匹配意象；`relationship` 再决定情感基调（伴侣浪漫、长辈敬重、孩子童真、商务克制）。
2. **页面与路由**：原「心意内容页」改为「心意准备页」——`/prepare/contact/[id]`（联系人）与 `/prepare/holiday/[id]`（节日，顶部联系人选择器默认「不指定收件人」）；贺卡页改为 `/card/[prepareId]`。通知深链与提醒页列表项同步指向新路由。
   > **2026-10-25 再调整**：联系人准备页内容已**内联到对象页 `/person/[id]`**，`/prepare/contact/[id]` 路由已删除，通知深链与提醒页列表项改为直达对象页；只保留节日准备页 `/prepare/holiday/[id]`。同时修掉 `usePrepareContent` 的「数据未就绪就用空特征判定」缺陷（该缺陷会让准备页永久停在「先填特征」且一条都不生成）。
3. **祝福持久化**：新增 `prepare` 表（data-model 3.9），保存场景、收件人、节日、祝福列表、选中下标与背景图 URL；退出再进入展示上次结果，重新生成即替换。原 4.8「AI 内容不入库」相应修改（礼物建议当时仍不持久化，2026-10-25 第二轮已改为保留最近一批，见 7.11）。
4. **礼物模块按 spec**：固定 4 条不可调、仅淘宝/京东、未安装回退浏览器；图片中的「数量可调、拼多多/亚马逊、应用商店引导」不纳入第一版。
5. **贺卡按图片方案（spec 功能 8 已同步）**：AI 背景图 + 祝福文字 + 联系人姓名 + 生成日期 + App 水印（默认「AI 心意管家」）；导出竖版 3:4 JPEG（captureRef，至少 2x）；保存相册 + 系统分享；背景图失败降级为默认背景色 + 文字。
6. **新增开关与隐私**：`settings` 增加 `gift_enabled`、`card_enabled`（默认开）、`signature_text`（可空）与 `privacy_consent_at`；首次 AI 生成前弹隐私提示，同意后持久化不再弹。
7. **待外部条件**：火山引擎方舟 API Key 需小康提供；模型 ID 与计费方式待确认（tasks.md 待确认第 8 条）。

### 7.10 云同步方案落地变更（2026-10-25，按小康拍板）

> 起因：小康反馈「卸载重装后登录原账号，之前的联系人没了」。原设计（spec 全局约定第 1 条）是「心意数据仅存本机」，本次提级到第一版，spec / data-model / plan / tasks 同步更新。

**四项决策**
1. 同步策略：**实时双向同步**（本地写库即上报，云端变更经 Realtime 触发拉取）。
2. 同步范围：**全部业务数据**（person / anniversary / trait / settings / history / prepare；2026-10-25 补充 gift 与贺卡背景图路径）。
3. 冲突处理：**最新为准**（LWW，按 `updated_at` 比较）。
4. 同设备换账号：**每账号独立本地库**，互不可见。

**落地要点**
- 服务端：三个迁移文件（均已于 2026-10-25 `supabase db push --linked` 应用）——`20261025120000_sync_schema.sql` 建 7 张表（6 张业务/同步表 + 墓碑表）+ RLS + 复合外键 + 墓碑触发器 + 复活守卫 + 时钟钳制 + Realtime publication；`20261025130000_card_backgrounds.sql` 加 `prepare_record.background_path` 与私有 Storage 桶 `card-backgrounds`；`20261025140000_gift_suggestions.sql` 建 `gift_suggestion` 并把 `gift` 纳入墓碑表名。
- 客户端：`rnapp/src/db/`（按账号分库、`DatabaseGate`、`sync_*` 三张本机表、`withWriteTransaction`）；`rnapp/src/sync/`（mappers / outbox / applyRemote / syncEngine / SyncContext）；6 个 Repository 改为事务内写入 + 入队。
- 界面：设置页新增「云同步」入口与 `/settings/sync` 状态页（状态、上次同步时间、待同步条数、立即同步、旧数据迁移说明）；提醒页 / 联系人页 / 对象页 / 回收站订阅 `dataVersion`，远端改动即时可见。

**设计评审中修正的四个坑**
1. **Realtime DELETE 事件不可用**：RLS 不作用于 DELETE，payload 只有主键、拿不到 `user_id`，无法归属到用户，还可能收到别人的删除事件。→ 改墓碑表：业务行物理删除，`AFTER DELETE` 触发器写 `sync_tombstone`，客户端只订阅墓碑表的 INSERT。
2. **「云端没有 = 已删除」会误删**：本地新建未推送、分页未拉完、单表请求失败都会表现为「云端没有」。→ 彻底删除 absence 对账，删除只信墓碑。
3. **settings 共用 `updated_at` 会冲掉云端设置**：每次启动 `syncPermission()` 都会写 `notification_permission`。→ 本机专属列不推进同步时间戳，另设 `sync_updated_at`。
4. **首次安装的默认 settings 行会赢过云端**：建库时 `updated_at = 现在`。→ 用持久标记 `sync_meta.settings_edited` 判定用户是否真的改过（起初用「outbox 是否有记录」，但推送成功后 outbox 同样是空的，重装场景会误判）；没改过则云端无条件覆盖。

**已知限制**（详见 data-model 9.8）：LWW 依赖设备时间（服务端把时钟钳到 `now()+5min`）；墓碑永久保留；trait 每对象 10 条是跨行约束，两端离线各加可能超限；`selected_index` / `background_url` 不同步（背景原图随 `background_path` 同步，URL 只是本机签名缓存）；Supabase 免费项目长期不活跃会被暂停，期间同步不可用。

### 7.11 云同步补强（2026-10-25 第二轮，按小康要求「重装后一切都在」）

> 迁移推送后逐条走查同步路径，发现四处会导致「恢复不完整」的缺陷，连同两项新功能一并落地。

1. **首次冲突「合并」= 本地覆盖云端**：原 `resolveBootstrapConflict` 先 `uploadAll` 再 pull。→ 改为 **pull → 判断云端是否已有 settings → 有条件 uploadAll → push → pull**，云端有设置时不再上传本机默认值。
2. **贺卡切祝福会顶掉云端较新祝福**：`setPrepareSelectedIndex` / `setPrepareBackgroundUrl` 原来都推进 `updated_at`。→ 纯本机 UI 状态不再推进；`savePrepare` 先比祝福内容，未变则只更新 `selected_index`；新增 `setPrepareBackgroundPath` 专门更新路径并推进时间。
3. **本机硬删后会被 pull 复活**：云端墓碑还没写、推送还没到，pull 就把旧行拉回。→ `hardDeletePerson` / `purgeExpiredRecycled` 在删除事务里同时写本机 `sync_tombstone`（person + anniversary + trait + gift）。
4. **其他健壮性修复**：`cloudRowCount` 改看全部同步业务表 + settings；23505 唯一键冲突改为按业务键查远端后取舍（不再静默 ack 丢数据）；401 / `PGRST301` 先 `refreshSession()` 再重试；永久性错误写入本机 `sync_dead_letter` 并在同步页计数（不再静默丢弃）；Realtime 回调按 `origin_device_id` 跳过本机推送；`user_settings` 订阅补齐 UPDATE；换账号时先拆旧频道。

**新增两项能力（spec 已同步）**
- **贺卡背景图上云**：`generate-card-image` 入参加 `prepareId`，出图后由函数下载并以用户身份上传到 `<uid>/<prepareId>.jpg`，返回 `backgroundPath`；客户端优先用 `createSignedUrl`（7 天）取回并按需回填 `background_url` 缓存；「换一张背景」覆盖同路径。
- **礼物建议持久化**：新增 `gift_suggestion` 表（本地 + 云端 + 墓碑 + Realtime），id 用确定性文本 `gift|scene|personId|festivalCode|序号`，重新生成原地覆盖同一批槽位，避免 id 爆炸与墓碑风暴；进入对象页/节日页先读缓存，没有才请求 AI。

**验收**
- `npx tsc --noEmit`、`npx expo lint` 均 0 error；`supabase migration list --linked` 两侧一致；匿名 REST 访问业务表返回空数组（RLS 生效）。
- 真机：卸载重装 → 登录 → 联系人 / 纪念日 / 特征 / 祝福 / 礼物 / 背景图 / 设置全部恢复；双设备互见；离线补传；删除不复活。

### 7.12 M10 历史记录与 M11 收尾（2026-10-25）

**M10 历史记录（M10-01～M10-04，已完成）**
- 历史页原为写死的样例数据（妈妈生日 / 父亲节 / 老徐结婚纪念），本次**全部删除**，改为读本机库真实记录：`historyRepository` 新增 `listHistoryRows()`，`LEFT JOIN person` 一次取回对象姓名，页面不再拼多表。
- 列表按日期倒序，分段「全部 / 未送 / 已送 / 已过期」带条数；「已过期」仍是读取时派生（M10-03），不回写。
- 未送 / 已过期可「标记已送」；每条可删除，**删除带二次确认**（待确认 5 已按此拍板，误删不可恢复）。
- 页面订阅 `dataVersion` 并用 `useFocusEffect`，同步下来的新记录与从对象页返回时都会自动刷新。

**M11 离线处理与收尾（M11-01～M11-04，已完成）**
- M11-01：**不新增依赖**实现断网提示——断网时 `supabase.functions.invoke` 会立刻失败，`src/lib/network.ts#isOfflineError` 按错误文案（`Network request failed` / `Failed to fetch` / `Failed to send a request…` 等）识别网络类失败，`aiClient.ts` 统一转成 spec 固定文案「当前无网络，联网后可生成心意内容」；祝福区同时展示对象信息（关系、特征）并保留预置兜底祝福，礼物区显示同一文案与「联网后重试」。没有引入 expo-network / netinfo，避免新增原生依赖。
- M11-02：代码层确认对象管理、提醒推送、历史记录均只读本机 SQLite；登录断网提示由 `src/auth/errors.ts` 覆盖（「当前无网络，请联网后再登录」）；强制登录门禁由 `Stack.Protected` 保证。真机飞行模式走查待小康执行。
- M11-03：新增 [docs/acceptance-checklist.md](docs/acceptance-checklist.md)，按 spec 功能 1～11 逐条标注「✅ 代码走查确认」与「⚠️ 待真机回填」；与云同步相关的条目以 M12-12 为准，不重复执行。
- M11-04：清理废弃的占位路由 `app/content/[id].tsx` 与随之无用的 `Placeholder` / `NavButton` 组件（App 内已无样例数据与占位页）；tasks.md / plan.md 同步，spec 与 data-model 无需改动（无新增功能、无表结构变化）。

**数据清理（2026-10-25，按小康要求）**
- 云端 Supabase 业务表已清空：`person` / `anniversary` / `trait` / `history` / `prepare_record` / `user_settings` / `gift_suggestion` / `sync_tombstone` 均为 0 行；**登录账号保留**（auth.users 仍为 2 个）。
- 注意：手机本机库里仍是旧数据，若直接联网同步会按「云端空 + 本机有 → 全部上传」把测试数据重新推上去。要得到干净环境，需**卸载重装（或清除应用数据）后再登录**。

**验证**：`npx tsc --noEmit` 通过；`npx expo lint` 0 error / 4 warning（均为历史遗留：`festivalVerify.mjs` 两个未使用变量、`festivals.ts` 两处 `Array<T>` 写法）；release APK 已重建（`D:\桌面文件存储1\心意管家-v1.0.0-test-20261025-1713.apk`，106.8 MB，纯 JS 改动、无新增原生依赖）。

### 7.13 历史页为空：排查与修复（2026-10-25）

小康反馈「历史点开是空的」。走查后确认**历史本身没有样例数据依赖，也不会凭空生成**，同时发现两个真实缺陷：

- **触发缺失**：`person/new.tsx`、`person/[id]/edit.tsx` 保存和 `recycle-bin.tsx` 恢复对象后都没有触发重排。排期与历史写入都只在「App 启动 / 回到前台 / 改设置 / 同步落库」时发生，所以新加的联系人不会立刻出现在历史页，提醒也不会立刻排上。
- **权限耦合**：`rescheduleAll` 原先在通知权限为 `denied` 时直接 return，历史写入被一起跳过；启动逻辑在系统未授权时也不会调用重排。结果是用户拒绝通知后，历史页永远是空的。

修复：
- 保存 / 恢复对象后 `await rescheduleAll()`（等写完历史再返回，避免刚回到历史页时还没落库）。
- `rescheduleAll` 调整为**先收集并写历史、再判断通知权限**：权限关闭只清空排期，不再影响心意记录。
- `_layout.tsx` 的 bootstrap 在权限对账（含首次授权请求）后统一跑一次重排，覆盖「用户拒绝通知」的分支。
- 历史页空态文案写明生成条件：未来 45 天内的对象日子 / 匹配到对象的节日，通用节日不记。

设计边界（未改动）：历史只收「未来 45 天内」的日子（`scheduler.ts#LOOKAHEAD_DAYS`），这正是对象日子很远时历史页为空的原因；通用节日按 spec 不进历史。

**验证**：`npx tsc --noEmit` 通过；`npx expo lint` 0 error / 4 warning（同前）；release APK 已重建：`D:\桌面文件存储1\心意管家-v1.0.0-test-20261025-1826.apk`（106.8 MB）。

### 7.14 Expo Go 兼容：通知原生模块缺失导致 App 起不来（2026-10-25）

小康用 Expo Go 扫码后报 `Cannot find native module 'ExpoTopicSubscriptionModule'`（栈顶在 `app/_layout.tsx`，经由 `expo-notifications`）。这不是网络问题，是 Expo Go 的 Android 二进制里没有该原生模块：`expo-notifications` 的入口会静态导入 `topicSubscription`，后者在初始化阶段直接 `requireNativeModule('ExpoTopicSubscriptionModule')`，抛错发生在渲染树之外，整屏报错。

修复（不改任何业务逻辑，正式 APK 行为不变）：
- 新增 `rnapp/src/notifications/notificationsModule.ts`：全工程唯一的 `expo-notifications` 取用口，用 `require` + try/catch 取模块，取不到返回 `null` 并打一条 warn。
- `permissions.ts` / `scheduler.ts` / `app/_layout.tsx` 三处静态 import 全部改为 `getNotifications()`；模块为 `null` 时：不注册 handler、不建渠道、不请求权限、不排期、不挂通知监听，但**历史记录照写、权限对账照走**（沿用 7.13 的解耦口径）。
- `clearAllSchedules` 同样空实现兜底。

修完通知后又暴露第二处同类问题：`expo-media-library` 的 `ExpoMediaLibraryNext` 同样不在 Expo Go 二进制里，栈顶指向 `src/lib/exportCard.ts`（贺卡导出页在启动时被 expo-router 求值）。处理方式一致：
- 新增 `src/lib/mediaLibrary.ts` 运行时取用口；
- `exportCard.ts` 的 `saveCardToLibrary` 在模块缺失时返回新的 `reason: 'unavailable'`，`card/[prepareId].tsx` 弹提示「当前环境不支持直接存相册，请用分享，在系统面板里保存」；
- 截屏（`react-native-view-shot`）与分享（`expo-sharing`）在 Expo Go 可用，所以「分享」这条路能走通。

边界：Expo Go 下推送 / 本地提醒、直接存相册都不可用（上游限制），真机验证通知仍需装 APK；Expo Go 只用于看界面与数据流。数据沙箱与 APK 隔离，两边账号数据互不影响（云同步会把同一账号的数据拉回来）。

**验证**：`npx tsc --noEmit` 通过；`npx eslint src/notifications app/_layout.tsx` 无输出。

### 7.15 两处运行期问题：LogBox 浮层挡点击 + 写事务撞锁（2026-10-25）

在 Expo Go 里点开贺卡页「保存」后，界面像「点了没反应」。日志给到两条线索：

- **LogBox 浮层**：降级日志原先写 `console.warn(msg, error对象)`，不会被当成普通日志，而是弹成浮层盖在界面上，挡住底部 Tab 的点击。改为 `console.log` + 只输出 `error.message`（`notificationsModule.ts`、`mediaLibrary.ts`）。预期内的环境差异不该打断用户。
- **写事务撞锁**：日志里有 `NativeDatabase.prepareAsync ... database is locked`。`withExclusiveTransactionAsync` 是另开一条连接拿 EXCLUSIVE 锁，事务连接上也没有 busy_timeout，两个写事务撞上就立即失败，随后读库会跟着卡住。`withWriteTransaction` 补了锁冲突重试（60/180/400ms，最多 4 次），只有 `database is locked` / `SQLITE_BUSY` / `SQLITE_LOCKED` 才重试，业务错误照旧上抛；失败即整体回滚，重跑安全。
- **历史卡片不可点**（小康反馈「点联系人没反应」）：M10 只做了「标记已送 / 删除」两个按钮，整卡没有跳转。现在整卡可点进对象页（`/person/{personId}`），右侧加了 chevron 提示；对象被彻底清除后 `person_id` 已置空的记录保持不可点（没有可去的地方）。属于补齐 M10-01 的交互，不新增页面。
- **对象页贺卡从「按钮」改成「一张图片」**（小康：点开联系人下面还是只有一个生成按钮；随后明确「就是一张贺卡图片就行，不要点进去再编辑」）：新增 `src/components/CardPreview.tsx`，把这张 `prepare` 记录里已有的贺卡按 3:4 直接摆在对象页——内部固定用 360 宽渲染再整体缩放到**对象页可用宽度**（`useWindowDimensions` 减左右 22 内边距，上限 360），放大后文字仍清晰；祝福文字取 prepare，背景图只复用已有缓存或云端签名地址，**不调用任何 AI、不新建记录**；没有背景图时用场景降级配色。**纯展示、不可点、无跳转**，不进编辑页。`AiActionsSection` 增加 `cardSlot`，传入时替换默认的「生成电子贺卡」按钮（节日准备页保持原样）。「默认称呼 / 卡片日期」抽到 `src/lib/cardDefaults.ts`，贺卡页与预览共用，避免两处文案走样。
- **贺卡预览只属于「从历史进入」**（2026-10-25 修正）：上面那条一开始做成了「对象页只要有 prepare 就显示预览卡」，结果从**联系人 Tab** 正常进入时也没了「生成电子贺卡」入口（小康反馈「怎么没有生成贺卡的功能了」）。现在 `cardSlot` 只在带 `?card=` 的历史入口传入；从联系人进入仍走原来的按钮 → 贺卡页出图 / 编辑 / 保存 / 分享。`AiActionsSection` 的展示条件改为「有 `prepareId` 或有 `cardSlot`」。
- **历史进入是「看记录」，不是「再准备一次」**（小康：「不要重新生成，直接用之前那张」「里边也不需要再编辑」）：
  - 贺卡本来就缓存在 `prepare` 记录里（祝福内容 + 背景图路径），不为历史另造一份。`listHistoryRows()` 增列 `prepare_id`（`COALESCE` 子查询：优先 `scene='contact'`，没有再退到该对象最近一条），点记录时以 `?card=<prepareId>` 带给对象页，对象页按这个 id **固定展示**那张卡，不按「当前对象最新内容」重选、不触发生成。
  - `BlessingPanel` 增加 `readOnly`：从历史进入时隐藏「重新生成 / 换一批」与逐条「编辑」，只保留「复制」，文案改为「以下是你之前准备好的内容」。
  - 历史卡片上不再有「查看贺卡」按钮（那是进编辑页的入口，与上述诉求相反）。
  - 从「联系人」Tab 正常进入对象页时行为不变：仍可生成、重排、编辑。

**验证**：`npx tsc --noEmit` 通过；`npx eslint src/db/tx.ts src/lib src/notifications app/card` 无输出。

### 7.16 云同步 `no such table: gift`：逻辑表名被当成 SQLite 表名（2026-10-25）

小康卸载重装后登录，云同步页显示「暂时离线」、上次同步「尚未同步」，错误为
`NativeDatabase.prepareAsync ... no such table: gift`，对象与历史都没回来。

- **根因**：同步层用逻辑表名 `SyncTable`（`person/anniversary/trait/history/prepare/gift`）直接拼本地 SQL。其中 `gift` 只是逻辑名，本地真实表是 `gift_suggestion`（`schema.sql:169`）；`prepare` 恰好同名、其余同名，所以只有礼物这张表会炸。重装后首次同步走 `pull()`，第一步 `applyRemoteTombstones()` 就对 `gift` 表执行 `DELETE`，直接抛错，整个 pull 回滚、`bootstrapState` 停在未完成，`lastSyncedAt` 永远是空——因此对象、历史也都不会落库。
- **修复**：`src/sync/mappers.ts` 新增 `LOCAL_TABLE`（逻辑名 → 本地表名，`gift → gift_suggestion`），并把所有拼本地 SQL 的位置改为映射后的名字：
  - `syncEngine.ts`：`uploadAll`（整库入队）、`localRowCount`（冲突提示的行数）、`pushOne`（读待推送行）；
  - `applyRemote.ts`：`upsertSql`、`applyOne` 的按 id 查询 / 业务键去重 / 删除重复行、`applyRemoteTombstones` 的硬删。
  `REMOTE_TABLE`（云端名）与 outbox / tombstone 里记录的**逻辑名**保持不变——墓碑、待推送队列、实时事件都按逻辑名沟通，只有本地 SQL 需要换名。
- **不新增功能**：属于 M12 既有同步链路的实现缺陷修正，未改表结构、未改 spec。

**验证**：`npx tsc --noEmit` 通过；`npx eslint src/sync src/db` 无输出。真机口径：卸载重装 → 登录 → 等首次同步完成，对象 / 纪念日 / 历史 / 贺卡 / 礼物建议全部恢复，云同步页显示本次同步时间。

### 7.17 云同步 `uuid = text`：墓碑 row_id 与礼物建议 id 类型不一致（2026-10-25）

7.16 修好后再次同步，同步页报 `operator does not exist: uuid = text`。待同步条数从 8 降到 5 后不再变化——person 等行的推送已成功入队并被确认，剩下的是礼物建议那几行。

- **根因**：`gift_suggestion.id` 是确定性文本（`gift|scene|personId|festivalCode|序号`），而 `sync_tombstone.row_id` 建表时是 `uuid`。两张表共用 `sync_write_tombstone()` / `sync_block_resurrection()`，函数里写的是 `row_id = new.id` 与 `insert ... old.id`，Polaris 无法把 `uuid` 与 `text` 直接比较，礼物建议一写入/删除就报错。
- **影响面**：`doSync()` 是「先 push 再 pull」，push 抛错后 pull 不执行，所以整次同步中断，表现为对象与历史都回不来、上次同步始终为空。该错误码（42883）不在永久错误清单里，条目留在 outbox 反复重试，不会静默丢数据。
- **修复**：新增迁移 `20261025150000_tombstone_row_id_text.sql`——`sync_tombstone.row_id` 由 `uuid` 改为 `text`（uuid→text 无损，与本地 `sync_tombstone.row_id TEXT` 对齐），两个触发器函数统一 `old.id::text` / `new.id::text`。只改一列与两个函数，不动业务表、不删数据。
- **不新增功能**：属于 M12 服务端 schema 的实现缺陷修正。

**验证**：迁移已 `db push`，`migration list` 本地与远端一致；真机「立即同步」后待同步归零、上次同步出现时间，礼物建议与其余数据一起恢复。
