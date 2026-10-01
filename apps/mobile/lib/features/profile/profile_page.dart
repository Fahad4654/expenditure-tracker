import 'package:flutter/material.dart';

import '../../app_scope.dart';
import '../../core/network/api_error.dart';
import '../../shared/widgets/confirm_dialog.dart';
import '../../shared/widgets/error_banner.dart';
import '../../shared/widgets/section_card.dart';
import '../categories/categories_page.dart';

/// Currencies offered in the preference dropdown (ISO-4217).
const List<String> _currencies = [
  'BDT',
  'USD',
  'EUR',
  'GBP',
  'INR',
  'JPY',
  'CNY',
  'AUD',
  'CAD',
  'SGD',
  'MYR',
  'PKR',
  'SAR',
  'AED',
];

/// Common IANA zones offered in the preference dropdown.
const List<String> _timezones = [
  'Asia/Dhaka',
  'Asia/Kolkata',
  'Asia/Karachi',
  'Asia/Dubai',
  'Asia/Riyadh',
  'Asia/Qatar',
  'Asia/Kuwait',
  'Asia/Singapore',
  'Asia/Kuala_Lumpur',
  'Asia/Bangkok',
  'Asia/Jakarta',
  'Asia/Shanghai',
  'Asia/Hong_Kong',
  'Asia/Tokyo',
  'Asia/Seoul',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Europe/Madrid',
  'Europe/Moscow',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Toronto',
  'America/Sao_Paulo',
  'Australia/Sydney',
  'Pacific/Auckland',
  'Africa/Cairo',
  'Africa/Lagos',
  'Africa/Nairobi',
  'UTC',
];

/// Profile and preferences, plus entry points to category management and
/// sign-out.
class ProfilePage extends StatefulWidget {
  const ProfilePage({super.key});

  @override
  State<ProfilePage> createState() => _ProfilePageState();
}

class _ProfilePageState extends State<ProfilePage> {
  final _formKey = GlobalKey<FormState>();
  final _nameController = TextEditingController();

