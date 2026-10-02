import 'package:expenditure_tracker/core/network/api_routes.dart';
import 'package:expenditure_tracker/features/profile/profile_page.dart';
import 'package:expenditure_tracker/shared/models/sync.dart';
import 'package:expenditure_tracker/shared/models/transaction.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'support/fakes.dart';
import 'support/fixtures.dart';
import 'support/pump_app.dart';

int _syncPushes(FakeApiClient api) =>
    api.requestsWhere((r) => r.method == 'POST' && r.path == ApiRoutes.sync).length;

TransactionInput _input({String title = 'Bus fare'}) => TransactionInput(
      type: TransactionType.expense,
      amount: '120.50',
      categoryId: 'cat-food',
      title: title,
      description: null,
      transactionDate: '2026-10-01',
    );

void main() {
  testWidgets('offline rows carry the pending-sync chip into the UI',
      (tester) async {
    String? clientId;
    final app = await pumpApp(
      tester,
      signedIn: true,
      seed: (store) async {
        clientId = store.createTransaction(userId: userId, input: _input());
      },
    );
    await settle(tester, pumps: 10);

    // The default sync handler acknowledges nothing, so the row keeps its
    // PENDING marker — exactly what a device waiting for connectivity shows.
    expect(find.byTooltip('Pending sync'), findsOneWidget);
    expect(app.store.entitySyncStatus('TRANSACTION', clientId!), kSyncStatusPending);
  });

  testWidgets('rejected rows show the sync-failed chip', (tester) async {
    await pumpApp(
      tester,
      signedIn: true,
      seed: (store) async {
        final clientId = store.createTransaction(userId: userId, input: _input());
        store.rejectOperation(store.nextPushBatch().single.operationId);
        expect(store.entitySyncStatus('TRANSACTION', clientId), kSyncStatusFailed);
      },
    );
    await settle(tester, pumps: 10);

    expect(find.byTooltip('Sync failed'), findsOneWidget);
    expect(find.byTooltip('Pending sync'), findsNothing);
  });

  testWidgets('profile sync card reports the queue and Sync now pushes it',
      (tester) async {
    final app = await pumpApp(
      tester,
      signedIn: true,
      seed: (store) async {
        store.createTransaction(userId: userId, input: _input());
      },
    );
    await settle(tester, pumps: 10);

    await tester.tap(find.text('Profile'));
    await settle(tester, pumps: 8);

    expect(find.byType(ProfilePage), findsOneWidget);
    expect(find.text('Sync'), findsOneWidget);
    expect(find.textContaining('change(s) waiting to sync'), findsOneWidget);

    final before = _syncPushes(app.api);
    await tester.ensureVisible(find.widgetWithText(FilledButton, 'Sync now'));
    await tester.pump();
    await tester.tap(find.widgetWithText(FilledButton, 'Sync now'));
    await settle(tester, pumps: 8);

    expect(_syncPushes(app.api), greaterThan(before),
        reason: 'Sync now forces a cycle through the backoff');
  });

  testWidgets('an all-synced store reports up to date', (tester) async {
    await pumpApp(
      tester,
      signedIn: true,
      seed: (store) async {
        final clientId = store.createTransaction(userId: userId, input: _input());
        store.completeOperations(store.nextPushBatch().map((o) => o.operationId).toList());
        expect(store.entitySyncStatus('TRANSACTION', clientId), kSyncStatusSynced);
      },
    );
    await settle(tester, pumps: 10);

    await tester.tap(find.text('Profile'));
    await settle(tester, pumps: 8);

    // The sign-in kick already pulled once, so the card reports the sync time.
    expect(find.textContaining('Up to date'), findsOneWidget);
    expect(find.byTooltip('Pending sync'), findsNothing);
  });
}
