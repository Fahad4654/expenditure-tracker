import 'common.dart';
import 'transaction.dart';

enum CategoryKind {
  system('SYSTEM'),
  user('USER');

  const CategoryKind(this.wire);

  final String wire;

  static CategoryKind parse(String value) =>
      CategoryKind.values.firstWhere((k) => k.wire == value, orElse: () => CategoryKind.system);
}

class Category {
  const Category({
    required this.id,
    required this.userId,
    required this.name,
    required this.kind,
    required this.icon,
    required this.color,
    required this.isSystem,
    required this.suggestedType,
    required this.createdAt,
    required this.updatedAt,
  });

  final String id;

  /// `null` for system categories visible to every user.
  final String? userId;
  final String name;
  final CategoryKind kind;

  /// Icon token resolved client-side, e.g. `utensils`.
  final String? icon;

  /// Hex color such as `#F97316`.
  final String? color;
  final bool isSystem;
  final TransactionType suggestedType;
  final IsoDateTime createdAt;
  final IsoDateTime updatedAt;

  factory Category.fromJson(Object? json) {
    final map = json! as Map<String, dynamic>;
    return Category(
      id: map['id']! as String,
      userId: map['userId'] as String?,
      name: map['name']! as String,
      kind: CategoryKind.parse(map['kind']! as String),
      icon: map['icon'] as String?,
      color: map['color'] as String?,
      isSystem: map['isSystem']! as bool,
      suggestedType: TransactionType.parse(map['suggestedType']! as String),
      createdAt: map['createdAt']! as String,
      updatedAt: map['updatedAt']! as String,
    );
  }
}

class CategoryInput {
  const CategoryInput({
    required this.name,
    required this.suggestedType,
    this.icon,
    this.color,
  });

  final String name;
  final TransactionType suggestedType;
  final String? icon;
  final String? color;

  Map<String, Object?> toJson() => {
        'name': name,
        'suggestedType': suggestedType.wire,
        if (icon != null && icon!.isNotEmpty) 'icon': icon,
        if (color != null && color!.isNotEmpty) 'color': color,
      };
}

/// Seed data mirrored from `DEFAULT_SYSTEM_CATEGORIES` in the API/web client so
/// the UI can render plausible colors/icons before the first fetch lands.
const List<({String name, String icon, String color, TransactionType suggestedType})>
    defaultSystemCategories = [
  (name: 'Food', icon: 'utensils', color: '#F97316', suggestedType: TransactionType.expense),
  (name: 'Transport', icon: 'car', color: '#3B82F6', suggestedType: TransactionType.expense),
  (name: 'Shopping', icon: 'bag', color: '#EC4899', suggestedType: TransactionType.expense),
  (name: 'Bills', icon: 'receipt', color: '#EF4444', suggestedType: TransactionType.expense),
  (name: 'Entertainment', icon: 'film', color: '#8B5CF6', suggestedType: TransactionType.expense),
  (name: 'Health', icon: 'heart', color: '#10B981', suggestedType: TransactionType.expense),
  (name: 'Education', icon: 'book', color: '#06B6D4', suggestedType: TransactionType.expense),
  (name: 'Salary', icon: 'wallet', color: '#22C55E', suggestedType: TransactionType.income),
  (name: 'Business', icon: 'briefcase', color: '#0EA5E9', suggestedType: TransactionType.income),
  (name: 'Investment', icon: 'trending-up', color: '#14B8A6', suggestedType: TransactionType.income),
  (name: 'Other', icon: 'dots', color: '#64748B', suggestedType: TransactionType.expense),
];
