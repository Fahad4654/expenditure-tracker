import 'dart:convert';

import 'package:sqlite3/sqlite3.dart';

import '../../shared/money.dart';
import '../../shared/models/category.dart';
import '../../shared/models/common.dart';
import '../../shared/models/sync.dart';
import '../../shared/models/transaction.dart';
import '../../shared/models/user.dart';
import '../../shared/utils/uuid.dart';

/// Local-first data access over SQLite.
///
/// The database is the app's source of truth while offline: every local write
/// lands in its entity table **and** the `sync_operations` queue inside the
/// same transaction, so a row can never exist without the operation that
/// creates it (or vice versa). The sync engine later drains the queue FIFO and
/// applies pulled `SyncServerChange`s back onto the tables.
class LocalStore {
  LocalStore(this.db);

  final Database db;

  /// Attempts before an operation is parked as `FAILED` (see
  /// [markPushFailure]).
  static const int maxPushAttempts = 8;

  static String _now() => DateTime.now().toUtc().toIso8601String();

  /// Runs [body] inside an explicit transaction: an entity write and its
  /// queued operation commit together or not at all.
  void _tx(void Function() body) {
    db.execute('BEGIN');
    try {
      body();
      db.execute('COMMIT');
    } catch (_) {
      try {
        db.execute('ROLLBACK');
      } on Object {
        // Already rolled back by SQLite — surface the original error.
      }
      rethrow;
    }
  }

  // --- metadata -------------------------------------------------------------

  String? getString(String key) {
    final rows = db.select('SELECT value FROM sync_metadata WHERE key = ?', [key]);
    return rows.isEmpty ? null : rows.first['value'] as String;
  }

  void setString(String key, String value) {
    db.execute(
      'INSERT INTO sync_metadata (key, value) VALUES (?, ?) '
      'ON CONFLICT(key) DO UPDATE SET value = excluded.value',
      [key, value],
    );
  }

  void removeString(String key) {
    db.execute('DELETE FROM sync_metadata WHERE key = ?', [key]);
  }

  /// Stable per-install id, created on first use. Safe across app restarts.
  String deviceId() {
    final existing = getString('device_id');
    if (existing != null) return existing;
    final id = generateUuidV4();
    setString('device_id', id);
    return id;
  }

  String? get cursor => getString('cursor');
  set cursor(String? value) {
    if (value == null) {
      removeString('cursor');
    } else {
      setString('cursor', value);
    }
  }

  DateTime? lastSyncAt() {
    final raw = getString('last_sync_at');
    return raw == null ? null : DateTime.tryParse(raw)?.toLocal();
  }

  void setLastSyncAt(DateTime time) => setString('last_sync_at', time.toUtc().toIso8601String());

  // --- users ----------------------------------------------------------------

  void upsertUser(UserProfile user) {
    db.execute(
      'INSERT INTO users (id, payload, updated_at) VALUES (?, ?, ?) '
      'ON CONFLICT(id) DO UPDATE SET payload = excluded.payload, updated_at = excluded.updated_at',
      [user.id, jsonEncode(user.toJson()), _now()],
    );
  }

  UserProfile? getUser() {
    final rows = db.select('SELECT payload FROM users ORDER BY updated_at DESC LIMIT 1');
    if (rows.isEmpty) return null;
    try {
      return UserProfile.fromJson(jsonDecode(rows.first['payload']! as String));
    } on Object {
      return null;
    }
  }

  // --- categories -----------------------------------------------------------

  /// All visible categories: system first, then alphabetical (case-insensitive).
  List<Category> listCategories() {
    final rows = db.select(
      'SELECT * FROM categories ORDER BY is_system DESC, name COLLATE NOCASE ASC',
    );
    return rows.map(_categoryFromRow).toList();
  }

  Category? getCategory(String id) {
    final rows = db.select('SELECT * FROM categories WHERE id = ?', [id]);
    return rows.isEmpty ? null : _categoryFromRow(rows.first);
  }

