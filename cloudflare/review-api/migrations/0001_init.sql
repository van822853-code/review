CREATE TABLE IF NOT EXISTS program (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  text TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

INSERT OR IGNORE INTO program (id, text) VALUES (1, '');

CREATE TABLE IF NOT EXISTS students (
  id TEXT PRIMARY KEY,
  full_name TEXT NOT NULL,
  roles_json TEXT NOT NULL DEFAULT '[]',
  text_summary TEXT NOT NULL DEFAULT '',
  video_summary_url TEXT NOT NULL DEFAULT '',
  video_upload_id TEXT NOT NULL DEFAULT '',
  video_object_key TEXT NOT NULL DEFAULT '',
  video_file_name TEXT NOT NULL DEFAULT '',
  video_content_type TEXT NOT NULL DEFAULT '',
  video_size_bytes INTEGER NOT NULL DEFAULT 0,
  video_duration_ms INTEGER NOT NULL DEFAULT 0,
  video_width INTEGER NOT NULL DEFAULT 0,
  video_height INTEGER NOT NULL DEFAULT 0,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_students_created_at
  ON students(created_at DESC, id DESC);

CREATE TABLE IF NOT EXISTS works (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL,
  student_name TEXT NOT NULL,
  work_index INTEGER NOT NULL,
  work_url TEXT NOT NULL,
  cover_url TEXT NOT NULL,
  cover_upload_id TEXT NOT NULL DEFAULT '',
  cover_object_key TEXT NOT NULL DEFAULT '',
  cover_file_name TEXT NOT NULL DEFAULT '',
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_works_created_at
  ON works(created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_works_student_id
  ON works(student_id, work_index);

CREATE TABLE IF NOT EXISTS uploads (
  id TEXT PRIMARY KEY,
  asset_kind TEXT NOT NULL,
  file_name TEXT NOT NULL,
  content_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  object_key TEXT NOT NULL,
  public_url TEXT NOT NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_uploads_created_at
  ON uploads(created_at DESC, id DESC);
