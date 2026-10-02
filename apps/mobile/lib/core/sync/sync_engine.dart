import 'dart:async';
import 'dart:math';

import 'package:flutter/foundation.dart';

import '../../features/auth/auth_controller.dart';
import '../../shared/models/sync.dart';
import '../db/local_store.dart';
import '../network/api_client.dart';
import '../network/api_error.dart';
import '../network/api_routes.dart';
import '../storage/token_store.dart';
import 'backoff.dart';
import 'connectivity.dart';
import 'sync_config.dart';

/// The push → apply → pull orchestrator from `docs/synchronization.md` §6.
///
/// A cycle is:
///
/// 1. drain the local queue (`nextPushBatch`) through `POST /sync`,
/// 2. apply per-operation results (`APPLIED`/`DUPLICATE`/`CONFLICT`/`REJECTED`)
///    and the returned `changes[]`,
/// 3. page `GET /sync/changes` until `hasMore` is false, advancing the cursor.
///
/// The engine never blocks the UI: writes nudge it via [requestSync] (a
/// fire-and-forget single-flight) and failures back off exponentially while
/// the queue stays in SQLite.
class SyncEngine extends ChangeNotifier {
  SyncEngine({
    required this.api,
    required this.store,
    required this.tokenStore,
    ConnectivityMonitor? connectivity,
    Random? random,
  })  : _connectivity = connectivity ?? ConnectivityMonitor(),
        _random = random ?? Random();

  final ApiClient api;
  final LocalStore store;
  final TokenStore tokenStore;
  final ConnectivityMonitor _connectivity;
  final Random _random;

  AuthController? _auth;
  bool _wasAuthenticated = false;
  bool _started = false;
  bool _syncing = false;
  bool _dirty = false;
  bool _terminalError = false;
  int _attempt = 0;
  DateTime? _nextAllowedAt;
  Timer? _pollTimer;
  List<String> _inFlightIds = const [];
  /// Completed whenever the current cycle unwinds; `syncNow` awaits it to
  /// turn a fire-and-forget nudge into a bounded wait.
  Completer<void> _idle = Completer<void>()..complete();

  /// Human-readable cause of the last failure (or last rejection reasons).
  String? lastError;

  bool get isSyncing => _syncing;
  bool get isOnline => _connectivity.isOnline;
  int get pendingCount => store.countQueuedOperations(status: kOperationStatusPending);
  int get failedCount => store.countQueuedOperations(status: kOperationStatusFailed);
  DateTime? get lastSyncAt => store.lastSyncAt();

  /// Aggregate state for the status UI (docs §6): `SYNCING` while a batch is
  /// in flight, `FAILED` on rejections or an exhausted retry budget, `PENDING`
  /// while anything waits, `SYNCED` otherwise.
  String get status {
    if (_syncing) return kSyncStatusSyncing;
    if (failedCount > 0 || (_terminalError && lastError != null)) return kSyncStatusFailed;
    if (pendingCount > 0 || lastError != null) return kSyncStatusPending;
    return kSyncStatusSynced;
  }

  /// Wires session transitions: signing in kicks the first sync, signing out
  /// stops new cycles (the queue itself is cleared by the logout path).
  void attachAuth(AuthController auth) {
    if (identical(_auth, auth)) return;
    _auth?.removeListener(_onAuthChanged);
    _auth = auth;
    _wasAuthenticated = auth.isAuthenticated;
    auth.addListener(_onAuthChanged);
  }

  /// Starts the lifecycle triggers: connectivity, the periodic poll, and an
  /// immediate kick (also re-arms operations parked as `FAILED` at app start).
  Future<void> start() async {
    if (_started) return;
    _started = true;
    _connectivity.onOnlineChanged = _onConnectivityChanged;
    await _connectivity.start();
    _pollTimer = Timer.periodic(
      const Duration(milliseconds: SyncConfig.pollIntervalMs),
      (_) => requestSync(),
    );
    store.resetFailedOperations();
    requestSync();
  }

  void stop() {
    _pollTimer?.cancel();
    _pollTimer = null;
    _connectivity.onOnlineChanged = null;
    unawaited(_connectivity.stop());
    _auth?.removeListener(_onAuthChanged);
    _auth = null;
    _started = false;
  }

  /// Fire-and-forget nudge after a local write. Single-flight: if a cycle is
  /// already running the nudge is coalesced into a follow-up run.
  void requestSync() {
    if (_syncing) {
      _dirty = true;
      return;
    }
    unawaited(_cycle());
  }

  /// Manual sync ("Sync now"): re-arms parked operations, clears the backoff
  /// and waits for a full cycle even if the previous attempt just failed.
  Future<void> syncNow() async {
    store.resetFailedOperations();
    _attempt = 0;
    _nextAllowedAt = null;
    if (_syncing) {
      // Ride out the in-flight cycle (it consumes this nudge through
      // `_dirty`) and any chained rerun, then run one fresh cycle ourselves.
      _dirty = true;
      await _idle.future;
      while (_syncing) {
        await _idle.future;
      }
    }
    await _cycle();
  }

