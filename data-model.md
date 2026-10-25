# AI 心意管家 — 第一版数据模型

> 依据：spec.md、plan.md
> 第一版物理存储：本机 expo-sqlite（每个账号一个库文件，离线可用）+ Supabase PostgreSQL（该账号的心意数据，实时双向同步）。
> 本机与云端共用同一套逻辑模型，差异只体现在类型写法（TEXT/INTEGER ↔ text/boolean/timestamptz）与三张纯本机的同步辅助表（见第九节）。

---

## 一、命名与类型约定

1. **中文字段名与 plan.md「四、数据设计」逐字一致**；「英文列名」是为 Supabase（PostgreSQL）准备的建议映射，开发前可由小康最终确认。
2. 主键第一版在 SQLite 中以 `TEXT` 存 UUID 字符串；在 Supabase 中用 `uuid`（`gen_random_uuid()` 生成）。
3. 日期统一存 `YYYY-MM-DD`；带时间的字段存 ISO 8601，Supabase 中用 `timestamptz`。
4. 「下一次发生日期」**不入库**，由日期计算工具按 spec 规则（今年已过则指向明年同一天）在运行时算出。
5. AI 祝福文案持久化到 `prepare` 表（2026-10-25 变更，供退出重进保留与贺卡引用）；礼物建议每个「场景 + 收件人 + 节日」保留最近一批到 `gift_suggestion` 表（2026-10-25 变更，随账号同步）；贺卡背景图存入云端 Storage 并在 `prepare.background_path` 记路径；贺卡 JPEG 保存到系统相册 / 经分享发出，库内不留副本（plan 4.8）。

---

## 二、表总览

| 表名 | 中文名 | 形态 | 说明 |
| --- | --- | --- | --- |
| person | 心意对象 | SQLite 业务表 | 对应 plan 4.1 |
| anniversary | 纪念日 | SQLite 业务表 | 对应 plan 4.2 |
| trait | 特征 | SQLite 业务表 | 对应 plan 4.3 |
| settings | 设置 | SQLite 单行表 | 对应 plan 4.4 |
| history | 心意记录 | SQLite 业务表 | 对应 plan 4.5 |
| prepare | 心意准备 | SQLite 业务表（云端名 `prepare_record`） | 2026-10-25 新增：持久化祝福结果与贺卡背景图路径，供退出重进保留与贺卡引用 |
| gift_suggestion | 礼物建议 | SQLite 业务表（云端同名） | 2026-10-25 新增：每个场景保留最近一批 4 条建议，随账号同步 |
| festivals | 通用节日 | 内置只读数据（建议表） | 对应 plan 4.6，12 个节日 |
| festival_dates | 节日日期表 | 内置只读数据（建议表） | 对应 plan 4.6，未来 10 年 |
| auth_cache | 本机账号缓存 | 本机轻量缓存（建议表） | 对应 plan 4.7 |
| sync_meta | 同步元数据 | 纯本机表（单行） | 2026-10-25 新增；设备标识、首次同步状态、上次同步时间、旧库迁移标记、设置是否被用户改过 |
| sync_outbox | 待推送队列 | 纯本机表 | 2026-10-25 新增；只记「哪一行脏了」，推送时读当前行判断 upsert/delete |
| sync_tombstone（本机） | 墓碑镜像 | 纯本机表 | 2026-10-25 新增；记录云端已彻底删除的行，拒绝延迟到达的旧数据复活 |
| sync_dead_letter | 推送死信 | 纯本机表 | 2026-10-25 新增；永久性推送失败的行落此表，同步页展示条数，避免卡队列或静默丢数据 |
| sync_tombstone（云端） | 墓碑 | 云端表 | 由 `AFTER DELETE` 触发器写入，客户端只读；跨设备删除的唯一依据 |

> `festivals`、`festival_dates`、`auth_cache` 在 plan 中未给英文表名，此处为建议命名，待小康拍板；其中节日数据第一版随 App 以静态资源（JSON/TS）打包，不建用户可写表。
> 云端另有一张 `user_settings`（单行，主键 `user_id`），对应本机 `settings` 的可同步列；本机 `settings` 的单行 `id='default'` 结构不变。

---

## 三、表结构

### 3.1 person（心意对象）

| 中文字段 | 英文列名 | 类型（SQLite → Supabase） | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- | --- |
| id | id | TEXT → uuid | 是 | 应用生成 UUID | 主键 |
| 姓名 | name | TEXT → text | 是 | — | |
| 关系 | relationship | TEXT → text | 是 | — | 用户自由输入，不限预设选项（如家人、挚友、重要客户） |
| 生日 | birthday | TEXT → text | 否 | NULL | 历史列。生日已并入纪念日，旧值在启动迁移时转成名为「生日」的纪念日后清空，新数据不再写入 |
| 生日历法 | birthday_calendar | TEXT → text | 是 | 'solar' | 历史列，仅迁移时使用；新数据看 anniversary.calendar |
| 删除时间 | deleted_at | TEXT → timestamptz | 否 | NULL | 软删除标记：进回收站保留 30 天可恢复，超期彻底清除 |
| 创建时间 | created_at | TEXT → timestamptz | 是 | 当前时间 | 审计字段 |
| 更新时间 | updated_at | TEXT → timestamptz | 是 | 当前时间 | 审计字段 |
| —（预留列） | user_id | TEXT → uuid | 否 | NULL | **本机恒为 NULL**（数据归属由「每个账号一个本地库文件」表达）；云端该列必填，默认 `auth.uid()`，外键 → `auth.users(id)`，RLS 依据 |

