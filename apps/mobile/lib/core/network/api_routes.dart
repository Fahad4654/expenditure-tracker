/// REST route map, mirrored from `apps/api/src/shared/config/api.ts`.
///
/// Every path goes through here so the client and the NestJS controllers
/// cannot drift apart.
abstract final class ApiRoutes {
  static const String prefix = '/api/v1';

  static const String register = '$prefix/auth/register';
  static const String login = '$prefix/auth/login';
  static const String otpSend = '$prefix/auth/otp/send';
  static const String forgotPassword = '$prefix/auth/forgot-password';
  static const String resetPassword = '$prefix/auth/reset-password';
  static const String google = '$prefix/auth/google';
  static const String logout = '$prefix/auth/logout';
  static const String refresh = '$prefix/auth/refresh';
  static const String me = '$prefix/auth/me';

  static const String userMe = '$prefix/users/me';

  static const String transactions = '$prefix/transactions';
  static String transaction(String id) => '$transactions/$id';

  static const String categories = '$prefix/categories';
  static String category(String id) => '$categories/$id';

  static const String reminders = '$prefix/reminders';
  static String reminder(String id) => '$reminders/$id';

  static const String notes = '$prefix/notes';
  static String note(String id) => '$notes/$id';

  static const String bugReports = '$prefix/bug-reports';
  static String bugReport(String id) => '$bugReports/$id';

  static const String reportSummary = '$prefix/reports/summary';
  static const String reportDaily = '$prefix/reports/daily';
  static const String reportMonthly = '$prefix/reports/monthly';
  static const String reportCategories = '$prefix/reports/categories';

  static const String sync = '$prefix/sync';
  static const String syncChanges = '$prefix/sync/changes';

  static const String healthLive = '$prefix/health/live';
}
