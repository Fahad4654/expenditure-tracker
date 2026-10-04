import 'package:flutter/material.dart';

import '../../app_scope.dart';
import '../../core/network/api_error.dart';
import '../../shared/formatters.dart';
import '../../shared/models/note.dart';
import '../../shared/widgets/empty_state.dart';
import '../../shared/widgets/error_banner.dart';
import '../../shared/widgets/loading_view.dart';
import 'note_form_page.dart';

/// The notes list — network-backed like the web client, with client-side
/// search over title/content and read-only "tagged on" chips.
class NotesPage extends StatefulWidget {
  const NotesPage({super.key});

  @override
  State<NotesPage> createState() => _NotesPageState();
}

class _NotesPageState extends State<NotesPage> {
  final TextEditingController _searchController = TextEditingController();

  List<Note> _items = [];
  bool _loading = true;
  ApiError? _error;
  int _requestId = 0;

  String get _query => _searchController.text.trim().toLowerCase();

  List<Note> get _visible => _query.isEmpty
      ? _items
      : _items
          .where(
            (note) =>
                note.title.toLowerCase().contains(_query) ||
                (note.content ?? '').toLowerCase().contains(_query),
          )
          .toList();

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    final requestId = ++_requestId;
    setState(() {
      _error = null;
      _loading = true;
    });
    try {
      final items = await AppScope.read(context).notes.list();
      if (!mounted || requestId != _requestId) return;
      setState(() {
        _items = items;
        _loading = false;
      });
    } on ApiError catch (error) {
      if (!mounted || requestId != _requestId) return;
      setState(() {
        _error = error;
        _loading = false;
      });
    }
  }

  Future<void> _openForm({Note? existing}) async {
    final changed = await Navigator.of(context).push<bool>(
      MaterialPageRoute(builder: (_) => NoteFormPage(existing: existing)),
    );
    if (changed == true && mounted) _load();
  }

  @override
  Widget build(BuildContext context) {
    final visible = _visible;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Notes'),
        actions: [
          IconButton(
            tooltip: 'Add note',
            icon: const Icon(Icons.add),
            onPressed: () => _openForm(),
          ),
        ],
      ),
      body: SafeArea(
        child: _loading
            ? const LoadingView(label: 'Loading notes…')
            : RefreshIndicator(
                onRefresh: _load,
                child: ListView(
                  padding: const EdgeInsets.fromLTRB(16, 4, 16, 24),
                  children: [
                    Center(
                      child: ConstrainedBox(
                        constraints: const BoxConstraints(maxWidth: 720),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.stretch,
                          children: [
                            if (_error != null) ...[
                              ErrorBanner(
                                message: _error!.message,
                                onRetry: _load,
                              ),
                              const SizedBox(height: 12),
                            ],
                            if (_items.isNotEmpty) ...[
                              TextField(
                                controller: _searchController,
                                onChanged: (_) => setState(() {}),
                                textInputAction: TextInputAction.search,
                                decoration: InputDecoration(
                                  hintText: 'Search notes…',
                                  prefixIcon: const Icon(Icons.search),
                                  suffixIcon: _query.isEmpty
                                      ? null
                                      : IconButton(
                                          icon: const Icon(Icons.clear),
                                          onPressed: () {
                                            _searchController.clear();
                                            setState(() {});
                                          },
                                        ),
                                ),
                              ),
                              const SizedBox(height: 12),
                            ],
                            if (visible.isEmpty)
                              EmptyState(
                                icon: Icons.notes_outlined,
                                title: _query.isEmpty
                                    ? 'No notes yet'
                                    : 'No notes match your search',
                                message: _query.isEmpty
                                    ? 'Tap + to write your first note.'
                                    : 'Try a different search.',
                                actionLabel: _query.isEmpty ? 'Add note' : 'Clear search',
                                onAction: _query.isEmpty
                                    ? () => _openForm()
                                    : () {
                                        _searchController.clear();
                                        setState(() {});
                                      },
                              )
                            else
                              for (var i = 0; i < visible.length; i++) ...[
                                if (i > 0) const SizedBox(height: 8),
                                _NoteCard(
                                  note: visible[i],
                                  onTap: () => _openForm(existing: visible[i]),
                                ),
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
}

class _NoteCard extends StatelessWidget {
  const _NoteCard({required this.note, required this.onTap});

  final Note note;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Card(
      margin: EdgeInsets.zero,
      child: InkWell(
        borderRadius: BorderRadius.circular(12),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(note.title, style: theme.textTheme.titleSmall),
              if (note.content != null && note.content!.isNotEmpty) ...[
                const SizedBox(height: 4),
                Text(
                  note.content!,
                  maxLines: 4,
                  overflow: TextOverflow.ellipsis,
                  style: theme.textTheme.bodySmall?.copyWith(
                    color: theme.colorScheme.onSurfaceVariant,
                  ),
                ),
              ],
              if (note.transactions.isNotEmpty) ...[
                const SizedBox(height: 8),
                Text(
                  'Tagged on',
                  style: theme.textTheme.labelSmall?.copyWith(
                    color: theme.colorScheme.outline,
                  ),
                ),
                const SizedBox(height: 4),
                Wrap(
                  spacing: 6,
                  runSpacing: 4,
                  children: [
                    for (final transaction in note.transactions)
                      Container(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 8,
                          vertical: 2,
                        ),
                        decoration: BoxDecoration(
                          color: theme.colorScheme.primaryContainer
                              .withValues(alpha: 0.35),
                          borderRadius: BorderRadius.circular(999),
                        ),
                        child: Text(
                          '${transaction.title} · '
                          '${formatDay(transaction.transactionDate)}',
                          style: theme.textTheme.labelSmall?.copyWith(
                            color: theme.colorScheme.onSurfaceVariant,
                          ),
                        ),
                      ),
                  ],
                ),
              ],
              const SizedBox(height: 8),
              Text(
                'Edited ${formatInstant(note.updatedAt)}',
                style: theme.textTheme.labelSmall?.copyWith(
                  color: theme.colorScheme.outline,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