### 3.2 anniversary（纪念日）

| 中文字段 | 英文列名 | 类型（SQLite → Supabase） | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- | --- |
| id | id | TEXT → uuid | 是 | 应用生成 UUID | 主键 |
| 对象 id | person_id | TEXT → uuid | 是 | — | 外键 → person.id |
| 名称 | name | TEXT → text | 是 | — | 用户自定义（如「结婚纪念日」「相识五周年」） |
| 日期 | date | TEXT → text | 是 | — | `MM-DD`（零填充），只记月日、每年重复 |
| 历法 | calendar | TEXT → text | 是 | 'solar' | `solar` 公历 / `lunar` 农历（第一版不支持闰月） |
| 创建时间 | created_at | TEXT → timestamptz | 是 | 当前时间 | 审计字段（plan 未显式列出，按功能补充） |
| 更新时间 | updated_at | TEXT → timestamptz | 是 | 当前时间 | 审计字段（plan 未显式列出，按功能补充） |

### 3.3 trait（特征）

| 中文字段 | 英文列名 | 类型（SQLite → Supabase） | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- | --- |
| id | id | TEXT → uuid | 是 | 应用生成 UUID | 主键 |
| 对象 id | person_id | TEXT → uuid | 是 | — | 外键 → person.id |
| 内容 | content | TEXT → text | 是 | — | 每条最多 50 字；每个对象最多 10 条 |
| 创建时间 | created_at | TEXT → timestamptz | 是 | 当前时间 | 审计字段（plan 未显式列出，按功能补充） |
| 更新时间 | updated_at | TEXT → timestamptz | 是 | 当前时间 | 审计字段（plan 未显式列出，按功能补充） |

### 3.4 settings（设置，单行表）

全表始终只有一行（id 固定），对应 plan 4.4。

| 中文字段 | 英文列名 | 类型（SQLite → Supabase） | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- | --- |
| id | id | TEXT(固定 `'default'`) → text | 是 | `'default'` | 单行主键 |
| 提前提醒天数 | advance_days | INTEGER → integer | 是 | 3 | 范围 0～30；0 表示只在当天提醒；全局生效，修改后所有提醒（含已排期）重新计算 |
| 祝福文案数量 | blessing_count | INTEGER → integer | 是 | 3 | 范围 1～5 |
| 电商平台 | ecommerce_platform | TEXT → text | 是 | 淘宝 | 取值：淘宝 / 京东 |
| 通知权限状态 | notification_permission | TEXT → text | 否 | NULL | 缓存系统权限状态，建议值：`granted` / `denied` / `undetermined`；用于首页「近日心意」提示 |
| 贺卡署名开关 | card_signature | INTEGER → boolean | 是 | 0（关） | 0 关 / 1 开；默认匿名 |
| 署名文字 | signature_text | TEXT → text | 否 | NULL | 2026-10-25 新增；开启署名后填写，显示在贺卡上 |
| 礼物区域开关 | gift_enabled | INTEGER → boolean | 是 | 1（开） | 2026-10-25 新增；关闭后准备页隐藏礼物区域且不请求 |
| 贺卡区域开关 | card_enabled | INTEGER → boolean | 是 | 1（开） | 2026-10-25 新增；关闭后准备页隐藏贺卡入口且不请求 |
| 节日关注状态 | festival_followed | TEXT → jsonb | 是 | `'{}'` | JSON 对象 `{ 'new_year': true, ... }`；缺省视为全部关注 |
| 推送时间（时） | reminder_hour | INTEGER → integer | 是 | 9 | 按手机本地时区；0～23 |
| 推送时间（分） | reminder_minute | INTEGER → integer | 是 | 0 | 按手机本地时区；0～59 |
| AI 隐私同意时间 | privacy_consent_at | TEXT → timestamptz | 否 | NULL | 2026-10-25 新增；首次 AI 生成前同意后写入，非空即不再弹提示。**本机专属，不同步** |
| 更新时间 | updated_at | TEXT → timestamptz | 是 | 当前时间 | 本机任意字段写入都会推进（含本机专属字段） |
| 同步更新时间 | sync_updated_at | TEXT（仅本机，不上云） | 是 | 当前时间 | 2026-10-25 新增；**只有可同步字段被用户修改时才推进**，推送时作为云端的 `updated_at`。否则启动时写 `notification_permission` 会把云端设置冲掉 |

