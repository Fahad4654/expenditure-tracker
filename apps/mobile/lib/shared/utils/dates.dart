/// Calendar-date math on bare `YYYY-MM-DD` strings, mirrored from
/// `apps/api/src/common/utils/date-range.ts` so local reports resolve presets
/// exactly like the server. Everything is UTC-anchored — no DST can shift a
/// bucket.
library;

/// `2026-10-01` + [days] calendar days (UTC-safe rollover).
String addDays(String date, int days) {
  final shifted = _utc(date).add(Duration(days: days));
  return shifted.toIso8601String().substring(0, 10);
}

/// Whole days from [from] to [to] (negative when [to] is earlier).
int daysBetween(String from, String to) {
  final ms = _utc(to).millisecondsSinceEpoch - _utc(from).millisecondsSinceEpoch;
  return (ms / Duration.millisecondsPerDay).round();
}

/// `2026-10-15` → `2026-10-01`.
String startOfMonth(String date) => '${date.substring(0, 7)}-01';

/// Last day of the month containing [date].
String endOfMonth(String date) {
  final year = int.parse(date.substring(0, 4));
  final month = int.parse(date.substring(5, 7));
  final nextYear = month == 12 ? year + 1 : year;
  final nextMonth = month == 12 ? 1 : month + 1;
  final firstNext = DateTime.utc(nextYear, nextMonth, 1);
  return firstNext.subtract(const Duration(days: 1)).toIso8601String().substring(0, 10);
}

/// Monday of the ISO week containing [date].
String startOfWeek(String date) {
  final weekday = _utc(date).weekday; // 1 = Monday … 7 = Sunday
  return addDays(date, -(weekday - 1));
}

/// `2026-10-15` → `2026-10`.
String monthOf(String date) => date.substring(0, 7);

/// Applies a non-`custom` preset in the calendar of [today].
String? presetFrom(String preset, String today) => switch (preset) {
      'today' => today,
      'week' => startOfWeek(today),
      'month' => startOfMonth(today),
      'year' => '${today.substring(0, 4)}-01-01',
      _ => null,
    };

String? presetTo(String preset, String today) => switch (preset) {
      'today' => today,
      'week' => addDays(startOfWeek(today), 6),
      'month' => endOfMonth(today),
      'year' => '${today.substring(0, 4)}-12-31',
      _ => null,
    };

/// The report window: an explicit preset wins, then bounded by "up to today"
/// with a month-start default — same rule as the server's `boundedRange`.
({String from, String to}) boundedRange({
  String? preset,
  String? from,
  String? to,
  required String today,
}) {
  String? resolvedFrom;
  String? resolvedTo;
  if (preset != null && preset != 'custom') {
    resolvedFrom = presetFrom(preset, today);
    resolvedTo = presetTo(preset, today);
  } else {
    resolvedFrom = from;
    resolvedTo = to;
  }
  final boundedTo = resolvedTo ?? today;
  final boundedFrom = resolvedFrom ?? startOfMonth(boundedTo);
  return (from: boundedFrom, to: boundedTo);
}

/// The `[limit]`-day window ending at [today] used by the daily report.
({String from, String to}) dailyRange({required int limit, required String today}) {
  final from = addDays(today, -(limit - 1));
  return (from: from, to: today);
}

DateTime _utc(String date) => DateTime.parse('${date}T00:00:00Z');
