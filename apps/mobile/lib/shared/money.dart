/// Fixed-point money helpers.
///
/// Amounts are decimal strings end to end; arithmetic happens in integer minor
/// units (`BigInt`) so no floating point ever touches a value. Mirrors
/// `apps/web/src/shared/types/money.ts`.
final _decimalRe = RegExp(r'^-?\d+(\.\d{1,2})?$');

bool isDecimalString(String value) => _decimalRe.hasMatch(value);

/// `"100.50"` → `10050`. Throws [FormatException] on malformed input.
BigInt toMinorUnits(String amount) {
  if (!isDecimalString(amount)) {
    throw FormatException('Invalid decimal amount: $amount');
  }
  final negative = amount.startsWith('-');
  final unsigned = negative ? amount.substring(1) : amount;
  final parts = unsigned.split('.');
  final whole = parts[0];
  final fraction = parts.length > 1 ? parts[1] : '';
  var minor = BigInt.parse(whole) * BigInt.from(100) +
      BigInt.parse(fraction.padRight(2, '0'));
  return negative ? -minor : minor;
}

/// `10050` → `"100.50"` (always exactly two fraction digits).
String fromMinorUnits(BigInt minor) {
  final negative = minor.isNegative;
  final abs = minor.abs();
  final whole = abs ~/ BigInt.from(100);
  final fraction = (abs % BigInt.from(100)).toString().padLeft(2, '0');
  return '${negative ? '-' : ''}$whole.$fraction';
}

/// Normalises `"100.5"` → `"100.50"` and `"100"` → `"100.00"`.
String normalizeAmount(String amount) => fromMinorUnits(toMinorUnits(amount));

String addAmounts(String a, String b) => fromMinorUnits(toMinorUnits(a) + toMinorUnits(b));

String subtractAmounts(String a, String b) => fromMinorUnits(toMinorUnits(a) - toMinorUnits(b));

String sumAmounts(Iterable<String> amounts) {
  var total = BigInt.zero;
  for (final amount in amounts) {
    total += toMinorUnits(amount);
  }
  return fromMinorUnits(total);
}

const Map<String, String> _currencySymbols = {
  'BDT': '৳',
  'USD': r'$',
  'EUR': '€',
  'GBP': '£',
  'INR': '₹',
  'JPY': '¥',
  'CNY': '¥',
  'KRW': '₩',
  'AUD': r'A$',
  'CAD': r'C$',
  'SGD': r'S$',
  'HKD': r'HK$',
  'MYR': 'RM',
  'THB': '฿',
  'PKR': '₨',
  'LKR': '₨',
  'NPR': '₨',
  'TRY': '₺',
  'RUB': '₽',
  'NGN': '₦',
  'GHS': '₵',
  'KES': 'KSh',
  'ZAR': 'R',
  'AED': 'AED ',
  'SAR': 'SAR ',
  'QAR': 'QAR ',
  'KWD': 'KWD ',
};

/// Renders a decimal string for display, e.g. `formatMoney("100.50", "BDT")`
/// → `৳100.50`. Grouping and fraction digits are produced from the minor-unit
/// representation, so the exact string is never routed through a `double`.
String formatMoney(String amount, String currency, {bool showCode = false}) {
  final negative = amount.startsWith('-');
  final unsigned = negative ? amount.substring(1) : amount;
  final parts = unsigned.split('.');
  final whole = _group(parts[0]);
  final fraction = (parts.length > 1 ? parts[1] : '').padRight(2, '0').substring(0, 2);
  final symbol = showCode ? '$currency ' : (_currencySymbols[currency] ?? '$currency ');
  final body = '$symbol$whole.$fraction';
  return negative ? '-$body' : body;
}

String _group(String digits) {
  if (digits.length <= 3) return digits;
  final buffer = StringBuffer();
  for (var i = 0; i < digits.length; i++) {
    if (i > 0 && (digits.length - i) % 3 == 0) buffer.write(',');
    buffer.write(digits[i]);
  }
  return buffer.toString();
}