> 不同步的列：`notification_permission`（系统权限，按设备）、`privacy_consent_at`（本机已同意过）。其余列均同步，云表 `user_settings` 只存这些可同步列。

### 3.5 history（心意记录）

| 中文字段 | 英文列名 | 类型（SQLite → Supabase） | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- | --- |
| id | id | TEXT → uuid | 是 | 应用生成 UUID | 主键 |
| 对象 id | person_id | TEXT → uuid | 创建时必填 | — | 外键 → person.id；关联到对象的节日提醒也记在对应对象名下；通用节日提醒不进入历史 |
| 日子名称 | name | TEXT → text | 是 | — | 如「2026 年妈妈生日」，系统按固定规则生成 |
| 日期 | date | TEXT → date | 是 | — | 该日子的发生日期 |
| 状态 | status | TEXT → text | 是 | 未送 | 三态：未送 / 已送 / 已过期。2026-10-25 变更：库内只持久化「未送 / 已送」两种用户意图；「已过期」在读取时按「日期已过且仍未送」派生，不再回写（避免自动状态与用户手动标记互相覆盖，也避免每次同步都改动数据） |
| 创建时间 | created_at | TEXT → timestamptz | 是 | 当前时间 | 审计字段（plan 未显式列出，按功能补充） |
| 更新时间 | updated_at | TEXT → timestamptz | 是 | 当前时间 | 审计字段（plan 未显式列出，按功能补充） |

### 3.6 festivals（通用节日，内置只读）

| 中文字段 | 英文列名 | 类型（SQLite → Supabase） | 必填 | 说明 |
| --- | --- | --- | --- | --- |
| 节日代码 | code | TEXT → text | 是 | 主键（建议编码见下表） |
| 名称 | name | TEXT → text | 是 | 元旦、春节、元宵节、情人节、妇女节、母亲节、父亲节、端午节、七夕、中秋节、重阳节、圣诞节 |
| 类型 | type | TEXT → text | 是 | 取值：指向性节日 / 通用节日 |
| 匹配关系关键词 | match_keywords | TEXT → text | 否 | 指向性节日用于关系字段关键词匹配；通用节日为 NULL |
| 计算规则 | calculation_rule | TEXT → text | 是 | 日期表之外的兜底规则（如母亲节为 5 月第二个周日） |

内置 12 行（2026-10-23 由 8 个扩为 12 个）：

| 名称 | 建议 code | 类型 | 匹配关系关键词（依据 spec） | 计算规则 |
| --- | --- | --- | --- | --- |
| 元旦 | new_year | 通用节日 | NULL | 公历 1 月 1 日 |
| 春节 | spring_festival | 通用节日 | NULL | 农历正月初一对应公历日期，以内置日期表为准 |
| 元宵节 | lantern_festival | 通用节日 | NULL | 农历正月十五对应公历日期，以内置日期表为准 |
| 情人节 | valentines_day | 指向性节日 | 伴侣 | 公历 2 月 14 日 |
| 妇女节 | womens_day | 指向性节日 | 女性家人 | 公历 3 月 8 日 |
| 母亲节 | mothers_day | 指向性节日 | 母亲/妈妈 | 5 月第二个周日 |
| 父亲节 | fathers_day | 指向性节日 | 父亲/爸爸 | 6 月第三个周日 |
| 端午节 | dragon_boat | 通用节日 | NULL | 农历五月初五对应公历日期，以内置日期表为准 |
| 七夕 | qixi | 通用节日 | NULL | 农历七月初七对应公历日期，以内置日期表为准 |
| 中秋节 | mid_autumn | 通用节日 | NULL | 农历八月十五对应公历日期，以内置日期表为准 |
| 重阳节 | double_ninth | 通用节日 | NULL | 农历九月初九对应公历日期，以内置日期表为准 |
| 圣诞节 | christmas | 通用节日 | NULL | 公历 12 月 25 日 |

> 关键词的具体词表（如「女性家人」「伴侣」展开为哪些词）在实现阶段确定，节日类型与 spec 的对应关系不得改变。

### 3.7 festival_dates（节日日期表，内置只读）

对应 spec「内置未来 10 年的节日日期表」。

| 中文字段 | 英文列名 | 类型（SQLite → Supabase） | 必填 | 说明 |
| --- | --- | --- | --- | --- |
| 节日代码 | festival_code | TEXT → text | 是 | 外键 → festivals.code |
| 年份 | year | INTEGER → integer | 是 | 未来 10 年逐年展开 |
| 日期 | date | TEXT → date | 是 | 该节日在该年的公历日期 |

复合主键：（节日代码, 年份）。共 12 × 10 = 120 行。

### 3.8 auth_cache（本机账号缓存）

对应 plan 4.7「本机只缓存登录状态与用于展示的账号信息」。建议物理载体为 `expo-secure-store` / AsyncStorage；如放 SQLite 则按下表。

