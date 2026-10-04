import 'common.dart';

/// A dated reminder, optionally carrying a wall-clock `HH:mm` time on the
/// due date. Mirrors `Reminder` in `apps/web/src/shared/types/reminder.ts`.
class Reminder {
  const Reminder({
    required this.id,
    required this.title,
    required this.details,
    required this.dueDate,
    required this.dueTime,
    required this.completedAt,
    required this.createdAt,
    required this.updatedAt,
  });

  final String id;
  final String title;
  final String? details;

  /// Calendar day, `YYYY-MM-DD`, in the owner's timezone.
  final IsoDate dueDate;

  /// `HH:mm` (24-hour) or `null` for a date-only reminder.
  final String? dueTime;

  final IsoDateTime? completedAt;
  final IsoDateTime createdAt;
  final IsoDateTime updatedAt;

  bool get isCompleted => completedAt != null;

  factory Reminder.fromJson(Object? json) {
    final map = json! as Map<String, dynamic>;
    return Reminder(
      id: map['id']! as String,
      title: map['title']! as String,
      details: map['details'] as String?,
      dueDate: map['dueDate']! as String,
      dueTime: map['dueTime'] as String?,
      completedAt: map['completedAt'] as String?,
      createdAt: map['createdAt']! as String,
      updatedAt: map['updatedAt']! as String,
    );
  }
}

/// Create payload — every field required so the wire shape stays explicit.
class ReminderInput {
  const ReminderInput({
    required this.title,
    required this.dueDate,
    this.details,
    this.dueTime,
  });

  final String title;
  final String? details;
  final IsoDate dueDate;

  /// `HH:mm`, or `null` for a date-only reminder.
  final String? dueTime;

  Map<String, Object?> toJson() => {
        'title': title,
        'details': details,
        'dueDate': dueDate,
        'dueTime': dueTime,
      };
}
