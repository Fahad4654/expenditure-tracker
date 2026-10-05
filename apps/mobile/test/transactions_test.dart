import 'package:expenditure_tracker/core/db/local_store.dart';
import 'package:expenditure_tracker/core/network/api_routes.dart';
import 'package:expenditure_tracker/features/transactions/transaction_detail_page.dart';
import 'package:expenditure_tracker/features/transactions/transaction_form_page.dart';
import 'package:expenditure_tracker/shared/models/transaction.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'support/fakes.dart';
import 'support/fixtures.dart';
import 'support/pump_app.dart';

Future<void> _seedTwo(LocalStore store) async {
  store.applyServerCategoryUpsert(categoryJson());
  store.applyServerTransactionUpsert(
    transactionJson(title: 'Lunch with Sam', amount: '250.00'),
  );
  store.applyServerTransactionUpsert(
    transactionJson(
      id: '55555555-5555-4555-8555-555555555555',
      clientId: '55555555-5555-4555-8555-555555555556',
      title: 'Monthly salary',
      amount: '50000.00',
      type: 'INCOME',
      date: '2026-09-25',
    ),
  );
}

void main() {
  testWidgets('lists transactions from the local store', (tester) async {
    await pumpApp(tester, signedIn: true, seed: _seedTwo);

    await tester.tap(find.text('Transactions'));
    await settle(tester, pumps: 8);

    expect(find.text('Lunch with Sam'), findsOneWidget);
    expect(find.text('Monthly salary'), findsOneWidget);
    expect(find.text('2 transactions'), findsOneWidget);
  });

  testWidgets('filters the list as search is typed', (tester) async {
    await pumpApp(tester, signedIn: true, seed: _seedTwo);

    await tester.tap(find.text('Transactions'));
    await settle(tester, pumps: 8);

    await tester.enterText(find.byType(TextField).first, 'lunch');
    await tester.pump(const Duration(milliseconds: 100));
    await tester.pump(const Duration(milliseconds: 300));
    await settle(tester);

    expect(find.text('Lunch with Sam'), findsOneWidget);
    expect(find.text('Monthly salary'), findsNothing);
    expect(find.text('1 transaction'), findsOneWidget);
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

  testWidgets('creates a transaction locally and queues it for sync',
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

    expect(find.byType(SnackBar), findsNothing);

    final created = app.store
        .listTransactions(const TransactionQuery(limit: 50))
        .items
        .single;
    expect(created.amount, '120.50', reason: 'normalised on write');
    expect(created.title, 'Coffee');
    expect(created.type, TransactionType.expense);
    expect(created.categoryId, categoryId);
    expect(created.clientId, isNotEmpty);
    expect(created.transactionDate, matches(RegExp(r'^\d{4}-\d{2}-\d{2}$')));
    expect(created.syncStatus, 'PENDING');

    final op = app.store.nextPushBatch().single;
    expect(op.operation, 'CREATE');
    expect(op.entityType, 'TRANSACTION');
    expect(op.payload['amount'], '120.50');
    expect(op.payload['clientId'], created.clientId);
    expect(
      app.api.requestsWhere((r) => r.method == 'POST' && r.path == ApiRoutes.sync),
      isNotEmpty,
      reason: 'the local write nudged the sync engine',
    );

    // The write never went over the network — the queue pushes it later.
    expect(
      app.api.requestsWhere((r) => r.method == 'POST' && r.path.endsWith('/transactions')),
      isEmpty,
    );
  });

  testWidgets('picking a category opens a searchable list', (tester) async {
    await pumpApp(tester, signedIn: true, seed: (store) async {
      store.applyServerCategoryUpsert(categoryJson());
      store.applyServerCategoryUpsert(
        categoryJson(id: 'cat-transport', name: 'Transport', icon: 'car'),
      );
    });

    await tester.tap(find.widgetWithText(FloatingActionButton, 'Add'));
    await settle(tester, pumps: 8);

    final form = find.byType(TransactionFormPage);
    expect(
      find.descendant(of: form, matching: find.text('Food')),
      findsOneWidget,
      reason: 'the first matching category is preselected',
    );

    await tester.tap(find.descendant(of: form, matching: find.text('Food')));
    await settle(tester);

    final search = find.byKey(const ValueKey('category-search'));
    expect(search, findsOneWidget);

    await tester.enterText(search, 'trans');
    await settle(tester);

    expect(find.widgetWithText(ListTile, 'Transport'), findsOneWidget);
    expect(find.widgetWithText(ListTile, 'Food'), findsNothing);

    await tester.tap(find.widgetWithText(ListTile, 'Transport'));
    await settle(tester);

    expect(
      find.descendant(of: form, matching: find.text('Transport')),
      findsOneWidget,
      reason: 'the picked category now shows in the form field',
    );
    expect(search, findsNothing);
  });

  testWidgets('tags a note on a new transaction', (tester) async {
    final api = FakeApiClient();
    api.onGet(ApiRoutes.notes, (_) => [noteJson()]);
    final app = await pumpApp(tester, api: api, signedIn: true, seed: (store) async {
      store.applyServerCategoryUpsert(categoryJson());
    });

    await tester.tap(find.widgetWithText(FloatingActionButton, 'Add'));
    await settle(tester, pumps: 8);

    await tester.enterText(find.byType(TextFormField).at(0), '120.5');
    await tester.enterText(find.byType(TextFormField).at(1), 'Coffee');

    await tester.tap(
      find.ancestor(of: find.text('Tag note'), matching: find.byType(InkWell)),
    );
    await settle(tester);

    final search = find.byKey(const ValueKey('note-search'));
    expect(search, findsOneWidget);
    expect(
      find.widgetWithText(ListTile, 'No note'),
      findsNothing,
      reason: 'the empty label is not offered as an option',
    );

    await tester.enterText(search, 'groc');
    await settle(tester);

    expect(find.widgetWithText(ListTile, 'Groceries'), findsOneWidget);

    await tester.tap(find.widgetWithText(ListTile, 'Groceries'));
    await settle(tester);

    expect(
      find.descendant(
        of: find.byType(TransactionFormPage),
        matching: find.text('Groceries'),
      ),
      findsOneWidget,
      reason: 'the picked note now shows in the form field',
    );

    await tester.tap(find.widgetWithText(FilledButton, 'Add transaction'));
    await settle(tester, pumps: 8);

    final created =
        app.store.listTransactions(const TransactionQuery(limit: 50)).items;
    expect(created.single.noteId, noteId);
  });

  testWidgets('clears the tagged note from the field', (tester) async {
    final api = FakeApiClient();
    api.onGet(ApiRoutes.notes, (_) => [noteJson()]);
    await pumpApp(tester, api: api, signedIn: true, seed: (store) async {
      store.applyServerCategoryUpsert(categoryJson());
    });

    await tester.tap(find.widgetWithText(FloatingActionButton, 'Add'));
    await settle(tester, pumps: 8);

    await tester.enterText(find.byType(TextFormField).at(0), '120.5');
    await tester.enterText(find.byType(TextFormField).at(1), 'Coffee');

    await tester.tap(
      find.ancestor(of: find.text('Tag note'), matching: find.byType(InkWell)),
    );
    await settle(tester);
    await tester.tap(find.widgetWithText(ListTile, 'Groceries'));
    await settle(tester);

    expect(find.byTooltip('Clear note'), findsOneWidget);

    await tester.tap(find.byTooltip('Clear note'));
    await settle(tester);

    expect(find.byTooltip('Clear note'), findsNothing);
    expect(
      find.descendant(
        of: find.byType(TransactionFormPage),
        matching: find.text('No note'),
      ),
      findsOneWidget,
      reason: 'the field falls back to its empty label',
    );
  });

  testWidgets('detail page shows the tagged note title', (tester) async {
    final api = FakeApiClient();
    api.onGet(ApiRoutes.notes, (_) => [noteJson()]);
    await pumpApp(tester, api: api, signedIn: true, seed: (store) async {
      store.applyServerCategoryUpsert(categoryJson());
      store.applyServerTransactionUpsert(transactionJson(noteId: noteId));
    });

    await tester.tap(find.text('Transactions'));
    await settle(tester, pumps: 8);

    await tester.tap(find.text('Lunch with Sam'));
    await settle(tester, pumps: 8);

    expect(find.byType(TransactionDetailPage), findsOneWidget);
    expect(find.text('Tagged note'), findsOneWidget);
    expect(find.text('Groceries'), findsOneWidget);
  });
}
