import 'package:flutter/material.dart';

import '../../app_scope.dart';
import '../../core/network/api_error.dart';
import '../../shared/formatters.dart';
import '../../shared/models/bug_report.dart';
import '../../shared/widgets/confirm_dialog.dart';
import '../../shared/widgets/empty_state.dart';
import '../../shared/widgets/error_banner.dart';
import '../../shared/widgets/loading_view.dart';
import 'bug_report_form_page.dart';

/// Reports filed by this account, newest first, with an entry point to file a
/// new one. Network-only like the web client — bug reports are not synced
/// offline.
class BugReportsPage extends StatefulWidget {
  const BugReportsPage({super.key});

  @override
  State<BugReportsPage> createState() => _BugReportsPageState();
}

class _BugReportsPageState extends State<BugReportsPage> {
  List<BugReport> _items = [];
  bool _loading = true;
  ApiError? _error;
  int _requestId = 0;

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
      final items = await AppScope.read(context).bugReports.list();
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

  Future<void> _openForm() async {
    final created = await Navigator.of(context).push<bool>(
      MaterialPageRoute(builder: (_) => const BugReportFormPage()),
    );
    if (created == true && mounted) _load();
  }

  Future<void> _delete(BugReport report) async {
    final confirmed = await showConfirmDialog(
      context,
      title: 'Delete report?',
      message: '"${report.title}" will be removed.',
      confirmLabel: 'Delete',
    );
    if (!confirmed || !mounted) return;

    try {
      await AppScope.read(context).bugReports.remove(report.id);
      if (!mounted) return;
      setState(() => _items = _items.where((row) => row.id != report.id).toList());
    } on ApiError catch (error) {
      if (!mounted) return;
      setState(() => _error = error);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Bug reports'),
        actions: [
          IconButton(
            tooltip: 'New bug report',
            icon: const Icon(Icons.add),
            onPressed: _openForm,
          ),
        ],
      ),
      body: SafeArea(
        child: _loading
            ? const LoadingView(label: 'Loading bug reports…')
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
                            if (_items.isEmpty)
                              EmptyState(
                                icon: Icons.bug_report_outlined,
                                title: 'No bug reports yet',
                                message:
                                    'If something misbehaves, tell us about it.',
                                actionLabel: 'Report a bug',
                                onAction: _openForm,
                              )
                            else
                              for (var i = 0; i < _items.length; i++) ...[
                                if (i > 0) const SizedBox(height: 8),
                                _BugReportCard(
                                  report: _items[i],
                                  onDelete: () => _delete(_items[i]),
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

Color severityColor(String severity) => switch (severity) {
      'LOW' => Colors.lightBlue,
      'MEDIUM' => Colors.orange,
      'HIGH' => Colors.deepOrange,
      _ => Colors.red,
    };

class _BugReportCard extends StatelessWidget {
  const _BugReportCard({required this.report, required this.onDelete});

  final BugReport report;
  final VoidCallback onDelete;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final contextLine = [
      if (report.area != null && report.area!.isNotEmpty) report.area!,
      if (report.platform != null && report.platform!.isNotEmpty)
        report.platform![0].toUpperCase() + report.platform!.substring(1),
      if (report.appVersion != null && report.appVersion!.isNotEmpty)
        'v${report.appVersion}',
    ].join(' · ');

    return Card(
      margin: EdgeInsets.zero,
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Wrap(
              spacing: 6,
              runSpacing: 6,
              children: [
                _StatusChip(
                  label: bugReportSeverityLabel(report.severity),
                  color: severityColor(report.severity),
                ),
                _StatusChip(
                  label: bugReportStatusLabel(report.status),
                  color: statusColor(report.status),
                ),
              ],
            ),
            const SizedBox(height: 10),
            Text(report.title, style: theme.textTheme.titleSmall),
            const SizedBox(height: 4),
            Text(
              report.description,
              style: theme.textTheme.bodySmall?.copyWith(
                color: theme.colorScheme.onSurfaceVariant,
              ),
            ),
            if (contextLine.isNotEmpty) ...[
              const SizedBox(height: 8),
              Text(
                contextLine,
                style: theme.textTheme.labelSmall?.copyWith(
                  color: theme.colorScheme.outline,
                ),
              ),
            ],
            const SizedBox(height: 8),
            Row(
              children: [
                Expanded(
                  child: Text(
                    'Reported ${formatInstant(report.createdAt)}',
                    style: theme.textTheme.labelSmall?.copyWith(
                      color: theme.colorScheme.outline,
                    ),
                  ),
                ),
                IconButton(
                  tooltip: 'Delete report',
                  visualDensity: VisualDensity.compact,
                  icon: const Icon(Icons.delete_outline, size: 20),
                  onPressed: onDelete,
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _StatusChip extends StatelessWidget {
  const _StatusChip({required this.label, required this.color});

  final String label;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.15),
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: color.withValues(alpha: 0.45)),
      ),
      child: Text(
        label,
        style: Theme.of(context)
            .textTheme
            .labelSmall
            ?.copyWith(color: color, fontWeight: FontWeight.w600),
      ),
    );
  }
}

String statusLabel(String status) => switch (status) {
      'IN_PROGRESS' => 'In progress',
      'RESOLVED' => 'Resolved',
      'CLOSED' => 'Closed',
      _ => 'Open',
    };

Color statusColor(String status) => switch (status) {
      'IN_PROGRESS' => Colors.blue,
      'RESOLVED' => Colors.green,
      'CLOSED' => Colors.grey,
      _ => Colors.teal,
    };