  Future<void> _cycle() async {
    if (_syncing) {
      _dirty = true;
      return;
    }
    if (!_connectivity.isOnline) return;
    if (true != (tokenStore.accessToken?.isNotEmpty ?? false)) return;
    final allowedAt = _nextAllowedAt;
    if (allowedAt != null && DateTime.now().isBefore(allowedAt)) return;

    _syncing = true;
    final done = _idle = Completer<void>();
    notifyListeners();

    String? error;
    String? notice;
    var terminal = false;
    try {
      try {
        notice = await _push();
        terminal = notice != null;
        await _pull();
      } on ApiError catch (caught) {
        error = caught.message;
      } on Object catch (caught) {
        error = caught.toString();
      }

      if (error != null && _inFlightIds.isNotEmpty) {
        store.markPushFailure(_inFlightIds, error: error);
        _inFlightIds = const [];
      }

      _syncing = false;
      if (error == null) {
        _attempt = 0;
        _nextAllowedAt = null;
        _terminalError = terminal;
        lastError = notice;
      } else {
        _terminalError = false;
        lastError = error;
        _attempt = (_attempt + 1).clamp(0, 30);
        _nextAllowedAt = DateTime.now().add(
          Duration(milliseconds: backoffDelayMs(_attempt, random: _random)),
        );
      }
      notifyListeners();

      if (_dirty) {
        _dirty = false;
        requestSync();
      }
    } finally {
      // Always release `syncNow` waiters, even if a listener threw.
      _syncing = false;
      done.complete();
    }
  }

  /// Drains the queue through `POST /sync`. Returns the distinct rejection
  /// reasons (which surface as a terminal sync error), or null when clean.
  Future<String?> _push() async {
    final reasons = <String>{};
    for (var round = 0; round < SyncConfig.maxPushRounds; round++) {
      final batch = store.nextPushBatch(limit: SyncConfig.maxOperationsPerBatch);
      if (batch.isEmpty) break;
      _inFlightIds = [for (final op in batch) op.operationId];
      final response = await api.post(
        ApiRoutes.sync,
        body: SyncRequest(
          deviceId: store.deviceId(),
          cursor: store.cursor,
          operations: [for (final op in batch) op.toEnvelope()],
        ).toJson(),
        decode: SyncResponse.fromJson,
      );
      _inFlightIds = const [];
      reasons.addAll(_applyPushResponse(response));
      if (batch.length < SyncConfig.maxOperationsPerBatch) break;
    }
    return reasons.isEmpty ? null : reasons.join(', ');
  }

  /// Pages `GET /sync/changes` until the server has nothing left to deliver.
  Future<void> _pull() async {
    for (var page = 0; page < SyncConfig.maxPullPages; page++) {
      final cursor = store.cursor;
      // A missing cursor asks for the fresh-device bootstrap (shared system
      // categories) — never send "0" before a real cursor exists.
      final query = <String, Object?>{'limit': '${SyncConfig.maxOperationsPerBatch}'};
      if (cursor != null) query['cursor'] = cursor;
      final response = await api.get(
        ApiRoutes.syncChanges,
        query: query,
        decode: SyncChangesResponse.fromJson,
      );
      _applyChanges(response.changes);
      store.cursor = response.cursor;
      store.setLastSyncAt(DateTime.now());
      if (!response.hasMore) break;
    }
  }

  /// Applies one `POST /sync` verdict per operation, then the batch's changes.
  ///
  /// Acknowledged operations are removed *before* the authoritative entity is
  /// applied so `_statusForOpenOps` recomputes each row as `SYNCED`.
  List<String> _applyPushResponse(SyncResponse response) {
    final reasons = <String>{};
    for (final result in response.results) {
      switch (result.status) {
        case 'APPLIED':
        case 'DUPLICATE':
        case 'CONFLICT':
          store.completeOperations([result.operationId]);
          final entity = result.entity;
          if (entity != null) _applyEntity(result.entityType, entity);
        case 'REJECTED':
          store.rejectOperation(result.operationId);
          if (result.reason != null) reasons.add(result.reason!);
        default:
          break;
      }
    }
    _applyChanges(response.changes);
    store.cursor = response.cursor;
    store.setLastSyncAt(DateTime.now());
    return reasons.toList();
  }

  void _applyEntity(String entityType, Map<String, Object?> entity) {
    if (entityType == 'TRANSACTION') {
      // Also handles tombstones: entities with `deletedAt` hard-delete locally.
      store.applyServerTransactionUpsert(entity);
    } else {
      store.applyServerCategoryUpsert(entity);
    }
  }

  void _applyChanges(List<SyncServerChange> changes) {
    for (final change in changes) {
      if (change.entityType == 'TRANSACTION') {
        if (change.operation == 'DELETE') {
          store.applyServerTransactionDelete(
            clientId: change.payload['clientId'] as String?,
            serverId: change.entityId,
          );
        } else {
          store.applyServerTransactionUpsert(change.payload);
        }
      } else if (change.operation == 'DELETE') {
        store.applyServerCategoryDelete(change.entityId);
      } else {
        store.applyServerCategoryUpsert(change.payload);
      }
    }
  }

  void _onConnectivityChanged(bool online) {
    if (!online) {
      notifyListeners();
      return;
    }
    // Back online: re-arm anything the retry budget parked and go now.
    _attempt = 0;
    _nextAllowedAt = null;
    store.resetFailedOperations();
    requestSync();
  }

  void _onAuthChanged() {
    final auth = _auth;
    if (auth == null) return;
    if (auth.isAuthenticated) {
      if (_wasAuthenticated) return;
      _wasAuthenticated = true;
      store.resetFailedOperations();
      requestSync();
    } else {
      _wasAuthenticated = false;
    }
  }
}
