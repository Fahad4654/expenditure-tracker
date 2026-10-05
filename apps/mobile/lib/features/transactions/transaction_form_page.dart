import 'package:flutter/material.dart';

import '../../app_scope.dart';
import '../../core/network/api_error.dart';
import '../../shared/models/category.dart';
import '../../shared/models/note.dart';
import '../../shared/models/transaction.dart';
import '../../shared/formatters.dart';
import '../../shared/money.dart';
import '../../shared/utils/uuid.dart';
import '../../shared/widgets/category_avatar.dart';
import '../../shared/widgets/error_banner.dart';
import '../../shared/widgets/loading_view.dart';
import '../../shared/widgets/searchable_picker_sheet.dart';

/// Create or edit a transaction. One screen serves both modes so validation,
/// category selection and server error mapping exist exactly once.
class TransactionFormPage extends StatefulWidget {
  const TransactionFormPage({super.key, this.existing});

  /// When set, the form edits this transaction (optimistic `baseVersion`).
  final Transaction? existing;

  @override
  State<TransactionFormPage> createState() => _TransactionFormPageState();
}

class _TransactionFormPageState extends State<TransactionFormPage> {
  final _formKey = GlobalKey<FormState>();
  final _amountController = TextEditingController();
  final _titleController = TextEditingController();
  final _descriptionController = TextEditingController();
  late final TextEditingController _dateController;

  TransactionType _type = TransactionType.expense;
  String _date = todayIso();
  String? _categoryId;
  List<Category> _categories = [];
  bool _loadingCategories = true;
  String? _noteId;
  List<Note> _notes = [];
  bool _loadingNotes = true;
  String? _notesError;
  bool _saving = false;
  String? _submitError;
  Map<String, String> _serverErrors = {};

  bool get _isEdit => widget.existing != null;

  @override
  void initState() {
    super.initState();
    _dateController = TextEditingController(text: _date);
    final existing = widget.existing;
    if (existing != null) {
      _type = existing.type;
      _amountController.text = existing.amount;
      _titleController.text = existing.title;
      _descriptionController.text = existing.description ?? '';
      _date = existing.transactionDate;
      _categoryId = existing.categoryId;
      _noteId = existing.noteId;
    }
    _loadCategories();
    _loadNotes();
  }

  @override
  void dispose() {
    _amountController.dispose();
    _titleController.dispose();
    _descriptionController.dispose();
    _dateController.dispose();
    super.dispose();
  }

  Future<void> _loadCategories() async {
    try {
      final categories = await AppScope.read(context).categories.list();
      if (!mounted) return;
      setState(() {
        _categories = categories;
        _loadingCategories = false;
        if (_categoryId == null || !categories.any((c) => c.id == _categoryId)) {
          _categoryId = _firstMatching(categories, _type);
        }
      });
    } on ApiError catch (error) {
      if (!mounted) return;
      setState(() {
        _loadingCategories = false;
        _submitError = error.message;
      });
    }
  }

  Future<void> _loadNotes() async {
    try {
      final notes = await AppScope.read(context).notes.list();
      if (!mounted) return;
      setState(() {
        _notes = notes;
        _loadingNotes = false;
      });
    } on ApiError catch (error) {
      if (!mounted) return;
      setState(() {
        _loadingNotes = false;
        _notesError = error.message;
      });
    }
  }

  String? _firstMatching(List<Category> categories, TransactionType type) {
    for (final category in categories) {
      if (category.suggestedType == type) return category.id;
    }
    return categories.isEmpty ? null : categories.first.id;
  }

  void _onTypeChanged(TransactionType type) {
    setState(() {
      _type = type;
      final selected = _categories.where((c) => c.id == _categoryId).firstOrNull;
      if (selected == null || selected.suggestedType != type) {
        _categoryId = _firstMatching(_categories, type);
      }
    });
  }