  /// Creates a user category and queues its `CREATE`. Returns the new id.
  String createCategory({
    String? userId,
    required String name,
    required TransactionType suggestedType,
    String? icon,
    String? color,
  }) {
    final id = generateUuidV4();
    final now = _now();
    _tx(() {
      db.execute(
        'INSERT INTO categories (id, user_id, name, kind, icon, color, is_system, '
        'suggested_type, version, sync_status, created_at, updated_at) '
        "VALUES (?, ?, ?, 'USER', ?, ?, 0, ?, 1, 'PENDING', ?, ?)",
        [id, userId, name, _nullIfEmpty(icon), _nullIfEmpty(color), suggestedType.wire, now, now],
      );
      _enqueue(
        entityType: 'CATEGORY',
        entityId: id,
        operation: 'CREATE',
        baseVersion: 1,
        payload: {
          'name': name,
          if (_nullIfEmpty(icon) != null) 'icon': icon,
          if (_nullIfEmpty(color) != null) 'color': color,
          'suggestedType': suggestedType.wire,
        },
      );
    });
    return id;
  }

  /// Applies a local edit and queues an `UPDATE` carrying the observed
  /// `baseVersion`. `icon`/`color` follow [CategoryInput] semantics: `null`
  /// or empty means "leave unchanged".
  void updateCategory(
    String id, {
    required String name,
    required TransactionType suggestedType,
    String? icon,
    String? color,
  }) {
    _tx(() {
      final rows = db.select('SELECT * FROM categories WHERE id = ?', [id]);
      if (rows.isEmpty) return;
      final existing = _categoryFromRow(rows.first);
      final nextIcon = _nullIfEmpty(icon) ?? existing.icon;
      final nextColor = _nullIfEmpty(color) ?? existing.color;
      final now = _now();
      db.execute(
        'UPDATE categories SET name = ?, suggested_type = ?, icon = ?, color = ?, '
        "sync_status = 'PENDING', updated_at = ? WHERE id = ?",
        [name, suggestedType.wire, nextIcon, nextColor, now, id],
      );
      _enqueue(
        entityType: 'CATEGORY',
        entityId: id,
        operation: 'UPDATE',
        baseVersion: existing.version,
        payload: {
          'name': name,
          'suggestedType': suggestedType.wire,
          'icon': nextIcon,
          'color': nextColor,
        },
      );
    });
  }

  /// Hard-deletes a local (non-system) category and queues its `DELETE`.
  /// System categories are left untouched.
  void deleteCategory(String id) {
    _tx(() {
      final rows = db.select('SELECT version FROM categories WHERE id = ? AND is_system = 0', [id]);
      if (rows.isEmpty) return;
      final version = (rows.first['version']! as num).toInt();
      db.execute('DELETE FROM categories WHERE id = ?', [id]);
      _enqueue(
        entityType: 'CATEGORY',
        entityId: id,
        operation: 'DELETE',
        baseVersion: version,
        payload: const {},
      );
    });
  }

  // --- transactions ---------------------------------------------------------

  /// Server-style paginated listing backed by SQL. `query.preset` is ignored —
  /// callers resolve presets to explicit `from`/`to` dates.
  Paginated<Transaction> listTransactions(TransactionQuery query) {
    final where = <String>[];
    final args = <Object?>[];

    final search = query.search?.trim();
    if (search != null && search.isNotEmpty) {
      final pattern = _like(search);
      where.add(r"(title LIKE ? ESCAPE '\' OR description LIKE ? ESCAPE '\')");
      args..add(pattern)..add(pattern);
    }
    if (query.type != null) {
      where.add('type = ?');
      args.add(query.type!.wire);
    }
    if (query.categoryId != null) {
      where.add('category_id = ?');
      args.add(query.categoryId);
    }
    if (query.from != null) {
      where.add('transaction_date >= ?');
      args.add(query.from);
    }
    if (query.to != null) {
      where.add('transaction_date <= ?');
      args.add(query.to);
    }

    final clause = where.isEmpty ? '' : 'WHERE ${where.join(' AND ')}';
    final total =
        (db.select('SELECT COUNT(*) AS c FROM transactions $clause', args).first['c']! as num)
            .toInt();

    const sortColumns = {
      'transactionDate': 'transaction_date',
      'amount': 'amount_minor',
      'createdAt': 'created_at',
      'title': 'title',
    };
    final sortColumn = sortColumns[query.sort] ?? 'transaction_date';
    final direction = query.order.toLowerCase() == 'asc' ? 'ASC' : 'DESC';
    final limit = query.limit > 0 ? query.limit : 20;
    final offset = (query.page > 0 ? query.page - 1 : 0) * limit;

    final rows = db.select(
      'SELECT * FROM transactions $clause '
      'ORDER BY $sortColumn $direction, client_id $direction '
      'LIMIT ? OFFSET ?',
      [...args, limit, offset],
    );

    return Paginated<Transaction>(
      items: rows.map(_transactionFromRow).toList(),
      meta: PageMeta(
        page: query.page > 0 ? query.page : 1,
        limit: limit,
        total: total,
        totalPages: (total / limit).ceil(),
      ),
    );
  }

