import 'package:flutter/material.dart';

import '../../shared/formatters.dart';
import '../../shared/models/reminder.dart';

/// How urgent a reminder's due chip is — drives the chip palette.
enum DueStatus { completed, overdue, today, upcoming }

/// Chip label mirroring the web client's due chip: `Due today · 18:30`,
/// `Overdue · 5 Oct 2026`, or the plain day for future reminders.
({String text, DueStatus status}) dueLabel(Reminder reminder, String today) {
  if (reminder.isCompleted) return (text: 'Completed', status: DueStatus.completed);
  final time = reminder.dueTime == null ? '' : ' · ${reminder.dueTime}';
  if (reminder.dueDate.compareTo(today) < 0) {
    return (
      text: 'Overdue · ${formatDay(reminder.dueDate)}$time',
      status: DueStatus.overdue,
    );
  }
  if (reminder.dueDate == today) {
    return (text: 'Due today$time', status: DueStatus.today);
  }
  return (
    text: '${formatDay(reminder.dueDate)}$time',
    status: DueStatus.upcoming,
  );
}

/// One row of the reminders list: completion checkbox, title, details and the
/// due chip. Tapping the row opens the edit form.
class ReminderTile extends StatelessWidget {
  const ReminderTile({
    super.key,
    required this.reminder,
    required this.today,
    required this.onTap,
    required this.onToggle,
  });

  final Reminder reminder;
  final String today;
  final VoidCallback onTap;
  final ValueChanged<bool?> onToggle;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final label = dueLabel(reminder, today);
    final chipColor = switch (label.status) {
      DueStatus.completed => theme.colorScheme.outline,
      DueStatus.overdue => theme.colorScheme.error,
      DueStatus.today => theme.colorScheme.tertiary,
      DueStatus.upcoming => theme.colorScheme.onSurfaceVariant,
    };

    return Card(
      margin: EdgeInsets.zero,
      child: InkWell(
        borderRadius: BorderRadius.circular(12),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.only(right: 4),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Checkbox(
                value: reminder.isCompleted,
                onChanged: onToggle,
              ),
              Expanded(
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(0, 12, 8, 12),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        reminder.title,
                        style: theme.textTheme.titleSmall?.copyWith(
                          decoration: reminder.isCompleted
                              ? TextDecoration.lineThrough
                              : null,
                        ),
                      ),
                      if (reminder.details != null &&
                          reminder.details!.isNotEmpty) ...[
                        const SizedBox(height: 2),
                        Text(
                          reminder.details!,
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                          style: theme.textTheme.bodySmall?.copyWith(
                            color: theme.colorScheme.onSurfaceVariant,
                          ),
                        ),
                      ],
                      const SizedBox(height: 6),
                      Container(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 8,
                          vertical: 2,
                        ),
                        decoration: BoxDecoration(
                          color: chipColor.withValues(alpha: 0.14),
                          borderRadius: BorderRadius.circular(999),
                          border: Border.all(
                            color: chipColor.withValues(alpha: 0.45),
                          ),
                        ),
                        child: Text(
                          label.text,
                          style: theme.textTheme.labelSmall?.copyWith(
                            color: chipColor,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
              Icon(Icons.chevron_right, color: theme.colorScheme.outline),
            ],
          ),
        ),
      ),
    );
  }
}
