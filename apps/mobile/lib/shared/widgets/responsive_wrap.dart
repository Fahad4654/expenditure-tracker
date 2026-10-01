import 'package:flutter/material.dart';

/// Horizontal card grid that reflows by itself: one column on a phone, two on a
/// tablet, more on a desktop — no manual breakpoints, equal-width cards with
/// natural heights.
class ResponsiveWrap extends StatelessWidget {
  const ResponsiveWrap({
    super.key,
    required this.children,
    this.minCardWidth = 260,
    this.spacing = 12,
    this.runSpacing = 12,
    this.padding = EdgeInsets.zero,
  });

  final List<Widget> children;
  final double minCardWidth;
  final double spacing;
  final double runSpacing;
  final EdgeInsetsGeometry padding;

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        final available = constraints.maxWidth;
        if (!available.isFinite || available <= 0) {
          return Padding(
            padding: padding,
            child: Wrap(spacing: spacing, runSpacing: runSpacing, children: children),
          );
        }

        final count =
            ((available + spacing) / (minCardWidth + spacing)).floor().clamp(1, 24);
        final width = (available - spacing * (count - 1)) / count;

        return Padding(
          padding: padding,
          child: Wrap(
            spacing: spacing,
            runSpacing: runSpacing,
            children: [for (final child in children) SizedBox(width: width, child: child)],
          ),
        );
      },
    );
  }
}
