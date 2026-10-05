import 'package:expenditure_tracker/core/db/local_store.dart';
import 'package:expenditure_tracker/core/network/api_routes.dart';
import 'package:expenditure_tracker/features/notes/note_form_page.dart';
import 'package:expenditure_tracker/shared/formatters.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'support/fakes.dart';
import 'support/fixtures.dart';
import 'support/pump_app.dart';

Future<void> _seedOne(LocalStore store) async {
  store.applyServerCategoryUpsert(categoryJson());
  store.applyServerTransactionUpsert(transactionJson());
}

Future<void> _seedTwo(LocalStore store) async {
  store.applyServerCategoryUpsert(categoryJson());
  store.applyServerTransactionUpsert(transactionJson());
  store.applyServerTransactionUpsert(
    transactionJson(
      id: '55555555-5555-4555-8555-555555555555',
      clientId: '55555555-5555-4555-8555-555555555556',
      title: 'Monthly salary',
      type: 'INCOME',
      date: '2026-09-25',
    ),
  );
}

/// The submit button inside the pushed form — the empty state behind it also
/// offers an "Add note" button.
Finder _submitForm(WidgetTester tester) => find.descendant(
      of: find.byType(NoteFormPage),
      matching: find.widgetWithText(FilledButton, 'Add note'),
    );

void main() {
  group('NotesPage', () {
    testWidgets('lists notes from the API with tagged transaction chips',
        (tester) async {
      final api = FakeApiClient();
      api.onGet(ApiRoutes.notes, (_) => [
            noteJson(
              transactions: [
                noteTransactionRefJson(
                  transactionDate: todayIso(),
                ),
              ],
            ),
          ]);
      await pumpApp(tester, api: api, signedIn: true);

      await tester.tap(find.text('Notes'));
      await settle(tester, pumps: 8);

      expect(find.text('Groceries'), findsOneWidget);
      expect(find.text('milk, eggs'), findsOneWidget);
      expect(find.text('Tagged on'), findsOneWidget);
      expect(
        find.text('Weekly groceries · ${formatDay(todayIso())}'),
        findsOneWidget,
      );
    });

    testWidgets('shows an empty state when there are none', (tester) async {
      await pumpApp(tester, signedIn: true);

      await tester.tap(find.text('Notes'));
      await settle(tester, pumps: 8);

      expect(find.text('No notes yet'), findsOneWidget);
    });

    testWidgets('validates the form before submitting', (tester) async {
      final app = await pumpApp(tester, signedIn: true);

      await tester.tap(find.text('Notes'));
      await settle(tester, pumps: 8);

      await tester.tap(find.byTooltip('Add note'));
      await settle(tester, pumps: 8);
      expect(find.byType(NoteFormPage), findsOneWidget);

      await tester.tap(_submitForm(tester));
      await settle(tester);

      expect(find.text('Title is required'), findsOneWidget);
      final posts = app.api.requestsWhere(
        (request) => request.method == 'POST' && request.path == ApiRoutes.notes,
      );
      expect(posts, isEmpty);
    });

    testWidgets('filters tagged transactions as the search is typed',
        (tester) async {
      await pumpApp(tester, signedIn: true, seed: _seedTwo);

      await tester.tap(find.text('Notes'));
      await settle(tester, pumps: 8);

      await tester.tap(find.byTooltip('Add note'));
      await settle(tester, pumps: 8);

      final search = find.byKey(const ValueKey('tag-transaction-search'));
      expect(search, findsOneWidget);

      await tester.enterText(search, 'salary');
      await settle(tester);

      expect(find.text('Monthly salary'), findsOneWidget);
      expect(find.text('Lunch with Sam'), findsNothing);

      await tester.enterText(search, 'zzz');
      await settle(tester);
      expect(find.text('No transactions match.'), findsOneWidget);
    });

    testWidgets('creates a note with the selected transaction tags',
        (tester) async {
      final app =
          await pumpApp(tester, signedIn: true, seed: _seedOne);

      await tester.tap(find.text('Notes'));
      await settle(tester, pumps: 8);

      await tester.tap(find.byTooltip('Add note'));
      await settle(tester, pumps: 8);

      await tester.enterText(find.byType(TextFormField).first, 'Groceries list');
      // Tag the seeded transaction from the local store.
      await tester.tap(find.text('Lunch with Sam'));
      await settle(tester);
      expect(tester.widget<Checkbox>(find.byType(Checkbox)).value, isTrue);

      await tester.tap(_submitForm(tester));
      await settle(tester, pumps: 30);

      final posts = app.api.requestsWhere(
        (request) => request.method == 'POST' && request.path == ApiRoutes.notes,
      );
      expect(posts, hasLength(1));
      final body = posts.single.body! as Map<String, Object?>;
      expect(body['title'], 'Groceries list');
      expect(body['content'], isNull);
      expect(body['transactionIds'], [transactionId]);
      expect(find.byType(NoteFormPage), findsNothing);
    });
  });
}
