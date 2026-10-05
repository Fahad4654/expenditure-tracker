import 'package:flutter/material.dart';

/// One row offered by a [SearchablePickerSheet].
class PickerOption {
  const PickerOption({required this.id, required this.label, this.leading});

  /// Returned when the row is picked. Only real entries are listed, so this is
  /// never empty — clearing a selection happens on the field itself.
  final String id;
  final String label;

  /// Optional avatar shown before the label (categories use one; notes don't).
  final Widget? leading;
}

/// Opens the searchable single-select sheet and resolves with the picked
/// option id, or `null` when the sheet is dismissed without a choice.
Future<String?> showSearchablePicker({
  required BuildContext context,
  required String searchHint,
  required List<PickerOption> options,
  required String? selectedId,
  required String Function(String query) emptyMessage,
  Key? searchKey,
}) =>
    showModalBottomSheet<String>(
      context: context,
      isScrollControlled: true,
      builder: (_) => SearchablePickerSheet(
        searchHint: searchHint,
        searchKey: searchKey,
        options: options,
        selectedId: selectedId,
        emptyMessage: emptyMessage,
      ),
    );

/// Bottom sheet pairing a search box with a single-select list — the picker
/// behind the transaction form's category and note fields. Follows the tag
/// search on the note form: type to narrow, tap to pick.
class SearchablePickerSheet extends StatefulWidget {
  const SearchablePickerSheet({
    super.key,
    required this.searchHint,
    required this.searchKey,
    required this.options,
    required this.selectedId,
    required this.emptyMessage,
  });

  final String searchHint;
  final Key? searchKey;
  final List<PickerOption> options;
  final String? selectedId;

  /// Builds the body message for the current query — an empty query means
  /// there is nothing to pick at all.
  final String Function(String query) emptyMessage;

  @override
  State<SearchablePickerSheet> createState() => _SearchablePickerSheetState();
}

class _SearchablePickerSheetState extends State<SearchablePickerSheet> {
  final _searchController = TextEditingController();
  String _query = '';

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final query = _query.trim().toLowerCase();
    final results = query.isEmpty
        ? widget.options
        : widget.options
            .where((option) => option.label.toLowerCase().contains(query))
            .toList();

    return Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.of(context).viewInsets.bottom),
      child: SafeArea(
        top: false,
        child: ConstrainedBox(
          constraints: BoxConstraints(
            maxHeight: MediaQuery.of(context).size.height * 0.7,
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
                child: TextField(
                  key: widget.searchKey,
                  controller: _searchController,
                  autofocus: true,
                  textInputAction: TextInputAction.search,
                  textCapitalization: TextCapitalization.sentences,
                  onChanged: (value) => setState(() => _query = value),
                  decoration: InputDecoration(
                    hintText: widget.searchHint,
                    prefixIcon: const Icon(Icons.search),
                    isDense: true,
                    suffixIcon: _query.isEmpty
                        ? null
                        : IconButton(
                            tooltip: 'Clear',
                            icon: const Icon(Icons.clear),
                            onPressed: () {
                              _searchController.clear();
                              setState(() => _query = '');
                            },
                          ),
                  ),
                ),
              ),
              Flexible(
                child: results.isEmpty
                    ? Padding(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 16,
                          vertical: 24,
                        ),
                        child: Text(
                          widget.emptyMessage(_query.trim()),
                          textAlign: TextAlign.center,
                          style: theme.textTheme.bodyMedium?.copyWith(
                            color: theme.colorScheme.onSurfaceVariant,
                          ),
                        ),
                      )
                    : ListView.builder(
                        shrinkWrap: true,
                        padding: const EdgeInsets.only(bottom: 8),
                        itemCount: results.length,
                        itemBuilder: (context, index) {
                          final option = results[index];
                          final selected = option.id == widget.selectedId;
                          return ListTile(
                            dense: true,
                            leading: option.leading,
                            title: Text(
                              option.label,
                              overflow: TextOverflow.ellipsis,
                            ),
                            trailing: selected
                                ? Icon(
                                    Icons.check_rounded,
                                    color: theme.colorScheme.primary,
                                  )
                                : null,
                            onTap: () => Navigator.of(context).pop(option.id),
                          );
                        },
                      ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
