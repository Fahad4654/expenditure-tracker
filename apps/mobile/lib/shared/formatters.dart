/// Date and label formatting for API wire values.
///
/// The API sends calendar dates as `YYYY-MM-DD` and instants as ISO-8601 UTC;
/// both are parsed explicitly so a user's calendar day never shifts with the
/// device timezone.
const List<String> _months = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

const List<String> _weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/// Today in the device's local day boundaries as `YYYY-MM-DD`.
String todayIso([DateTime? now]) {
  final date = (now ?? DateTime.now()).toLocal();
  return '${date.year.toString().padLeft(4, '0')}-'
      '${date.month.toString().padLeft(2, '0')}-'
      '${date.day.toString().padLeft(2, '0')}';
}

/// `2026-09-30` → `30 Sep 2026` (optionally `30 Sep 2026 (Tue)`).
String formatDay(String isoDate, {bool weekday = false}) {
  final date = _parseDate(isoDate);
  if (date == null) return isoDate;
  final label = '${date.day} ${_months[date.month - 1]} ${date.year}';
  return weekday ? '$label (${_weekdays[date.weekday - 1]})' : label;
}

/// `2026-10-01` → `1 Oct` — short axis label for a daily series.
String formatDayShort(String isoDate) {
  final date = _parseDate(isoDate);
  if (date == null) return isoDate;
  return '${date.day} ${_months[date.month - 1]}';
}

/// `2026-10-01T12:00:00.000Z` → `1 Oct, 12:00` in the device timezone.
String formatInstant(String iso) {
  final instant = DateTime.tryParse(iso)?.toLocal();
  if (instant == null) return iso;
  return '${instant.day} ${_months[instant.month - 1]}, '
      '${instant.hour.toString().padLeft(2, '0')}:${instant.minute.toString().padLeft(2, '0')}';
}

/// `2026-09` → `Sep 2026`.
String formatMonthLabel(String month) {
  final parts = month.split('-');
  if (parts.length != 2) return month;
  final monthOfYear = int.tryParse(parts[1]);
  if (monthOfYear == null || monthOfYear < 1 || monthOfYear > 12) return month;
  return '${_months[monthOfYear - 1]} ${parts[0]}';
}

/// Percentage decimal string → `92.6%` (one decimal keeps bars readable).
String formatPercent(String value) {
  final number = double.tryParse(value);
  if (number == null) return '$value%';
  final rounded = (number * 10).round() / 10;
  return '${rounded.toStringAsFixed(1)}%';
}

/// `5000` → `5,000` for chart axis labels.
String formatCount(int value) {
  var text = value.toString();
  if (text.length > 3) {
    final buffer = StringBuffer();
    for (var i = 0; i < text.length; i++) {
      if (i > 0 && (text.length - i) % 3 == 0) buffer.write(',');
      buffer.write(text[i]);
    }
    text = buffer.toString();
  }
  return text;
}

DateTime? _parseDate(String isoDate) {
  final parts = isoDate.split('-');
  if (parts.length != 3) return null;
  final year = int.tryParse(parts[0]);
  final month = int.tryParse(parts[1]);
  final day = int.tryParse(parts[2]);
  if (year == null || month == null || day == null) return null;
  return DateTime.utc(year, month, day);
}