| 中文字段 | 英文列名 | 类型（SQLite → Supabase） | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- | --- |
| id | id | TEXT(固定 `'current'`) → text | 是 | `'current'` | 单行主键 |
| 用户 id | user_id | TEXT → uuid | 是 | — | Supabase 用户 id（来源 `auth.users.id`） |
| 登录方式 | provider | TEXT → text | 是 | — | 取值：phone / email / wechat / apple |
| 账号显示 | display_name | TEXT → text | 是 | — | 手机号/邮箱掩码或第三方昵称，供设置页展示 |
| 登录时间 | logged_in_at | TEXT → timestamptz | 是 | 当前时间 | |

> 登录令牌（access/refresh token）**不入此表**：由 supabase-js 的 storage adapter 保管（建议 expo-secure-store）。Supabase 侧账号由系统表 `auth.users`、`auth.identities` 承载，本项目不自建账号表。

### 3.9 prepare（心意准备，2026-10-25 新增）

对应 plan 4.8 的变更与 tasks.md M7-07 / M9-05：祝福语持久化保留，贺卡页按 `prepareId` 引用同一份内容。

> 入口（2026-10-25 调整）：联系人场景的祝福语与礼物建议内联在**对象页**，节日场景在**节日准备页**；两者的生成结果都写在本表（`scene` 区分 `contact` / `holiday`）。

| 中文字段 | 英文列名 | 类型（SQLite → Supabase） | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- | --- |
| id | id | TEXT → uuid | 是 | 应用生成 UUID | 主键 |
| 场景 | scene | TEXT → text | 是 | — | `contact` 联系人 / `holiday` 节日 |
| 收件人 | person_id | TEXT → uuid | 否 | NULL | 外键 → person.id；节日「不指定收件人」时为空 |
| 节日代码 | festival_code | TEXT → text | 否 | NULL | 外键 → festivals.code；联系人场景为空 |
| 祝福列表 | blessings | TEXT → jsonb | 是 | `'[]'` | JSON 字符串数组，含用户手动编辑后的文字 |
| 选中下标 | selected_index | INTEGER → （不上云） | 是 | 0 | 贺卡当前选中的祝福下标；纯 UI 状态，跨设备同步会跳变，故只存本机 |
| 背景图 URL | background_url | TEXT → （不上云） | 否 | NULL | AI 生成的贺卡背景图临时地址；会过期，只存本机作离线缓存；失败时为空，走降级 |
| 背景图路径 | background_path | TEXT → text | 否 | NULL | 2026-10-25 新增：Storage 相对路径 `\<uid\>/\<prepareId\>.jpg`（私有桶 `card-backgrounds`）；**随账号同步**，重装/换机后据此换签名 URL 取回原图 |
| 创建时间 | created_at | TEXT → timestamptz | 是 | 当前时间 | |
| 更新时间 | updated_at | TEXT → timestamptz | 是 | 当前时间 | 取最近一条时按此排序；只有祝福内容或背景图路径变化才推进 |

> 不建唯一索引：`person_id`、`festival_code` 可空，SQLite 唯一索引对 NULL 不去重。按「场景 + 收件人 + 节日」取 `updated_at` 最新一条展示；重新生成即覆盖更新该条。
> 云端表名为 `prepare_record`（避开 PostgreSQL 关键字 `prepare`），云端建 `unique nulls not distinct (user_id, scene, person_id, festival_code)` 收敛多设备重复生成。

### 3.9.1 gift_suggestion（礼物建议，2026-10-25 新增）

每个「场景 + 收件人 + 节日」保留最近一批 4 条建议（与 spec 功能 7 的固定条数一致），随账号同步。

| 中文字段 | 英文列名 | 类型（SQLite → Supabase） | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- | --- |
| id | id | TEXT → text | 是 | 确定性字符串 | 主键：`gift\|scene\|personId\|festivalCode\|序号`。重新生成时原地覆盖同样的几行，不产生新 id 与墓碑，多设备并发按槽位 LWW |
| 收件人 | person_id | TEXT → uuid | 否 | NULL | 外键 → person.id；节日「不指定收件人」时为空；对象彻底删除时级联删除 |
| 场景 | scene | TEXT → text | 是 | — | `contact` / `holiday`，与 prepare 一致 |
| 节日代码 | festival_code | TEXT → text | 否 | NULL | 联系人场景为空 |
| 名称 | name | TEXT → text | 是 | — | 礼物名称 |
| 推荐理由 | reason | TEXT → text | 是 | `''` | 一句话说明为什么适合对方 |
| 搜索关键词 | keyword | TEXT → text | 是 | `''` | 电商平台跳转用 |
| 展示顺序 | sort_order | INTEGER → integer | 是 | 0 | 0～3 |
| 创建时间 | created_at | TEXT → timestamptz | 是 | 当前时间 | |
| 更新时间 | updated_at | TEXT → timestamptz | 是 | 当前时间 | 同步 LWW 时间戳 |

