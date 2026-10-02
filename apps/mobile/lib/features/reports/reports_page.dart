import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';

import '../../app_scope.dart';
import '../../core/network/api_error.dart';
import '../../core/theme/app_theme.dart';
import '../../shared/formatters.dart';
import '../../shared/models/common.dart';
import '../../shared/models/report.dart';
import '../../shared/models/transaction.dart';
import '../../shared/money.dart';
import '../../shared/widgets/category_avatar.dart';
import '../../shared/widgets/empty_state.dart';
import '../../shared/widgets/error_banner.dart';
import '../../shared/widgets/loading_view.dart';
import '../../shared/widgets/section_card.dart';

/// Summary + daily/monthly trends + category breakdown.
class ReportsPage extends StatefulWidget {
  const ReportsPage({super.key, this.refreshTick});

  /// Bumped (by the shell) after a sync cycle so reports re-read SQLite.
  final ValueListenable<int>? refreshTick;

  @override
  State<ReportsPage> createState() => _ReportsPageState();
}

class _ReportsPageState extends State<ReportsPage> {
  DateRangePreset _preset = DateRangePreset.month;
  TransactionType _breakdownType = TransactionType.expense;
  int _year = DateTime.now().year;

  SummaryResponse? _summary;
  DailyReport? _daily;
  CategoryReport? _breakdown;
  MonthlyReport? _monthly;
  bool _loading = true;
  ApiError? _error;

  @override
  void initState() {
    super.initState();
    widget.refreshTick?.addListener(_onTick);
    _loadMain();
    _loadMonthly();
  }

  @override
  void dispose() {
    widget.refreshTick?.removeListener(_onTick);
    super.dispose();
  }

  void _onTick() {
    _loadMain();
    _loadMonthly();
  }

  String? get _timezone => AppScope.read(context).auth.user?.timezone;

  Future<void> _loadMain() async {
    setState(() {
      _loading = true;
      _error = null;
    });

    final scope = AppScope.read(context);
    final timezone = scope.auth.user?.timezone;

    SummaryResponse? summary;
    DailyReport? daily;
    CategoryReport? breakdown;
    ApiError? error;

    Future<void> run<T>(Future<T> future, void Function(T value) assign) async {
      try {
        assign(await future);
      } on ApiError catch (caught) {
        error ??= caught;
      }
    }

    await Future.wait([
      run(
        scope.reports.summary(preset: _preset, timezone: timezone),
        (value) => summary = value,
      ),
      run(
        scope.reports.daily(preset: _preset, timezone: timezone),
        (value) => daily = value,
      ),
      run(
        scope.reports.categories(
          preset: _preset,
          type: _breakdownType,
          timezone: timezone,
        ),
        (value) => breakdown = value,
      ),
    ]);

    if (!mounted) return;
    setState(() {
      _summary = summary ?? _summary;
      _daily = daily ?? _daily;
      _breakdown = breakdown ?? _breakdown;
      _loading = false;
      _error = error;
    });
  }

  Future<void> _loadBreakdown() async {
    try {
      final report = await AppScope.read(context).reports.categories(
            preset: _preset,
            type: _breakdownType,
            timezone: _timezone,
          );
      if (mounted) setState(() => _breakdown = report);
    } on ApiError catch (error) {
      if (mounted) setState(() => _error = error);
    }
  }

  Future<void> _loadMonthly() async {
    try {
      final report = await AppScope.read(context).reports.monthly(
            year: _year,
            timezone: _timezone,
          );
      if (mounted) setState(() => _monthly = report);
    } on ApiError catch (error) {
      if (mounted) setState(() => _error = error);
    }
  }

  void _setPreset(DateRangePreset preset) {
    if (preset == _preset) return;
    setState(() => _preset = preset);
    _loadMain();
  }

  void _setBreakdownType(TransactionType type) {
    if (type == _breakdownType) return;
    setState(() => _breakdownType = type);
    _loadBreakdown();
  }

