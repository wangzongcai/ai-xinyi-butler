# AI 心意管家 — 第一版数据模型

> 依据：spec.md、plan.md
> 第一版物理存储：expo-sqlite（本机）；Supabase 仅启用 Auth。
> 本模型同时按 Supabase（PostgreSQL）的形态设计，保证未来数据上云时模型不变、只换存储实现。

---

## 一、命名与类型约定

1. **中文字段名与 plan.md「四、数据设计」逐字一致**；「英文列名」是为 Supabase（PostgreSQL）准备的建议映射，开发前可由小康最终确认。
2. 主键第一版在 SQLite 中以 `TEXT` 存 UUID 字符串；在 Supabase 中用 `uuid`（`gen_random_uuid()` 生成）。
3. 日期统一存 `YYYY-MM-DD`；带时间的字段存 ISO 8601，Supabase 中用 `timestamptz`。
4. 「下一次发生日期」**不入库**，由日期计算工具按 spec 规则（今年已过则指向明年同一天）在运行时算出。
5. AI 生成的祝福文案、礼物建议不入库；贺卡 PNG 保存到系统相册，库内不留副本（plan 4.8）。

---

## 二、表总览

| 表名 | 中文名 | 形态 | 说明 |
| --- | --- | --- | --- |
| person | 心意对象 | SQLite 业务表 | 对应 plan 4.1 |
| anniversary | 纪念日 | SQLite 业务表 | 对应 plan 4.2 |
| trait | 特征 | SQLite 业务表 | 对应 plan 4.3 |
| settings | 设置 | SQLite 单行表 | 对应 plan 4.4 |
| history | 心意记录 | SQLite 业务表 | 对应 plan 4.5 |
| festivals | 通用节日 | 内置只读数据（建议表） | 对应 plan 4.6，8 个节日 |
| festival_dates | 节日日期表 | 内置只读数据（建议表） | 对应 plan 4.6，未来 10 年 |
| auth_cache | 本机账号缓存 | 本机轻量缓存（建议表） | 对应 plan 4.7 |

> `festivals`、`festival_dates`、`auth_cache` 在 plan 中未给英文表名，此处为建议命名，待小康拍板；其中节日数据第一版随 App 以静态资源（JSON/TS）打包，不建用户可写表。

---

## 三、表结构

### 3.1 person（心意对象）

| 中文字段 | 英文列名 | 类型（SQLite → Supabase） | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- | --- |
| id | id | TEXT → uuid | 是 | 应用生成 UUID | 主键 |
| 姓名 | name | TEXT → text | 是 | — | |
| 关系 | relationship | TEXT → text | 是 | — | 用户自由输入，不限预设选项（如家人、挚友、重要客户） |
| 生日 | birthday | TEXT → date | 否 | NULL | 可为空；允许创建不含任何日期的对象 |
| 删除时间 | deleted_at | TEXT → timestamptz | 否 | NULL | 软删除标记：进回收站保留 30 天可恢复，超期彻底清除 |
| 创建时间 | created_at | TEXT → timestamptz | 是 | 当前时间 | 审计字段 |
| 更新时间 | updated_at | TEXT → timestamptz | 是 | 当前时间 | 审计字段 |
| —（预留列） | user_id | TEXT → uuid | 否 | NULL | **第一版始终为 NULL**，未来外键关联 `auth.users`，为多设备同步预留 |

### 3.2 anniversary（纪念日）

| 中文字段 | 英文列名 | 类型（SQLite → Supabase） | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- | --- |
| id | id | TEXT → uuid | 是 | 应用生成 UUID | 主键 |
| 对象 id | person_id | TEXT → uuid | 是 | — | 外键 → person.id |
| 名称 | name | TEXT → text | 是 | — | 用户自定义（如「结婚纪念日」「相识五周年」） |
| 日期 | date | TEXT → date | 是 | — | |
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
| 更新时间 | updated_at | TEXT → timestamptz | 是 | 当前时间 | |