  Transaction? getTransaction(String clientId) {
    final rows = db.select('SELECT * FROM transactions WHERE client_id = ?', [clientId]);
    return rows.isEmpty ? null : _transactionFromRow(rows.first);
  }

  /// Maps a `clientId` **or** a server id (what pages pass around after a
  /// sync) to the local `client_id` key. `null` when nothing matches.
  String? resolveClientId(String id) {
    final rows = db.select(
      'SELECT client_id FROM transactions WHERE client_id = ? OR server_id = ?',
      [id, id],
    );
    return rows.isEmpty ? null : rows.first['client_id'] as String;
  }

  /// Creates a local transaction and queues its `CREATE`. Returns the
  /// `clientId`.
  String createTransaction({
    required String userId,
    required TransactionInput input,
    CurrencyCode currency = 'BDT',
  }) {
    final clientId = input.clientId ?? generateUuidV4();
    final amount = normalizeAmount(input.amount);
    final now = _now();
    _tx(() {
      db.execute(
        'INSERT INTO transactions (client_id, server_id, user_id, type, amount, amount_minor, '
        "currency, category_id, title, description, transaction_date, version, sync_status, "
        "created_at, updated_at) VALUES (?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 'PENDING', ?, ?)",
        [
          clientId,
          userId,
          input.type.wire,
          amount,
          toMinorUnits(amount).toInt(),
          currency,
          input.categoryId,
          input.title,
          input.description,
          input.transactionDate,
          now,
          now,
        ],
      );
      _enqueue(
        entityType: 'TRANSACTION',
        entityId: clientId,
        operation: 'CREATE',
        baseVersion: 1,
        payload: {
          'clientId': clientId,
          'type': input.type.wire,
          'amount': amount,
          'currency': currency,
          'categoryId': input.categoryId,
          'title': input.title,
          'description': input.description,
          'transactionDate': input.transactionDate,
        },
      );
    });
    return clientId;
  }

  /// Applies a local edit and queues an `UPDATE` with the observed
  /// `baseVersion`.
  void updateTransaction(String clientId, TransactionInput input) {
    _tx(() {
      final rows = db.select('SELECT version FROM transactions WHERE client_id = ?', [clientId]);
      if (rows.isEmpty) {
        throw StateError('Local transaction not found: $clientId');
      }
      final baseVersion = (rows.first['version']! as num).toInt();
      final amount = normalizeAmount(input.amount);
      final now = _now();
      db.execute(
        'UPDATE transactions SET type = ?, amount = ?, amount_minor = ?, category_id = ?, '
        "title = ?, description = ?, transaction_date = ?, sync_status = 'PENDING', updated_at = ? "
        'WHERE client_id = ?',
        [
          input.type.wire,
          amount,
          toMinorUnits(amount).toInt(),
          input.categoryId,
          input.title,
          input.description,
          input.transactionDate,
          now,
          clientId,
        ],
      );
      _enqueue(
        entityType: 'TRANSACTION',
        entityId: clientId,
        operation: 'UPDATE',
        baseVersion: baseVersion,
        payload: {
          'clientId': clientId,
          'type': input.type.wire,
          'amount': amount,
          'categoryId': input.categoryId,
          'title': input.title,
          'description': input.description,
          'transactionDate': input.transactionDate,
        },
      );
    });
  }

  /// Hard-deletes a local transaction and queues its `DELETE`. Unknown ids are
  /// a no-op.
  void deleteTransaction(String clientId) {
    _tx(() {
      final rows = db.select('SELECT version FROM transactions WHERE client_id = ?', [clientId]);
      if (rows.isEmpty) return;
      final version = (rows.first['version']! as num).toInt();
      db.execute('DELETE FROM transactions WHERE client_id = ?', [clientId]);
      _enqueue(
        entityType: 'TRANSACTION',
        entityId: clientId,
        operation: 'DELETE',
        baseVersion: version,
        payload: const {},
      );
    });
  }

  // --- applying server changes --------------------------------------------