> 云端表同名 `gift_suggestion`，复合外键 `(user_id, person_id) → person(user_id, id) on delete cascade`，删除时由触发器写 `gift` 墓碑。

### 3.10 sync_meta（同步元数据，纯本机，单行）

| 中文字段 | 英文列名 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- | --- |
| id | id | TEXT(固定 `'default'`) | 是 | `'default'` | 单行主键 |
| 设备标识 | device_id | TEXT | 是 | 首次建库生成 UUID | 推送时写入 `origin_device_id`，用于识别「自己的写入」，避免实时事件回环 |
| 首次同步状态 | bootstrap_state | TEXT | 是 | `unbound` | `unbound` 未开始 / `bootstrapping` 进行中 / `ready` 就绪 / `blocked` 等待用户确认冲突 |
| 上次同步时间 | last_sync_at | TEXT | 否 | NULL | 最近一次完整同步（push+pull）成功的时间 |
| 旧库已迁入 | legacy_adopted | INTEGER | 是 | 0 | 旧单库 `xinyi_butler` 是否已并入当前账号库（0/1） |
| 设置已编辑 | settings_edited | INTEGER | 是 | 0 | 本机是否改过可同步设置（0/1）。为 0（全新安装/重装）时云端设置无条件覆盖本机默认值，避免默认值的新时间戳挡住云端真实设置 |
| 最近错误 | last_error | TEXT | 否 | NULL | 供「设置 - 云同步」页展示可读错误 |

### 3.11 sync_outbox（待推送队列，纯本机）

| 中文字段 | 英文列名 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- | --- |
| 序号 | seq | INTEGER PRIMARY KEY AUTOINCREMENT | 是 | 推送后按**精确序号**回执删除（不能按 table+row 删，否则会丢掉网络期间新产生的脏项） |
| 表名 | table_name | TEXT | 是 | `person` / `anniversary` / `trait` / `history` / `prepare` / `gift` / `settings` |
| 行 id | row_id | TEXT | 是 | 业务行主键；settings 固定 `'default'` |
| 入队时间 | created_at | TEXT | 是 | 默认当前时间 |

> 唯一约束 `(table_name, row_id)`：同一行多次写入只保留一条。**不存操作类型**——推送时读本地当前行，存在即 upsert、不存在即 delete，这样「新建后立刻删除」不会在云端留下残影。

### 3.12 sync_tombstone（墓碑镜像，纯本机）

| 中文字段 | 英文列名 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- | --- |
| 表名 | table_name | TEXT | 是 | 与 outbox 同值为 `person` / `anniversary` / `trait` / `history` / `prepare` / `gift` |
| 行 id | row_id | TEXT | 是 | 被彻底删除的行 |
| 删除时间 | deleted_at | TEXT | 是 | 云端墓碑的 `deleted_at` |

> 主键 `(table_name, row_id)`。永久保留（只有 id 与时间，体积很小）：一旦清理，离线设备上延迟到达的旧数据就会把已彻底删除的行写回来。

### 3.13 sync_dead_letter（推送死信，纯本机）

永久性推送失败（数据非法、外键缺失等重试也没用的错误）的行落在这里，避免「要么卡住队列、要么静默丢数据」。

| 中文字段 | 英文列名 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- | --- |
| 序号 | seq | INTEGER PRIMARY KEY AUTOINCREMENT | 是 | 自增 |
| 表名 | table_name | TEXT | 是 | 与 outbox 同值 |
| 行 id | row_id | TEXT | 是 | 推送失败的行 |
| 错误 | error | TEXT | 是 | 服务端返回的可读错误（最多 500 字） |
| 记录时间 | created_at | TEXT | 是 | 默认当前时间 |

> 唯一约束 `(table_name, row_id)`；同步页展示条数，供排查。

---

## 四、表与表的关系

| 关系 | 基数 | 外键 | 删除策略 |
| --- | --- | --- | --- |
| person → anniversary | 一对多（多对一反向） | anniversary.对象 id → person.id | 对象超期彻底清除时级联删除（CASCADE） |
| person → trait | 一对多（多对一反向） | trait.对象 id → person.id | 同上，级联删除（CASCADE） |
| person → history | 一对多（多对一反向） | history.对象 id → person.id | 对象彻底清除时置空（SET NULL），**记录本身永久保留** |
| person → prepare | 一对多（多对一反向） | prepare.person_id → person.id | 对象彻底清除时置空（SET NULL），准备记录保留 |
| person → gift_suggestion | 一对多（多对一反向） | gift_suggestion.person_id → person.id | 对象彻底清除时级联删除（CASCADE） |
| festivals → prepare | 一对多（多对一反向） | prepare.festival_code → festivals.code | 内置只读，不删除 |
| festivals → festival_dates | 一对多（多对一反向） | festival_dates.节日代码 → festivals.code | 内置只读，不删除 |
| auth.users → person / anniversary / trait / history / prepare_record / gift_suggestion / user_settings / sync_tombstone（云端） | 一对多 | 各表 `user_id` | `on delete cascade`：注销账号即清空该账号全部云端数据 |
| 云端 person → 子表（同用户内） | 一对多 | 复合外键 `(user_id, person_id) → person (user_id, id)` | 与本地行为一致，并顺带防止跨用户引用：anniversary / trait 级联，history / prepare_record 置空 `person_id` |