### 3.5 history（心意记录）

| 中文字段 | 英文列名 | 类型（SQLite → Supabase） | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- | --- |
| id | id | TEXT → uuid | 是 | 应用生成 UUID | 主键 |
| 对象 id | person_id | TEXT → uuid | 创建时必填 | — | 外键 → person.id；关联到对象的节日提醒也记在对应对象名下；通用节日提醒不进入历史 |
| 日子名称 | name | TEXT → text | 是 | — | 如「2026 年妈妈生日」，系统按固定规则生成 |
| 日期 | date | TEXT → date | 是 | — | 该日子的发生日期 |
| 状态 | status | TEXT → text | 是 | 未送 | 三态：未送 / 已送 / 已过期（日子过去且未标记的由系统自动置为已过期） |
| 创建时间 | created_at | TEXT → timestamptz | 是 | 当前时间 | 审计字段（plan 未显式列出，按功能补充） |
| 更新时间 | updated_at | TEXT → timestamptz | 是 | 当前时间 | 审计字段（plan 未显式列出，按功能补充） |

### 3.6 festivals（通用节日，内置只读）

| 中文字段 | 英文列名 | 类型（SQLite → Supabase） | 必填 | 说明 |
| --- | --- | --- | --- | --- |
| 节日代码 | code | TEXT → text | 是 | 主键（建议编码见下表） |
| 名称 | name | TEXT → text | 是 | 元旦、春节、情人节、妇女节、母亲节、父亲节、中秋节、圣诞节 |
| 类型 | type | TEXT → text | 是 | 取值：指向性节日 / 通用节日 |
| 匹配关系关键词 | match_keywords | TEXT → text | 否 | 指向性节日用于关系字段关键词匹配；通用节日为 NULL |
| 计算规则 | calculation_rule | TEXT → text | 是 | 日期表之外的兜底规则（如母亲节为 5 月第二个周日） |

内置 8 行：

| 名称 | 建议 code | 类型 | 匹配关系关键词（依据 spec） | 计算规则 |
| --- | --- | --- | --- | --- |
| 元旦 | new_year | 通用节日 | NULL | 公历 1 月 1 日 |
| 春节 | spring_festival | 通用节日 | NULL | 农历正月初一对应公历日期，以内置日期表为准 |
| 情人节 | valentines_day | 指向性节日 | 伴侣 | 公历 2 月 14 日 |
| 妇女节 | womens_day | 指向性节日 | 女性家人 | 公历 3 月 8 日 |
| 母亲节 | mothers_day | 指向性节日 | 母亲/妈妈 | 5 月第二个周日 |
| 父亲节 | fathers_day | 指向性节日 | 父亲/爸爸 | 6 月第三个周日 |
| 中秋节 | mid_autumn | 通用节日 | NULL | 农历八月十五对应公历日期，以内置日期表为准 |
| 圣诞节 | christmas | 通用节日 | NULL | 公历 12 月 25 日 |

> 关键词的具体词表（如「女性家人」「伴侣」展开为哪些词）在实现阶段确定，节日类型与 spec 的对应关系不得改变。

### 3.7 festival_dates（节日日期表，内置只读）

对应 spec「内置未来 10 年的节日日期表」。

| 中文字段 | 英文列名 | 类型（SQLite → Supabase） | 必填 | 说明 |
| --- | --- | --- | --- | --- |
| 节日代码 | festival_code | TEXT → text | 是 | 外键 → festivals.code |
| 年份 | year | INTEGER → integer | 是 | 未来 10 年逐年展开 |
| 日期 | date | TEXT → date | 是 | 该节日在该年的公历日期 |

复合主键：（节日代码, 年份）。共 8 × 10 = 80 行。

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

---

## 四、表与表的关系

