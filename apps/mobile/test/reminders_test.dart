import 'package:expenditure_tracker/core/network/api_routes.dart';
import 'package:expenditure_tracker/core/network/repositories.dart';
import 'package:expenditure_tracker/features/reminders/reminder_form_page.dart';
import 'package:expenditure_tracker/shared/formatters.dart';
import 'package:expenditure_tracker/shared/models/reminder.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'support/fakes.dart';
import 'support/fixtures.dart';
import 'support/pump_app.dart';
/// The submit button inside the pushed form — the empty state behind it also
/// offers an "Add reminder" button.
Finder _submitForm(WidgetTester tester) => find.descendant(
      of: find.byType(ReminderFormPage),
      matching: find.widgetWithText(FilledButton, 'Add reminder'),
    );

void main() {
  group('RemindersPage', () {
    testWidgets('lists reminders from the API with due chips', (tester) async {
      final api = FakeApiClient();
      api.onGet(ApiRoutes.reminders, (_) => [
            reminderJson(
              title: 'Pay internet bill',
              dueDate: '2020-01-01',
              dueTime: '18:30',
            ),
            reminderJson(
              id: '77777777-7777-4777-8777-777777777777',
              title: 'Renew passport',
              dueDate: todayIso(),
              details: null,
            ),
          ]);
      await pumpApp(tester, api: api, signedIn: true);

      await tester.tap(find.text('Reminders'));
      await settle(tester, pumps: 8);

      expect(find.text('Pay internet bill'), findsOneWidget);
      expect(find.text('Renew passport'), findsOneWidget);
      expect(find.text('Overdue · 1 Jan 2020 · 18:30'), findsOneWidget);
      expect(find.text('Due today'), findsOneWidget);
      expect(find.text('2 reminders'), findsOneWidget);
    });

    testWidgets('shows an empty state when there are none', (tester) async {
      await pumpApp(tester, signedIn: true);

      await tester.tap(find.text('Reminders'));
      await settle(tester, pumps: 8);

      expect(find.text('No reminders yet'), findsOneWidget);
    });

    testWidgets('validates the form before submitting', (tester) async {
      final app = await pumpApp(tester, signedIn: true);

      await tester.tap(find.text('Reminders'));
      await settle(tester, pumps: 8);

      await tester.tap(find.byTooltip('Add reminder'));
      await settle(tester, pumps: 8);
      expect(find.byType(ReminderFormPage), findsOneWidget);

      await tester.tap(_submitForm(tester));
      await settle(tester);

      expect(find.text('Title is required'), findsOneWidget);
      final posts = app.api.requestsWhere(
        (request) => request.method == 'POST' && request.path == ApiRoutes.reminders,
      );
      expect(posts, isEmpty);
    });

    testWidgets('creates a reminder and posts the form payload', (tester) async {
      final app = await pumpApp(tester, signedIn: true);

      await tester.tap(find.text('Reminders'));
      await settle(tester, pumps: 8);

      await tester.tap(find.byTooltip('Add reminder'));
      await settle(tester, pumps: 8);

      await tester.enterText(find.byType(TextFormField).first, 'Pay internet bill');
      await tester.tap(_submitForm(tester));
      await settle(tester, pumps: 30);

      final posts = app.api.requestsWhere(
        (request) => request.method == 'POST' && request.path == ApiRoutes.reminders,
      );
      expect(posts, hasLength(1));
      final body = posts.single.body! as Map<String, Object?>;
      expect(body['title'], 'Pay internet bill');
      expect(body['dueDate'], todayIso());
      expect(body['dueTime'], isNull);
      expect(body['details'], isNull);
      expect(find.byType(ReminderFormPage), findsNothing);
    });

    testWidgets('toggles completion with a completed patch', (tester) async {
      final api = FakeApiClient();
      api.onGet(ApiRoutes.reminders, (_) => [reminderJson()]);
      final app = await pumpApp(tester, api: api, signedIn: true);

      await tester.tap(find.text('Reminders'));
      await settle(tester, pumps: 8);

      await tester.tap(find.byType(Checkbox));
      await settle(tester, pumps: 8);

      final patches = app.api.requestsWhere(
        (request) =>
            request.method == 'PATCH' &&
            request.path == ApiRoutes.reminder(reminderId),
      );
      expect(patches, hasLength(1));
      expect(patches.single.body, {'completed': true});
    });

    testWidgets('filters by pending and completed', (tester) async {
      final api = FakeApiClient();
      api.onGet(ApiRoutes.reminders, (_) => [
            reminderJson(title: 'Open one'),
            reminderJson(
              id: '77777777-7777-4777-8777-777777777777',
              title: 'Done one',
              completedAt: '2026-10-01T10:00:00.000Z',
            ),
          ]);
      await pumpApp(tester, api: api, signedIn: true);

      await tester.tap(find.text('Reminders'));
      await settle(tester, pumps: 8);
      expect(find.text('2 reminders'), findsOneWidget);

      await tester.tap(find.widgetWithText(ChoiceChip, 'Pending'));
      await settle(tester);
      expect(find.text('Open one'), findsOneWidget);
      expect(find.text('Done one'), findsNothing);

      await tester.tap(find.widgetWithText(ChoiceChip, 'Completed'));
      await settle(tester);
      expect(find.text('Open one'), findsNothing);
      expect(find.text('Done one'), findsOneWidget);
    });
  });

  group('RemindersRepository', () {
    test('sends the due time as HH:mm and clears it with null', () async {
      final api = FakeApiClient();
      api.onPost(ApiRoutes.reminders, (request) {
        final body = request.body! as Map<String, Object?>;
        return reminderJson(
          title: body['title']! as String,
          dueDate: body['dueDate']! as String,
          dueTime: body['dueTime'] as String?,
          details: body['details'] as String?,
        );
      });
      api.onPatch(ApiRoutes.reminder(reminderId), (request) {
        final body = request.body! as Map<String, Object?>;
        return reminderJson(dueTime: body['dueTime'] as String?);
      });

      final repository = RemindersRepository(api);

      await repository.create(const ReminderInput(
        title: 'Pay internet bill',
        dueDate: '2026-10-05',
        dueTime: '18:30',
      ));
      final createBody = api.log.last.body! as Map<String, Object?>;
      expect(createBody['dueTime'], '18:30');

      await repository.update(reminderId, const ReminderInput(
        title: 'Pay internet bill',
        dueDate: '2026-10-05',
        dueTime: null,
      ));
      final updateBody = api.log.last.body! as Map<String, Object?>;
      expect(updateBody.containsKey('dueTime'), isTrue);
      expect(updateBody['dueTime'], isNull);
    });
  });
}
