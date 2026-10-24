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
  -- 预留：第一版恒为 NULL，为多设备同步预留
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
  -- 更新时间
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
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

-- 开启外键约束（expo-sqlite 默认关闭，需显式开启才能生效级联/置空）
PRAGMA foreign_keys = ON;
`;