  void _setYear(int year) {
    if (year == _year) return;
    setState(() => _year = year);
    _loadMonthly();
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Scaffold(
      appBar: AppBar(title: const Text('Reports')),
      body: _loading && _summary == null
          ? const LoadingView(label: 'Crunching your numbers…')
          : RefreshIndicator(
              onRefresh: () async {
                await Future.wait([_loadMain(), _loadMonthly()]);
              },
              child: ListView(
                padding: const EdgeInsets.fromLTRB(16, 8, 16, 96),
                children: [
                  if (_error != null) ...[
                    ErrorBanner(message: _error!.message, onRetry: _loadMain),
                    const SizedBox(height: 12),
                  ],
                  Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    children: [
                      for (final preset in const [
                        DateRangePreset.today,
                        DateRangePreset.week,
                        DateRangePreset.month,
                        DateRangePreset.year,
                      ])
                        ChoiceChip(
                          label: Text(switch (preset) {
                            DateRangePreset.today => 'Today',
                            DateRangePreset.week => 'This week',
                            DateRangePreset.month => 'This month',
                            _ => 'This year',
                          }),
                          selected: _preset == preset,
                          onSelected: (_) => _setPreset(preset),
                        ),
                    ],
                  ),
                  const SizedBox(height: 12),
                  SectionCard(
                    title: 'Summary',
                    child: _summary == null
                        ? Text(
                            'No data for this range yet.',
                            style: theme.textTheme.bodyMedium?.copyWith(
                              color: theme.colorScheme.onSurfaceVariant,
                            ),
                          )
                        : _SummaryBlock(summary: _summary!),
                  ),
                  const SizedBox(height: 12),
                  SectionCard(
                    title: 'Daily trend',
                    trailing: _daily == null
                        ? null
                        : Text(
                            '${formatDayShort(_daily!.range.from)} – '
                            '${formatDayShort(_daily!.range.to)}',
                            style: theme.textTheme.bodySmall?.copyWith(
                              color: theme.colorScheme.onSurfaceVariant,
                            ),
                          ),
                    child: _daily == null || _daily!.points.isEmpty
                        ? const EmptyState(
                            icon: Icons.bar_chart_rounded,
                            title: 'Nothing recorded',
                            message: 'Transactions in this range will be charted here.',
                          )
                        : _DailyChart(report: _daily!),
                  ),
                  const SizedBox(height: 12),
                  SectionCard(
                    title: 'Monthly trend',
                    trailing: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        IconButton(
                          tooltip: 'Previous year',
                          icon: const Icon(Icons.chevron_left),
                          onPressed:
                              _year > 2000 ? () => _setYear(_year - 1) : null,
                        ),
                        Text('$_year', style: theme.textTheme.titleSmall),
                        IconButton(
                          tooltip: 'Next year',
                          icon: const Icon(Icons.chevron_right),
                          onPressed: _year < DateTime.now().year
                              ? () => _setYear(_year + 1)
                              : null,
                        ),
                      ],
                    ),
                    child: _monthly == null || _monthly!.points.isEmpty
                        ? const EmptyState(
                            icon: Icons.calendar_month_outlined,
                            title: 'No data for this year',
                          )
                        : _MonthlyChart(report: _monthly!),
                  ),
                  const SizedBox(height: 12),
                  SectionCard(
                    title: 'By category',
                    trailing: SegmentedButton<TransactionType>(
                      style: const ButtonStyle(
                        visualDensity: VisualDensity.compact,
                      ),
                      segments: const [
                        ButtonSegment(
                          value: TransactionType.expense,
                          label: Text('Expense'),
                        ),
                        ButtonSegment(
                          value: TransactionType.income,
                          label: Text('Income'),
                        ),
                      ],
                      selected: {_breakdownType},
                      onSelectionChanged: (selection) =>
                          _setBreakdownType(selection.first),
                    ),
                    child: _breakdown == null || _breakdown!.points.isEmpty
                        ? EmptyState(
                            icon: Icons.donut_small_outlined,
                            title: 'No ${_breakdownType == TransactionType.income ? 'income' : 'expenses'} yet',
                            message: 'Add transactions to see the breakdown.',
                          )
                        : _CategoryBreakdown(report: _breakdown!),
                  ),
                ],
              ),
            ),
    );
  }
}

