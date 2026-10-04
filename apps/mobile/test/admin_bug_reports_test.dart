import 'package:expenditure_tracker/core/network/api_error.dart';
import 'package:expenditure_tracker/core/network/api_routes.dart';
import 'package:expenditure_tracker/features/bug_reports/admin_bug_reports_page.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'support/fakes.dart';
import 'support/fixtures.dart';
import 'support/pump_app.dart';

/// Profile → Manage → "Admin panel", scrolling the profile list if the entry
/// point sits below the fold.
Future<void> _openAdminPanel(WidgetTester tester) async {
  await tester.tap(find.text('Profile'));
  await settle(tester, pumps: 8);

  await tester.ensureVisible(find.text('Admin panel'));
  await settle(tester);
  await tester.tap(find.text('Admin panel'));
  await settle(tester, pumps: 8);
}

/// The silent refresh [pumpApp] runs on restore is what carries the role, so
/// an admin session is just a differently-shaped refresh response.
FakeApiClient _adminApi({List<Map<String, Object?>> reports = const []}) {
  final api = FakeApiClient();
  api.onPost(ApiRoutes.refresh, (_) => sessionJson(role: 'ADMIN'));
  api.onGet(ApiRoutes.adminBugReports, (_) => reports);
  return api;
}

void main() {
  group('AdminBugReportsPage', () {
    testWidgets('never offers the panel to a regular profile', (tester) async {
      await pumpApp(tester, signedIn: true);

      await tester.tap(find.text('Profile'));
      await settle(tester, pumps: 8);
      await tester.ensureVisible(find.text('Report a bug'));
      await settle(tester);

      expect(find.text('Report a bug'), findsOneWidget);
      expect(find.text('Admin panel'), findsNothing);
    });

    testWidgets('lists every report with the reporter who filed it',
        (tester) async {
      final api = _adminApi(reports: [
        adminBugReportJson(),
        adminBugReportJson(
          id: '88888888-8888-4888-8888-888888888888',
          title: 'Wrong balance',
          status: 'RESOLVED',
          reporterName: 'Alice Rahman',
          reporterEmail: 'alice@example.com',
        ),
      ]);

      await pumpApp(tester, api: api, signedIn: true);
      await _openAdminPanel(tester);

      expect(find.byType(AdminBugReportsPage), findsOneWidget);
      expect(find.text('Chart renders empty'), findsOneWidget);
      expect(find.text('Wrong balance'), findsOneWidget);
      expect(find.text('Bob Khan · bob@example.com'), findsOneWidget);
      expect(find.text('Alice Rahman · alice@example.com'), findsOneWidget);
      expect(find.text('2 of 2 reports'), findsOneWidget);
    });

    testWidgets('filters the board by triage status', (tester) async {
      final api = _adminApi(reports: [
        adminBugReportJson(),
        adminBugReportJson(
          id: '88888888-8888-4888-8888-888888888888',
          title: 'Wrong balance',
          status: 'RESOLVED',
        ),
      ]);

      await pumpApp(tester, api: api, signedIn: true);
      await _openAdminPanel(tester);

      await tester.tap(
        find.widgetWithText(DropdownButtonFormField<String?>, 'All statuses'),
      );
      await settle(tester);
      // The open menu renders above the page, so its option is the last match
      // for a label the board also shows on chips and closed dropdowns.
      await tester.tap(find.text('Resolved').last);
      await settle(tester, pumps: 8);

      expect(find.text('1 of 2 reports'), findsOneWidget);
      expect(find.text('Wrong balance'), findsOneWidget);
      expect(find.text('Chart renders empty'), findsNothing);
    });

    testWidgets('moves a report through triage with a PATCH', (tester) async {
      final api = _adminApi(reports: [adminBugReportJson()]);
      api.onPatch(
        ApiRoutes.adminBugReport(bugReportId),
        (_) => adminBugReportJson(status: 'IN_PROGRESS'),
      );

      await pumpApp(tester, api: api, signedIn: true);
      await _openAdminPanel(tester);
      expect(find.text('Chart renders empty'), findsOneWidget);

      await tester.tap(find.widgetWithText(DropdownButtonFormField<String>, 'Open'));
      await settle(tester);
      await tester.tap(find.text('In progress').last);
      await settle(tester, pumps: 12);

      final requests = api.requestsWhere(
        (request) =>
            request.method == 'PATCH' &&
            request.path == ApiRoutes.adminBugReport(bugReportId),
      );
      expect(requests, hasLength(1));
      expect(requests.single.body, {'status': 'IN_PROGRESS'});
      expect(find.text('In progress'), findsWidgets);
    });

    testWidgets('surfaces a 403 instead of silently dropping the change',
        (tester) async {
      final api = _adminApi(reports: [adminBugReportJson()]);
      api.onPatch(
        ApiRoutes.adminBugReport(bugReportId),
        (_) => throw const ApiError(
          ApiErrorCodes.forbidden,
          'Admin access required',
        ),
      );

      await pumpApp(tester, api: api, signedIn: true);
      await _openAdminPanel(tester);

      await tester.tap(find.widgetWithText(DropdownButtonFormField<String>, 'Open'));
      await settle(tester);
      await tester.tap(find.text('Closed').last);
      await settle(tester, pumps: 12);

      expect(find.text('Admin access required'), findsOneWidget);
      // Chip and dropdown both still read the status the server refused.
      expect(find.text('Open'), findsWidgets);
    });
  });
}
