import 'dart:ffi';
import 'dart:io';

import 'package:sqlite3/open.dart';

import 'package:expenditure_tracker/core/db/database.dart';
import 'package:expenditure_tracker/core/db/local_store.dart';

/// Host-side sqlite3 bootstrap for tests: the package defaults to
/// `libsqlite3.so`, which Debian/Ubuntu ships only as `libsqlite3.so.0`.
void ensureHostSqlite() {
  if (Platform.isLinux) {
    open.overrideFor(
      OperatingSystem.linux,
      () => DynamicLibrary.open('libsqlite3.so.0'),
    );
  }
}

/// A temp-file-backed [LocalStore] for tests, with reopen support so
/// persistence can be asserted.
class TestStore {
  TestStore._(this.store, this.path, this._dir);

  final LocalStore store;
  final String path;
  final Directory _dir;
  bool _closed = false;

  static Future<TestStore> open({String? name, Directory? dir}) async {
    ensureHostSqlite();
    final parent = dir ?? await Directory.systemTemp.createTemp('local_store_test');
    final path = '${parent.path}/${name ?? 'test'}.db';
    final db = await AppDatabase.open(path: path);
    return TestStore._(LocalStore(db), path, parent);
  }

  /// Closes the connection and opens the same file again.
  Future<TestStore> reopen() async {
    store.db.dispose();
    _closed = true;
    final db = await AppDatabase.open(path: path);
    return TestStore._(LocalStore(db), path, _dir);
  }

  void close() {
    if (_closed) return;
    _closed = true;
    store.db.dispose();
  }

  void cleanup() {
    close();
    if (_dir.existsSync()) _dir.deleteSync(recursive: true);
  }
}