class _SummaryBlock extends StatelessWidget {
  const _SummaryBlock({required this.summary});

  final SummaryResponse summary;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          '${formatDay(summary.range.from)} – ${formatDay(summary.range.to)}',
          style: theme.textTheme.bodySmall?.copyWith(
            color: theme.colorScheme.onSurfaceVariant,
          ),
        ),
        const SizedBox(height: 12),
        Row(
          children: [
            Expanded(child: _Stat(label: 'Income', amount: summary.totalIncome, income: true, currency: summary.currency)),
            Expanded(child: _Stat(label: 'Expense', amount: summary.totalExpense, income: false, currency: summary.currency)),
          ],
        ),
        const Divider(height: 24),
        Row(
          children: [
            Expanded(child: Text('Balance', style: theme.textTheme.bodyLarge)),
            Text(
              formatMoney(summary.balance, summary.currency),
              style: theme.textTheme.titleLarge?.copyWith(
                fontWeight: FontWeight.w700,
                color: summary.balance.startsWith('-')
                    ? theme.extension<AppPalette>()?.balanceNegative
                    : theme.extension<AppPalette>()?.balancePositive,
              ),
            ),
          ],
        ),
      ],
    );
  }
}

class _Stat extends StatelessWidget {
  const _Stat({
    required this.label,
    required this.amount,
    required this.income,
    required this.currency,
  });

  final String label;
  final String amount;
  final bool income;
  final String currency;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final palette = theme.extension<AppPalette>();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          label,
          style: theme.textTheme.bodySmall?.copyWith(
            color: theme.colorScheme.onSurfaceVariant,
          ),
        ),
        const SizedBox(height: 4),
        Text(
          formatMoney(amount, currency),
          style: theme.textTheme.titleMedium?.copyWith(
            fontWeight: FontWeight.w600,
            color: income ? palette?.income : palette?.expense,
          ),
        ),
      ],
    );
  }
}

/// Simple grouped bar chart. Scrolls horizontally inside its own container so
/// the page never overflows.
class _SeriesChart extends StatelessWidget {
  const _SeriesChart({required this.points});

  final List<({String label, double primary, double secondary})> points;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final palette = AppPalette.of(context);
    final screenHeight = MediaQuery.sizeOf(context).height;
    final barArea = (screenHeight * 0.22).clamp(120.0, 220.0);

    final max = points.fold<double>(0, (acc, point) {
      if (point.primary > acc) return point.primary;
      return point.secondary > acc ? point.secondary : acc;
    });

    if (max <= 0) {
      return const Padding(
        padding: EdgeInsets.symmetric(vertical: 24),
        child: EmptyState(
          icon: Icons.bar_chart_rounded,
          title: 'No activity in this range',
        ),
      );
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        SizedBox(
          height: barArea,
          child: SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                for (var i = 0; i < points.length; i++)
                  Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 3),
                    child: SizedBox(
                      width: 18,
                      child: Column(
                        mainAxisAlignment: MainAxisAlignment.end,
                        children: [
                          SizedBox(
                            height: barArea - 22,
                            child: Row(
                              crossAxisAlignment: CrossAxisAlignment.end,
                              children: [
                                Expanded(
                                  child: _Bar(
                                    fraction: points[i].primary / max,
                                    color: palette.income,
                                  ),
                                ),
                                const SizedBox(width: 2),
                                Expanded(
                                  child: _Bar(
                                    fraction: points[i].secondary / max,
                                    color: palette.expense,
                                  ),
                                ),
                              ],
                            ),
                          ),
                          const SizedBox(height: 6),
                          SizedBox(
                            height: 16,
                            child: Text(
                              points[i].label,
                              style: theme.textTheme.labelSmall?.copyWith(
                                color: theme.colorScheme.onSurfaceVariant,
                                fontSize: 10,
                              ),
                              maxLines: 1,
                              overflow: TextOverflow.clip,
                              textAlign: TextAlign.center,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
              ],
            ),
          ),
        ),
        const SizedBox(height: 12),
        Wrap(
          spacing: 16,
          runSpacing: 8,
          children: [
            _Legend(color: palette.income, label: 'Income'),
            _Legend(color: palette.expense, label: 'Expense'),
          ],
        ),
      ],
    );
  }
}

