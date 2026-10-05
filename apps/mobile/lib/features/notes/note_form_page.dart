import 'package:flutter/material.dart';

import '../../app_scope.dart';
import '../../core/network/api_error.dart';
import '../../shared/formatters.dart';
import '../../shared/models/note.dart';
import '../../shared/models/transaction.dart';
import '../../shared/widgets/confirm_dialog.dart';
import '../../shared/widgets/error_banner.dart';

/// Create or edit a note and pick the transactions it is tagged on. One screen
/// serves both modes so validation, tagging and server error mapping exist
/// exactly once. The tag list offers the 50 newest synced transactions — the
/// server rejects anything it does not own, so unsynced rows stay hidden.
class NoteFormPage extends StatefulWidget {
  const NoteFormPage({super.key, this.existing});

  /// When set, the form edits this note.
  final Note? existing;

  @override
  State<NoteFormPage> createState() => _NoteFormPageState();
}

class _NoteFormPageState extends State<NoteFormPage> {
  final _formKey = GlobalKey<FormState>();
  final _titleController = TextEditingController();
  final _contentController = TextEditingController();
  final _tagSearchController = TextEditingController();

  final Set<String> _tagIds = {};
  List<Transaction> _transactions = [];
  bool _loadingTransactions = true;
  bool _saving = false;
  String? _submitError;
  Map<String, String> _serverErrors = {};

  bool get _isEdit => widget.existing != null;

  @override
  void initState() {
    super.initState();
    final existing = widget.existing;
    if (existing != null) {
      _titleController.text = existing.title;
      _contentController.text = existing.content ?? '';
      _tagIds.addAll(existing.transactions.map((transaction) => transaction.id));
    }
    _loadTransactions();
  }

  @override
  void dispose() {
    _titleController.dispose();
    _contentController.dispose();
    _tagSearchController.dispose();
    super.dispose();
  }

  Future<void> _loadTransactions() async {
    try {
      final result = await AppScope.read(context)
          .transactions
          .list(const TransactionQuery(limit: 50));
      if (!mounted) return;
      setState(() {
        _transactions = result.items
            .where((row) => row.syncStatus == 'SYNCED' && row.id.isNotEmpty)
            .toList();
        _loadingTransactions = false;
      });
    } on ApiError catch (error) {
      if (!mounted) return;
      setState(() {
        _loadingTransactions = false;
        _submitError = error.message;
      });
    }
  }

  void _toggleTag(String id) {
    setState(() {
      if (!_tagIds.remove(id)) _tagIds.add(id);
    });
  }