  /// Applies a pulled `UPSERT` for a transaction (matched by the payload's
  /// `clientId`). Local queued edits are preserved: the queue holds their full
  /// payloads, so they still push afterwards.
  void applyServerTransactionUpsert(Map<String, Object?> payload) {
    final clientId = (payload['clientId'] as String?) ?? (payload['id'] as String?) ?? '';
    if (clientId.isEmpty) return;
    _tx(() {
      if (payload['deletedAt'] != null) {
        db.execute('DELETE FROM transactions WHERE client_id = ? OR server_id = ?', [
          clientId,
          payload['id'],
        ]);
        return;
      }
      final status = _statusForOpenOps('TRANSACTION', clientId);
      final amount = normalizeAmount(payload['amount']! as String);
      // `version` is absent from older REST shapes — the next CONFLICT result
      // self-heals a defaulted value, so 1 is a safe floor.
      final version = (payload['version'] as num?)?.toInt() ?? 1;
      db.execute(
        'INSERT INTO transactions (client_id, server_id, user_id, type, amount, amount_minor, '
        'currency, category_id, title, description, transaction_date, version, sync_status, '
        'created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) '
        'ON CONFLICT(client_id) DO UPDATE SET server_id = excluded.server_id, '
        'user_id = excluded.user_id, type = excluded.type, amount = excluded.amount, '
        'amount_minor = excluded.amount_minor, currency = excluded.currency, '
        'category_id = excluded.category_id, title = excluded.title, '
        'description = excluded.description, transaction_date = excluded.transaction_date, '
        'version = excluded.version, sync_status = excluded.sync_status, '
        'updated_at = excluded.updated_at',
        [
          clientId,
          payload['id'],
          payload['userId'],
          payload['type'],
          amount,
          toMinorUnits(amount).toInt(),
          payload['currency'],
          payload['categoryId'],
          payload['title'],
          payload['description'],
          _dateOnly(payload['transactionDate']! as String),
          version,
          status,
          payload['createdAt'],
          payload['updatedAt'],
        ],
      );
    });
  }

  /// Applies a pulled `DELETE` for a transaction. Matched by `clientId` and
  /// `server_id` — the row goes even when local operations are still queued
  /// (the queue is independent and would replay idempotently).
  void applyServerTransactionDelete({String? clientId, String? serverId}) {
    if (clientId == null && serverId == null) return;
    db.execute(
      'DELETE FROM transactions WHERE client_id = ? OR server_id = ?',
      [clientId ?? '', serverId ?? ''],
    );
  }

  /// Applies a pulled `UPSERT` for a category. The payload's `id` is the
  /// client-generated id the server adopted, so local FKs stay stable.
  void applyServerCategoryUpsert(Map<String, Object?> payload) {
    final id = payload['id'] as String?;
    if (id == null || id.isEmpty) return;
    _tx(() {
      if (payload['deletedAt'] != null) {
        db.execute('DELETE FROM categories WHERE id = ?', [id]);
        return;
      }
      final status = _statusForOpenOps('CATEGORY', id);
      db.execute(
        'INSERT INTO categories (id, user_id, name, kind, icon, color, is_system, '
        'suggested_type, version, sync_status, created_at, updated_at) '
        'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) '
        'ON CONFLICT(id) DO UPDATE SET user_id = excluded.user_id, name = excluded.name, '
        'kind = excluded.kind, icon = excluded.icon, color = excluded.color, '
        'is_system = excluded.is_system, suggested_type = excluded.suggested_type, '
        'version = excluded.version, sync_status = excluded.sync_status, '
        'updated_at = excluded.updated_at',
        [
          id,
          payload['userId'],
          payload['name'],
          payload['kind'],
          payload['icon'],
          payload['color'],
          (payload['isSystem']! as bool) ? 1 : 0,
          payload['suggestedType'],
          // REST category payloads omit `version` (see `toCategory`).
          (payload['version'] as num?)?.toInt() ?? 1,
          status,
          payload['createdAt'],
          payload['updatedAt'],
        ],
      );
    });
  }

  /// Applies a pulled `DELETE` for a category (hard delete, tombstones are not
  /// kept locally).
  void applyServerCategoryDelete(String id) {
    db.execute('DELETE FROM categories WHERE id = ?', [id]);
  }

  // --- sync queue -----------------------------------------------------------

