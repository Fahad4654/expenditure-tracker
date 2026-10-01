import 'package:flutter/material.dart';

import '../../core/theme/app_theme.dart';
import '../models/transaction.dart';
import '../money.dart';

/// Money rendered with the semantic income/expense colour.
class AmountText extends StatelessWidget {
  const AmountText(
    this.amount, {
    super.key,
    this.type,
    this.currency = 'BDT',
    this.style,
    this.showSign = true,
  });

  final String amount;
  final TransactionType? type;
  final String currency;
  final TextStyle? style;
  final bool showSign;

  @override
  Widget build(BuildContext context) {
    final palette = AppPalette.of(context);
    Color? color;
    switch (type) {
      case TransactionType.income:
        color = palette.income;
      case TransactionType.expense:
        color = palette.expense;
      case null:
        break;
    }

    final sign = switch (type) {
      TransactionType.income when showSign => '+',
      TransactionType.expense when showSign => '-',
      _ => '',
    };

    return Text(
      '$sign${formatMoney(amount, currency)}',
      style: (style ?? Theme.of(context).textTheme.titleMedium)?.copyWith(
        color: color,
        fontWeight: type == null ? null : FontWeight.w600,
      ),
      overflow: TextOverflow.ellipsis,
    );
  }
}
