import 'dart:convert';

/// Wire contract of `POST /sync` and `GET /sync/changes`, mirrored from
/// `docs/synchronization.md` and `apps/api/src/shared/types/sync.ts`.
///
/// Local-only `sync_operations` rows and the envelopes sent to the server are
/// both represented here so the push payload can be asserted in tests.

/// Status persisted on a local row after a sync outcome.
const String kSyncStatusSynced = 'SYNCED';
const String kSyncStatusPending = 'PENDING';
const String kSyncStatusFailed = 'FAILED';

/// Engine-level state: a batch is on the wire right now.
const String kSyncStatusSyncing = 'SYNCING';

/// Lifecycle of a `sync_operations` row.
///
/// * `PENDING` — queued, picked up by the next push.
/// * `FAILED`  — exhausted retries (or paused); re-armed by connectivity,
///   manual "sync now" or an app start.
/// * `REJECTED` — the server refused it for a domain reason (`name_conflict`,
///   `category_in_use`, …); never re-pushed automatically.
const String kOperationStatusPending = 'PENDING';
const String kOperationStatusFailed = 'FAILED';
const String kOperationStatusRejected = 'REJECTED';

/// One queued mutation. `payload` is the exact object sent as `payload` in
/// the operation envelope.
class QueuedOperation {
  const QueuedOperation({
    required this.operationId,
    required this.entityType,
    required this.entityId,
    required this.operation,
    required this.payload,
    required this.baseVersion,
    required this.status,
    required this.attempts,
    required this.lastError,
    required this.createdAt,
  });

  final String operationId;

  /// `TRANSACTION` or `CATEGORY`.
  final String entityType;

  /// Client id: `clientId` for transactions, the local id for categories.
  final String entityId;

  /// `CREATE`, `UPDATE` or `DELETE`.
  final String operation;
  final Map<String, Object?> payload;
  final int? baseVersion;
  final String status;
  final int attempts;
  final String? lastError;
  final String createdAt;

  factory QueuedOperation.fromRow(Map<String, Object?> row) => QueuedOperation(
        operationId: row['operation_id']! as String,
        entityType: row['entity_type']! as String,
        entityId: row['entity_id']! as String,
        operation: row['operation']! as String,
        payload: (jsonDecode(row['payload']! as String) as Map<String, dynamic>)
            .cast<String, Object?>(),
        baseVersion: row['base_version'] as int?,
        status: row['status']! as String,
        attempts: (row['attempts']! as num).toInt(),
        lastError: row['last_error'] as String?,
        createdAt: row['created_at']! as String,
      );

  /// The `SyncOperationEnvelope` sent to `POST /sync`.
  Map<String, Object?> toEnvelope() => {
        'operationId': operationId,
        'entityId': entityId,
        'entityType': entityType,
        'operation': operation,
        'timestamp': createdAt,
        if (baseVersion != null) 'baseVersion': baseVersion,
        'payload': payload,
      };
}

/// A server-side change delivered by the pull half of the protocol.
class SyncServerChange {
  const SyncServerChange({
    required this.entityId,
    required this.entityType,
    required this.operation,
    required this.version,
    required this.updatedAt,
    required this.payload,
  });

  final String entityId;
  final String entityType;
  final String operation;
  final int version;
  final String updatedAt;
  final Map<String, Object?> payload;

  factory SyncServerChange.fromJson(Object? json) {
    final map = json! as Map<String, dynamic>;
    return SyncServerChange(
      entityId: map['entityId']! as String,
      entityType: map['entityType']! as String,
      operation: map['operation']! as String,
      version: (map['version']! as num).toInt(),
      updatedAt: map['updatedAt']! as String,
      payload: (map['payload']! as Map<String, dynamic>).cast<String, Object?>(),
    );
  }
}

/// Server verdict for one pushed operation.
class SyncOperationResult {
  const SyncOperationResult({
    required this.operationId,
    required this.entityId,
    required this.entityType,
    required this.operation,
    required this.status,
    this.reason,
    this.entity,
  });

  final String operationId;
  final String entityId;
  final String entityType;
  final String operation;

  /// `APPLIED`, `DUPLICATE`, `CONFLICT` or `REJECTED`.
  final String status;
  final String? reason;
  final Map<String, Object?>? entity;

  factory SyncOperationResult.fromJson(Object? json) {
    final map = json! as Map<String, dynamic>;
    return SyncOperationResult(
      operationId: map['operationId']! as String,
      entityId: map['entityId']! as String,
      entityType: map['entityType']! as String,
      operation: map['operation']! as String,
      status: map['status']! as String,
      reason: map['reason'] as String?,
      entity: (map['entity'] as Map<String, dynamic>?)?.cast<String, Object?>(),
    );
  }
}

/// Request body of `POST /sync`.
class SyncRequest {
  const SyncRequest({required this.deviceId, required this.operations, this.cursor});

  final String deviceId;
  final String? cursor;
  final List<Map<String, Object?>> operations;

  Map<String, Object?> toJson() => {
        'deviceId': deviceId,
        if (cursor != null) 'cursor': cursor,
        'operations': operations,
      };
}

/// Response of `POST /sync`.
class SyncResponse {
  const SyncResponse({
    required this.results,
    required this.changes,
    required this.cursor,
    required this.serverTime,
  });

  final List<SyncOperationResult> results;
  final List<SyncServerChange> changes;
  final String cursor;
  final String serverTime;

  factory SyncResponse.fromJson(Object? json) {
    final map = json! as Map<String, dynamic>;
    return SyncResponse(
      results: ((map['results']! as List<Object?>).map(SyncOperationResult.fromJson)).toList(),
      changes: ((map['changes']! as List<Object?>).map(SyncServerChange.fromJson)).toList(),
      cursor: map['cursor']! as String,
      serverTime: map['serverTime']! as String,
    );
  }
}

/// Response of `GET /sync/changes`.
class SyncChangesResponse {
  const SyncChangesResponse({
    required this.changes,
    required this.cursor,
    required this.hasMore,
    required this.serverTime,
  });

  final List<SyncServerChange> changes;
  final String cursor;
  final bool hasMore;
  final String serverTime;

  factory SyncChangesResponse.fromJson(Object? json) {
    final map = json! as Map<String, dynamic>;
    return SyncChangesResponse(
      changes: ((map['changes']! as List<Object?>).map(SyncServerChange.fromJson)).toList(),
      cursor: map['cursor']! as String,
      hasMore: map['hasMore']! as bool,
      serverTime: map['serverTime']! as String,
    );
  }
}
