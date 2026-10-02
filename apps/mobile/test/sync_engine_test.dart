import 'package:expenditure_tracker/core/db/local_store.dart';
import 'package:expenditure_tracker/core/network/api_error.dart';
import 'package:expenditure_tracker/core/network/api_routes.dart';
import 'package:expenditure_tracker/core/network/repositories.dart';
import 'package:expenditure_tracker/core/storage/token_store.dart';
import 'package:expenditure_tracker/core/sync/connectivity.dart';
import 'package:expenditure_tracker/core/sync/sync_engine.dart';
import 'package:expenditure_tracker/features/auth/auth_controller.dart';
import 'package:expenditure_tracker/shared/models/sync.dart';
import 'package:expenditure_tracker/shared/models/transaction.dart';
import 'package:flutter_test/flutter_test.dart';

import 'support/fakes.dart';
import 'support/fixtures.dart';
import 'support/sqlite_setup.dart';

TransactionInput input({
  String amount = '120.50',
  String title = 'Bus fare',
  String categoryId = 'cat-food',
  String date = '2026-10-01',
  String? clientId,
}) =>
    TransactionInput(
      type: TransactionType.expense,
      amount: amount,
      categoryId: categoryId,
      title: title,
      description: null,
      transactionDate: date,
      clientId: clientId,
    );

/// Lets the fake-API microtask chain (push → apply → pull) fully drain.
Future<void> emit([int turns = 2]) async {
  for (var i = 0; i < turns; i++) {
    await Future<void>.delayed(Duration.zero);
  }
}

int syncPushes(FakeApiClient api) =>
    api.requestsWhere((r) => r.method == 'POST' && r.path == ApiRoutes.sync).length;

