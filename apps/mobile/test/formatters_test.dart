import 'package:expenditure_tracker/shared/formatters.dart';
import 'package:expenditure_tracker/shared/money.dart';
import 'package:expenditure_tracker/shared/utils/uuid.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('money', () {
    test('normalises to two fraction digits', () {
      expect(normalizeAmount('100'), '100.00');
      expect(normalizeAmount('100.5'), '100.50');
      expect(normalizeAmount('0.05'), '0.05');
    });

    test('rejects malformed amounts', () {
      expect(isDecimalString('12.345'), isFalse);
      expect(isDecimalString('abc'), isFalse);
      expect(isDecimalString(''), isFalse);
      expect(isDecimalString('.5'), isFalse);
      expect(() => toMinorUnits('12.345'), throwsFormatException);
    });

    test('keeps negatives for balances but normalises them', () {
      expect(isDecimalString('-5'), isTrue);
      expect(normalizeAmount('-5'), '-5.00');
    });

    test('adds and subtracts in minor units', () {
      expect(addAmounts('0.10', '0.20'), '0.30');
      expect(subtractAmounts('100.00', '0.01'), '99.99');
      expect(sumAmounts(['1.05', '2.05', '3.90']), '7.00');
    });

    test('formats with grouping and symbols', () {
      expect(formatMoney('1234.50', 'BDT'), '৳1,234.50');
      expect(formatMoney('100', 'USD'), r'$100.00');
      expect(formatMoney('-42.10', 'EUR'), '-€42.10');
      expect(formatMoney('1234567.89', 'BDT'), '৳1,234,567.89');
      expect(formatMoney('10', 'XYZ'), 'XYZ 10.00');
      expect(formatMoney('10', 'USD', showCode: true), 'USD 10.00');
    });

    test('handles very large amounts without floats', () {
      expect(normalizeAmount('999999999999999999.99'), '999999999999999999.99');
    });
  });

  group('date formatting', () {
    test('formats calendar days', () {
      expect(formatDay('2026-09-30'), '30 Sep 2026');
      expect(formatDay('2026-09-30', weekday: true), '30 Sep 2026 (Wed)');
      expect(formatDayShort('2026-10-01'), '1 Oct');
      expect(formatDay('nonsense'), 'nonsense');
    });

    test('formats instants in the local timezone', () {
      const iso = '2026-10-01T12:00:00.000Z';
      final local = DateTime.parse(iso).toLocal();
      const months = [
        'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
        'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
      ];
      final expected = '${local.day} ${months[local.month - 1]}, '
          '${local.hour.toString().padLeft(2, '0')}:'
          '${local.minute.toString().padLeft(2, '0')}';
      expect(formatInstant(iso), expected);
      expect(formatInstant('not-a-date'), 'not-a-date');
    });

    test('formats month labels and percentages', () {
      expect(formatMonthLabel('2026-09'), 'Sep 2026');
      expect(formatMonthLabel('2026-13'), '2026-13');
      expect(formatPercent('92.645'), '92.6%');
      expect(formatPercent('100'), '100.0%');
    });

    test('produces today as YYYY-MM-DD', () {
      expect(RegExp(r'^\d{4}-\d{2}-\d{2}$').hasMatch(todayIso()), isTrue);
    });
  });

  group('uuid', () {
    test('generates v4 uuids', () {
      final id = generateUuidV4();
      expect(
        RegExp(r'^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$')
            .hasMatch(id),
        isTrue,
      );
      expect(generateUuidV4(), isNot(id));
    });
  });
}
