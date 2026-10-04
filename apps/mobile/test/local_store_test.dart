import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';

import 'package:expenditure_tracker/core/db/database.dart';
import 'package:expenditure_tracker/core/db/local_store.dart';
import 'package:expenditure_tracker/shared/models/sync.dart';
import 'package:expenditure_tracker/shared/models/transaction.dart';
import 'package:expenditure_tracker/shared/models/user.dart';

import 'support/sqlite_setup.dart';

TransactionInput input({
  String amount = '12.5',
  String title = 'Coffee',
  String categoryId = 'cat-food',
  String date = '2026-10-01',
  TransactionType type = TransactionType.expense,
  String? clientId,
  String? description,
}) =>
    TransactionInput(
      type: type,
      amount: amount,
      categoryId: categoryId,
      title: title,
      description: description,
      transactionDate: date,
      clientId: clientId,
    );

void main() {
  late TestStore harness;
  var opened = false;

  Future<TestStore> fresh() async {
    if (opened) harness.cleanup();
    final store = await TestStore.open();
    harness = store;
    opened = true;
    return store;
  }

  setUp(() async => fresh());
  tearDown(() => harness.cleanup());

  group('schema', () {
    test('opens at version 1 with the Phase 5 tables', () async {
      final store = harness.store;
      expect(store.db.userVersion, AppDatabase.schemaVersion);
      final tables = store.db
          .select("SELECT name FROM sqlite_master WHERE type = 'table'")
          .map((r) => r['name'])
          .toSet();
      expect(
        tables,
        containsAll([
          'users',
          'categories',
          'transactions',
          'sync_operations',
          'sync_metadata',
        ]),
      );
    });
  });

  group('local transaction writes', () {
    test('create inserts the row and queues a CREATE envelope', () async {
      final store = harness.store;
      final clientId = store.createTransaction(
        userId: 'user-1',
        input: input(amount: '12.5', clientId: 'client-abc', description: 'Ole'),
      );

      expect(clientId, 'client-abc');
      final row = store.getTransaction(clientId)!;
      expect(row.amount, '12.50', reason: 'amount normalised to two decimals');
      expect(row.version, 1);
      expect(row.syncStatus, kSyncStatusPending);
      expect(row.transactionDate, '2026-10-01');

      final ops = store.nextPushBatch();
      expect(ops, hasLength(1));
      final envelope = ops.single.toEnvelope();
      expect(envelope.keys, containsAll([
        'operationId',
        'entityId',
        'entityType',
        'operation',
        'timestamp',
        'payload',
      ]));
      expect(envelope['entityId'], 'client-abc');
      expect(envelope['entityType'], 'TRANSACTION');
      expect(envelope['operation'], 'CREATE');
      expect(envelope['payload'], {
        'clientId': 'client-abc',
        'type': 'EXPENSE',
        'amount': '12.50',
        'currency': 'BDT',
        'categoryId': 'cat-food',
        'title': 'Coffee',
        'description': 'Ole',
        'transactionDate': '2026-10-01',
      });
      expect(envelope['baseVersion'], 1);
      expect(DateTime.tryParse(envelope['timestamp']! as String), isNotNull);
    });

    test('create without a clientId generates one', () async {
      final store = harness.store;
      final clientId = store.createTransaction(userId: 'user-1', input: input());
      expect(clientId, matches(RegExp(
          r'^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$')));
      expect(store.getTransaction(clientId), isNotNull);
    });

    test('update queues an UPDATE with the observed baseVersion', () async {
      final store = harness.store;
      final clientId = store.createTransaction(userId: 'user-1', input: input());

      store.updateTransaction(
        clientId,
        input(amount: '99', title: 'Rent', date: '2026-10-02', categoryId: 'cat-bills'),
      );

      final row = store.getTransaction(clientId)!;
      expect(row.title, 'Rent');
      expect(row.amount, '99.00');
      expect(row.syncStatus, kSyncStatusPending);

      final ops = store.nextPushBatch();
      expect(ops, hasLength(2), reason: 'CREATE and UPDATE both queued, FIFO');
      expect(ops.first.operation, 'CREATE');
      final update = ops.last;
      expect(update.operation, 'UPDATE');
      expect(update.baseVersion, 1);
      expect((update.payload['amount']! as String), '99.00');
    });

    test('update with a baseVersion of the second version bumps correctly', () async {
      final store = harness.store;
      final clientId = store.createTransaction(userId: 'user-1', input: input());
      store.completeOperations(store.nextPushBatch().map((o) => o.operationId).toList());

      // Server applied the push: version 1 stays; simulate server v2 via pull.
      store.applyServerTransactionUpsert({
        'id': 'srv-1',
        'clientId': clientId,
        'deviceId': 'dev-a',
        'userId': 'user-1',
        'type': 'EXPENSE',
        'amount': '12.50',
        'currency': 'BDT',
        'categoryId': 'cat-food',
        'title': 'Coffee',
        'description': null,
        'transactionDate': '2026-10-01',
        'version': 2,
        'createdAt': '2026-10-01T10:00:00.000Z',
        'updatedAt': '2026-10-01T11:00:00.000Z',
        'deletedAt': null,
      });
      expect(store.getTransaction(clientId)!.version, 2);

      store.updateTransaction(clientId, input(title: 'Latte'));
      expect(store.nextPushBatch().single.baseVersion, 2);
    });

    test('delete removes the row and queues a DELETE', () async {
      final store = harness.store;
      final clientId = store.createTransaction(userId: 'user-1', input: input());

      store.deleteTransaction(clientId);

      expect(store.getTransaction(clientId), isNull);
      final ops = store.nextPushBatch();
      expect(ops.map((o) => o.operation).toList(), ['CREATE', 'DELETE']);
      expect(ops.last.baseVersion, 1);
      expect(ops.last.payload, isEmpty);
    });

    test('update of an unknown id throws; delete is a no-op', () async {
      final store = harness.store;
      expect(() => store.updateTransaction('nope', input()), throwsStateError);
      store.deleteTransaction('nope');
      expect(store.nextPushBatch(), isEmpty);
    });
  });

  group('local listing', () {
    setUp(() async {
      final store = harness.store;
      store.createTransaction(
        userId: 'user-1',
        input: input(title: 'Coffee shop', amount: '10.00', date: '2026-09-01'),
      );
      store.createTransaction(
        userId: 'user-1',
        input: input(
            title: 'Beans',
            description: 'for filter',
            amount: '2.50',
            date: '2026-09-15',
            categoryId: 'cat-other'),
      );
      store.createTransaction(
        userId: 'user-1',
        input: input(
            title: 'Salary',
            amount: '15.75',
            date: '2026-10-01',
            type: TransactionType.income,
            categoryId: 'cat-salary'),
      );
    });

    test('search matches title and description but not LIKE wildcards', () async {
      final store = harness.store;
      final byTitle = store.listTransactions(
          TransactionQuery(search: 'shop'));
      expect(byTitle.items.map((t) => t.title), ['Coffee shop']);

      final byDescription = store.listTransactions(
          TransactionQuery(search: 'filter'));
      expect(byDescription.items.map((t) => t.title), ['Beans']);

      final wildcard = store.listTransactions(TransactionQuery(search: '%'));
      expect(wildcard.items, isEmpty, reason: '% is escaped, not a wildcard');
    });

    test('type and category filters', () async {
      final store = harness.store;
      final income =
          store.listTransactions(TransactionQuery(type: TransactionType.income));
      expect(income.items.single.title, 'Salary');

      final byCategory =
          store.listTransactions(TransactionQuery(categoryId: 'cat-other'));
      expect(byCategory.items.single.title, 'Beans');
    });

    test('date range is inclusive and calendar-ordered', () async {
      final store = harness.store;
      final september = store
          .listTransactions(TransactionQuery(from: '2026-09-01', to: '2026-09-30'));
      expect(september.items.map((t) => t.title), ['Beans', 'Coffee shop']);
      expect(september.meta.total, 2);
    });

    test('sort by amount with pagination meta', () async {
      final store = harness.store;
      final asc = store.listTransactions(
          TransactionQuery(sort: 'amount', order: 'asc', limit: 2, page: 1));
      expect(asc.items.map((t) => t.amount), ['2.50', '10.00']);
      expect(asc.meta.total, 3);
      expect(asc.meta.totalPages, 2);
      expect(asc.meta.hasNextPage, isTrue);

      final page2 = store.listTransactions(
          TransactionQuery(sort: 'amount', order: 'asc', limit: 2, page: 2));
      expect(page2.items.single.amount, '15.75');
    });
  });

  group('local category writes', () {
    test('create queues a CREATE and normalises empty icon/color', () async {
      final store = harness.store;
      final id = store.createCategory(
        userId: 'user-1',
        name: 'Pets',
        suggestedType: TransactionType.expense,
        icon: '',
        color: null,
      );
      final row = store.getCategory(id)!;
      expect(row.icon, isNull);
      expect(row.syncStatus, kSyncStatusPending);
      expect(row.version, 1);

      final op = store.nextPushBatch().single;
      expect(op.entityType, 'CATEGORY');
      expect(op.payload, {
        'name': 'Pets',
        'suggestedType': 'EXPENSE',
      });
    });

    test('update merges with the existing row and keeps baseVersion', () async {
      final store = harness.store;
      final id = store.createCategory(
        userId: 'user-1',
        name: 'Pets',
        suggestedType: TransactionType.expense,
        icon: 'paw',
        color: '#123456',
      );
      store.updateCategory(id, name: 'Pets & vets', suggestedType: TransactionType.expense);

      final row = store.getCategory(id)!;
      expect(row.name, 'Pets & vets');
      expect(row.icon, 'paw', reason: 'omitted icon keeps its old value');
      expect(row.color, '#123456');
      expect(store.nextPushBatch().last.baseVersion, 1);
    });

    test('system categories are not deletable locally', () async {
      final store = harness.store;
      store.applyServerCategoryUpsert({
        'id': 'sys-food',
        'userId': null,
        'name': 'Food',
        'kind': 'SYSTEM',
        'icon': 'utensils',
        'color': '#F97316',
        'isSystem': true,
        'suggestedType': 'EXPENSE',
        'version': 1,
        'createdAt': '2026-01-01T00:00:00.000Z',
        'updatedAt': '2026-01-01T00:00:00.000Z',
        'deletedAt': null,
      });
      store.deleteCategory('sys-food');
      expect(store.getCategory('sys-food'), isNotNull);
      expect(store.nextPushBatch(), isEmpty);
    });

    test('delete queues an operation and drops the row', () async {
      final store = harness.store;
      final id = store.createCategory(
          userId: 'user-1', name: 'Pets', suggestedType: TransactionType.expense);
      store.deleteCategory(id);
      expect(store.getCategory(id), isNull);
      expect(store.nextPushBatch().last.operation, 'DELETE');
    });
  });

  group('list ordering', () {
    test('system categories sort first, then by name', () async {
      final store = harness.store;
      store.createCategory(
          userId: 'user-1', name: 'zebra', suggestedType: TransactionType.expense);
      store.createCategory(
          userId: 'user-1', name: 'Ants', suggestedType: TransactionType.expense);
      store.applyServerCategoryUpsert({
        'id': 'sys-food',
        'userId': null,
        'name': 'Food',
        'kind': 'SYSTEM',
        'icon': null,
        'color': null,
        'isSystem': true,
        'suggestedType': 'EXPENSE',
        'version': 1,
        'createdAt': '2026-01-01T00:00:00.000Z',
        'updatedAt': '2026-01-01T00:00:00.000Z',
        'deletedAt': null,
      });

      expect(
        store.listCategories().map((c) => c.name).toList(),
        ['Food', 'Ants', 'zebra'],
      );
    });
  });

  group('sync queue lifecycle', () {
    test('batch is FIFO across entity types', () async {
      final store = harness.store;
      final tx = store.createTransaction(userId: 'user-1', input: input());
      final cat = store.createCategory(
          userId: 'user-1', name: 'Pets', suggestedType: TransactionType.expense);
      store.deleteTransaction(tx);
      store.deleteCategory(cat);

      expect(
        store.nextPushBatch().map((o) => o.operation).toList(),
        ['CREATE', 'CREATE', 'DELETE', 'DELETE'],
      );
    });

    test('completeOperations clears ops and restores SYNCED', () async {
      final store = harness.store;
      final tx = store.createTransaction(userId: 'user-1', input: input());
      expect(store.entitySyncStatus('TRANSACTION', tx), kSyncStatusPending);

      store.completeOperations(
          store.nextPushBatch().map((o) => o.operationId).toList());

      expect(store.countQueuedOperations(), 0);
      expect(store.entitySyncStatus('TRANSACTION', tx), kSyncStatusSynced);
      expect(store.getTransaction(tx)!.version, 1, reason: 'server entity comes via CONFLICT');
    });

    test('completing one op keeps the entity PENDING while others remain', () async {
      final store = harness.store;
      final tx = store.createTransaction(userId: 'user-1', input: input());
      store.updateTransaction(tx, input(title: 'Tea'));

      store.completeOperations([store.nextPushBatch().first.operationId]);

      expect(store.entitySyncStatus('TRANSACTION', tx), kSyncStatusPending);
      expect(store.countQueuedOperations(), 1);
    });

    test('markPushFailure parks the operation after max attempts', () async {
      final store = harness.store;
      final tx = store.createTransaction(userId: 'user-1', input: input());
      final opId = store.nextPushBatch().single.operationId;

      for (var i = 0; i < LocalStore.maxPushAttempts - 1; i++) {
        store.markPushFailure([opId], error: 'timeout');
        expect(store.nextPushBatch(), hasLength(1), reason: 'still retryable');
      }
      store.markPushFailure([opId], error: 'timeout');

      expect(store.nextPushBatch(), isEmpty, reason: 'parked as FAILED');
      expect(store.countQueuedOperations(status: kOperationStatusFailed), 1);
      expect(store.entitySyncStatus('TRANSACTION', tx), kSyncStatusFailed);

      store.resetFailedOperations();
      expect(store.nextPushBatch(), hasLength(1));
      expect(store.entitySyncStatus('TRANSACTION', tx), kSyncStatusPending);
    });

    test('rejectOperation is terminal for the op but FAILED for the entity', () async {
      final store = harness.store;
      final cat = store.createCategory(
          userId: 'user-1', name: 'Pets', suggestedType: TransactionType.expense);
      final opId = store.nextPushBatch().single.operationId;

      store.rejectOperation(opId);

      expect(store.countQueuedOperations(), 0);
      expect(store.entitySyncStatus('CATEGORY', cat), kSyncStatusFailed);

      store.resetFailedOperations();
      expect(store.nextPushBatch(), isEmpty, reason: 'a rejection is never re-pushed');
    });
  });

  group('applying server changes', () {
    test('transaction upsert inserts, then overwrites keeping pending edits', () async {
      final store = harness.store;
      final clientId = store.createTransaction(userId: 'user-1', input: input());
      final payload = {
        'id': 'srv-9',
        'clientId': clientId,
        'deviceId': 'dev-b',
        'userId': 'user-1',
        'type': 'INCOME',
        'amount': '500.00',
        'currency': 'BDT',
        'categoryId': 'cat-salary',
        'title': 'Pulled',
        'description': null,
        'transactionDate': '2026-10-03T00:00:00.000Z',
        'version': 4,
        'createdAt': '2026-10-03T10:00:00.000Z',
        'updatedAt': '2026-10-03T11:00:00.000Z',
        'deletedAt': null,
      };

      store.applyServerTransactionUpsert(payload);

      final row = store.getTransaction(clientId)!;
      expect(row.id, 'srv-9');
      expect(row.title, 'Pulled');
      expect(row.type, TransactionType.income);
      expect(row.transactionDate, '2026-10-03', reason: 'date-only column');
      expect(row.version, 4);
      expect(row.syncStatus, kSyncStatusPending, reason: 'local CREATE still queued');
      expect(store.countQueuedOperations(), 1, reason: 'queue untouched by pull');

      store.completeOperations(
          store.nextPushBatch().map((o) => o.operationId).toList());
      expect(store.getTransaction(clientId)!.syncStatus, kSyncStatusSynced);
    });

    test('transaction pull with no local ops lands as SYNCED', () async {
      final store = harness.store;
      store.applyServerTransactionUpsert({
        'id': 'srv-x',
        'clientId': 'client-x',
        'deviceId': 'dev-b',
        'userId': 'user-1',
        'type': 'EXPENSE',
        'amount': '7.25',
        'currency': 'BDT',
        'categoryId': 'cat-food',
        'title': 'Bus',
        'description': null,
        'transactionDate': '2026-10-02',
        'version': 1,
        'createdAt': '2026-10-02T10:00:00.000Z',
        'updatedAt': '2026-10-02T10:00:00.000Z',
        'deletedAt': null,
      });
      final row = store.getTransaction('client-x')!;
      expect(row.syncStatus, kSyncStatusSynced);
      expect(row.amount, '7.25');
    });

    test('transaction delete matches by clientId or serverId', () async {
      final store = harness.store;
      store.applyServerTransactionUpsert({
        'id': 'srv-d',
        'clientId': 'client-d',
        'deviceId': null,
        'userId': 'user-1',
        'type': 'EXPENSE',
        'amount': '1.00',
        'currency': 'BDT',
        'categoryId': 'cat-food',
        'title': 'Gone',
        'description': null,
        'transactionDate': '2026-10-02',
        'version': 3,
        'createdAt': '2026-10-02T10:00:00.000Z',
        'updatedAt': '2026-10-02T10:00:00.000Z',
        'deletedAt': '2026-10-02T12:00:00.000Z',
      });
      expect(store.getTransaction('client-d'), isNull, reason: 'tombstone payload deletes');

      store.applyServerTransactionUpsert({
        'id': 'srv-e',
        'clientId': 'client-e',
        'deviceId': null,
        'userId': 'user-1',
        'type': 'EXPENSE',
        'amount': '1.00',
        'currency': 'BDT',
        'categoryId': 'cat-food',
        'title': 'Gone2',
        'description': null,
        'transactionDate': '2026-10-02',
        'version': 1,
        'createdAt': '2026-10-02T10:00:00.000Z',
        'updatedAt': '2026-10-02T10:00:00.000Z',
        'deletedAt': null,
      });
      store.applyServerTransactionDelete(serverId: 'srv-e');
      expect(store.getTransaction('client-e'), isNull);
    });

    test('category upsert adopts the server version and flags pending ops', () async {
      final store = harness.store;
      final id = store.createCategory(
          userId: 'user-1', name: 'Pets', suggestedType: TransactionType.expense);
      store.updateCategory(id, name: 'Pets', suggestedType: TransactionType.income);

      store.applyServerCategoryUpsert({
        'id': id,
        'userId': 'user-1',
        'name': 'Pets',
        'kind': 'USER',
        'icon': null,
        'color': null,
        'isSystem': false,
        'suggestedType': 'INCOME',
        'version': 3,
        'createdAt': '2026-10-01T00:00:00.000Z',
        'updatedAt': '2026-10-01T00:00:00.000Z',
        'deletedAt': null,
      });

      final row = store.getCategory(id)!;
      expect(row.version, 3);
      expect(row.syncStatus, kSyncStatusPending, reason: 'queued UPDATE remains');
      expect(store.countQueuedOperations(), 2);
    });

    test('category delete removes the row', () async {
      final store = harness.store;
      store.applyServerCategoryUpsert({
        'id': 'cat-1',
        'userId': 'user-1',
        'name': 'Old',
        'kind': 'USER',
        'icon': null,
        'color': null,
        'isSystem': false,
        'suggestedType': 'EXPENSE',
        'version': 2,
        'createdAt': '2026-10-01T00:00:00.000Z',
        'updatedAt': '2026-10-01T00:00:00.000Z',
        'deletedAt': null,
      });
      store.applyServerCategoryDelete('cat-1');
      expect(store.getCategory('cat-1'), isNull);
    });
  });

  group('metadata', () {
    test('deviceId is stable within and across reopen', () async {
      final store = harness.store;
      final id = store.deviceId();
      expect(store.deviceId(), id);
      expect(
        RegExp(r'^[0-9a-f-]{36}$').hasMatch(id),
        isTrue,
      );

      final reopened = await harness.reopen();
      expect(reopened.store.deviceId(), id);
      harness = reopened;
    });

    test('cursor and lastSyncAt roundtrip; cursor can be cleared', () async {
      final store = harness.store;
      expect(store.cursor, isNull);
      store.cursor = '1234567890123';
      expect(store.cursor, '1234567890123');

      final now = DateTime.now().toUtc();
      store.setLastSyncAt(now);
      expect(store.lastSyncAt()!.toUtc(), now);

      store.cursor = null;
      expect(store.cursor, isNull);
    });
  });

  group('user snapshot', () {
    test('upsert then get roundtrips the profile', () async {
      final store = harness.store;
      const user = UserProfile(
        id: 'user-1',
        name: 'Demo',
        email: 'demo@example.com',
        phone: null,
        avatarUrl: null,
        emailVerified: true,
        phoneVerified: false,
        role: 'ADMIN',
        providers: [AuthProvider.email],
        defaultCurrency: 'BDT',
        timezone: 'Asia/Dhaka',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-02T00:00:00.000Z',
      );
      store.upsertUser(user);
      final loaded = store.getUser()!;
      expect(loaded.id, user.id);
      expect(loaded.name, 'Demo');
      expect(loaded.providers, [AuthProvider.email]);
      expect(loaded.defaultCurrency, 'BDT');
      expect(loaded.role, 'ADMIN');
      expect(loaded.isAdmin, isTrue);
    });

    test('a snapshot cached before `role` existed is not read as an admin', () {
      const user = UserProfile(
        id: 'user-2',
        name: 'Legacy',
        email: null,
        phone: null,
        avatarUrl: null,
        emailVerified: false,
        phoneVerified: false,
        role: 'USER',
        providers: [],
        defaultCurrency: 'BDT',
        timezone: 'UTC',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      );
      final legacy = jsonDecode(jsonEncode(user.toJson())) as Map<String, Object?>;
      legacy.remove('role');

      final parsed = UserProfile.fromJson(legacy);

      expect(parsed.role, 'USER');
      expect(parsed.isAdmin, isFalse);
    });
  });

  group('persistence', () {
    test('rows, queue, and metadata survive a reopen', () async {
      final store = harness.store;
      final tx = store.createTransaction(userId: 'user-1', input: input(title: 'Persist'));
      final cat = store.createCategory(
          userId: 'user-1', name: 'Pets', suggestedType: TransactionType.expense);
      store.cursor = '999';
      final deviceId = store.deviceId();

      final reopened = await harness.reopen();
      harness = reopened;
      final s = reopened.store;
      expect(s.getTransaction(tx)!.title, 'Persist');
      expect(s.getCategory(cat), isNotNull);
      expect(s.countQueuedOperations(), 2);
      expect(s.cursor, '999');
      expect(s.deviceId(), deviceId);
    });

    test('clearAll wipes user data but keeps the device id', () async {
      final store = harness.store;
      store.createTransaction(userId: 'user-1', input: input());
      store.cursor = '42';
      final deviceId = store.deviceId();

      store.clearAll();

      expect(store.listTransactions(TransactionQuery()).items, isEmpty);
      expect(store.listCategories(), isEmpty);
      expect(store.countQueuedOperations(), 0);
      expect(store.cursor, isNull);
      expect(store.deviceId(), deviceId);
    });
  });

  group('wire models', () {
    test('SyncResponse parses results and changes', () {
      final response = SyncResponse.fromJson(jsonDecode('''
      {
        "results": [{
          "operationId": "op-1", "entityId": "e-1", "entityType": "TRANSACTION",
          "operation": "CREATE", "status": "APPLIED",
          "entity": {"id": "srv-1", "clientId": "e-1"}
        }],
        "changes": [{
          "entityId": "srv-2", "entityType": "TRANSACTION", "operation": "DELETE",
          "version": 3, "updatedAt": "2026-10-01T00:00:00.000Z",
          "payload": {"id": "srv-2", "clientId": "e-2"}
        }],
        "cursor": "123",
        "serverTime": "2026-10-01T00:00:00.000Z"
      }
      '''));
      expect(response.results.single.status, 'APPLIED');
      expect(response.results.single.entity!['clientId'], 'e-1');
      expect(response.changes.single.operation, 'DELETE');
      expect(response.cursor, '123');
    });
  });
}