  Future<void> _save() async {
    final form = _formKey.currentState;
    if (form == null || !form.validate()) return;

    final scope = AppScope.read(context);
    final content = _contentController.text.trim();

    setState(() {
      _saving = true;
      _submitError = null;
      _serverErrors = {};
    });

    final input = NoteInput(
      title: _titleController.text.trim(),
      content: content.isEmpty ? null : content,
      transactionIds: _tagIds.toList(),
    );

    try {
      if (_isEdit) {
        await scope.notes.update(widget.existing!.id, input);
      } else {
        await scope.notes.create(input);
      }
      if (mounted) Navigator.of(context).pop(true);
    } on ApiError catch (error) {
      if (!mounted) return;
      const fields = {'title', 'content', 'transactionIds'};
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

  Future<void> _delete() async {
    final existing = widget.existing;
    if (existing == null) return;
    final confirmed = await showConfirmDialog(
      context,
      title: 'Delete note?',
      message: '"${existing.title}" will be removed.',
    );
    if (!confirmed || !mounted) return;

    setState(() => _saving = true);
    try {
      await AppScope.read(context).notes.remove(existing.id);
      if (mounted) Navigator.of(context).pop(true);
    } on ApiError catch (error) {
      if (!mounted) return;
      setState(() {
        _saving = false;
        _submitError = error.message;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final tagQuery = _tagSearchController.text.trim().toLowerCase();
    final candidates = tagQuery.isEmpty
        ? _transactions
        : _transactions
            .where((row) => row.title.toLowerCase().contains(tagQuery))
            .toList();

    return Scaffold(
      appBar: AppBar(
        title: Text(_isEdit ? 'Edit note' : 'Add note'),
        actions: [
          if (_isEdit)
            IconButton(
              tooltip: 'Delete',
              icon: const Icon(Icons.delete_outline),
              onPressed: _saving ? null : _delete,
            ),
        ],
      ),
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(16),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 560),
              child: Form(
                key: _formKey,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    TextFormField(
                      controller: _titleController,
                      textCapitalization: TextCapitalization.sentences,
                      textInputAction: TextInputAction.next,
                      decoration: InputDecoration(
                        labelText: 'Title',
                        hintText: 'Grocery list',
                        errorText: _serverErrors['title'],
                      ),
                      validator: (value) {
                        final text = value?.trim() ?? '';
                        if (text.isEmpty) return 'Title is required';
                        if (text.length > 120) {
                          return 'Keep it under 120 characters';
                        }
                        return null;
                      },
                    ),
                    const SizedBox(height: 16),
                    TextFormField(
                      controller: _contentController,
                      textCapitalization: TextCapitalization.sentences,
                      maxLines: 8,
                      minLines: 4,
                      maxLength: 5000,
                      decoration: InputDecoration(
                        labelText: 'Note',
                        alignLabelWithHint: true,
                        counterText: '',
                        hintText: 'Anything you want to remember…',
                        errorText: _serverErrors['content'],
                      ),
                    ),
                    const SizedBox(height: 16),
                    Text('Tagged transactions', style: theme.textTheme.titleSmall),
                    const SizedBox(height: 4),
                    Text(
                      _tagIds.isEmpty
                          ? 'Optional — pick the transactions this note belongs to.'
                          : '${_tagIds.length} selected.',
                      style: theme.textTheme.bodySmall?.copyWith(
                        color: theme.colorScheme.onSurfaceVariant,
                      ),
                    ),
                    if (_serverErrors['transactionIds'] != null) ...[
                      const SizedBox(height: 6),
                      Text(
                        _serverErrors['transactionIds']!,
                        style: theme.textTheme.bodySmall?.copyWith(
                          color: theme.colorScheme.error,
                        ),
                      ),
                    ],
                    const SizedBox(height: 8),
                    if (_loadingTransactions)
                      const Padding(
                        padding: EdgeInsets.symmetric(vertical: 12),
                        child: Center(
                          child: SizedBox(
                            width: 22,
                            height: 22,
                            child: CircularProgressIndicator(strokeWidth: 2.4),
                          ),
                        ),
                      )
                    else if (_transactions.isEmpty)
                      Text(
                        'No transactions to tag yet.',
                        style: theme.textTheme.bodySmall?.copyWith(
                          color: theme.colorScheme.outline,
                        ),
                      )
                    else ...[
                      TextField(
                        key: const ValueKey('tag-transaction-search'),
                        controller: _tagSearchController,
                        onChanged: (_) => setState(() {}),
                        textInputAction: TextInputAction.search,
                        decoration: InputDecoration(
                          hintText: 'Search transactions…',
                          prefixIcon: const Icon(Icons.search),
                          isDense: true,
                        ),
                      ),
                      const SizedBox(height: 8),
                      ConstrainedBox(
                        constraints: const BoxConstraints(maxHeight: 260),
                        child: candidates.isEmpty
                            ? Center(
                                child: Padding(
                                  padding: const EdgeInsets.all(12),
                                  child: Text(
                                    'No transactions match.',
                                    style: theme.textTheme.bodySmall?.copyWith(
                                      color: theme.colorScheme.outline,
                                    ),
                                  ),
                                ),
                              )
                            : SingleChildScrollView(
                                child: Column(
                                  mainAxisSize: MainAxisSize.min,
                                  children: [
                                    for (final row in candidates)
                                      InkWell(
                                        onTap: () => _toggleTag(row.id),
                                        child: Padding(
                                          padding: const EdgeInsets.symmetric(
                                            vertical: 2,
                                          ),
                                          child: Row(
                                            children: [
                                              Checkbox(
                                                value:
                                                    _tagIds.contains(row.id),
                                                onChanged: (_) =>
                                                    _toggleTag(row.id),
                                              ),
                                              Expanded(
                                                child: Text(
                                                  row.title,
                                                  maxLines: 1,
                                                  overflow:
                                                      TextOverflow.ellipsis,
                                                ),
                                              ),
                                              Text(
                                                '${formatDay(row.transactionDate)} · '
                                                '${row.amount}',
                                                style: theme
                                                    .textTheme.labelSmall
                                                    ?.copyWith(
                                                  color:
                                                      theme.colorScheme.outline,
                                                ),
                                              ),
                                              const SizedBox(width: 8),
                                            ],
                                          ),
                                        ),
                                      ),
                                  ],
                                ),
                              ),
                      ),
                    ],
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
                              child:
                                  CircularProgressIndicator(strokeWidth: 2.4),
                            )
                          : Text(_isEdit ? 'Save changes' : 'Add note'),
                    ),
                    const SizedBox(height: 8),
                    Text(
                      'A transaction can only carry one note — tagging it here '
                      'moves it off any other.',
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