void main() {
  late TestStore harness;
  late LocalStore store;
  late FakeApiClient api;
  late TokenStore tokens;
  late SyncEngine engine;

  setUp(() async {
    harness = await TestStore.open();
    store = harness.store;
    api = FakeApiClient();
    registerDefaultHandlers(api);
    tokens = TokenStore(InMemoryTokenBackend());
    await tokens.saveSession(accessToken: 'access-token', refreshToken: 'refresh-token');
    engine = SyncEngine(api: api, store: harness.store, tokenStore: tokens);
  });

  tearDown(() {
    engine.stop();
    harness.cleanup();
  });

  test('push adopts the server entity and empties the queue', () async {
    final clientId = store.createTransaction(userId: userId, input: input(title: 'Bus fare'));
    Map<String, Object?>? sentBody;

    api.onPost(ApiRoutes.sync, (req) {
      final body = (req.body! as Map<String, Object?>).cast<String, dynamic>();
      sentBody = body;
      final ops = (body['operations']! as List<Object?>).cast<Map<String, Object?>>();
      expect(body['deviceId'], store.deviceId());
      expect(body.containsKey('cursor'), isFalse, reason: 'fresh device never sends "0"');
      expect(ops.single['operation'], 'CREATE');
      expect(ops.single['entityType'], 'TRANSACTION');
      expect(ops.single['entityId'], clientId);
      expect(ops.single['baseVersion'], 1);
      final envelope = (ops.single['payload']! as Map<String, Object?>);
      expect(envelope['title'], 'Bus fare');
      expect(envelope['clientId'], clientId);
      return syncResponseJson(
        cursor: '7',
        results: [
          {
            'operationId': ops.single['operationId'],
            'entityId': clientId,
            'entityType': 'TRANSACTION',
            'operation': 'CREATE',
            'status': 'APPLIED',
            'entity': transactionJson(id: 'server-1', clientId: clientId, title: 'Bus fare'),
          },
        ],
      );
    });

    await engine.syncNow();

    expect(sentBody, isNotNull);
    expect(store.nextPushBatch(), isEmpty);
    expect(store.entitySyncStatus('TRANSACTION', clientId), kSyncStatusSynced);
    final row = store.db
        .select('SELECT server_id, version FROM transactions WHERE client_id = ?', [clientId])
        .single;
    expect(row['server_id'], 'server-1');
    expect(row['version'], 1);
    expect(store.cursor, '7');
    expect(store.lastSyncAt(), isNotNull);
    expect(engine.status, kSyncStatusSynced);
    expect(engine.lastError, isNull);
  });

  test('a replayed batch answers DUPLICATE and keeps a single row', () async {
    final clientId = store.createTransaction(userId: userId, input: input());

    api.onPost(ApiRoutes.sync, (req) {
      final ops = ((req.body! as Map<String, Object?>)['operations']! as List<Object?>)
          .cast<Map<String, Object?>>();
      return syncResponseJson(
        cursor: '1',
        results: [
          {
            'operationId': ops.single['operationId'],
            'entityId': clientId,
            'entityType': 'TRANSACTION',
            'operation': 'CREATE',
            'status': 'DUPLICATE',
          },
        ],
      );
    });

    await engine.syncNow();
    await engine.syncNow(); // second cycle: queue is empty, nothing to re-push

    expect(store.nextPushBatch(), isEmpty);
    expect(
      store.db.select('SELECT COUNT(*) AS c FROM transactions').single['c'],
      1,
      reason: 'DUPLICATE never writes a second row',
    );
    expect(store.entitySyncStatus('TRANSACTION', clientId), kSyncStatusSynced);
    expect(syncPushes(api), 1);
  });

  test('CONFLICT overwrites the local row with the authoritative entity', () async {
    final clientId = store.createTransaction(userId: userId, input: input());

    api.onPost(ApiRoutes.sync, (req) {
      final ops = ((req.body! as Map<String, Object?>)['operations']! as List<Object?>)
          .cast<Map<String, Object?>>();
      return syncResponseJson(
        cursor: '3',
        results: [
          {
            'operationId': ops.single['operationId'],
            'entityId': clientId,
            'entityType': 'TRANSACTION',
            'operation': 'UPDATE',
            'status': 'CONFLICT',
            'reason': 'stale_version',
            'entity': transactionJson(
              id: 'server-9',
              clientId: clientId,
              title: 'Newer server title',
              version: 7,
            ),
          },
        ],
      );
    });

    await engine.syncNow();

    final row = store.db
        .select('SELECT title, version FROM transactions WHERE client_id = ?', [clientId])
        .single;
    expect(row['title'], 'Newer server title');
    expect(row['version'], 7);
    expect(store.nextPushBatch(), isEmpty);
    // CONFLICT is not a rejection: the batch is still considered clean.
    expect(engine.lastError, isNull);
    expect(engine.status, kSyncStatusSynced);
  });

  test('one REJECTED operation fails its row while the batch still applies',
      () async {
    final rejectedId =
        store.createTransaction(userId: userId, input: input(title: 'Bad link'));
    final appliedId =
        store.createTransaction(userId: userId, input: input(title: 'Good row'));

    api.onPost(ApiRoutes.sync, (req) {
      final ops = ((req.body! as Map<String, Object?>)['operations']! as List<Object?>)
          .cast<Map<String, Object?>>();
      return syncResponseJson(
        cursor: '4',
        results: [
          {
            'operationId': ops.first['operationId'],
            'entityId': rejectedId,
            'entityType': 'TRANSACTION',
            'operation': 'CREATE',
            'status': 'REJECTED',
            'reason': 'category_not_found',
          },
          {
            'operationId': ops.last['operationId'],
            'entityId': appliedId,
            'entityType': 'TRANSACTION',
            'operation': 'CREATE',
            'status': 'APPLIED',
            'entity': transactionJson(id: 'server-2', clientId: appliedId),
          },
        ],
      );
    });

    await engine.syncNow();

    expect(store.entitySyncStatus('TRANSACTION', rejectedId), kSyncStatusFailed);
    expect(store.entitySyncStatus('TRANSACTION', appliedId), kSyncStatusSynced);
    expect(store.nextPushBatch(), isEmpty, reason: 'both operations are off the queue');
    expect(engine.lastError, 'category_not_found');
    expect(engine.status, kSyncStatusFailed);
  });

  test('a network failure keeps the queue and arms the backoff', () async {
    store.createTransaction(userId: userId, input: input());
    api.onPost(
      ApiRoutes.sync,
      (_) => throw const ApiError(ApiErrorCodes.network, 'No connection.'),
    );

    await engine.syncNow();

    final op = store.nextPushBatch().single;
    expect(op.status, kOperationStatusPending, reason: 'network errors are never terminal');
    expect(op.attempts, 1);
    expect(engine.lastError, 'No connection.');
    expect(engine.status, kSyncStatusPending);

    // Within the backoff window a nudge must not hit the network again.
    final posts = syncPushes(api);
    engine.requestSync();
    await emit();
    expect(syncPushes(api), posts);

    // "Sync now" clears the backoff and pushes again.
    api.onPost(ApiRoutes.sync, (_) => syncResponseJson());
    await engine.syncNow();
    expect(syncPushes(api), posts + 1);
  });

  test('pull bootstraps without a cursor and pages until hasMore is false',
      () async {
    var calls = 0;
    api.onGet(ApiRoutes.syncChanges, (req) {
      calls++;
      if (calls == 1) {
        expect(req.query, isNot(contains('cursor')), reason: 'fresh device omits the cursor');
        return syncChangesJson(
          cursor: '10',
          hasMore: true,
          changes: [
            {
              'entityId': 'server-a',
              'entityType': 'TRANSACTION',
              'operation': 'UPSERT',
              'version': 2,
              'updatedAt': '2026-10-01T00:00:00.000Z',
              'payload': transactionJson(
                id: 'server-a',
                clientId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
                title: 'From another device',
              ),
            },
          ],
        );
      }
      expect(req.query?['cursor'], '10', reason: 'cursor advances page by page');
      return syncChangesJson(
        cursor: '20',
        hasMore: false,
        changes: [
          {
            'entityId': 'server-a',
            'entityType': 'TRANSACTION',
            'operation': 'DELETE',
            'version': 3,
            'updatedAt': '2026-10-01T00:00:01.000Z',
            'payload': transactionJson(
              id: 'server-a',
              clientId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
            ),
          },
        ],
      );
    });

    await engine.syncNow();

    expect(calls, 2);
    expect(store.cursor, '20');
    expect(store.lastSyncAt(), isNotNull);
    expect(
      store.db
          .select('SELECT COUNT(*) AS c FROM transactions WHERE client_id = ?',
              ['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'])
          .single['c'],
      0,
      reason: 'the tombstone from page 2 hard-deletes locally',
    );
    expect(engine.status, kSyncStatusSynced);
  });

  test('pull upserts land on top of the local store with their version', () async {
    api.onGet(ApiRoutes.syncChanges, (req) {
      return syncChangesJson(
        cursor: '5',
        changes: [
          {
            'entityId': 'server-b',
            'entityType': 'TRANSACTION',
            'operation': 'UPSERT',
            'version': 4,
            'updatedAt': '2026-10-01T00:00:00.000Z',
            'payload': transactionJson(
              id: 'server-b',
              clientId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
              title: 'Pulled row',
              version: 4,
            ),
          },
        ],
      );
    });

    await engine.syncNow();

    final row = store.db
        .select("SELECT title, version, sync_status FROM transactions WHERE client_id = ?",
            ['bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'])
        .single;
    expect(row['title'], 'Pulled row');
    expect(row['version'], 4);
    expect(row['sync_status'], kSyncStatusSynced);
    expect(store.cursor, '5');
  });

  test('an offline monitor blocks the cycle until connectivity returns', () async {
    final monitor = ConnectivityMonitor();
    final offlineEngine = SyncEngine(
      api: api,
      store: harness.store,
      tokenStore: tokens,
      connectivity: monitor,
    );
    addTearDown(offlineEngine.stop);

    await offlineEngine.start();
    monitor.debugSetOnline(false);

    store.createTransaction(userId: userId, input: input());
    offlineEngine.requestSync();
    await emit();
    expect(syncPushes(api), 0, reason: 'offline: no request is attempted');

    // Going online re-arms the queue and pushes it in one shot.
    api.onPost(ApiRoutes.sync, (req) {
      final ops = ((req.body! as Map<String, Object?>)['operations']! as List<Object?>)
          .cast<Map<String, Object?>>();
      return syncResponseJson(
        cursor: '1',
        results: [
          {
            'operationId': ops.single['operationId'],
            'entityId': ops.single['entityId'],
            'entityType': 'TRANSACTION',
            'operation': 'CREATE',
            'status': 'APPLIED',
            'entity': transactionJson(id: 'server-1', clientId: ops.single['entityId']! as String),
          },
        ],
      );
    });
    monitor.debugSetOnline(true);
    await emit();

    expect(syncPushes(api), 1, reason: 'online transition re-arms and pushes');
    expect(store.nextPushBatch(), isEmpty);
    offlineEngine.stop();
  });

  test('signing in kicks the first sync', () async {
    final auth = AuthController(
      authRepository: AuthRepository(api, harness.store),
      tokenStore: tokens,
    );
    engine.attachAuth(auth);
    addTearDown(() => engine.stop());

    expect(api.requestsWhere((r) => r.path == ApiRoutes.syncChanges), isEmpty);

    await auth.restore();
    await emit();

    expect(auth.status, AuthStatus.authenticated);
    expect(
      api.requestsWhere((r) => r.path == ApiRoutes.syncChanges),
      isNotEmpty,
      reason: 'the authenticated transition triggers a pull',
    );
  });

  test('parked operations are re-armed by syncNow', () async {
    final clientId = store.createTransaction(userId: userId, input: input());
    // Park it: eight failed pushes trip the retry budget.
    for (var i = 0; i < 8; i++) {
      store.markPushFailure([store.nextPushBatch().single.operationId], error: 'boom');
    }
    expect(store.nextPushBatch(), isEmpty);
    expect(store.countQueuedOperations(status: kOperationStatusFailed), 1);
    expect(store.entitySyncStatus('TRANSACTION', clientId), kSyncStatusFailed);

    await engine.syncNow();

    expect(
      store.countQueuedOperations(status: kOperationStatusPending),
      1,
      reason: 'manual sync re-arms FAILED operations before pushing',
    );
    // The push used the default empty-results handler, so the op is back to
    // PENDING after its attempt — proving it left the FAILED park.
    expect(store.entitySyncStatus('TRANSACTION', clientId), kSyncStatusPending);
  });
}
