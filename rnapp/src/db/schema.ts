// =====================================================================
// 数据库建表脚本（SQLite / expo-sqlite）
// 依据 data-model.md「三、表结构」。Metro 不支持 ?raw 查询后缀导入，
// 故将脚本内联为字符串常量，供 client.ts 整段执行。
// =====================================================================

export const SCHEMA_SQL = `-- =====================================================================
-- 心意管家 第一版 数据库建表脚本 (SQLite / expo-sqlite)
-- 依据 data-model.md「三、表结构」。中文字段名与业务注释保持逐字一致。
-- 说明：
--   * 主键一律 TEXT 存 UUID（应用侧生成，参考 data-model 一.2）。
--   * 生日/纪念日只存「月-日」('MM-DD')，每年重复；另用日历列区分公历/农历。
--     带时间字段存 ISO 8601（strftime 生成 UTC 时间）。history.date 例外，
--     它记录某次具体日子，仍存 'YYYY-MM-DD'。
--   * person 软删除（deleted_at 非空进回收站）；anniversary/trait 级联删除；
--     history 在 person 物理删除时 person_id 置空、记录永久保留。
--   * settings 为单行表（id 固定 'default'），预置默认行。
--   * 额外为贺卡署名、12 个节日关注状态各加一列（扩展 settings 承载，
--     见 settingsRepository 说明）。
-- =====================================================================

-- 心意对象 --------------------------------------------------------------
CREATE TABLE IF NOT EXISTS person (
  id TEXT PRIMARY KEY,
  -- 姓名
  name TEXT NOT NULL,
  -- 关系：用户自由输入，不限预设选项
  relationship TEXT NOT NULL,
  -- 生日：历史列。生日已并入纪念日，旧值启动时迁移成「生日」纪念日后清空，新数据不再写入
  birthday TEXT,
  -- 生日历法：历史列，仅迁移时使用
  birthday_calendar TEXT NOT NULL DEFAULT 'solar',
  -- 删除时间：软删除标记，进回收站保留 30 天可恢复，超期彻底清除
  deleted_at TEXT,
  -- 创建时间
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  -- 更新时间
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  -- 云端才使用：本机恒为 NULL（账号归属由「每个账号一个库文件」表达）
  user_id TEXT
);

CREATE INDEX IF NOT EXISTS idx_person_deleted_at ON person (deleted_at);

-- 纪念日 ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS anniversary (
  id TEXT PRIMARY KEY,
  -- 对象 id：外键，对象物理删除时级联删除
  person_id TEXT NOT NULL REFERENCES person (id) ON DELETE CASCADE,
  -- 名称：用户自定义（如「结婚纪念日」「相识五周年」）
  name TEXT NOT NULL,
  -- 日期：只记「月-日」(MM-DD)，每年重复
  date TEXT NOT NULL,
  -- 日期历法：solar 公历 / lunar 农历（第一版不支持闰月）
  calendar TEXT NOT NULL DEFAULT 'solar',
  -- 创建时间
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  -- 更新时间
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX IF NOT EXISTS idx_anniversary_person_id ON anniversary (person_id);

-- 特征 ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS trait (
  id TEXT PRIMARY KEY,
  -- 对象 id：外键，对象物理删除时级联删除
  person_id TEXT NOT NULL REFERENCES person (id) ON DELETE CASCADE,
  -- 内容：每条最多 50 字（数据层与应用层双重校验）
  content TEXT NOT NULL CHECK (length(content) <= 50),
  -- 创建时间
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  -- 更新时间
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX IF NOT EXISTS idx_trait_person_id ON trait (person_id);

-- 设置（单行表，id 固定 'default'）---------------------------------------
-- 物理列以 data-model 3.4 为准；另为承载贺卡署名开关与 12 个节日关注状态
-- 追加 card_signature、festival_followed 两列（决策见 settingsRepository 说明）。
CREATE TABLE IF NOT EXISTS settings (
  id TEXT PRIMARY KEY,
  -- 提前提醒天数：0~30，0 表示只在当天提醒；默认 3；全局生效
  advance_days INTEGER NOT NULL DEFAULT 3 CHECK (advance_days BETWEEN 0 AND 30),
  -- 祝福文案数量：1~5；默认 3
  blessing_count INTEGER NOT NULL DEFAULT 3 CHECK (blessing_count BETWEEN 1 AND 5),
  -- 电商平台：淘宝 / 京东；默认淘宝
  ecommerce_platform TEXT NOT NULL DEFAULT '淘宝' CHECK (ecommerce_platform IN ('淘宝','京东')),
  -- 通知权限状态：granted / denied / undetermined；可空
  notification_permission TEXT,
  -- 贺卡署名开关：0 关 / 1 开；默认 0（匿名）
  card_signature INTEGER NOT NULL DEFAULT 0 CHECK (card_signature IN (0, 1)),
  -- 12 个节日关注状态：存 JSON 对象字符串 { 'new_year': true, ... }；默认全部关注
  festival_followed TEXT NOT NULL DEFAULT '{}',
  -- 推送时间（按手机本地时区）：默认 09:00，可自定义
  reminder_hour INTEGER NOT NULL DEFAULT 9 CHECK (reminder_hour BETWEEN 0 AND 23),
  reminder_minute INTEGER NOT NULL DEFAULT 0 CHECK (reminder_minute BETWEEN 0 AND 59),
  -- 礼物区域全局开关：0 关 / 1 开；默认 1（开）。关闭后准备页隐藏礼物区且不请求
  gift_enabled INTEGER NOT NULL DEFAULT 1 CHECK (gift_enabled IN (0, 1)),
  -- 贺卡区域全局开关：0 关 / 1 开；默认 1（开）。关闭后准备页隐藏贺卡入口且不请求
  card_enabled INTEGER NOT NULL DEFAULT 1 CHECK (card_enabled IN (0, 1)),
  -- 贺卡署名文字：开启署名后可填，为空时回落账号信息或提示填写；可空
  signature_text TEXT,
  -- AI 隐私同意时间：首次 AI 生成前同意后写入，非空即不再弹提示
  privacy_consent_at TEXT,
  -- 更新时间（本地写入时间，含本机专属字段）
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  -- 仅本地：可同步字段最近一次被用户修改的时间，用作云端 LWW 时间戳。
  -- 只改通知权限/隐私同意等本机专属字段时不推进该列，避免把云端设置冲掉。
  sync_updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- 写入 settings 默认行（仅在不存在时插入，保证单行且幂等）
INSERT OR IGNORE INTO settings (id) VALUES ('default');

-- 心意记录（history）----------------------------------------------------
CREATE TABLE IF NOT EXISTS history (
  id TEXT PRIMARY KEY,
  -- 对象 id：外键，对象物理删除时置空保留记录；创建时业务必填
  person_id TEXT REFERENCES person (id) ON DELETE SET NULL,
  -- 日子名称：如「2026 年妈妈生日」，按系统规则生成
  name TEXT NOT NULL,
  -- 日期：该日子的发生日期
  date TEXT NOT NULL,
  -- 状态：未送 / 已送 / 已过期；默认未送
  status TEXT NOT NULL DEFAULT '未送' CHECK (status IN ('未送','已送','已过期')),
  -- 创建时间
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  -- 更新时间
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX IF NOT EXISTS idx_history_person_id ON history (person_id);
CREATE INDEX IF NOT EXISTS idx_history_date ON history (date);
CREATE INDEX IF NOT EXISTS idx_history_status ON history (status);
-- 唯一索引：同一对象的同一日子只有一条记录，重复推送不产生重复
CREATE UNIQUE INDEX IF NOT EXISTS uq_history_person_name ON history (person_id, name);

-- 心意准备（prepare，2026-10-25 新增）----------------------------------------
-- 持久化祝福语结果：退出准备页再进入展示上次结果；贺卡页按 prepareId 引用。
-- 依据 data-model 3.9。scene：contact 联系人 / holiday 节日。
-- 不建唯一索引（person_id/festival_code 可空，SQLite 唯一索引对 NULL 不去重）；
-- 按「场景 + 收件人 + 节日」取 updated_at 最新一条展示，重新生成即覆盖更新该条（由 Repository 负责）。
CREATE TABLE IF NOT EXISTS prepare (
  id TEXT PRIMARY KEY,
  -- 场景：contact 联系人 / holiday 节日
  scene TEXT NOT NULL CHECK (scene IN ('contact','holiday')),
  -- 收件人：外键，对象彻底清除时置空保留记录；节日「不指定收件人」时为空
  person_id TEXT REFERENCES person (id) ON DELETE SET NULL,
  -- 节日代码：联系人场景为空
  festival_code TEXT,
  -- 祝福列表：JSON 字符串数组，含用户手动编辑后的文字
  blessings TEXT NOT NULL DEFAULT '[]',
  -- 选中下标：贺卡当前选中的祝福下标
  selected_index INTEGER NOT NULL DEFAULT 0,
  -- 背景图 URL：AI 生成的贺卡背景图临时地址（本机缓存，可能过期，不同步）
  background_url TEXT,
  -- 背景图云端存储路径（<uid>/<prepareId>.jpg）：随账号同步，重装后据此取回原图
  background_path TEXT,
  -- 创建时间
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  -- 更新时间：取最近一条时按此排序
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- 按对象 / 节日取最近一条祝福缓存
CREATE INDEX IF NOT EXISTS idx_prepare_lookup ON prepare (scene, person_id, festival_code, updated_at);

-- 礼物建议（2026-10-25 新增）----------------------------------------------
-- 保存每个「场景 + 收件人 + 节日」最近一批 AI 礼物建议，随账号同步。
-- id 用确定性字符串（场景|收件人|节日|序号）：重新生成时原地覆盖同样的几行，
-- 不会产生新 id 和墓碑，两端并发也只会按槽位各自 LWW，简单可靠。
CREATE TABLE IF NOT EXISTS gift_suggestion (
  id TEXT PRIMARY KEY,
  -- 收件人：对象彻底清除时级联删除（节日不指定收件人时为空）
  person_id TEXT REFERENCES person (id) ON DELETE CASCADE,
  -- 场景：contact 联系人 / holiday 节日（与 prepare 一致）
  scene TEXT NOT NULL CHECK (scene IN ('contact','holiday')),
  -- 节日代码：联系人场景为空
  festival_code TEXT,
  -- 礼物名称
  name TEXT NOT NULL,
  -- 推荐理由
  reason TEXT NOT NULL DEFAULT '',
  -- 搜索关键词（电商平台跳转用）
  keyword TEXT NOT NULL DEFAULT '',
  -- 展示顺序 0~3
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX IF NOT EXISTS idx_gift_lookup
  ON gift_suggestion (scene, person_id, festival_code, sort_order);

-- =====================================================================
-- 云同步（M12）：以下四张表只存在于本机，不上云
-- =====================================================================

-- 同步元数据（单行，id 固定 'default'）
CREATE TABLE IF NOT EXISTS sync_meta (
  id TEXT PRIMARY KEY,
  -- 本机设备标识（UUID）：推送时带给云端，用于识别「自己的写入」避免回环
  device_id TEXT NOT NULL,
  -- 首次同步状态：unbound 未开始 / bootstrapping 进行中 / ready 已就绪 / blocked 需用户确认
  bootstrap_state TEXT NOT NULL DEFAULT 'unbound'
    CHECK (bootstrap_state IN ('unbound','bootstrapping','ready','blocked')),
  -- 最近一次完整同步成功的时间
  last_sync_at TEXT,
  -- 旧单库是否已迁入当前账号库（0/1）
  legacy_adopted INTEGER NOT NULL DEFAULT 0,
  -- 用户是否在本机改过可同步设置（0/1）。
  -- 为 0 时（全新安装/重装）云端设置无条件覆盖本机默认值，
  -- 否则重装后本机默认值的新时间戳会挡住云端真实设置。
  settings_edited INTEGER NOT NULL DEFAULT 0,
  -- 最近一次同步错误（供同步页展示）
  last_error TEXT
);

-- 待推送队列（outbox）：只记「哪一行脏了」，推送时再读当前行判断 upsert/delete。
-- 同一行多次写入只保留一条，避免队列膨胀。
CREATE TABLE IF NOT EXISTS sync_outbox (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  table_name TEXT NOT NULL,
  row_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE (table_name, row_id)
);

-- 墓碑镜像：云端已彻底删除的行。用于拒绝延迟到达的旧数据复活该行。
CREATE TABLE IF NOT EXISTS sync_tombstone (
  table_name TEXT NOT NULL,
  row_id TEXT NOT NULL,
  deleted_at TEXT NOT NULL,
  PRIMARY KEY (table_name, row_id)
);

-- 死信：永久性推送失败（数据非法、外键缺失等）的行。
-- 直接丢会静默丢数据，反复重试又会卡住整条队列，故落此表留证据并在同步页提示。
CREATE TABLE IF NOT EXISTS sync_dead_letter (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  table_name TEXT NOT NULL,
  row_id TEXT NOT NULL,
  error TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE (table_name, row_id)
);

-- 开启外键约束（expo-sqlite 默认关闭，需显式开启才能生效级联/置空）
PRAGMA foreign_keys = ON;
`;
