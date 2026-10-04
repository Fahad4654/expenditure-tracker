import 'package:flutter/material.dart';

import '../../app_scope.dart';
import '../../core/network/api_error.dart';
import '../../shared/formatters.dart';
import '../../shared/models/reminder.dart';
import '../../shared/widgets/empty_state.dart';
import '../../shared/widgets/error_banner.dart';
import '../../shared/widgets/loading_view.dart';
import 'reminder_form_page.dart';
import 'reminder_tile.dart';

/// The reminders list — network-backed like the web client, with client-side
/// pending/completed filtering over the server's date/time ordering.
class RemindersPage extends StatefulWidget {
  const RemindersPage({super.key});

  @override
  State<RemindersPage> createState() => _RemindersPageState();
}

enum _Filter { all, pending, completed }

class _RemindersPageState extends State<RemindersPage> {
  List<Reminder> _items = [];
  bool _loading = true;
  ApiError? _error;
  _Filter _filter = _Filter.all;
  int _requestId = 0;

  bool get _hasAny => _items.isNotEmpty;

  List<Reminder> get _visible => switch (_filter) {
        _Filter.all => _items,
        _Filter.pending => _items.where((r) => !r.isCompleted).toList(),
        _Filter.completed => _items.where((r) => r.isCompleted).toList(),
      };

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final requestId = ++_requestId;
    setState(() {
      _error = null;
      _loading = true;
    });
    try {
      final items = await AppScope.read(context).reminders.list();
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

  Future<void> _openForm({Reminder? existing}) async {
    final changed = await Navigator.of(context).push<bool>(
      MaterialPageRoute(
        builder: (_) => ReminderFormPage(existing: existing),
      ),
    );
    if (changed == true && mounted) _load();
  }

  Future<void> _toggle(Reminder reminder) async {
    final completed = !reminder.isCompleted;
    // Optimistic flip so the checkbox reacts instantly.
    setState(() {
      _items = [
        for (final item in _items)
          if (item.id == reminder.id)
            Reminder(
              id: item.id,
              title: item.title,
              details: item.details,
              dueDate: item.dueDate,
              dueTime: item.dueTime,
              completedAt: completed ? DateTime.now().toUtc().toIso8601String() : null,
              createdAt: item.createdAt,
              updatedAt: item.updatedAt,
            )
          else
            item,
      ];
    });
    try {
      await AppScope.read(context).reminders.setCompleted(reminder.id, completed);
    } on ApiError catch (error) {
      if (!mounted) return;
      // Roll back to server truth on failure.
      setState(() => _error = error);
      _load();
    }
  }

  void _clearFilter() => setState(() => _filter = _Filter.all);

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final visible = _visible;
    final today = todayIso();

    return Scaffold(
      appBar: AppBar(
        title: const Text('Reminders'),
        actions: [
          IconButton(
            tooltip: 'Add reminder',
            icon: const Icon(Icons.add),
            onPressed: () => _openForm(),
          ),
        ],
      ),
      body: SafeArea(
        child: _loading
            ? const LoadingView(label: 'Loading reminders…')
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
                            Wrap(
                              spacing: 8,
                              runSpacing: 8,
                              children: [
                                _filterChip('All', _Filter.all),
                                _filterChip('Pending', _Filter.pending),
                                _filterChip('Completed', _Filter.completed),
                              ],
                            ),
                            const SizedBox(height: 12),
                            if (visible.isEmpty)
                              EmptyState(
                                icon: Icons.notifications_outlined,
                                title: _emptyTitle,
                                message: _emptyMessage,
                                actionLabel: _filter == _Filter.all
                                    ? 'Add reminder'
                                    : 'Show all',
                                onAction: _filter == _Filter.all
                                    ? () => _openForm()
                                    : _clearFilter,
                              )
                            else ...[
                              Padding(
                                padding: const EdgeInsets.only(bottom: 8),
                                child: Text(
                                  '${visible.length} reminder${visible.length == 1 ? '' : 's'}',
                                  style: theme.textTheme.bodySmall?.copyWith(
                                    color: theme.colorScheme.onSurfaceVariant,
                                  ),
                                ),
                              ),
                              for (var i = 0; i < visible.length; i++) ...[
                                if (i > 0) const SizedBox(height: 8),
                                ReminderTile(
                                  reminder: visible[i],
                                  today: today,
                                  onTap: () => _openForm(existing: visible[i]),
                                  onToggle: (_) => _toggle(visible[i]),
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

  String get _emptyTitle => switch (_filter) {
        _Filter.all => _hasAny ? 'No reminders match' : 'No reminders yet',
        _Filter.pending => 'Nothing pending',
        _Filter.completed => 'Nothing completed yet',
      };

  String? get _emptyMessage => switch (_filter) {
        _Filter.all => _hasAny
            ? 'Try a different filter.'
            : 'Tap + to add your first reminder.',
        _Filter.pending => 'Every reminder is done. Nice.',
        _Filter.completed => 'Completed reminders show up here.',
      };

  Widget _filterChip(String label, _Filter value) {
    return ChoiceChip(
      label: Text(label),
      selected: _filter == value,
      onSelected: (_) => setState(() => _filter = value),
    );
  }
}