class _Bar extends StatelessWidget {
  const _Bar({required this.fraction, required this.color});

  final double fraction;
  final Color color;

  @override
  Widget build(BuildContext context) {
    final height = fraction <= 0
        ? 0.0
        : (fraction < 0.03 ? 0.03 : fraction).toDouble();
    if (height == 0) return const SizedBox.shrink();
    return FractionallySizedBox(
      heightFactor: height > 1 ? 1 : height,
      alignment: Alignment.bottomCenter,
      child: Container(
        decoration: BoxDecoration(
          color: color,
          borderRadius: const BorderRadius.vertical(top: Radius.circular(3)),
        ),
      ),
    );
  }
}

class _Legend extends StatelessWidget {
  const _Legend({required this.color, required this.label});

  final Color color;
  final String label;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(
          width: 10,
          height: 10,
          decoration: BoxDecoration(color: color, shape: BoxShape.circle),
        ),
        const SizedBox(width: 6),
        Text(label, style: theme.textTheme.bodySmall),
      ],
    );
  }
}

class _DailyChart extends StatelessWidget {
  const _DailyChart({required this.report});

  final DailyReport report;

  @override
  Widget build(BuildContext context) {
    final points = [
      for (final point in report.points)
        (
          label: '${DateTime.parse('${point.date}T00:00:00Z').day}',
          primary: double.tryParse(point.income) ?? 0,
          secondary: double.tryParse(point.expense) ?? 0,
        ),
    ];
    return _SeriesChart(points: points);
  }
}

class _MonthlyChart extends StatelessWidget {
  const _MonthlyChart({required this.report});

  final MonthlyReport report;

  @override
  Widget build(BuildContext context) {
    final points = [
      for (final point in report.points)
        (
          label: formatMonthLabel(point.month).split(' ').first,
          primary: double.tryParse(point.income) ?? 0,
          secondary: double.tryParse(point.expense) ?? 0,
        ),
    ];
    return _SeriesChart(points: points);
  }
}

class _CategoryBreakdown extends StatelessWidget {
  const _CategoryBreakdown({required this.report});

  final CategoryReport report;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Column(
      children: [
        for (final point in report.points) ...[
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 6),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Row(
                  children: [
                    Container(
                      width: 10,
                      height: 10,
                      decoration: BoxDecoration(
                        color: colorFromHex(
                          point.color,
                          fallback: theme.colorScheme.outlineVariant,
                        ),
                        shape: BoxShape.circle,
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Text(
                        point.categoryName,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: theme.textTheme.bodyMedium,
                      ),
                    ),
                    Text(
                      formatPercent(point.percentage),
                      style: theme.textTheme.bodySmall?.copyWith(
                        color: theme.colorScheme.onSurfaceVariant,
                      ),
                    ),
                    const SizedBox(width: 10),
                    Text(
                      formatMoney(point.total, report.currency),
                      style: theme.textTheme.titleSmall,
                    ),
                  ],
                ),
                const SizedBox(height: 6),
                ClipRRect(
                  borderRadius: BorderRadius.circular(4),
                  child: LinearProgressIndicator(
                    value: (double.tryParse(point.percentage) ?? 0) / 100,
                    minHeight: 6,
                    color: colorFromHex(
                      point.color,
                      fallback: theme.colorScheme.primary,
                    ),
                    backgroundColor: theme.colorScheme.surfaceContainerHighest,
                  ),
                ),
              ],
            ),
          ),
        ],
      ],
    );
  }
}
