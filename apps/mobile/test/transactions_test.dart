import 'package:expenditure_tracker/features/transactions/transaction_form_page.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'support/fixtures.dart';
import 'support/pump_app.dart';

void main() {
  testWidgets('lists transactions returned by the API', (tester) async {
    final app = await pumpApp(tester, signedIn: true);
    app.api.onGet('/api/v1/transactions', (_) => paginatedJson([
          transactionJson(title: 'Lunch with Sam', amount: '250.00'),
          transactionJson(
            id: '55555555-5555-4555-8555-555555555555',
            title: 'Monthly salary',
            amount: '50000.00',
            type: 'INCOME',
            date: '2026-09-25',
          ),
        ], total: 2));

    await tester.tap(find.text('Transactions'));
    await settle(tester, pumps: 8);

    expect(find.text('Lunch with Sam'), findsOneWidget);
    expect(find.text('Monthly salary'), findsOneWidget);
    expect(find.text('2 transactions'), findsOneWidget);
  });

  testWidgets('debounces search and sends it to the API', (tester) async {
    final app = await pumpApp(tester, signedIn: true);

    await tester.tap(find.text('Transactions'));
    await settle(tester, pumps: 8);

    await tester.enterText(find.byType(TextField).first, 'lunch');
    await tester.pump(const Duration(milliseconds: 100));
    await tester.pump(const Duration(milliseconds: 300));
    await settle(tester);

    final searchRequests = app.api.requestsWhere(
      (r) => r.path.endsWith('/transactions') && r.query?['search'] == 'lunch',
    );
    expect(searchRequests, isNotEmpty);
  });

  testWidgets('validates the add form before submitting', (tester) async {
    await pumpApp(tester, signedIn: true);

    await tester.tap(find.widgetWithText(FloatingActionButton, 'Add'));
    await settle(tester, pumps: 8);

    expect(find.byType(TransactionFormPage), findsOneWidget);

    await tester.tap(find.widgetWithText(FilledButton, 'Add transaction'));
    await settle(tester);

    expect(find.text('Amount is required'), findsOneWidget);
  });

  testWidgets('creates a transaction with an idempotency client id',
      (tester) async {
    final app = await pumpApp(tester, signedIn: true);

    await tester.tap(find.widgetWithText(FloatingActionButton, 'Add'));
    await settle(tester, pumps: 8);

    final amountField = find.byType(TextFormField).at(0);
    final titleField = find.byType(TextFormField).at(1);
    await tester.enterText(amountField, '120.5');
    await tester.enterText(titleField, 'Coffee');

    await tester.tap(find.widgetWithText(FilledButton, 'Add transaction'));
    await settle(tester, pumps: 8);

    final create = app.api.requestsWhere((r) => r.method == 'POST' && r.path.endsWith('/transactions')).single;
    final body = create.body! as Map<String, Object?>;
    expect(body['amount'], '120.50');
    expect(body['title'], 'Coffee');
    expect(body['type'], 'EXPENSE');
    expect(body['categoryId'], categoryId);
    expect(body['clientId'], isNotNull);
    expect(body['transactionDate'], matches(RegExp(r'^\d{4}-\d{2}-\d{2}$')));
    expect(find.byType(SnackBar), findsNothing);
  });
}
