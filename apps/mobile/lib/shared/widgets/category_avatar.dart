import 'package:flutter/material.dart';

/// `#F97316` → [Color]; falls back to the theme outline for null/invalid.
Color colorFromHex(String? hex, {Color fallback = const Color(0xFF64748B)}) {
  if (hex == null || hex.length != 7 || !hex.startsWith('#')) return fallback;
  final value = int.tryParse(hex.substring(1), radix: 16);
  if (value == null) return fallback;
  return Color(0xFF00000000 | value);
}

/// Solid category colour swatch — used in lists, chips and forms. A
/// category is told apart by its colour alone.
class CategoryAvatar extends StatelessWidget {
  const CategoryAvatar({
    super.key,
    required this.color,
    this.size = 40,
  });

  final String? color;
  final double size;

  @override
  Widget build(BuildContext context) {
    final resolved = colorFromHex(color, fallback: Theme.of(context).colorScheme.outlineVariant);
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(color: resolved, shape: BoxShape.circle),
    );
  }
}
