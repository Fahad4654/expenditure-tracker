import 'dart:async';

import 'package:flutter/foundation.dart' show ValueListenable;
import 'package:flutter/material.dart';

import '../../app_scope.dart';
import '../../core/network/api_error.dart';
import '../../shared/models/category.dart';
import '../../shared/models/common.dart';
import '../../shared/models/transaction.dart';
import '../../shared/widgets/empty_state.dart';
import '../../shared/widgets/error_banner.dart';
import '../../shared/widgets/loading_view.dart';
import '../../shared/widgets/transaction_tile.dart';
import '../categories/categories_page.dart';
import 'transaction_detail_page.dart';
import 'transaction_form_page.dart';

/// Searchable, filterable transaction list with incremental pagination.
class TransactionsPage extends StatefulWidget {
  const TransactionsPage({super.key, this.refreshTick});

  /// Bumped by the shell after a transaction is created from the Add button.
  final ValueListenable<int>? refreshTick;

  @override
  State<TransactionsPage> createState() => _TransactionsPageState();
}

class _TransactionsPageState extends State<TransactionsPage> {
  static const _pageSize = 20;

  final TextEditingController _searchController = TextEditingController();
  Timer? _debounce;

  List<Category> _categories = [];
  List<Transaction> _items = [];
  PageMeta? _meta;
  TransactionType? _type;
  DateRangePreset? _preset;
  String? _categoryId;
  int _page = 1;
  bool _loading = true;
  bool _loadingMore = false;
  ApiError? _error;
  int _requestId = 0;

  bool get _hasFilters =>
      _searchController.text.trim().isNotEmpty ||
      _type != null ||
      _preset != null ||
      _categoryId != null;

  @override
  void initState() {
    super.initState();
    widget.refreshTick?.addListener(_onTick);
    _loadCategories();
    _load(reset: true);
  }

  @override
  void dispose() {
    widget.refreshTick?.removeListener(_onTick);
    _debounce?.cancel();
    _searchController.dispose();
    super.dispose();
  }

  void _onTick() => _load(reset: true);

  TransactionQuery get _query => TransactionQuery(
        page: _page,
        limit: _pageSize,
        search: _searchController.text,
        type: _type,
        categoryId: _categoryId,
        preset: _preset,
      );

  Future<void> _loadCategories() async {
    try {
      final categories = await AppScope.read(context).categories.list();
      if (mounted) setState(() => _categories = categories);
    } on ApiError {
      // Filters degrade gracefully without the category list.
    }
  }

  Future<void> _load({bool reset = false}) async {
    final requestId = ++_requestId;
    if (reset) _page = 1;

    setState(() {
      _error = null;
      if (reset) {
        _loading = true;
      } else {
        _loadingMore = true;
      }
    });

    final scope = AppScope.read(context);
    try {
      final result = await scope.transactions.list(_query);
      if (!mounted || requestId != _requestId) return;
      setState(() {
        _items = reset ? result.items : [..._items, ...result.items];
        _meta = result.meta;
        _loading = false;
        _loadingMore = false;
      });
    } on ApiError catch (error) {
      if (!mounted || requestId != _requestId) return;
      setState(() {
        _error = error;
        _loading = false;
        _loadingMore = false;
      });
    }
  }