说明：
- 软删除（deleted_at 非空）期间，anniversary、trait、history 数据全部保留，恢复对象后完整可见。
- history 在对象被彻底清除后，靠「日子名称」（如「2026 年妈妈生日」）仍可正常浏览，满足 spec「记录永久保留」。此处理为建议方案，小康可否决。
- 本地 `PRAGMA foreign_keys = ON`，云端用真外键：两边级联/置空行为一致，因此「彻底删除一个对象」在本地和云端都只需删 `person` 这一行，子表与墓碑由数据库自动完成。

---

## 五、关键索引

| 索引名 | 所在表 | 字段 | 用途 |
| --- | --- | --- | --- |
| idx_person_deleted_at | person | 删除时间 | 首页只列未删除对象、回收站筛选、超期 30 天清理 |
| idx_anniversary_person_id | anniversary | 对象 id | 按对象查询全部纪念日 |
| idx_trait_person_id | trait | 对象 id | 按对象查询特征 |
| idx_history_person_id | history | 对象 id | 按对象查历史 |
| idx_history_date | history | 日期 | 心意记录页按时间排列 |
| idx_history_status | history | 状态 | 三态筛选 |
| uq_history_person_name | history | （对象 id, 日子名称） | **唯一索引**：保证同一对象的同一日子只有一条记录，多次推送不重复产生 |
| idx_prepare_lookup | prepare | （场景, 对象 id, 节日代码, 更新时间） | 按对象 / 节日取最近一条祝福缓存 |
| idx_gift_lookup | gift_suggestion | （场景, 对象 id, 节日代码, 展示顺序） | 按对象 / 节日取最近一批礼物建议 |
| idx_festival_dates_date | festival_dates | 日期 | 按日期查临近节日 |
| （主键） | festival_dates | （节日代码, 年份） | 复合主键，防日期表重复 |
| （主键） | settings | id | 单行约束 |
| （唯一） | sync_outbox | （table_name, row_id） | 同一行多次写入合并为一条 |
| （主键） | sync_tombstone | （table_name, row_id） | 墓碑幂等 |

云端额外索引（2026-10-25 新增，见第九节）：各表 `(user_id)`、`(user_id, updated_at)`；`person` 的 `unique (user_id, id)` 供子表复合外键引用；`history` 的 `unique (user_id, person_id, name) nulls not distinct`；`prepare_record` 的 `unique (user_id, scene, person_id, festival_code) nulls not distinct`。
person 列表可改为部分索引 `CREATE INDEX idx_person_active ON person (updated_at) WHERE deleted_at IS NULL;`

---

## 六、业务约束的落地方式

| spec 规则 | 落地方式 |
| --- | --- |
| 关系自由输入 | 不加枚举、不加外键，仅 `text` |
| 无日期对象 | person.生日可空；anniversary 允许 0 行 |
| 特征每对象最多 10 条 | 应用层校验为主；可选数据层触发器（INSERT 前按 person_id 计数） |
| 特征每条最多 50 字 | 应用层校验 + SQLite/Postgres 的 `length(内容) <= 50` CHECK |
| 提前提醒天数 0～30、默认 3 | CHECK（提前提醒天数 BETWEEN 0 AND 30），默认 3 |
| 祝福文案数量 1～5、默认 3 | CHECK（祝福文案数量 BETWEEN 1 AND 5），默认 3 |
| 电商平台淘宝/京东、默认淘宝 | CHECK（电商平台 IN ('淘宝','京东')），默认 '淘宝' |
| 历史三态 | CHECK（状态 IN ('未送','已送','已过期')），默认 '未送'；库内只写「未送/已送」，「已过期」由 `withDerivedStatus()` 在读时按「日期已过且未送」派生 |
| 一日子一记录 | uq_history_person_name 唯一索引 |
| 回收站 30 天 | 删除时间 + 定时清理任务（超期彻底清除并级联） |
| 通用节日不进历史 | 应用层逻辑：通用节日不写 history，无需特殊表结构 |
| 祝福退出重进保留 | prepare 表按（场景, 收件人, 节日）取 `updated_at` 最近一条展示；重新生成即覆盖更新 |
| 礼物建议重装后仍在 | gift_suggestion 按确定性 id 原地覆盖最近一批，并纳入云同步 |
| 礼物 / 贺卡区域开关 | settings.gift_enabled / card_enabled 默认 1；关闭后准备页不渲染对应区域，也不发起请求 |
| 首次 AI 隐私同意 | settings.privacy_consent_at 非空视为已同意，之后不再弹提示；未同意不发起生成 |
| 换机/重装数据不丢 | 登录后按账号双向同步；本机库文件名 `xinyi_butler_<user_id>`，同机换账号互不干扰 |
| 冲突以最新为准 | 各业务行比较 `updated_at`（统一转毫秒比较），较新者胜；settings 用 `sync_updated_at` |
| 彻底删除是终态 | 云端 `AFTER DELETE` 写 `sync_tombstone`；客户端收到墓碑即本地硬删并记忆，此后拒绝任何旧数据写回 |

