CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  login_id TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS couples (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  invite_code_hash TEXT,
  invite_code_expires_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS couple_members (
  couple_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('husband', 'wife')),
  created_at TEXT NOT NULL,
  UNIQUE(couple_id, user_id),
  UNIQUE(couple_id, role)
);

CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  couple_id INTEGER NOT NULL,
  created_by INTEGER NOT NULL,
  title TEXT NOT NULL,
  start_date TEXT NOT NULL,
  end_date TEXT,
  start_time TEXT,
  end_time TEXT,
  is_all_day INTEGER NOT NULL DEFAULT 1,
  target TEXT NOT NULL CHECK(target IN ('husband', 'wife', 'both')),
  icon TEXT NOT NULL,
  location TEXT,
  memo TEXT,
  category_id INTEGER,
  cycle_id INTEGER,
  amount INTEGER,
  shared INTEGER NOT NULL DEFAULT 1,
  notify_before_day INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- カテゴリ（色・アイコンをカップル単位でカスタマイズ可能）
CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  couple_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  icon TEXT NOT NULL,
  color TEXT NOT NULL,
  is_default INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

-- 生理期間
CREATE TABLE IF NOT EXISTS period_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  couple_id INTEGER NOT NULL,
  start_date TEXT NOT NULL,
  end_date TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- 治療周期（生理開始日を基準に自動生成、手動補正可）
CREATE TABLE IF NOT EXISTS cycles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  couple_id INTEGER NOT NULL,
  period_record_id INTEGER,
  start_date TEXT NOT NULL,
  end_date TEXT,
  treatment_type TEXT,
  result TEXT,
  is_manual_override INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- 自己検査（排卵検査薬・妊娠検査薬、1日複数回対応）
CREATE TABLE IF NOT EXISTS self_tests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  couple_id INTEGER NOT NULL,
  cycle_id INTEGER,
  type TEXT NOT NULL CHECK(type IN ('ovulation', 'pregnancy')),
  result TEXT NOT NULL CHECK(result IN ('negative', 'positive', 'pending')),
  tested_at TEXT NOT NULL,
  memo TEXT,
  created_by INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);