import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';

import '../../app_scope.dart';
import '../../core/network/api_error.dart';
import '../../shared/models/bug_report.dart';
import '../../shared/widgets/error_banner.dart';

/// File a new bug report: title, what happened, severity and optionally the
/// screen it happened on. The platform is attached automatically so triage
/// knows which build to look at.
class BugReportFormPage extends StatefulWidget {
  const BugReportFormPage({super.key});

  @override
  State<BugReportFormPage> createState() => _BugReportFormPageState();
}

class _BugReportFormPageState extends State<BugReportFormPage> {
  final _formKey = GlobalKey<FormState>();
  final _titleController = TextEditingController();
  final _descriptionController = TextEditingController();
  final _areaController = TextEditingController();

  String _severity = 'MEDIUM';
  bool _saving = false;
  String? _submitError;
  Map<String, String> _serverErrors = {};

  /// `android` / `ios`; anything else (desktop, tests) sends no platform.
  static String? get _platform => switch (defaultTargetPlatform) {
        TargetPlatform.android => 'android',
        TargetPlatform.iOS => 'ios',
        _ => null,
      };

  @override
  void dispose() {
    _titleController.dispose();
    _descriptionController.dispose();
    _areaController.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    final form = _formKey.currentState;
    if (form == null || !form.validate()) return;

    setState(() {
      _saving = true;
      _submitError = null;
      _serverErrors = {};
    });

    final area = _areaController.text.trim();
    final input = BugReportInput(
      title: _titleController.text.trim(),
      description: _descriptionController.text.trim(),
      severity: _severity,
      area: area.isEmpty ? null : area,
      platform: _platform,
    );

    try {
      await AppScope.read(context).bugReports.create(input);
      if (mounted) Navigator.of(context).pop(true);
    } on ApiError catch (error) {
      if (!mounted) return;
      const fields = {'title', 'description', 'severity', 'area'};
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

    return Scaffold(
      appBar: AppBar(title: const Text('New bug report')),
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
                      maxLength: 160,
                      decoration: InputDecoration(
                        labelText: 'Title',
                        counterText: '',
                        hintText: 'Chart renders empty on the reports page',
                        errorText: _serverErrors['title'],
                      ),
                      validator: (value) {
                        final text = value?.trim() ?? '';
                        if (text.isEmpty) return 'Title is required';
                        if (text.length > 160) {
                          return 'Keep it under 160 characters';
                        }
                        return null;
                      },
                    ),
                    const SizedBox(height: 16),
                    TextFormField(
                      controller: _descriptionController,
                      textCapitalization: TextCapitalization.sentences,
                      maxLines: 8,
                      minLines: 4,
                      maxLength: 5000,
                      decoration: InputDecoration(
                        labelText: 'What happened?',
                        alignLabelWithHint: true,
                        counterText: '',
                        hintText:
                            'Steps to reproduce, what you expected, and what you saw…',
                        errorText: _serverErrors['description'],
                      ),
                      validator: (value) {
                        final text = value?.trim() ?? '';
                        if (text.isEmpty) return 'Describe what happened';
                        if (text.length > 5000) {
                          return 'Keep it under 5000 characters';
                        }
                        return null;
                      },
                    ),
                    const SizedBox(height: 16),
                    DropdownButtonFormField<String>(
                      key: const ValueKey('bug-severity'),
                      initialValue: _severity,
                      decoration: const InputDecoration(
                        labelText: 'Severity',
                        prefixIcon: Icon(Icons.priority_high),
                      ),
                      items: [
                        for (final value in bugReportSeverities)
                          DropdownMenuItem<String>(
                            value: value,
                            child: Text(bugReportSeverityLabel(value)),
                          ),
                      ],
                      onChanged: (value) =>
                          setState(() => _severity = value ?? 'MEDIUM'),
                    ),
                    if (_serverErrors['severity'] != null) ...[
                      const SizedBox(height: 6),
                      Text(
                        _serverErrors['severity']!,
                        style: theme.textTheme.bodySmall?.copyWith(
                          color: theme.colorScheme.error,
                        ),
                      ),
                    ],
                    const SizedBox(height: 16),
                    TextFormField(
                      controller: _areaController,
                      textCapitalization: TextCapitalization.words,
                      maxLength: 80,
                      decoration: InputDecoration(
                        labelText: 'Where did it happen?',
                        prefixIcon: const Icon(Icons.location_on_outlined),
                        counterText: '',
                        hintText: 'Reports',
                        errorText: _serverErrors['area'],
                      ),
                      validator: (value) {
                        final text = value?.trim() ?? '';
                        if (text.length > 80) return 'Keep it under 80 characters';
                        return null;
                      },
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
                              child:
                                  CircularProgressIndicator(strokeWidth: 2.4),
                            )
                          : const Text('Send report'),
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
