import 'package:expenditure_tracker/core/network/api_routes.dart';
import 'package:expenditure_tracker/features/bug_reports/bug_report_form_page.dart';
import 'package:expenditure_tracker/features/bug_reports/bug_reports_page.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'support/fakes.dart';
import 'support/fixtures.dart';
import 'support/pump_app.dart';

/// Profile → Manage → "Report a bug", scrolling the profile list if the entry
/// point sits below the fold.
Future<void> _openBugReports(WidgetTester tester) async {
  await tester.tap(find.text('Profile'));
  await settle(tester, pumps: 8);

  // The Manage section sits below the fold on the default test surface.
  await tester.ensureVisible(find.text('Report a bug'));
  await settle(tester);
  await tester.tap(find.text('Report a bug'));
  await settle(tester, pumps: 8);
}

/// The submit button inside the pushed form — the empty state behind it also
/// offers a "Report a bug" button.
Finder _submitForm(WidgetTester tester) => find.descendant(
      of: find.byType(BugReportFormPage),
      matching: find.widgetWithText(FilledButton, 'Send report'),
    );

void main() {
  group('BugReportsPage', () {
    testWidgets('lists the reports filed by this account', (tester) async {
      final api = FakeApiClient();
      api.onGet(ApiRoutes.bugReports, (_) => [bugReportJson()]);

      await pumpApp(tester, api: api, signedIn: true);
      await _openBugReports(tester);

      expect(find.byType(BugReportsPage), findsOneWidget);
      expect(find.text('Chart renders empty'), findsOneWidget);
      expect(find.text('High'), findsOneWidget);
      expect(find.text('Open'), findsOneWidget);
      expect(find.text('Reports · Web'), findsOneWidget);
    });

    testWidgets('shows an empty state when there are none', (tester) async {
      await pumpApp(tester, signedIn: true);
      await _openBugReports(tester);

      expect(find.byType(BugReportsPage), findsOneWidget);
      expect(find.text('No bug reports yet'), findsOneWidget);
    });

    testWidgets('validates the form before submitting', (tester) async {
      final app = await pumpApp(tester, signedIn: true);
      await _openBugReports(tester);

      await tester.tap(find.byTooltip('New bug report'));
      await settle(tester, pumps: 8);
      expect(find.byType(BugReportFormPage), findsOneWidget);

      await tester.tap(_submitForm(tester));
      await settle(tester);

      expect(find.text('Title is required'), findsOneWidget);
      expect(find.text('Describe what happened'), findsOneWidget);
      final posts = app.api.requestsWhere(
        (request) =>
            request.method == 'POST' && request.path == ApiRoutes.bugReports,
      );
      expect(posts, isEmpty);
    });

    testWidgets('files a report with the chosen severity', (tester) async {
      final app = await pumpApp(tester, signedIn: true);
      await _openBugReports(tester);

      await tester.tap(find.byTooltip('New bug report'));
      await settle(tester, pumps: 8);

      final fields = find.byType(TextFormField);
      await tester.enterText(fields.first, 'Wrong balance');
      await tester.enterText(
        fields.at(1),
        'Balance is off by one taka on the dashboard.',
      );
      await tester.tap(_submitForm(tester));
      await settle(tester, pumps: 30);

      final posts = app.api.requestsWhere(
        (request) =>
            request.method == 'POST' && request.path == ApiRoutes.bugReports,
      );
      expect(posts, hasLength(1));
      final body = posts.single.body! as Map<String, Object?>;
      expect(body['title'], 'Wrong balance');
      expect(body['description'], 'Balance is off by one taka on the dashboard.');
      expect(body['severity'], 'MEDIUM');
      expect(body['area'], isNull);
      expect(find.byType(BugReportFormPage), findsNothing);
    });
  });
}
