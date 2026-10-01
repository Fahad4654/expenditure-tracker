import 'package:flutter/foundation.dart' show ValueListenable;
import 'package:flutter/material.dart';

import '../../app_scope.dart';
import '../../core/network/api_error.dart';
import '../../shared/models/category.dart';
import '../../shared/models/common.dart';
import '../../shared/models/report.dart';
import '../../shared/models/transaction.dart';
import '../../shared/formatters.dart';
import '../../shared/money.dart';
import '../../shared/widgets/amount_text.dart';
import '../../shared/widgets/category_avatar.dart';
import '../../shared/widgets/empty_state.dart';
import '../../shared/widgets/error_banner.dart';
import '../../shared/widgets/loading_view.dart';
import '../../shared/widgets/responsive_wrap.dart';
import '../../shared/widgets/section_card.dart';
import '../../shared/widgets/transaction_tile.dart';
import '../transactions/transaction_detail_page.dart';

/// Today/month money summaries, top spending categories and recent activity.
class DashboardPage extends StatefulWidget {
  const DashboardPage({super.key, this.refreshTick});

  /// Bumped by the shell after a transaction is created from the Add button.
  final ValueListenable<int>? refreshTick;

  @override
  State<DashboardPage> createState() => _DashboardPageState();
}

class _DashboardPageState extends State<DashboardPage> {
  SummaryResponse? _today;
  SummaryResponse? _month;
  CategoryReport? _topSpending;
  List<Transaction> _recent = [];
  List<Category> _categories = [];
  bool _loading = true;
  ApiError? _error;

  @override
  void initState() {
    super.initState();
    widget.refreshTick?.addListener(_onTick);
    _load();
  }

  @override
  void dispose() {
    widget.refreshTick?.removeListener(_onTick);
    super.dispose();
  }

  void _onTick() => _load();

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });

    final scope = AppScope.read(context);
    final timezone = scope.auth.user?.timezone;

    SummaryResponse? today;
    SummaryResponse? month;
    CategoryReport? topSpending;
    List<Transaction>? recent;
    List<Category>? categories;
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
        scope.reports.summary(preset: DateRangePreset.today, timezone: timezone),
        (value) => today = value,
      ),
      run(
        scope.reports.summary(preset: DateRangePreset.month, timezone: timezone),
        (value) => month = value,
      ),
      run(
        scope.reports.categories(
          preset: DateRangePreset.month,
          type: TransactionType.expense,
          timezone: timezone,
        ),
        (value) => topSpending = value,
      ),
      run(
        scope.transactions.list(
          const TransactionQuery(limit: 5, sort: 'createdAt', order: 'desc'),
        ),
        (value) => recent = value.items,
      ),
      run(scope.categories.list(), (value) => categories = value),
    ]);

    if (!mounted) return;
    setState(() {
      _today = today;
      _month = month;
      _topSpending = topSpending;
      _recent = recent ?? _recent;
      _categories = categories ?? _categories;
      _loading = false;
      _error = error;
    });
  }

  Future<void> _openTransaction(Transaction transaction) async {
    final changed = await Navigator.of(context).push<bool>(
      MaterialPageRoute(
        builder: (_) => TransactionDetailPage(transactionId: transaction.id),
      ),
    );
    if (changed == true && mounted) _load();
  }

  @override
  Widget build(BuildContext context) {
    final auth = AppScope.read(context).auth;
    final firstName = (auth.user?.name ?? '').split(' ').first;
    final title = firstName.isEmpty ? 'Dashboard' : 'Hi, $firstName';

    return Scaffold(
      appBar: AppBar(title: Text(title)),
      body: _loading && _today == null && _recent.isEmpty
          ? const LoadingView(label: 'Loading your overview…')
          : RefreshIndicator(
              onRefresh: _load,
              child: ListView(
                padding: const EdgeInsets.fromLTRB(16, 8, 16, 96),
                children: [
                  if (_error != null) ...[
                    ErrorBanner(message: _error!.message, onRetry: _load),
                    const SizedBox(height: 12),
                  ],
                  ResponsiveWrap(
                    children: [
                      _SummaryCard(title: 'Today', summary: _today),
                      _SummaryCard(title: 'This month', summary: _month),
                    ],
                  ),
                  const SizedBox(height: 12),
                  SectionCard(
                    title: 'Recent activity',
                    child: _recent.isEmpty
                        ? const EmptyState(
                            icon: Icons.receipt_long_outlined,
                            title: 'No transactions yet',
                            message: 'Tap Add to record your first one.',
                          )
                        : Column(
                            children: [
                              for (var i = 0; i < _recent.length; i++) ...[
                                if (i > 0) const SizedBox(height: 8),
                                TransactionTile(
                                  transaction: _recent[i],
                                  categories: _categories,
                                  onTap: () => _openTransaction(_recent[i]),
                                ),
                              ],
                            ],
                          ),
                  ),
                  const SizedBox(height: 12),
                  SectionCard(
                    title: 'Top spending this month',
                    child: _topSpending == null || _topSpending!.points.isEmpty
                        ? EmptyState(
                            icon: Icons.pie_chart_outline,
                            title: 'Nothing to show yet',
                            message: _loading ? ' ' : 'Expenses this month will appear here.',
                          )
                        : Column(
                            children: [
                              for (final point in _topSpending!.points.take(5)) ...[
                                _CategoryRow(point: point, currency: _topSpending!.currency),
                                const SizedBox(height: 10),
                              ],
                            ],
                          ),
                  ),
                ],
              ),
            ),
    );
  }
}