  /// Queues an operation. Must be called inside the same transaction as the
  /// entity write it belongs to.
  void _enqueue({
    required String entityType,
    required String entityId,
    required String operation,
    required Map<String, Object?> payload,
    int? baseVersion,
  }) {
    db.execute(
      'INSERT INTO sync_operations (operation_id, entity_type, entity_id, operation, payload, '
      "base_version, status, attempts, last_error, created_at) VALUES (?, ?, ?, ?, ?, ?, 'PENDING', 0, NULL, ?)",
      [
        generateUuidV4(),
        entityType,
        entityId,
        operation,
        jsonEncode(payload),
        baseVersion,
        _now(),
      ],
    );
  }

  /// Next operations to push, in FIFO order (ties broken by insertion order).
  List<QueuedOperation> nextPushBatch({int limit = 200}) {
    final rows = db.select(
      "SELECT * FROM sync_operations WHERE status = 'PENDING' "
      'ORDER BY created_at ASC, rowid ASC LIMIT ?',
      [limit],
    );
    return rows.map(QueuedOperation.fromRow).toList();
  }

  /// Records a failed push: `attempts + 1`; after [maxPushAttempts] the
  /// operation is parked as `FAILED` until [resetFailedOperations].
  void markPushFailure(List<String> operationIds, {required String error}) {
    if (operationIds.isEmpty) return;
    _tx(() {
      final entities = _entitiesOf(operationIds);
      for (final id in operationIds) {
        final rows = db.select(
          'SELECT attempts FROM sync_operations WHERE operation_id = ?',
          [id],
        );
        if (rows.isEmpty) continue;
        final attempts = (rows.first['attempts']! as num).toInt() + 1;
        db.execute(
          'UPDATE sync_operations SET attempts = ?, status = ?, last_error = ? '
          'WHERE operation_id = ?',
          [
            attempts,
            attempts >= maxPushAttempts ? kOperationStatusFailed : kOperationStatusPending,
            error,
            id,
          ],
        );
      }
      for (final (type, entityId) in entities) {
        _refreshEntityStatus(type, entityId);
      }
    });
  }

  /// Removes operations the server acknowledged (`APPLIED`, `DUPLICATE`,
  /// `CONFLICT`) and recomputes each touched entity's `sync_status`.
  void completeOperations(List<String> operationIds) {
    if (operationIds.isEmpty) return;
    _tx(() {
      final entities = _entitiesOf(operationIds);
      for (final id in operationIds) {
        db.execute('DELETE FROM sync_operations WHERE operation_id = ?', [id]);
      }
      for (final (type, entityId) in entities) {
        _refreshEntityStatus(type, entityId);
      }
    });
  }

  /// Marks an operation as terminally `REJECTED` (never re-pushed) and flips
  /// its entity to `FAILED` unless other operations are still open.
  void rejectOperation(String operationId) {
    _tx(() {
      final entities = _entitiesOf([operationId]);
      db.execute('DELETE FROM sync_operations WHERE operation_id = ?', [operationId]);
      for (final (type, entityId) in entities) {
        if (_openOperationCount(type, entityId) > 0) {
          _refreshEntityStatus(type, entityId);
        } else {
          _setEntityStatus(type, entityId, kSyncStatusFailed);
        }
      }
    });
  }

  /// Re-arms parked operations after connectivity returns, an app start or a
  /// manual sync: `FAILED → PENDING`, attempts reset.
  void resetFailedOperations() {
    _tx(() {
      final rows = db.select(
        'SELECT DISTINCT entity_type, entity_id FROM sync_operations '
        "WHERE status = '$kOperationStatusFailed'",
      );
      db.execute(
        "UPDATE sync_operations SET status = 'PENDING', attempts = 0 "
        "WHERE status = '$kOperationStatusFailed'",
      );
      for (final row in rows) {
        _refreshEntityStatus(row['entity_type']! as String, row['entity_id']! as String);
      }
    });
  }

  int countQueuedOperations({String? status}) {
    final rows = status == null
        ? db.select('SELECT COUNT(*) AS c FROM sync_operations')
        : db.select('SELECT COUNT(*) AS c FROM sync_operations WHERE status = ?', [status]);
    return (rows.first['c']! as num).toInt();
  }

  /// Sync status of a local row — used by tests and status UI.
  String? entitySyncStatus(String entityType, String id) {
    final (table, idColumn) = _entityTable(entityType);
    final rows = db.select('SELECT sync_status FROM $table WHERE $idColumn = ?', [id]);
    return rows.isEmpty ? null : rows.first['sync_status'] as String;
  }

  // --- housekeeping ---------------------------------------------------------