---

## 七、Supabase 接入现状（2026-10-25 已落地）

1. **类型已按 Postgres 设计**：uuid / text / timestamptz / jsonb / boolean，云端表由迁移建立，列名与本地一一对应（仅 `prepare → prepare_record` 改了表名）。迁移共三个，均已于 2026-10-25 `db push` 到远端：
   - `20261025120000_sync_schema.sql`：6 张业务/同步表、触发器、RLS、Realtime publication
   - `20261025130000_card_backgrounds.sql`：`prepare_record.background_path` + Storage 桶 `card-backgrounds` 与四条 owner policy
   - `20261025140000_gift_suggestions.sql`：`gift_suggestion` 表、墓碑表名补 `gift`、触发器、RLS、publication
2. **`user_id` 云端必填**：默认 `auth.uid()`，外键 `REFERENCES auth.users(id) ON DELETE CASCADE`；RLS 策略 `USING (user_id = (select auth.uid())) WITH CHECK (user_id = (select auth.uid()))`，客户端无法读写别人的行。
3. **审计字段**：`created_at` 默认 `now()`；`updated_at` **由客户端提供，服务端不覆盖**（只把「超过 now()+5 分钟」的时钟钳回），否则「最新生效」会退化成「最后到达者生效」。`server_received_at` 由触发器写服务端接收时间，便于排查。
4. **软删除模式**与云数据库通用，`deleted_at` 方案无需改造。
5. **迁移路径**：读写仍全部经 Repository；同步层（`src/sync/`）在 Repository 事务内顺手写 outbox，网络与冲突处理完全独立于 UI。
6. **节日表仍随包**：12 个节日与未来 10 年日期表继续以静态资源打包，尚未上云。
7. **账号关联**：`auth.users.id` 与各表 `user_id` 同型（uuid），注销账号即级联清空云端数据。
8. RLS 与远程业务表 **已启用并推送至远端**（`supabase migration list --linked` 两侧时间戳一致；匿名 REST 访问业务表返回空数组，说明 RLS 生效）；spec「以后再做」原第 10 条（多设备同步）已提前到第一版实现。

---

## 八、与 spec/plan 的对齐自查

- 表名 person、anniversary、trait、settings、history 与 plan 完全一致；中文字段名与 plan 4.1～4.5 逐字一致，未改写。2026-10-25 新增 prepare 表用于祝福持久化（对应 plan 4.8 变更与 tasks M7-07）。
- 关键数字一致：回收站 30 天、特征最多 10 条每条 50 字、提前提醒天数 0～30 默认 3、祝福文案数量 1～5 默认 3、电商平台淘宝（默认）/京东、礼物建议固定 4 条、12 个节日、未来 10 年日期表。
- 账号承载数据：云端业务表通过 `user_id` 归属账号并受 RLS 保护；本机按账号分库文件；令牌不进业务库。
- 未新增 spec 之外的功能；所有「建议」命名与补充字段均已显式标注，最终由小康拍板。
- 2026-10-25：云同步（spec 功能 11「数据同步」）落地，本文件新增 3.10～3.12 三张纯本机表与第九节设计说明。

---

## 九、云同步设计（2026-10-25）

### 9.1 总体形态

- **实时双向同步**：本地写入在同一事务里落库并入 outbox；登录后由 `src/sync/syncEngine.ts` 串行推送，远端变更通过 Supabase Realtime 触发一次全量拉取。
- **全量拉取而非增量游标**：个人应用数据量小（百行级），分页每页 1000 行足够；后续数据量上来再加 `sync_seq` 游标。
- **Realtime 只当失效通知**：收到任何 INSERT/UPDATE 事件就重新按 id 拉整行（规避 TOAST 大字段不全、payload 形态差异）。

### 9.2 云端表一览