  /// Categories ordered so the ones matching the active type come first.
  List<Category> get _orderedCategories => [..._categories]..sort((a, b) {
      final aMatch = a.suggestedType == _type ? 0 : 1;
      final bMatch = b.suggestedType == _type ? 0 : 1;
      return aMatch != bMatch ? aMatch.compareTo(bMatch) : a.name.compareTo(b.name);
    });

  /// Resolved title for the tagged note. A note the list could not reach (or
  /// one deleted upstream) keeps its id — the tag is never dropped silently.
  String get _noteLabel {
    if (_noteId == null) return 'No note';
    return _notes.where((note) => note.id == _noteId).firstOrNull?.title ??
        'Unknown note';
  }

  Future<void> _pickCategory() async {
    final picked = await showSearchablePicker(
      context: context,
      searchHint: 'Search categories…',
      searchKey: const ValueKey('category-search'),
      selectedId: _categoryId,
      options: [
        for (final category in _orderedCategories)
          PickerOption(
            id: category.id,
            label: category.name,
            leading: CategoryAvatar(
              color: category.color,
              icon: category.icon,
              size: 32,
            ),
          ),
      ],
      emptyMessage: (query) => query.isEmpty
          ? 'No categories for this type.'
          : 'No categories match “$query”.',
    );
    if (picked == null || !mounted) return;
    setState(() => _categoryId = picked);
  }

  Future<void> _pickNote() async {
    final picked = await showSearchablePicker(
      context: context,
      searchHint: 'Search notes…',
      searchKey: const ValueKey('note-search'),
      selectedId: _noteId,
      options: [
        for (final note in _notes) PickerOption(id: note.id, label: note.title),
      ],
      emptyMessage: (query) {
        if (_notesError != null) return 'Notes could not be loaded.';
        if (query.isEmpty) return 'No notes yet.';
        return 'No notes match “$query”.';
      },
    );
    if (picked == null || !mounted) return;
    setState(() => _noteId = picked);
  }

  void _clearNote() => setState(() => _noteId = null);

  Future<void> _pickDate() async {
    final initial = DateTime.tryParse(_date) ?? DateTime.now();
    final picked = await showDatePicker(
      context: context,
      initialDate: initial.isAfter(DateTime(2100)) ? DateTime(2100) : initial,
      firstDate: DateTime(2000),
      lastDate: DateTime(2100),
    );
    if (picked == null || !mounted) return;
    _date =
        '${picked.year.toString().padLeft(4, '0')}-'
        '${picked.month.toString().padLeft(2, '0')}-'
        '${picked.day.toString().padLeft(2, '0')}';
    _dateController.text = _date;
    setState(() {});
  }