  /// Wipes all user data (logout / account switch). The device id survives —
  /// it identifies the install, not the account — the cursor does not, so the
  /// next account pulls from scratch.
  void clearAll() {
    final device = getString('device_id');
    _tx(() {
      db.execute('DELETE FROM users');
      db.execute('DELETE FROM categories');
      db.execute('DELETE FROM transactions');
      db.execute('DELETE FROM sync_operations');
      db.execute('DELETE FROM sync_metadata');
      if (device != null) setString('device_id', device);
    });
  }

  // --- internals ------------------------------------------------------------

  void _refreshEntityStatus(String entityType, String entityId) {
    _setEntityStatus(entityType, entityId, _statusForOpenOps(entityType, entityId));
  }

  /// `SYNCED` when nothing is queued, `PENDING` when at least one operation is
  /// waiting, `FAILED` when only parked ones remain.
  String _statusForOpenOps(String entityType, String entityId) {
    final rows = db.select(
      'SELECT status FROM sync_operations WHERE entity_type = ? AND entity_id = ?',
      [entityType, entityId],
    );
    if (rows.isEmpty) return kSyncStatusSynced;
    final statuses = rows.map((r) => r['status'] as String).toSet();
    return statuses.contains(kOperationStatusPending)
        ? kSyncStatusPending
        : kSyncStatusFailed;
  }

  void _setEntityStatus(String entityType, String entityId, String status) {
    final (table, idColumn) = _entityTable(entityType);
    db.execute('UPDATE $table SET sync_status = ? WHERE $idColumn = ?', [status, entityId]);
  }

  /// Entities behind the given operation ids (deduplicated).
  List<(String, String)> _entitiesOf(List<String> operationIds) {
    final seen = <(String, String)>{};
    for (final id in operationIds) {
      final rows = db.select(
        'SELECT entity_type, entity_id FROM sync_operations WHERE operation_id = ?',
        [id],
      );
      if (rows.isNotEmpty) {
        seen.add((rows.first['entity_type']! as String, rows.first['entity_id']! as String));
      }
    }
    return seen.toList();
  }

  int _openOperationCount(String entityType, String entityId) {
    final rows = db.select(
      'SELECT COUNT(*) AS c FROM sync_operations '
      'WHERE entity_type = ? AND entity_id = ?',
      [entityType, entityId],
    );
    return (rows.first['c']! as num).toInt();
  }

  (String, String) _entityTable(String entityType) => entityType == 'TRANSACTION'
      ? ('transactions', 'client_id')
      : ('categories', 'id');

  Transaction _transactionFromRow(Map<String, Object?> row) => Transaction(
        id: (row['server_id'] as String?) ?? row['client_id']! as String,
        clientId: row['client_id']! as String,
        deviceId: null,
        userId: row['user_id']! as String,
        type: TransactionType.parse(row['type']! as String),
        amount: row['amount']! as String,
        currency: row['currency']! as String,
        categoryId: row['category_id']! as String,
        title: row['title']! as String,
        description: row['description'] as String?,
        transactionDate: row['transaction_date']! as String,
        version: (row['version']! as num).toInt(),
        createdAt: row['created_at']! as String,
        updatedAt: row['updated_at']! as String,
        deletedAt: null,
        syncStatus: row['sync_status']! as String,
      );

  Category _categoryFromRow(Map<String, Object?> row) => Category(
        id: row['id']! as String,
        userId: row['user_id'] as String?,
        name: row['name']! as String,
        kind: CategoryKind.parse(row['kind']! as String),
        icon: row['icon'] as String?,
        color: row['color'] as String?,
        isSystem: (row['is_system']! as num) != 0,
        suggestedType: TransactionType.parse(row['suggested_type']! as String),
        createdAt: row['created_at']! as String,
        updatedAt: row['updated_at']! as String,
        version: (row['version']! as num).toInt(),
        syncStatus: row['sync_status']! as String,
      );
}

String? _nullIfEmpty(String? value) =>
    value == null || value.isEmpty ? null : value;

/// `%needle%` with LIKE wildcards escaped (`ESCAPE '\'` in the query).
String _like(String needle) {
  final escaped = needle
      .replaceAll(r'\', r'\\')
      .replaceAll('%', r'\%')
      .replaceAll('_', r'\_');
  return '%$escaped%';
}

/// `transactionDate` is calendar-date only, but pulled payloads may carry the
/// full `YYYY-MM-DDT00:00:00.000Z` the server stores.
String _dateOnly(String value) => value.length >= 10 ? value.substring(0, 10) : value;