class _SummaryCard extends StatelessWidget {
  const _SummaryCard({required this.title, required this.summary});

  final String title;
  final SummaryResponse? summary;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    if (summary == null) {
      return Card(
        margin: EdgeInsets.zero,
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(title, style: theme.textTheme.titleMedium),
              const SizedBox(height: 16),
              const SizedBox(
                height: 12,
                width: 12,
                child: CircularProgressIndicator(strokeWidth: 2),
              ),
            ],
          ),
        ),
      );
    }

    final data = summary!;
    return Card(
      margin: EdgeInsets.zero,
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(title, style: theme.textTheme.titleMedium),
            const SizedBox(height: 12),
            _MoneyRow(
              icon: Icons.arrow_downward_rounded,
              label: 'Income',
              amount: data.totalIncome,
              currency: data.currency,
              income: true,
            ),
            const SizedBox(height: 8),
            _MoneyRow(
              icon: Icons.arrow_upward_rounded,
              label: 'Expense',
              amount: data.totalExpense,
              currency: data.currency,
              income: false,
            ),
            const Divider(height: 20),
            Row(
              children: [
                Expanded(
                  child: Text('Balance', style: theme.textTheme.bodyMedium),
                ),
                Flexible(
                  child: AmountText(
                    data.balance,
                    currency: data.currency,
                    showSign: false,
                    style: theme.textTheme.titleMedium,
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _MoneyRow extends StatelessWidget {
  const _MoneyRow({
    required this.icon,
    required this.label,
    required this.amount,
    required this.currency,
    required this.income,
  });

  final IconData icon;
  final String label;
  final String amount;
  final String currency;
  final bool income;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Row(
      children: [
        Icon(icon, size: 16, color: theme.colorScheme.onSurfaceVariant),
        const SizedBox(width: 6),
        Expanded(
          child: Text(label, style: theme.textTheme.bodyMedium),
        ),
        Flexible(
          child: AmountText(
            amount,
            type: income ? TransactionType.income : TransactionType.expense,
            currency: currency,
            showSign: false,
            style: theme.textTheme.bodyLarge,
          ),
        ),
      ],
    );
  }
}

class _CategoryRow extends StatelessWidget {
  const _CategoryRow({required this.point, required this.currency});

  final CategoryBreakdownPoint point;
  final String currency;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final color = colorFromHex(point.color, fallback: theme.colorScheme.outlineVariant);

    return Row(
      children: [
        Container(
          width: 10,
          height: 10,
          decoration: BoxDecoration(color: color, shape: BoxShape.circle),
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
        const SizedBox(width: 8),
        Text(
          formatPercent(point.percentage),
          style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSurfaceVariant),
        ),
        const SizedBox(width: 10),
        Flexible(
          child: Text(
            formatMoney(point.total, currency),
            style: theme.textTheme.titleSmall,
            textAlign: TextAlign.end,
          ),
        ),
      ],
    );
  }
}