| 关系 | 基数 | 外键 | 删除策略 |
| --- | --- | --- | --- |
| person → anniversary | 一对多（多对一反向） | anniversary.对象 id → person.id | 对象超期彻底清除时级联删除（CASCADE） |
| person → trait | 一对多（多对一反向） | trait.对象 id → person.id | 同上，级联删除（CASCADE） |
| person → history | 一对多（多对一反向） | history.对象 id → person.id | 对象彻底清除时置空（SET NULL），**记录本身永久保留** |
| festivals → festival_dates | 一对多（多对一反向） | festival_dates.节日代码 → festivals.code | 内置只读，不删除 |
| auth.users → person（未来） | 一对多 | person.user_id（预留列） | 第一版不启用；未来外键 `auth.users.id` |

说明：
- 软删除（deleted_at 非空）期间，anniversary、trait、history 数据全部保留，恢复对象后完整可见。
- history 在对象被彻底清除后，靠「日子名称」（如「2026 年妈妈生日」）仍可正常浏览，满足 spec「记录永久保留」。此处理为建议方案，小康可否决。

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
| idx_festival_dates_date | festival_dates | 日期 | 按日期查临近节日 |
| （主键） | festival_dates | （节日代码, 年份） | 复合主键，防日期表重复 |
| （主键） | settings | id | 单行约束 |

Supabase/PostgreSQL 额外建议：person 列表可改为部分索引
`CREATE INDEX idx_person_active ON person (updated_at) WHERE deleted_at IS NULL;`

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
| 历史三态 | CHECK（状态 IN ('未送','已送','已过期')），默认 '未送'；「已过期」由系统在日子过去且未标记时自动更新 |
| 一日子一记录 | uq_history_person_name 唯一索引 |
| 回收站 30 天 | 删除时间 + 定时清理任务（超期彻底清除并级联） |
| 通用节日不进历史 | 应用层逻辑：通用节日不写 history，无需特殊表结构 |

---

## 七、为接入 Supabase 做的准备

1. **类型已按 Postgres 设计**：uuid / text / date / integer / timestamptz，SQLite 侧用等价写法，未来建表可直接平移。
2. **预留 `user_id` 列**（person 第一版恒为 NULL）。未来加数据同步时：
   - 补充外键 `user_id REFERENCES auth.users(id)`；
   - 所有业务行写入时填 `auth.uid()`；
   - 启用 RLS（行级安全），策略草案：`USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid())`。
3. **审计字段统一**：创建时间默认 `now()`；更新时间未来用 Postgres 触发器自动维护。
4. **软删除模式**与云数据库通用，deleted_at 方案无需改造。
5. **迁移路径**：第一版所有读写经 Repository 接口；接入时新增 Postgres 实现 + 一份本地导出/云端导入的一次性迁移即可，UI 不动（与 plan 1.3 一致）。
6. **节日表上云**：festivals、festival_dates 可直接作为公共只读表（对 anon 开放 SELECT），App 首次启动或每年拉取，替代随包静态资源。
7. **账号关联**：auth_cache.用户 id 已与 `auth.users.id` 同型（uuid），未来打通业务数据无需改字段。
8. 第一版不启用 RLS、不建远程业务表，避免引入 spec「以后再做」第 10 条的多设备同步。

---

## 八、与 spec/plan 的对齐自查

- 表名 person、anniversary、trait、settings、history 与 plan 完全一致；中文字段名与 plan 4.1～4.5 逐字一致，未改写。
- 关键数字一致：回收站 30 天、特征最多 10 条每条 50 字、提前提醒天数 0～30 默认 3、祝福文案数量 1～5 默认 3、电商平台淘宝（默认）/京东、8 个节日、未来 10 年日期表。
- 登录仅作身份：业务表第一版不关联账号，仅预留可空 user_id；令牌不进业务库。
- 未新增 spec 之外的功能；所有「建议」命名与补充字段均已显式标注，最终由小康拍板。
