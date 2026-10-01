import 'package:flutter/material.dart';

/// Icon token → Material icon. Mirrors the token names seeded by the API
/// (`utensils`, `car`, …) so system categories render like the web app.
const Map<String, IconData> _icons = {
  'utensils': Icons.restaurant,
  'car': Icons.directions_car_outlined,
  'bag': Icons.shopping_bag_outlined,
  'receipt': Icons.receipt_long_outlined,
  'film': Icons.movie_outlined,
  'heart': Icons.favorite_outline,
  'book': Icons.menu_book_outlined,
  'wallet': Icons.account_balance_wallet_outlined,
  'briefcase': Icons.work_outline,
  'trending-up': Icons.trending_up,
  'dots': Icons.more_horiz,
  'home': Icons.home_outlined,
  'gift': Icons.card_giftcard_outlined,
  'fitness': Icons.fitness_center_outlined,
  'pets': Icons.pets_outlined,
  'child': Icons.child_care_outlined,
  'flight': Icons.flight_takeoff_outlined,
  'coffee': Icons.local_cafe_outlined,
  'phone': Icons.smartphone_outlined,
  'bolt': Icons.bolt_outlined,
  'shopping-cart': Icons.shopping_cart_outlined,
  'school': Icons.school_outlined,
  'medical': Icons.local_hospital_outlined,
  'savings': Icons.savings_outlined,
};

/// Every token a user can pick in the category form.
const List<String> categoryIconTokens = [
  'utensils',
  'car',
  'bag',
  'receipt',
  'film',
  'heart',
  'book',
  'wallet',
  'briefcase',
  'trending-up',
  'home',
  'gift',
  'fitness',
  'pets',
  'child',
  'flight',
  'coffee',
  'phone',
  'bolt',
  'shopping-cart',
  'school',
  'medical',
  'savings',
  'dots',
];

IconData iconForToken(String? token) => _icons[token ?? ''] ?? Icons.sell_outlined;

/// `#F97316` → [Color]; falls back to the theme outline for null/invalid.
Color colorFromHex(String? hex, {Color fallback = const Color(0xFF64748B)}) {
  if (hex == null || hex.length != 7 || !hex.startsWith('#')) return fallback;
  final value = int.tryParse(hex.substring(1), radix: 16);
  if (value == null) return fallback;
  return Color(0xFF00000000 | value);
}

/// Category colour swatch with its icon — used in lists, chips and forms.
class CategoryAvatar extends StatelessWidget {
  const CategoryAvatar({
    super.key,
    required this.color,
    required this.icon,
    this.size = 40,
  });

  final String? color;
  final String? icon;
  final double size;

  @override
  Widget build(BuildContext context) {
    final resolved = colorFromHex(color, fallback: Theme.of(context).colorScheme.outlineVariant);
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        color: resolved.withValues(alpha: 0.18),
        shape: BoxShape.circle,
      ),
      child: Icon(iconForToken(icon), size: size * 0.5, color: resolved),
    );
  }
}