  void _onSearchChanged(String value) {
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 300), () => _load(reset: true));
  }

  void _clearFilters() {
    _searchController.clear();
    setState(() {
      _type = null;
      _preset = null;
      _categoryId = null;
    });
    _load(reset: true);
  }

  Future<void> _openTransaction(Transaction transaction) async {
    final changed = await Navigator.of(context).push<bool>(
      MaterialPageRoute(
        builder: (_) => TransactionDetailPage(transactionId: transaction.id),
      ),
    );
    if (changed == true && mounted) _load(reset: true);
  }

  Future<void> _openCategories() async {
    await Navigator.of(context).push(
      MaterialPageRoute(builder: (_) => const CategoriesPage()),
    );
    if (mounted) _loadCategories();
  }

  Future<void> _openAdd() async {
    final created = await Navigator.of(context).push<bool>(
      MaterialPageRoute(builder: (_) => const TransactionFormPage()),
    );
    if (created == true && mounted) _load(reset: true);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Transactions'),
        actions: [
          IconButton(
            tooltip: 'Categories',
            icon: const Icon(Icons.label_outline),
            onPressed: _openCategories,
          ),
        ],
      ),
      body: SafeArea(
        child: _loading
            ? const LoadingView(label: 'Loading transactions…')
            : RefreshIndicator(
                onRefresh: () => _load(reset: true),
                child: ListView(
                  padding: const EdgeInsets.fromLTRB(16, 4, 16, 96),
                  children: [
                    Center(
                      child: ConstrainedBox(
                        constraints: const BoxConstraints(maxWidth: 720),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.stretch,
                          children: [
                            if (_error != null) ...[
                              ErrorBanner(message: _error!.message, onRetry: () => _load(reset: true)),
                              const SizedBox(height: 12),
                            ],
                            _buildFilters(),
                            const SizedBox(height: 12),
                            if (_items.isEmpty)
                              EmptyState(
                                icon: Icons.receipt_long_outlined,
                                title: _hasFilters ? 'No matching transactions' : 'No transactions yet',
                                message: _hasFilters
                                    ? 'Try a different search or filter.'
                                    : 'Tap Add to record your first one.',
                                actionLabel:
                                    _hasFilters ? 'Clear filters' : 'Add transaction',
                                onAction: _hasFilters ? _clearFilters : _openAdd,
                              )
                            else ...[
                              if (_meta != null)
                                Padding(
                                  padding: const EdgeInsets.only(bottom: 8),
                                  child: Text(
                                    '${_meta!.total} transaction${_meta!.total == 1 ? '' : 's'}',
                                    style: Theme.of(context).textTheme.bodySmall?.copyWith(
                                          color: Theme.of(context).colorScheme.onSurfaceVariant,
                                        ),
                                  ),
                                ),
                              for (var i = 0; i < _items.length; i++) ...[
                                if (i > 0) const SizedBox(height: 8),
                                TransactionTile(
                                  transaction: _items[i],
                                  categories: _categories,
                                  onTap: () => _openTransaction(_items[i]),
                                ),
                              ],
                              if (_meta?.hasNextPage == true) ...[
                                const SizedBox(height: 16),
                                FilledButton.tonal(
                                  onPressed: _loadingMore
                                      ? null
                                      : () {
                                          _page++;
                                          _load();
                                        },
                                  child: _loadingMore
                                      ? const SizedBox(
                                          width: 20,
                                          height: 20,
                                          child: CircularProgressIndicator(strokeWidth: 2),
                                        )
                                      : const Text('Load more'),
                                ),
                              ],
                            ],
                          ],
                        ),
                      ),
                    ),
                  ],
                ),
              ),
      ),
    );
  }

  Widget _buildFilters() {
    final theme = Theme.of(context);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        TextField(
          controller: _searchController,
          onChanged: _onSearchChanged,
          textInputAction: TextInputAction.search,
          decoration: InputDecoration(
            hintText: 'Search transactions',
            prefixIcon: const Icon(Icons.search),
            suffixIcon: _searchController.text.isEmpty
                ? null
                : IconButton(
                    icon: const Icon(Icons.clear),
                    onPressed: () {
                      _searchController.clear();
                      _load(reset: true);
                    },
                  ),
          ),
        ),
        const SizedBox(height: 12),
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [
            _filterChip(label: 'All', selected: _type == null, onSelected: () {
              setState(() => _type = null);
              _load(reset: true);
            }),
            _filterChip(label: 'Income', selected: _type == TransactionType.income, onSelected: () {
              setState(() => _type = TransactionType.income);
              _load(reset: true);
            }),
            _filterChip(label: 'Expense', selected: _type == TransactionType.expense, onSelected: () {
              setState(() => _type = TransactionType.expense);
              _load(reset: true);
            }),
          ],
        ),
        const SizedBox(height: 8),
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [
            for (final preset in const <DateRangePreset?>[
              null,
              DateRangePreset.today,
              DateRangePreset.week,
              DateRangePreset.month,
              DateRangePreset.year,
            ])
              _filterChip(
                label: switch (preset) {
                  null => 'All time',
                  DateRangePreset.today => 'Today',
                  DateRangePreset.week => 'This week',
                  DateRangePreset.month => 'This month',
                  DateRangePreset.year => 'This year',
                  _ => preset.wire,
                },
                selected: _preset == preset,
                onSelected: () {
                  setState(() => _preset = preset);
                  _load(reset: true);
                },
              ),
          ],
        ),
        const SizedBox(height: 12),
        DropdownButtonFormField<String?>(
          key: ValueKey('category-filter-$_categoryId'),
          initialValue: _categoryId,
          decoration: const InputDecoration(
            labelText: 'Category',
            prefixIcon: Icon(Icons.label_outline),
          ),
          items: [
            const DropdownMenuItem<String?>(value: null, child: Text('All categories')),
            for (final category in _categories)
              DropdownMenuItem<String?>(
                value: category.id,
                child: Text(category.name, overflow: TextOverflow.ellipsis),
              ),
          ],
          onChanged: (value) {
            setState(() => _categoryId = value);
            _load(reset: true);
          },
        ),
        const SizedBox(height: 4),
        Text(
          _hasFilters ? 'Filters are applied as you change them.' : 'Showing everything.',
          style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSurfaceVariant),
        ),
      ],
    );
  }

  Widget _filterChip({
    required String label,
    required bool selected,
    required VoidCallback onSelected,
  }) {
    return ChoiceChip(
      label: Text(label),
      selected: selected,
      onSelected: (_) => onSelected(),
    );
  }
}