  Future<void> _save() async {
    final form = _formKey.currentState;
    if (form == null || !form.validate()) return;
    final categoryId = _categoryId;
    if (categoryId == null) return;

    final scope = AppScope.read(context);
    final description = _descriptionController.text.trim();

    setState(() {
      _saving = true;
      _submitError = null;
      _serverErrors = {};
    });

    final input = TransactionInput(
      type: _type,
      amount: normalizeAmount(_amountController.text.trim()),
      categoryId: categoryId,
      title: _titleController.text.trim(),
      description: description.isEmpty ? null : description,
      transactionDate: _date,
      noteId: _noteId,
      baseVersion: widget.existing?.version,
      clientId: _isEdit ? null : generateUuidV4(),
    );

    try {
      if (_isEdit) {
        await scope.transactions.update(widget.existing!.id, input);
      } else {
        await scope.transactions.create(input);
      }
      if (mounted) Navigator.of(context).pop(true);
    } on ApiError catch (error) {
      if (!mounted) return;
      const fields = {
        'type',
        'amount',
        'categoryId',
        'title',
        'description',
        'transactionDate',
        'noteId',
      };
      final fieldErrors = <String, String>{
        for (final detail in error.details)
          if (fields.contains(detail.path)) detail.path: detail.message,
      };
      setState(() {
        _saving = false;
        _serverErrors = fieldErrors;
        _submitError = fieldErrors.isEmpty ? error.message : null;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _saving = false;
        _submitError = 'Something went wrong. Please try again.';
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final auth = AppScope.read(context).auth;
    final currency = auth.user?.defaultCurrency ?? 'BDT';

    return Scaffold(
      appBar: AppBar(title: Text(_isEdit ? 'Edit transaction' : 'Add transaction')),
      body: SafeArea(
        child: _loadingCategories
            ? const LoadingView(label: 'Loading categories…')
            : Center(
                child: SingleChildScrollView(
                  padding: const EdgeInsets.all(16),
                  child: ConstrainedBox(
                    constraints: const BoxConstraints(maxWidth: 560),
                    child: Form(
                      key: _formKey,
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          SegmentedButton<TransactionType>(
                            segments: const [
                              ButtonSegment(
                                value: TransactionType.income,
                                label: Text('Income'),
                                icon: Icon(Icons.arrow_downward_rounded),
                              ),
                              ButtonSegment(
                                value: TransactionType.expense,
                                label: Text('Expense'),
                                icon: Icon(Icons.arrow_upward_rounded),
                              ),
                            ],
                            selected: {_type},
                            onSelectionChanged: (selection) =>
                                _onTypeChanged(selection.first),
                          ),
                          const SizedBox(height: 16),
                          TextFormField(
                            controller: _amountController,
                            keyboardType:
                                const TextInputType.numberWithOptions(decimal: true),
                            textInputAction: TextInputAction.next,
                            decoration: InputDecoration(
                              labelText: 'Amount',
                              prefixText: '$currency ',
                              errorText: _serverErrors['amount'],
                            ),
                            validator: (value) {
                              final text = value?.trim() ?? '';
                              if (text.isEmpty) return 'Amount is required';
                              if (text.startsWith('-')) {
                                return 'Enter a positive amount, e.g. 120.50';
                              }
                              final normalized =
                                  text.endsWith('.') ? '${text}0' : text;
                              if (!isDecimalString(normalized)) {
                                return 'Enter a positive amount, e.g. 120.50';
                              }
                              if (normalized.split('.').first.length > 18) {
                                return 'Amount is too large';
                              }
                              return null;
                            },
                          ),
                          const SizedBox(height: 16),
                          TextFormField(
                            controller: _titleController,
                            textCapitalization: TextCapitalization.sentences,
                            textInputAction: TextInputAction.next,
                            decoration: InputDecoration(
                              labelText: 'Title',
                              hintText: 'e.g. Lunch with Sam',
                              errorText: _serverErrors['title'],
                            ),
                            validator: (value) {
                              final text = value?.trim() ?? '';
                              if (text.isEmpty) return 'Title is required';
                              if (text.length > 120) return 'Keep it under 120 characters';
                              return null;
                            },
                          ),
                          const SizedBox(height: 16),
                          FormField<String>(
                            key: ValueKey('category-$_categoryId'),
                            initialValue: _categoryId,
                            validator: (value) =>
                                value == null ? 'Pick a category' : null,
                            builder: (state) {
                              final selected = _categories
                                  .where((c) => c.id == _categoryId)
                                  .firstOrNull;
                              return InkWell(
                                onTap: _pickCategory,
                                borderRadius: BorderRadius.circular(12),
                                child: InputDecorator(
                                  decoration: InputDecoration(
                                    labelText: 'Category',
                                    errorText: state.errorText ??
                                        _serverErrors['categoryId'],
                                    suffixIcon: const Icon(
                                      Icons.arrow_drop_down_rounded,
                                    ),
                                  ),
                                  child: selected == null
                                      ? Text(
                                          'Search categories…',
                                          style: theme.textTheme.bodyMedium
                                              ?.copyWith(
                                            color: theme
                                                .colorScheme.onSurfaceVariant,
                                          ),
                                        )
                                      : Row(
                                          children: [
                                            CategoryAvatar(
                                              color: selected.color,
                                              icon: selected.icon,
                                              size: 24,
                                            ),
                                            const SizedBox(width: 10),
                                            Expanded(
                                              child: Text(
                                                selected.name,
                                                overflow: TextOverflow.ellipsis,
                                                style:
                                                    theme.textTheme.bodyMedium,
                                              ),
                                            ),
                                          ],
                                        ),
                                ),
                              );
                            },
                          ),
                          const SizedBox(height: 16),
                          InkWell(
                            onTap: _loadingNotes ? null : _pickNote,
                            borderRadius: BorderRadius.circular(12),
                            child: InputDecorator(
                              decoration: InputDecoration(
                                labelText: 'Tag note',
                                helperText: _notesError,
                                errorText: _serverErrors['noteId'],
                                suffixIcon: Row(
                                  mainAxisSize: MainAxisSize.min,
                                  children: [
                                    if (_noteId != null)
                                      IconButton(
                                        tooltip: 'Clear note',
                                        icon: const Icon(Icons.close_rounded),
                                        onPressed: _clearNote,
                                      ),
                                    const Icon(
                                      Icons.arrow_drop_down_rounded,
                                    ),
                                  ],
                                ),
                              ),
                              child: _loadingNotes
                                  ? const SizedBox(
                                      height: 20,
                                      width: 20,
                                      child: CircularProgressIndicator(
                                        strokeWidth: 2,
                                      ),
                                    )
                                  : Text(
                                      _noteLabel,
                                      overflow: TextOverflow.ellipsis,
                                      style: theme.textTheme.bodyMedium
                                          ?.copyWith(
                                        color: _noteId == null
                                            ? theme.colorScheme.onSurfaceVariant
                                            : null,
                                      ),
                                    ),
                            ),
                          ),
                          const SizedBox(height: 16),
                          TextFormField(
                            controller: _descriptionController,
                            textCapitalization: TextCapitalization.sentences,
                            maxLines: 3,
                            minLines: 1,
                            maxLength: 1000,
                            decoration: InputDecoration(
                              labelText: 'Description (optional)',
                              counterText: '',
                              errorText: _serverErrors['description'],
                            ),
                          ),
                          const SizedBox(height: 4),
                          TextFormField(
                            controller: _dateController,
                            readOnly: true,
                            onTap: _pickDate,
                            decoration: InputDecoration(
                              labelText: 'Date',
                              prefixIcon: const Icon(Icons.calendar_today_outlined),
                              suffixIcon: IconButton(
                                icon: const Icon(Icons.edit_outlined),
                                onPressed: _pickDate,
                              ),
                              errorText: _serverErrors['transactionDate'],
                            ),
                            validator: (_) =>
                                RegExp(r'^\d{4}-\d{2}-\d{2}$').hasMatch(_date)
                                    ? null
                                    : 'Pick a valid date',
                          ),
                          if (_submitError != null) ...[
                            const SizedBox(height: 16),
                            ErrorBanner(message: _submitError!),
                          ],
                          const SizedBox(height: 24),
                          FilledButton(
                            onPressed: _saving ? null : _save,
                            child: _saving
                                ? const SizedBox(
                                    width: 22,
                                    height: 22,
                                    child: CircularProgressIndicator(strokeWidth: 2.4),
                                  )
                                : Text(_isEdit ? 'Save changes' : 'Add transaction'),
                          ),
                          const SizedBox(height: 8),
                          Text(
                            _isEdit
                                ? 'Editing keeps the original record; edits are versioned.'
                                : 'Saved straight to your account — you can edit it later.',
                            style: theme.textTheme.bodySmall?.copyWith(
                              color: theme.colorScheme.onSurfaceVariant,
                            ),
                            textAlign: TextAlign.center,
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
              ),
      ),
    );
  }
}
