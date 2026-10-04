import 'package:flutter/material.dart';

import '../../app_scope.dart';
import '../../core/network/api_error.dart';
import '../../shared/formatters.dart';
import '../../shared/models/reminder.dart';
import '../../shared/widgets/confirm_dialog.dart';
import '../../shared/widgets/error_banner.dart';

/// Create or edit a reminder. One screen serves both modes so validation,
/// date/time picking and server error mapping exist exactly once. The time is
/// optional — a reminder without one stays a date-only reminder.
class ReminderFormPage extends StatefulWidget {
  const ReminderFormPage({super.key, this.existing});

  /// When set, the form edits this reminder.
  final Reminder? existing;

  @override
  State<ReminderFormPage> createState() => _ReminderFormPageState();
}

class _ReminderFormPageState extends State<ReminderFormPage> {
  final _formKey = GlobalKey<FormState>();
  final _titleController = TextEditingController();
  final _detailsController = TextEditingController();
  late final TextEditingController _dateController;
  late final TextEditingController _timeController;

  String _date = todayIso();
  String? _time; // `HH:mm` (24-hour) or null for a date-only reminder.
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
      _detailsController.text = existing.details ?? '';
      _date = existing.dueDate;
      _time = existing.dueTime;
    }
    _dateController = TextEditingController(text: formatDay(_date));
    _timeController = TextEditingController(text: _time ?? '');
  }

  @override
  void dispose() {
    _titleController.dispose();
    _detailsController.dispose();
    _dateController.dispose();
    _timeController.dispose();
    super.dispose();
  }

  Future<void> _pickDate() async {
    final initial = DateTime.tryParse(_date) ?? DateTime.now();
    final picked = await showDatePicker(
      context: context,
      initialDate: initial.isAfter(DateTime(2100)) ? DateTime(2100) : initial,
      firstDate: DateTime(2000),
      lastDate: DateTime(2100),
    );
    if (picked == null || !mounted) return;
    setState(() {
      _date = '${picked.year.toString().padLeft(4, '0')}-'
          '${picked.month.toString().padLeft(2, '0')}-'
          '${picked.day.toString().padLeft(2, '0')}';
      _dateController.text = formatDay(_date);
    });
  }

  Future<void> _pickTime() async {
    final now = TimeOfDay.now();
    var initial = now;
    final existing = _time;
    if (existing != null) {
      final parts = existing.split(':');
      initial = TimeOfDay(
        hour: int.tryParse(parts.first) ?? now.hour,
        minute: int.tryParse(parts.last) ?? now.minute,
      );
    }
    final picked = await showTimePicker(context: context, initialTime: initial);
    if (picked == null || !mounted) return;
    _time = '${picked.hour.toString().padLeft(2, '0')}:'
        '${picked.minute.toString().padLeft(2, '0')}';
    _timeController.text = _time!;
    setState(() {});
  }

  void _clearTime() {
    _time = null;
    _timeController.clear();
    setState(() {});
  }

  Future<void> _save() async {
    final form = _formKey.currentState;
    if (form == null || !form.validate()) return;

    final scope = AppScope.read(context);
    final details = _detailsController.text.trim();

    setState(() {
      _saving = true;
      _submitError = null;
      _serverErrors = {};
    });

    final input = ReminderInput(
      title: _titleController.text.trim(),
      details: details.isEmpty ? null : details,
      dueDate: _date,
      dueTime: _time,
    );

    try {
      if (_isEdit) {
        await scope.reminders.update(widget.existing!.id, input);
      } else {
        await scope.reminders.create(input);
      }
      if (mounted) Navigator.of(context).pop(true);
    } on ApiError catch (error) {
      if (!mounted) return;
      const fields = {'title', 'details', 'dueDate', 'dueTime'};
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
      title: 'Delete reminder?',
      message: '"${existing.title}" will be removed.',
    );
    if (!confirmed || !mounted) return;

    setState(() => _saving = true);
    try {
      await AppScope.read(context).reminders.remove(existing.id);
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

    return Scaffold(
      appBar: AppBar(
        title: Text(_isEdit ? 'Edit reminder' : 'Add reminder'),
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
                        hintText: 'e.g. Pay internet bill',
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
                    TextFormField(
                      controller: _detailsController,
                      textCapitalization: TextCapitalization.sentences,
                      maxLines: 3,
                      minLines: 1,
                      maxLength: 1000,
                      decoration: InputDecoration(
                        labelText: 'Details (optional)',
                        hintText: 'Account number, amount…',
                        counterText: '',
                        errorText: _serverErrors['details'],
                      ),
                    ),
                    const SizedBox(height: 4),
                    TextFormField(
                      controller: _dateController,
                      readOnly: true,
                      onTap: _pickDate,
                      decoration: InputDecoration(
                        labelText: 'Due date',
                        prefixIcon: const Icon(Icons.calendar_today_outlined),
                        suffixIcon: IconButton(
                          icon: const Icon(Icons.edit_outlined),
                          onPressed: _pickDate,
                        ),
                        errorText: _serverErrors['dueDate'],
                      ),
                      validator: (_) =>
                          RegExp(r'^\d{4}-\d{2}-\d{2}$').hasMatch(_date)
                              ? null
                              : 'Pick a valid date',
                    ),
                    const SizedBox(height: 16),
                    TextFormField(
                      controller: _timeController,
                      readOnly: true,
                      onTap: _pickTime,
                      decoration: InputDecoration(
                        labelText: 'Time (optional)',
                        hintText: 'No time',
                        prefixIcon: const Icon(Icons.schedule_outlined),
                        suffixIcon: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            if (_time != null)
                              IconButton(
                                tooltip: 'No time',
                                icon: const Icon(Icons.clear),
                                onPressed: _clearTime,
                              ),
                            IconButton(
                              icon: const Icon(Icons.edit_outlined),
                              onPressed: _pickTime,
                            ),
                          ],
                        ),
                        errorText: _serverErrors['dueTime'],
                      ),
                    ),
                    const SizedBox(height: 8),
                    Text(
                      _time == null
                          ? 'Leave the time empty for a date-only reminder.'
                          : 'Reminds at $_time (24-hour) on the due date.',
                      style: theme.textTheme.bodySmall?.copyWith(
                        color: theme.colorScheme.onSurfaceVariant,
                      ),
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
                          : Text(_isEdit ? 'Save changes' : 'Add reminder'),
                    ),
                    const SizedBox(height: 8),
                    Text(
                      'Saved to your account — edit or complete it any time.',
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
