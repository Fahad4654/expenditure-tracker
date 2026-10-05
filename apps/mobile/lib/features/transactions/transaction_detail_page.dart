import 'package:flutter/material.dart';

import '../../app_scope.dart';
import '../../core/network/api_error.dart';
import '../../core/theme/app_theme.dart';
import '../../shared/formatters.dart';
import '../../shared/money.dart';
import '../../shared/models/category.dart';
import '../../shared/models/note.dart';
import '../../shared/models/transaction.dart';
import '../../shared/widgets/category_avatar.dart';
import '../../shared/widgets/confirm_dialog.dart';
import '../../shared/widgets/error_banner.dart';
import '../../shared/widgets/loading_view.dart';
import 'transaction_form_page.dart';

/// Read-only detail view with edit and delete actions.
///
/// Pops with `true` when the underlying transaction changed so the list that
/// opened it can refresh.
class TransactionDetailPage extends StatefulWidget {
  const TransactionDetailPage({super.key, required this.transactionId});

  final String transactionId;

  @override
  State<TransactionDetailPage> createState() => _TransactionDetailPageState();
}

class _TransactionDetailPageState extends State<TransactionDetailPage> {
  Transaction? _transaction;
  List<Category> _categories = [];
  List<Note> _notes = [];
  bool _loading = true;
  bool _dirty = false;
  ApiError? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });

    final scope = AppScope.read(context);
    Transaction? transaction;
    List<Category>? categories;
    List<Note>? notes;
    ApiError? error;

    try {
      transaction = await scope.transactions.get(widget.transactionId);
    } on ApiError catch (caught) {
      error = caught;
    }
    try {
      categories = await scope.categories.list();
    } on ApiError {
      // The category label is a nicety; the detail still renders without it.
    }
    try {
      notes = await scope.notes.list();
    } on ApiError {
      // Same for the tagged note title — the tag itself stays on the row.
    }

    if (!mounted) return;
    setState(() {
      _transaction = transaction;
      _categories = categories ?? _categories;
      _notes = notes ?? _notes;
      _loading = false;
      _error = error;
    });
  }

  Future<void> _edit() async {
    final transaction = _transaction;
    if (transaction == null) return;
    final changed = await Navigator.of(context).push<bool>(
      MaterialPageRoute(
        builder: (_) => TransactionFormPage(existing: transaction),
      ),
    );
    if (changed != true || !mounted) return;
    _dirty = true;
    await _load();
  }

  Future<void> _delete() async {
    final transaction = _transaction;
    if (transaction == null) return;
    final confirmed = await showConfirmDialog(
      context,
      title: 'Delete transaction?',
      message: '"${transaction.title}" will be removed from your records.',
      confirmLabel: 'Delete',
    );
    if (!confirmed || !mounted) return;

    final scope = AppScope.read(context);
    try {
      await scope.transactions.delete(transaction.id);
      if (mounted) Navigator.of(context).pop(true);
    } on ApiError catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(error.message)),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final transaction = _transaction;

    return PopScope(
      canPop: false,
      onPopInvokedWithResult: (didPop, _) {
        if (didPop) return;
        Navigator.of(context).pop(_dirty);
      },
      child: Scaffold(
        appBar: AppBar(
          title: const Text('Transaction'),
          actions: [
            if (transaction != null) ...[
              IconButton(
                tooltip: 'Edit',
                icon: const Icon(Icons.edit_outlined),
                onPressed: _edit,
              ),
              IconButton(
                tooltip: 'Delete',
                icon: const Icon(Icons.delete_outline),
                onPressed: _delete,
              ),
            ],
          ],
        ),
        body: _loading
            ? const LoadingView(label: 'Loading transaction…')
            : _error != null
                ? Center(
                    child: Padding(
                      padding: const EdgeInsets.all(24),
                      child: ErrorBanner(message: _error!.message, onRetry: _load),
                    ),
                  )
                : transaction == null
                    ? const SizedBox.shrink()
                    : _Details(
                        transaction: transaction,
                        categories: _categories,
                        notes: _notes,
                      ),
      ),
    );
  }
}

class _Details extends StatelessWidget {
  const _Details({
    required this.transaction,
    required this.categories,
    required this.notes,
  });

  final Transaction transaction;
  final List<Category> categories;
  final List<Note> notes;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final palette = AppPalette.of(context);
    final category =
        categories.where((c) => c.id == transaction.categoryId).firstOrNull;
    final typeLabel = transaction.type == TransactionType.income ? 'Income' : 'Expense';
    // The tag stays visible even when its title cannot be resolved (offline,
    // or the note was deleted upstream).
    final noteTitle = transaction.noteId == null
        ? null
        : notes.where((note) => note.id == transaction.noteId).firstOrNull?.title ??
            'Unknown note';

    return Center(
      child: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 560),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Card(
                margin: EdgeInsets.zero,
                child: Padding(
                  padding: const EdgeInsets.all(20),
                  child: Column(
                    children: [
                      Text(
                        typeLabel,
                        style: theme.textTheme.labelLarge?.copyWith(
                          color: theme.colorScheme.onSurfaceVariant,
                        ),
                      ),
                      const SizedBox(height: 8),
                      Text(
                        '${transaction.type == TransactionType.expense ? '-' : '+'}'
                        '${formatMoney(transaction.amount, transaction.currency)}',
                        style: theme.textTheme.headlineMedium?.copyWith(
                          fontWeight: FontWeight.w700,
                          color: transaction.type == TransactionType.income
                              ? palette.income
                              : palette.expense,
                        ),
                        textAlign: TextAlign.center,
                      ),
                      const SizedBox(height: 16),
                      Row(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          if (category != null) ...[
                            CategoryAvatar(
                              color: category.color,
                              icon: category.icon,
                              size: 28,
                            ),
                            const SizedBox(width: 8),
                            Text(category.name, style: theme.textTheme.bodyMedium),
                            const SizedBox(width: 12),
                          ],
                          Text(
                            formatDay(transaction.transactionDate, weekday: true),
                            style: theme.textTheme.bodyMedium?.copyWith(
                              color: theme.colorScheme.onSurfaceVariant,
                            ),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
              ),
              const SizedBox(height: 16),
              Card(
                margin: EdgeInsets.zero,
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(transaction.title, style: theme.textTheme.titleLarge),
                      if (transaction.description != null &&
                          transaction.description!.isNotEmpty) ...[
                        const SizedBox(height: 8),
                        Text(
                          transaction.description!,
                          style: theme.textTheme.bodyMedium,
                        ),
                      ],
                      if (noteTitle != null) ...[
                        const SizedBox(height: 8),
                        _MetaRow(label: 'Tagged note', value: noteTitle),
                      ],
                      const Divider(height: 28),
                      _MetaRow(label: 'Created', value: formatInstant(transaction.createdAt)),
                      _MetaRow(label: 'Updated', value: formatInstant(transaction.updatedAt)),
                      _MetaRow(label: 'Version', value: '${transaction.version}'),
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
}

class _MetaRow extends StatelessWidget {
  const _MetaRow({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 90,
            child: Text(
              label,
              style: theme.textTheme.bodySmall?.copyWith(
                color: theme.colorScheme.onSurfaceVariant,
              ),
            ),
          ),
          Expanded(child: Text(value, style: theme.textTheme.bodyMedium)),
        ],
      ),
    );
  }
}
