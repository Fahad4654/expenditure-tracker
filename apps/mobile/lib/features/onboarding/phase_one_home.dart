import 'package:flutter/material.dart';

import '../../core/config/app_config.dart';

/// Phase 1 placeholder home screen.
///
/// It documents the planned screen map and the sync-state vocabulary that the
/// offline engine (Phase 5) will drive, so the UI contract is agreed before
/// any feature code lands.
class PhaseOneHome extends StatelessWidget {
  const PhaseOneHome({super.key});

  static const _screens = <String, String>{
    'Splash': 'App bootstrap, secure token restore',
    'Login / Register': 'Email, phone OTP and Google sign-in',
    'Dashboard': 'Today & month income / expense / balance',
    'Add Transaction': 'Optimised single-tap entry',
    'Transactions': 'Search, filter, edit, delete',
    'Categories': 'System + user categories',
    'Reports': 'Daily, monthly and category breakdowns',
    'Profile / Settings': 'Currency, timezone, account',
  };

  static const _syncStates = <(IconData, String, Color)>[
    (Icons.check_circle, 'Synced', Color(0xFF10B981)),
    (Icons.sync, 'Syncing…', Color(0xFF3B82F6)),
    (Icons.pending, 'Pending sync', Color(0xFFF59E0B)),
    (Icons.error, 'Sync failed', Color(0xFFEF4444)),
  ];

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Scaffold(
      appBar: AppBar(title: const Text(AppConfig.appTitle)),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('Phase 1 — architecture scaffold', style: theme.textTheme.titleMedium),
                  const SizedBox(height: 8),
                  Text('API base URL', style: theme.textTheme.labelMedium),
                  Text(
                    AppConfig.apiBaseUrl,
                    style: theme.textTheme.bodyMedium?.copyWith(
                      fontFamily: 'monospace',
                      color: theme.colorScheme.primary,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text('Environment: ${AppConfig.environment}',
                      style: theme.textTheme.bodySmall),
                ],
              ),
            ),
          ),
          const SizedBox(height: 16),
          Text('Planned screens', style: theme.textTheme.titleMedium),
          const SizedBox(height: 8),
          ..._screens.entries.map(
            (entry) => ListTile(
              contentPadding: EdgeInsets.zero,
              leading: const Icon(Icons.chevron_right),
              title: Text(entry.key),
              subtitle: Text(entry.value),
            ),
          ),
          const SizedBox(height: 16),
          Text('Sync status vocabulary', style: theme.textTheme.titleMedium),
          const SizedBox(height: 8),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: _syncStates
                .map(
                  (state) => Chip(
                    avatar: Icon(state.$1, size: 18, color: state.$3),
                    label: Text(state.$2),
                  ),
                )
                .toList(),
          ),
        ],
      ),
    );
  }
}
