import 'package:flutter/material.dart';

import '../../app_scope.dart';
import '../../core/sync/sync_engine.dart';
import '../dashboard/dashboard_page.dart';
import '../notes/notes_page.dart';
import '../profile/profile_page.dart';
import '../reminders/reminders_page.dart';
import '../reports/reports_page.dart';
import '../transactions/transaction_form_page.dart';
import '../transactions/transactions_page.dart';

/// Root of the authenticated experience: bottom navigation with a central
/// "Add" action. Tabs are built lazily so a screen only fetches its data the
/// first time it is opened, and offstage tabs keep their state.
class ShellPage extends StatefulWidget {
  const ShellPage({super.key});

  @override
  State<ShellPage> createState() => _ShellPageState();
}

class _ShellPageState extends State<ShellPage> {
  static const _labels = [
    'Home',
    'Transactions',
    'Reports',
    'Reminders',
    'Notes',
    'Profile',
  ];
  static const _icons = [
    Icons.dashboard_outlined,
    Icons.receipt_long_outlined,
    Icons.bar_chart_rounded,
    Icons.notifications_outlined,
    Icons.notes_outlined,
    Icons.person_outline,
  ];

  final Set<int> _visited = {0};
  final ValueNotifier<int> _refreshTick = ValueNotifier<int>(0);
  int _index = 0;
  late final SyncEngine _sync;
  late final List<Widget> _pages;

  @override
  void initState() {
    super.initState();
    // Reload dashboard/transactions whenever a sync cycle finishes so fresh
    // server state (and flipped sync chips) show up without a manual refresh.
    _sync = AppScope.read(context).sync;
    _sync.addListener(_onSyncChanged);
    _pages = [
      DashboardPage(refreshTick: _refreshTick),
      TransactionsPage(refreshTick: _refreshTick),
      ReportsPage(refreshTick: _refreshTick),
      const RemindersPage(),
      const NotesPage(),
      const ProfilePage(),
    ];
  }

  @override
  void dispose() {
    _sync.removeListener(_onSyncChanged);
    _refreshTick.dispose();
    super.dispose();
  }

  void _onSyncChanged() {
    if (_sync.isSyncing || !mounted) return;
    _refreshTick.value++;
  }

  Future<void> _addTransaction() async {
    final created = await Navigator.of(context).push<bool>(
      MaterialPageRoute(builder: (_) => const TransactionFormPage()),
    );
    if (created == true) _refreshTick.value++;
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: IndexedStack(
        index: _index,
        children: [
          for (var i = 0; i < _labels.length; i++)
            _visited.contains(i) ? _pages[i] : const SizedBox.shrink(),
        ],
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: _addTransaction,
        icon: const Icon(Icons.add),
        label: const Text('Add'),
      ),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _index,
        onDestinationSelected: (index) => setState(() {
          _index = index;
          _visited.add(index);
        }),
        destinations: [
          for (var i = 0; i < _labels.length; i++)
            NavigationDestination(
              icon: Icon(_icons[i]),
              label: _labels[i],
            ),
        ],
      ),
    );
  }
}