  String? _currency;
  String? _timezone;
  bool _saving = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    final user = AppScope.read(context).auth.user;
    _nameController.text = user?.name ?? '';
    _currency = user?.defaultCurrency ?? 'BDT';
    _timezone = user?.timezone ?? 'Asia/Dhaka';
  }

  @override
  void dispose() {
    _nameController.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    final form = _formKey.currentState;
    if (form == null || !form.validate()) return;

    final scope = AppScope.read(context);
    setState(() {
      _saving = true;
      _error = null;
    });

    try {
      final updated = await scope.users.update(
        name: _nameController.text,
        defaultCurrency: _currency,
        timezone: _timezone,
      );
      scope.auth.applyProfile(updated);
      if (!mounted) return;
      setState(() => _saving = false);
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Profile updated')),
      );
    } on ApiError catch (error) {
      if (!mounted) return;
      setState(() {
        _saving = false;
        _error = error.message;
      });
    }
  }

  Future<void> _signOut() async {
    final confirmed = await showConfirmDialog(
      context,
      title: 'Sign out?',
      message: 'You can sign back in any time.',
      confirmLabel: 'Sign out',
    );
    if (!confirmed || !mounted) return;
    await AppScope.read(context).auth.logout();
  }

  Future<void> _openCategories() async {
    await Navigator.of(context).push(
      MaterialPageRoute(builder: (_) => const CategoriesPage()),
    );
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final auth = AppScope.read(context).auth;
    final user = auth.user;

    final currencyOptions = [
      if (_currency != null && !_currencies.contains(_currency)) _currency!,
      ..._currencies,
    ];
    final timezoneOptions = [
      if (_timezone != null && !_timezones.contains(_timezone)) _timezone!,
      ..._timezones,
    ];

    final initials = (user?.name ?? '?')
        .split(' ')
        .where((part) => part.isNotEmpty)
        .take(2)
        .map((part) => part[0].toUpperCase())
        .join();

    return Scaffold(
      appBar: AppBar(title: const Text('Profile')),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 96),
          children: [
            Center(
              child: ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 560),
                child: Form(
                  key: _formKey,
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      Row(
                        children: [
                          CircleAvatar(
                            radius: 28,
                            backgroundColor: theme.colorScheme.primaryContainer,
                            child: Text(
                              initials.isEmpty ? '?' : initials,
                              style: theme.textTheme.titleLarge?.copyWith(
                                color: theme.colorScheme.onPrimaryContainer,
                              ),
                            ),
                          ),
                          const SizedBox(width: 16),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  user?.name ?? '',
                                  style: theme.textTheme.titleMedium,
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                ),
                                const SizedBox(height: 4),
                                Row(
                                  children: [
                                    Flexible(
                                      child: Text(
                                        user?.email ?? 'No email',
                                        style: theme.textTheme.bodySmall?.copyWith(
                                          color: theme.colorScheme.onSurfaceVariant,
                                        ),
                                        maxLines: 1,
                                        overflow: TextOverflow.ellipsis,
                                      ),
                                    ),
                                    if (user?.emailVerified == true) ...[
                                      const SizedBox(width: 6),
                                      Icon(
                                        Icons.verified_rounded,
                                        size: 16,
                                        color: theme.colorScheme.primary,
                                      ),
                                    ],
                                  ],
                                ),
                              ],
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 16),
                      if (_error != null) ...[
                        ErrorBanner(message: _error!),
                        const SizedBox(height: 12),
                      ],
                      SectionCard(
                        title: 'Account',
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.stretch,
                          children: [
                            TextFormField(
                              controller: _nameController,
                              textCapitalization: TextCapitalization.words,
                              decoration: const InputDecoration(labelText: 'Name'),
                              validator: (value) {
                                final text = value?.trim() ?? '';
                                if (text.length < 2) return 'Name is too short';
                                if (text.length > 80) return 'Name is too long';
                                return null;
                              },
                            ),
                            const SizedBox(height: 16),
                            TextFormField(
                              initialValue: user?.email ?? '',
                              readOnly: true,
                              decoration: const InputDecoration(
                                labelText: 'Email',
                                suffixIcon: Icon(Icons.lock_outline),
                              ),
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(height: 12),
                      SectionCard(
                        title: 'Preferences',
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.stretch,
                          children: [
                            DropdownButtonFormField<String>(
                              key: ValueKey('currency-$_currency'),
                              initialValue: _currency,
                              decoration: const InputDecoration(
                                labelText: 'Default currency',
                                prefixIcon: Icon(Icons.payments_outlined),
                              ),
                              items: [
                                for (final code in currencyOptions)
                                  DropdownMenuItem<String>(
                                    value: code,
                                    child: Text(code),
                                  ),
                              ],
                              onChanged: (value) =>
                                  setState(() => _currency = value),
                            ),
                            const SizedBox(height: 16),
                            DropdownButtonFormField<String>(
                              key: ValueKey('timezone-$_timezone'),
                              initialValue: _timezone,
                              decoration: const InputDecoration(
                                labelText: 'Timezone',
                                prefixIcon: Icon(Icons.public_outlined),
                              ),
                              items: [
                                for (final zone in timezoneOptions)
                                  DropdownMenuItem<String>(
                                    value: zone,
                                    child: Text(
                                      zone,
                                      overflow: TextOverflow.ellipsis,
                                    ),
                                  ),
                              ],
                              onChanged: (value) =>
                                  setState(() => _timezone = value),
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(height: 12),
                      SectionCard(
                        title: 'Manage',
                        child: Column(
                          children: [
                            ListTile(
                              contentPadding: EdgeInsets.zero,
                              leading: const Icon(Icons.label_outline),
                              title: const Text('Categories'),
                              subtitle: const Text('Create and organise your categories'),
                              trailing: const Icon(Icons.chevron_right),
                              onTap: _openCategories,
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(height: 24),
                      FilledButton(
                        onPressed: _saving ? null : _save,
                        child: _saving
                            ? const SizedBox(
                                width: 22,
                                height: 22,
                                child: CircularProgressIndicator(strokeWidth: 2.4),
                              )
                            : const Text('Save changes'),
                      ),
                      const SizedBox(height: 12),
                      OutlinedButton.icon(
                        onPressed: _signOut,
                        style: OutlinedButton.styleFrom(
                          minimumSize: const Size.fromHeight(52),
                          foregroundColor: theme.colorScheme.error,
                        ),
                        icon: const Icon(Icons.logout_rounded),
                        label: const Text('Sign out'),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
