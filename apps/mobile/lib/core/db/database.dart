import 'package:path_provider/path_provider.dart';
import 'package:sqlite3/sqlite3.dart';

/// SQLite bootstrap: opening the app database file and running versioned
/// migrations. The schema is the local source of truth while offline — see
/// `docs/synchronization.md`.
class AppDatabase {
  AppDatabase._();

  static const int schemaVersion = 2;

  /// Opens the database at [path] (or the app documents directory when
  /// omitted) and brings the schema up to [schemaVersion].
  static Future<Database> open({String? path}) async {
    final resolved = path ?? await defaultPath();
    final db = sqlite3.open(resolved);
    migrate(db);
    return db;
  }

  static Future<String> defaultPath() async {
    final dir = await getApplicationDocumentsDirectory();
    return '${dir.path}/expenditure.db';
  }

  static void migrate(Database db) {
    db.execute('PRAGMA journal_mode = WAL');
    db.execute('PRAGMA synchronous = NORMAL');
    db.execute('PRAGMA foreign_keys = ON');

    if (db.userVersion < 1) {
      db.execute('BEGIN');
      try {
        db.execute(v1Schema);
        db.userVersion = 1;
        db.execute('COMMIT');
      } catch (_) {
        db.execute('ROLLBACK');
        rethrow;
      }
    }

    if (db.userVersion < 2) {
      db.execute('BEGIN');
      try {
        db.execute(v2Schema);
        db.userVersion = 2;
        db.execute('COMMIT');
      } catch (_) {
        db.execute('ROLLBACK');
        rethrow;
      }
    }
  }

  /// Bootstrap schema for a fresh install (version 1).
  static const String v1Schema = '''
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  payload TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE categories (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  name TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'USER',
  icon TEXT,
  color TEXT,
  is_system INTEGER NOT NULL DEFAULT 0,
  suggested_type TEXT NOT NULL DEFAULT 'EXPENSE',
  version INTEGER NOT NULL DEFAULT 1,
  sync_status TEXT NOT NULL DEFAULT 'SYNCED',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX idx_categories_sync ON categories(sync_status);

CREATE TABLE transactions (
  client_id TEXT PRIMARY KEY,
  server_id TEXT,
  user_id TEXT NOT NULL,
  type TEXT NOT NULL,
  amount TEXT NOT NULL,
  amount_minor INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'BDT',
  category_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  transaction_date TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  sync_status TEXT NOT NULL DEFAULT 'PENDING',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX idx_transactions_date ON transactions(transaction_date);
CREATE INDEX idx_transactions_category ON transactions(category_id);
CREATE INDEX idx_transactions_sync ON transactions(sync_status);

CREATE TABLE sync_operations (
  operation_id TEXT PRIMARY KEY,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  operation TEXT NOT NULL,
  payload TEXT NOT NULL,
  base_version INTEGER,
  status TEXT NOT NULL DEFAULT 'PENDING',
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX idx_sync_operations_status ON sync_operations(status, created_at);

CREATE TABLE sync_metadata (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
''';

  /// Transactions carry the note they are tagged on (`Transaction.noteId`).
  static const String v2Schema = '''
ALTER TABLE transactions ADD COLUMN note_id TEXT;
''';
}
