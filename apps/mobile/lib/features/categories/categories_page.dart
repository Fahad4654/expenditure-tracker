import 'package:flutter/material.dart';

import '../../app_scope.dart';
import '../../core/network/api_error.dart';
import '../../shared/models/category.dart';
import '../../shared/models/transaction.dart';
import '../../shared/widgets/category_avatar.dart';
import '../../shared/widgets/confirm_dialog.dart';
import '../../shared/widgets/empty_state.dart';
import '../../shared/widgets/error_banner.dart';
import '../../shared/widgets/loading_view.dart';
import '../../shared/widgets/section_card.dart';

/// Colour swatches offered when creating a category (data values, mirroring
/// the seeded system palette).
const List<String> _palette = [
  '#F97316',
  '#3B82F6',
  '#EC4899',
  '#EF4444',
  '#8B5CF6',
  '#10B981',
  '#06B6D4',
  '#22C55E',
  '#0EA5E9',
  '#64748B',
  '#F59E0B',
  '#14B8A6',
];

/// Manage system and personal categories.
class CategoriesPage extends StatefulWidget {
  const CategoriesPage({super.key});

  @override
  State<CategoriesPage> createState() => _CategoriesPageState();
}

class _CategoriesPageState extends State<CategoriesPage> {
  List<Category> _categories = [];
  bool _loading = true;
  ApiError? _error;

  List<Category> get _own =>
      _categories.where((c) => c.kind == CategoryKind.user).toList();
  List<Category> get _system =>
      _categories.where((c) => c.kind == CategoryKind.system).toList();

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
    try {
      final categories = await AppScope.read(context).categories.list();
      if (!mounted) return;
      setState(() {
        _categories = categories;
        _loading = false;
      });
    } on ApiError catch (error) {
      if (!mounted) return;
      setState(() {
        _error = error;
        _loading = false;
      });
    }
  }

  Future<void> _openForm({Category? existing}) async {
    final input = await showDialog<CategoryInput>(
      context: context,
      builder: (_) => _CategoryFormDialog(existing: existing),
    );
    if (input == null || !mounted) return;

    final repo = AppScope.read(context).categories;
    try {
      if (existing == null) {
        await repo.create(input);
      } else {
        await repo.update(existing.id, input);
      }
      if (mounted) _load();
    } on ApiError catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(error.message)),
      );
    }
  }

  Future<void> _delete(Category category) async {
    final confirmed = await showConfirmDialog(
      context,
      title: 'Delete category?',
      message: '"${category.name}" will be removed from your categories.',
    );
    if (!confirmed || !mounted) return;

    try {
      await AppScope.read(context).categories.delete(category.id);
      if (mounted) _load();
    } on ApiError catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            error.isConflict
                ? 'This category is used by transactions and cannot be deleted.'
                : error.message,
          ),
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Categories')),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => _openForm(),
        icon: const Icon(Icons.add),
        label: const Text('New'),
      ),
      body: _loading
          ? const LoadingView(label: 'Loading categories…')
          : RefreshIndicator(
              onRefresh: _load,
              child: ListView(
                padding: const EdgeInsets.fromLTRB(16, 8, 16, 96),
                children: [
                  if (_error != null) ...[
                    ErrorBanner(message: _error!.message, onRetry: _load),
                    const SizedBox(height: 12),
                  ],
                  if (_own.isNotEmpty) ...[
                    SectionCard(
                      title: 'Your categories',
                      child: Column(
                        children: [
                          for (var i = 0; i < _own.length; i++) ...[
                            if (i > 0) const Divider(height: 1),
                            _CategoryRow(
                              category: _own[i],
                              onEdit: () => _openForm(existing: _own[i]),
                              onDelete: () => _delete(_own[i]),
                            ),
                          ],
                        ],
                      ),
                    ),
                    const SizedBox(height: 12),
                  ],
                  SectionCard(
                    title: 'System categories',
                    child: _system.isEmpty
                        ? const EmptyState(
                            icon: Icons.category_outlined,
                            title: 'Nothing here yet',
                          )
                        : Wrap(
                            spacing: 8,
                            runSpacing: 8,
                            children: [
                              for (final category in _system)
                                _SystemChip(category: category),
                            ],
                          ),
                  ),
                ],
              ),
            ),
    );
  }
}

class _SystemChip extends StatelessWidget {
  const _SystemChip({required this.category});

