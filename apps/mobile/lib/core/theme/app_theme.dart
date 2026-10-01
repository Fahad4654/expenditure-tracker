import 'package:flutter/material.dart';

/// Material 3 themes shared by every screen.
///
/// Colours come from a single seed so light/dark stay consistent with the web
/// app's emerald/slate palette.
abstract final class AppTheme {
  static const Color _seed = Color(0xFF10B981);

  static ThemeData light() => _base(Brightness.light, AppPalette.light());

  static ThemeData dark() => _base(Brightness.dark, AppPalette.dark());

  static ThemeData _base(Brightness brightness, AppPalette palette) {
    final scheme = ColorScheme.fromSeed(seedColor: _seed, brightness: brightness);
    return ThemeData(
      useMaterial3: true,
      colorScheme: scheme,
      scaffoldBackgroundColor: scheme.surface,
      appBarTheme: AppBarTheme(
        centerTitle: false,
        backgroundColor: scheme.surface,
        foregroundColor: scheme.onSurface,
        elevation: 0,
        scrolledUnderElevation: 1,
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: BorderSide.none,
        ),
      ),
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          minimumSize: const Size.fromHeight(52),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
          textStyle: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600),
        ),
      ),
      snackBarTheme: const SnackBarThemeData(behavior: SnackBarBehavior.floating),
      extensions: [palette],
    );
  }
}

/// Semantic colours that are not part of M3's stock palette (income vs expense
/// money colours, category tints). Kept in the theme so every screen agrees and
/// light/dark stay correct.
class AppPalette extends ThemeExtension<AppPalette> {
  const AppPalette({
    required this.income,
    required this.incomeSoft,
    required this.expense,
    required this.expenseSoft,
    required this.balancePositive,
    required this.balanceNegative,
  });

  factory AppPalette.light() => const AppPalette(
        income: Color(0xFF059669),
        incomeSoft: Color(0xFFD1FAE5),
        expense: Color(0xFFDC2626),
        expenseSoft: Color(0xFFFEE2E2),
        balancePositive: Color(0xFF047857),
        balanceNegative: Color(0xFFB91C1C),
      );

  factory AppPalette.dark() => const AppPalette(
        income: Color(0xFF34D399),
        incomeSoft: Color(0xFF064E3B),
        expense: Color(0xFFF87171),
        expenseSoft: Color(0xFF7F1D1D),
        balancePositive: Color(0xFF6EE7B7),
        balanceNegative: Color(0xFFFCA5A5),
      );

  final Color income;
  final Color incomeSoft;
  final Color expense;
  final Color expenseSoft;
  final Color balancePositive;
  final Color balanceNegative;

  static AppPalette of(BuildContext context) =>
      Theme.of(context).extension<AppPalette>() ?? AppPalette.light();

  @override
  AppPalette copyWith({
    Color? income,
    Color? incomeSoft,
    Color? expense,
    Color? expenseSoft,
    Color? balancePositive,
    Color? balanceNegative,
  }) =>
      AppPalette(
        income: income ?? this.income,
        incomeSoft: incomeSoft ?? this.incomeSoft,
        expense: expense ?? this.expense,
        expenseSoft: expenseSoft ?? this.expenseSoft,
        balancePositive: balancePositive ?? this.balancePositive,
        balanceNegative: balanceNegative ?? this.balanceNegative,
      );

  @override
  AppPalette lerp(AppPalette? other, double t) {
    if (other == null) return this;
    return AppPalette(
      income: Color.lerp(income, other.income, t)!,
      incomeSoft: Color.lerp(incomeSoft, other.incomeSoft, t)!,
      expense: Color.lerp(expense, other.expense, t)!,
      expenseSoft: Color.lerp(expenseSoft, other.expenseSoft, t)!,
      balancePositive: Color.lerp(balancePositive, other.balancePositive, t)!,
      balanceNegative: Color.lerp(balanceNegative, other.balanceNegative, t)!,
    );
  }
}
