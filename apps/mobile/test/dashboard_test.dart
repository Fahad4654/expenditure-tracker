import 'package:expenditure_tracker/core/db/local_store.dart';
import 'package:expenditure_tracker/features/auth/auth_controller.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'support/fixtures.dart';
import 'support/pump_app.dart';

String _ymd(DateTime d) =>
    '${d.year.toString().padLeft(4, '0')}-'
    '${d.month.toString().padLeft(2, '0')}-'
    '${d.day.toString().padLeft(2, '0')}';

/// Seeds the store with a fixed financial picture:
/// - ৳1,000.00 income + ৳250.00 expense **today**
/// - ৳50,000.00 income + ৳12,000.00 expense on day 2 of the month
/// - everything categories as the "Food" system category
///
/// The second day is an in-month day that is never "today" (on the 1st/2nd
/// the naive day-2 date would collide with the daily window).
Future<void> _seedDashboard(LocalStore store) async {
  final now = DateTime.now();
  final today = _ymd(now);
  final dayTwo = '${today.substring(0, 8)}${today.endsWith('02') ? '03' : '02'}';
  store.applyServerCategoryUpsert(categoryJson());
  for (final json in [
    transactionJson(
        amount: '1000.00', type: 'INCOME', date: today, title: 'Salary'),
    transactionJson(
      id: '99999999-9999-4999-8999-999999999999',
      clientId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      title: 'Lunch with Sam',
      amount: '250.00',
      date: today,
    ),
    transactionJson(
      id: '88888888-8888-4888-8888-888888888888',
      clientId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      amount: '50000.00',
      type: 'INCOME',
      date: dayTwo,
      title: 'Freelance payout',
    ),
    transactionJson(
      id: '77777777-7777-4777-8777-777777777777',
      clientId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      amount: '12000.00',
      date: dayTwo,
      title: 'Quarterly rent',
    ),
  ]) {
    store.applyServerTransactionUpsert(json);
  }
}

void main() {
  testWidgets('shows today/month summaries and recent activity',
      (tester) async {
    final app = await pumpApp(tester, signedIn: true, seed: _seedDashboard);
    await settle(tester, pumps: 10);

    expect(app.auth.status, AuthStatus.authenticated);
    expect(find.text('Today'), findsOneWidget);
    expect(find.text('This month'), findsOneWidget);

    // Today: ৳1,000.00 income, ৳250.00 expense, ৳750.00 balance.
    expect(find.text('৳1,000.00'), findsWidgets);
    expect(find.text('৳250.00'), findsWidgets);
    expect(find.text('৳750.00'), findsOneWidget);

    // Month: ৳51,000.00 − ৳12,250.00 = ৳38,750.00 balance.
    expect(find.text('৳51,000.00'), findsWidgets);
    expect(find.text('৳12,250.00'), findsWidgets);
    expect(find.text('৳38,750.00'), findsOneWidget);

    expect(find.text('Lunch with Sam'), findsOneWidget);
    // The category card sits below the fold in the dashboard ListView.
    await tester.scrollUntilVisible(
      find.text('Top spending this month'),
      200,
      scrollable: find.byType(Scrollable),
    );
    expect(find.text('Top spending this month'), findsOneWidget);
    expect(find.text('100.0%'), findsOneWidget);

    // Local-first: reports never hit the network.
    expect(
      app.api.requestsWhere((r) => r.path.contains('/reports/')),
      isEmpty,
    );
  });

  testWidgets('refreshes the dashboard after a transaction is added',
      (tester) async {
    final app = await pumpApp(tester, signedIn: true, seed: _seedDashboard);
    await settle(tester, pumps: 10);

    await tester.tap(find.widgetWithText(FloatingActionButton, 'Add'));
    await settle(tester, pumps: 8);

    await tester.enterText(find.byType(TextFormField).at(0), '40');
    await tester.enterText(find.byType(TextFormField).at(1), 'Bus fare');
    await tester.tap(find.widgetWithText(FilledButton, 'Add transaction'));
    await settle(tester, pumps: 10);

    // The write landed locally, queued for sync, and the tick reloaded the
    // dashboard from SQLite: today's expense grew by ৳40.00.
    expect(find.byType(SnackBar), findsNothing);
    expect(find.text('৳290.00'), findsOneWidget);
    expect(app.syncRequests, greaterThan(0));
    expect(
      app.store.nextPushBatch().map((op) => op.payload['title']),
      contains('Bus fare'),
    );
    expect(app.store.nextPushBatch(), isNotEmpty);
  });
}