  final Category category;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Tooltip(
      message: category.suggestedType == TransactionType.income ? 'Income' : 'Expense',
      child: Chip(
        avatar: CategoryAvatar(
          color: category.color,
          size: 24,
        ),
        label: Text(category.name),
        visualDensity: VisualDensity.compact,
        side: BorderSide(color: theme.colorScheme.outlineVariant),
      ),
    );
  }
}

class _CategoryRow extends StatelessWidget {
  const _CategoryRow({
    required this.category,
    required this.onEdit,
    required this.onDelete,
  });

  final Category category;
  final VoidCallback onEdit;
  final VoidCallback onDelete;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: Row(
        children: [
          CategoryAvatar(color: category.color, size: 36),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  category.name,
                  style: theme.textTheme.titleSmall,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
                Text(
                  category.suggestedType == TransactionType.income
                      ? 'Suggested: Income'
                      : 'Suggested: Expense',
                  style: theme.textTheme.bodySmall?.copyWith(
                    color: theme.colorScheme.onSurfaceVariant,
                  ),
                ),
              ],
            ),
          ),
          IconButton(
            tooltip: 'Edit',
            icon: const Icon(Icons.edit_outlined),
            onPressed: onEdit,
          ),
          IconButton(
            tooltip: 'Delete',
            icon: const Icon(Icons.delete_outline),
            onPressed: onDelete,
          ),
        ],
      ),
    );
  }
}

class _CategoryFormDialog extends StatefulWidget {
  const _CategoryFormDialog({this.existing});

  final Category? existing;

  @override
  State<_CategoryFormDialog> createState() => _CategoryFormDialogState();
}

class _CategoryFormDialogState extends State<_CategoryFormDialog> {
  late final TextEditingController _nameController;
  late TransactionType _type;
  late String _color;
  String? _nameError;

  @override
  void initState() {
    super.initState();
    final existing = widget.existing;
    _nameController = TextEditingController(text: existing?.name ?? '');
    _type = existing?.suggestedType ?? TransactionType.expense;
    _color = existing?.color ?? _palette.first;
  }

  @override
  void dispose() {
    _nameController.dispose();
    super.dispose();
  }

  void _submit() {
    final name = _nameController.text.trim();
    if (name.isEmpty) {
      setState(() => _nameError = 'Name is required');
      return;
    }
    if (name.length > 40) {
      setState(() => _nameError = 'Keep it under 40 characters');
      return;
    }
    Navigator.of(context).pop(
      CategoryInput(name: name, suggestedType: _type, color: _color),
    );
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return AlertDialog(
      title: Text(widget.existing == null ? 'New category' : 'Edit category'),
      content: SingleChildScrollView(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 360),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              TextField(
                controller: _nameController,
                autofocus: true,
                textCapitalization: TextCapitalization.sentences,
                maxLength: 40,
                decoration: InputDecoration(
                  labelText: 'Name',
                  counterText: '',
                  errorText: _nameError,
                ),
              ),
              const SizedBox(height: 16),
              Text('Suggested type', style: theme.textTheme.labelMedium),
              const SizedBox(height: 8),
              SegmentedButton<TransactionType>(
                segments: const [
                  ButtonSegment(value: TransactionType.expense, label: Text('Expense')),
                  ButtonSegment(value: TransactionType.income, label: Text('Income')),
                ],
                selected: {_type},
                onSelectionChanged: (selection) =>
                    setState(() => _type = selection.first),
              ),
              const SizedBox(height: 16),
              Text('Colour', style: theme.textTheme.labelMedium),
              const SizedBox(height: 8),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  for (final hex in _palette)
                    InkWell(
                      borderRadius: BorderRadius.circular(20),
                      onTap: () => setState(() => _color = hex),
                      child: Container(
                        width: 32,
                        height: 32,
                        decoration: BoxDecoration(
                          color: colorFromHex(hex),
                          shape: BoxShape.circle,
                          border: Border.all(
                            color: _color == hex
                                ? theme.colorScheme.onSurface
                                : Colors.transparent,
                            width: 2,
                          ),
                        ),
                        child: _color == hex
                            ? Icon(Icons.check, size: 18, color: Colors.white)
                            : null,
                      ),
                    ),
                ],
              ),
            ],
          ),
        ),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.of(context).pop(),
          child: const Text('Cancel'),
        ),
        FilledButton(
          onPressed: _submit,
          child: const Text('Save'),
        ),
      ],
    );
  }
}
