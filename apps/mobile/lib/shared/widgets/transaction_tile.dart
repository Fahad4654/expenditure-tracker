import 'package:flutter/material.dart';

import '../models/category.dart';
import '../models/sync.dart';
import '../models/transaction.dart';
import '../formatters.dart';
import 'amount_text.dart';
import 'category_avatar.dart';

/// One row of the transactions list — used by the dashboard's recent activity
/// and the transactions screen. Long titles and category names truncate instead
/// of stretching the row.
class TransactionTile extends StatelessWidget {
  const TransactionTile({
    super.key,
    required this.transaction,
    this.categories = const [],
    this.onTap,
  });

  final Transaction transaction;
  final List<Category> categories;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final category = categories.where((c) => c.id == transaction.categoryId).firstOrNull;
    final fallbackType =
        transaction.type == TransactionType.income ? 'Income' : 'Expense';
    final meta = '${category?.name ?? fallbackType} • ${formatDay(transaction.transactionDate)}';
    final syncStatus = transaction.syncStatus;
    final pending = syncStatus == kSyncStatusPending;
    final failed = syncStatus == kSyncStatusFailed;

    return Card(
      margin: EdgeInsets.zero,
      child: InkWell(
        borderRadius: BorderRadius.circular(12),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
          child: Row(
            children: [
              CategoryAvatar(
                color: category?.color,
                size: 40,
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      transaction.title,
                      style: theme.textTheme.titleSmall,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                    const SizedBox(height: 2),
                    Row(
                      children: [
                        Flexible(
                          child: Text(
                            meta,
                            style: theme.textTheme.bodySmall?.copyWith(
                              color: theme.colorScheme.onSurfaceVariant,
                            ),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                        if (pending || failed) ...[
                          const SizedBox(width: 6),
                          Tooltip(
                            message: pending ? 'Pending sync' : 'Sync failed',
                            child: Icon(
                              pending ? Icons.schedule_send_outlined : Icons.sync_problem,
                              size: 14,
                              color: pending
                                  ? theme.colorScheme.primary
                                  : theme.colorScheme.error,
                            ),
                          ),
                        ],
                      ],
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 8),
              AmountText(
                transaction.amount,
                type: transaction.type,
                currency: transaction.currency,
                style: theme.textTheme.titleSmall,
              ),
            ],
          ),
        ),
      ),
    );
  }
}
