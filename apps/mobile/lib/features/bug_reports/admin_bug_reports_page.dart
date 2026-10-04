import 'package:flutter/material.dart';

import '../../app_scope.dart';
import '../../core/network/api_error.dart';
import '../../shared/formatters.dart';
import '../../shared/models/bug_report.dart';
import '../../shared/widgets/empty_state.dart';
import '../../shared/widgets/error_banner.dart';
import '../../shared/widgets/loading_view.dart';
import 'bug_reports_page.dart';

/// Triage board for maintainers: every report from every account, newest
/// first, with a status dropdown on each card.
///
/// The server is the authority — `AdminGuard` answers 403 for a non-admin, so
/// this page is only ever opened from a profile with `role == ADMIN`.
class AdminBugReportsPage extends StatefulWidget {
  const AdminBugReportsPage({super.key});

  @override
  State<AdminBugReportsPage> createState() => _AdminBugReportsPageState();
}

class _AdminBugReportsPageState extends State<AdminBugReportsPage> {
  List<AdminBugReport> _items = <AdminBugReport>[];
  bool _loading = true;
  ApiError? _error;
  int _requestId = 0;

  /// `null` shows everything — the filter is client-side on purpose.
  String? _filter;
  String? _savingId;

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
      final items = await AppScope.read(context).bugReports.listAll();
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

  Future<void> _setStatus(AdminBugReport report, String status) async {
    if (status == report.status) return;
    final scope = AppScope.read(context);
    setState(() {
      _error = null;
      _savingId = report.id;
    });
    try {
      final updated = await scope.bugReports.setStatus(report.id, status);
      if (!mounted) return;
      setState(() {
        _items = [for (final row in _items) row.id == updated.id ? updated : row];
        _savingId = null;
      });
    } on ApiError catch (error) {
      if (!mounted) return;
      setState(() {
        _error = error;
        _savingId = null;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final filter = _filter;
    final visible =
        filter == null ? _items : _items.where((row) => row.status == filter).toList();

    return Scaffold(
      appBar: AppBar(title: const Text('Admin panel')),
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
                            _StatusFilterField(
                              value: _filter,
                              onChanged: (value) =>
                                  setState(() => _filter = value),
                            ),
                            const SizedBox(height: 8),
                            Text(
                              _items.isEmpty
                                  ? 'No bug reports'
                                  : '${visible.length} of ${_items.length} reports',
                              style: Theme.of(context)
                                  .textTheme
                                  .labelMedium
                                  ?.copyWith(
                                    color:
                                        Theme.of(context).colorScheme.outline,
                                  ),
                            ),
                            const SizedBox(height: 8),
                            if (_items.isEmpty)
                              const EmptyState(
                                icon: Icons.bug_report_outlined,
                                title: 'No bug reports yet',
                                message:
                                    'Nothing has been reported. Enjoy the quiet.',
                              )
                            else if (visible.isEmpty)
                              const EmptyState(
                                icon: Icons.filter_alt_off_outlined,
                                title: 'Nothing with that status',
                                message: 'Pick another status above.',
                              )
                            else
                              for (var i = 0; i < visible.length; i++) ...[
                                if (i > 0) const SizedBox(height: 8),
                                _AdminReportCard(
                                  report: visible[i],
                                  busy: _savingId == visible[i].id,
                                  onStatus: (status) =>
                                      _setStatus(visible[i], status),
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

class _StatusFilterField extends StatelessWidget {
  const _StatusFilterField({required this.value, required this.onChanged});

  final String? value;
  final ValueChanged<String?> onChanged;

  @override
  Widget build(BuildContext context) {
    return DropdownButtonFormField<String?>(
      initialValue: value,
      decoration: const InputDecoration(
        labelText: 'Filter by status',
        prefixIcon: Icon(Icons.filter_alt_outlined),
      ),
      items: [
        const DropdownMenuItem<String?>(
          value: null,
          child: Text('All statuses'),
        ),
        for (final status in bugReportStatuses)
          DropdownMenuItem<String?>(
            value: status,
            child: Text(bugReportStatusLabel(status)),
          ),
      ],
      onChanged: onChanged,
    );
  }
}

class _AdminReportCard extends StatelessWidget {
  const _AdminReportCard({
    required this.report,
    required this.busy,
    required this.onStatus,
  });

  final AdminBugReport report;
  final bool busy;
  final ValueChanged<String> onStatus;

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
                StatusChip(
                  label: bugReportSeverityLabel(report.severity),
                  color: severityColor(report.severity),
                ),
                StatusChip(
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
            const SizedBox(height: 8),
            Text(
              report.reporterEmail == null ||
                      report.reporterEmail!.isEmpty
                  ? report.reporterName
                  : '${report.reporterName} · ${report.reporterEmail}',
              style: theme.textTheme.labelMedium,
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
            Text(
              'Reported ${formatInstant(report.createdAt)}',
              style: theme.textTheme.labelSmall?.copyWith(
                color: theme.colorScheme.outline,
              ),
            ),
            const SizedBox(height: 8),
            DropdownButtonFormField<String>(
              initialValue: report.status,
              decoration: const InputDecoration(
                labelText: 'Status',
                isDense: true,
              ),
              items: [
                for (final status in bugReportStatuses)
                  DropdownMenuItem(
                    value: status,
                    child: Text(bugReportStatusLabel(status)),
                  ),
              ],
              // A null `onChanged` is how this widget disables itself.
              onChanged: busy
                  ? null
                  : (value) {
                      if (value != null) onStatus(value);
                    },
            ),
            if (busy)
              Padding(
                padding: const EdgeInsets.only(top: 8),
                child: Text(
                  'Saving…',
                  style: theme.textTheme.labelSmall?.copyWith(
                    color: theme.colorScheme.outline,
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }
}