| 表 | 关键约束 | 说明 |
| --- | --- | --- |
| person | `unique (user_id, id)` | 供子表复合外键引用；`deleted_at` 软删除 |
| anniversary | 复合外键 `(user_id, person_id)`，`on delete cascade` | `date` 为 `MM-DD` 文本（不能用 PG `date`） |
| trait | 同上 | `content` CHECK ≤50 字 |
| history | 同上，`on delete set null (person_id)` | `unique (user_id, person_id, name) nulls not distinct` |
| prepare_record | 同上，`on delete set null (person_id)` | `unique (user_id, scene, person_id, festival_code) nulls not distinct`；多 `background_path` |
| gift_suggestion | 同上，`on delete cascade (person_id)` | id 为确定性文本 `gift\|scene\|personId\|festivalCode\|序号`；换机重建时原地覆盖 |
| user_settings | 主键 `user_id` | 只存可同步列，无 `notification_permission` / `privacy_consent_at` |
| sync_tombstone | 主键 `(user_id, table_name, row_id)` | 客户端只读；写入仅由 `SECURITY DEFINER` 触发器完成 |

业务表统一追加 `user_id`、`origin_device_id`、`server_received_at`；`tombstone.table_name` 取值为 `person / anniversary / trait / history / prepare / gift`。

贺卡背景图原图存私有 Storage 桶 `card-backgrounds`，对象路径 `<uid>/<prepareId>.jpg`，policy 限定首段等于 `auth.uid()`；云表只存 `background_path` 文本，客户端用 `createSignedUrl` 取回（7 天有效）。

### 9.3 为什么用墓碑表而不是 Realtime DELETE

`@supabase/realtime-js` 文档明确：RLS 不作用于 DELETE 事件；开启 RLS 后 DELETE payload 只带主键，`user_id` 不在其中，无法按用户过滤，还可能收到别人的删除通知。因此：

- 业务行物理 DELETE，由 `AFTER DELETE` 触发器写 `sync_tombstone`；
- 客户端只订阅业务表的 INSERT/UPDATE + 墓碑表的 INSERT；
- 级联删除（删 person 带走 anniversary/trait/gift_suggestion）同样会触发行触发器，子表墓碑自动补齐；本机硬删时由 `writeLocalTombstones` 同步补写本机墓碑，防止未推送前的 pull 把对象拉回来。

### 9.4 删除矩阵

| 操作 | 同步表示 | 冲突规则 |
| --- | --- | --- |
| 软删除 / 恢复 | `person.deleted_at` 更新 | LWW，可被更晚的恢复覆盖 |
| 彻底删除 / 回收站超期 | 云端 DELETE → 墓碑 | **终态，永远优先**，不比时间 |
| 注销账号 | `auth.users` 级联删除 | 云端全清；本机账号库删除 |

### 9.5 冲突与时间

- 统一把时间转毫秒比较（Postgres 返回 `+00:00`、本地写 `Z`，字符串比较会判错）。
- 本地更新更晚 → 保留本地，继续等推送；云端更晚 → 覆盖本地。
- 时间相同且本地仍有待推送改动 → 保留本地，避免无意义覆盖。
- 服务端把 `updated_at` 钳到 `now() + 5 分钟` 以内，防止单机时钟错乱永久压制其他设备。

### 9.6 首次同步（bootstrap）三态

| 情况 | 处理 |
| --- | --- |
| 云端空、本机有数据 | 本机全部入队 → 推送 → 标记 ready |
| 云端有数据、本机为空（重装/换机） | 先拉取云端，再决定是否上传本机数据 |
| 两边都有数据 | 提示「本机 N 条 / 云端 M 条」，按「稍后 / 合并」让用户决定，不静默合并；选「合并」时改为 **pull → 有条件 uploadAll → push → pull**，而非直接本地覆盖云端 |

「本机为空」按全部同步业务表（person / anniversary / trait / history / prepare / gift）与 user_settings 的行数合计判定。设置项是否上传不看 outbox（推送成功后 outbox 同样是空的），改看持久标记 `sync_meta.settings_edited`：为 0 表示用户从未改过设置，云端无条件覆盖本机默认值，不比时间。

### 9.7 本地库与账号

- 库文件名 `xinyi_butler_<user_id>`，每个账号一份；旧单库 `xinyi_butler` 仅在「当前账号云端为空且本机库为空」时并入一次（`sync_meta.legacy_adopted=1`），避免把数据塞错账号。
- `DatabaseGate` 位于 `AuthProvider` 与 `SettingsProvider` 之间：库未按当前账号打开前不渲染任何读库页面。
- 账号切换时取消全部已排期通知（通知属系统级，不随库走），拉回数据后去抖重排。

### 9.8 已知限制

- trait「每对象最多 10 条」是跨行约束，两端离线各加可能超限，第一版接受。
- 墓碑永久保留（只增不删）。
- LWW 依赖设备时间，仍接受小概率判错。
- `selected_index` / `background_url` 不同步：跨设备打开贺卡从第 0 条开始；背景图原图随 `background_path` 同步，本机 URL 只是签名缓存，过期后重新签名。
- 贺卡切祝福、切背景不再推进 `prepare.updated_at`（只有祝福文字或背景路径变化才推进），避免把云端的较新祝福顶掉。
- Supabase 免费项目长期不活跃会被暂停，期间同步不可用（数据仍在）。
