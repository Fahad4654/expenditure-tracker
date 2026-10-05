import 'package:expenditure_tracker/core/db/local_store.dart';
import 'package:expenditure_tracker/core/network/api_routes.dart';
import 'package:expenditure_tracker/shared/models/category.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'support/fakes.dart';
import 'support/fixtures.dart';
import 'support/pump_app.dart';

const _ownId = '99999999-9999-4999-8999-999999999999';

Future<void> _seed(LocalStore store) async {
  store.applyServerCategoryUpsert(categoryJson());
  store.applyServerCategoryUpsert(
    categoryJson(
      id: _ownId,
      name: 'Pets',
      kind: 'USER',
      isSystem: false,
      icon: 'pets',
      color: '#EC4899',
    ),
  );
}

List<Map<String, Object?>> _categories() => [
      categoryJson(),
      categoryJson(
        id: _ownId,
        name: 'Pets',
        kind: 'USER',
        isSystem: false,
        icon: 'pets',
        color: '#EC4899',
      ),
    ];

Finder _dialog() => find.byWidgetPredicate((widget) => widget is AlertDialog);

Finder _nameField() => find.descendant(
      of: _dialog(),
      matching: find.byType(TextField),
    );

Finder _saveButton() => find.descendant(
      of: _dialog(),
      matching: find.widgetWithText(FilledButton, 'Save'),
    );

/// The 32×32 colour swatches inside the category form dialog.
Finder _swatches() => find.descendant(
      of: _dialog(),
      matching: find.byWidgetPredicate(
        (widget) =>
            widget is InkWell &&
            widget.child is Container &&
            (widget.child! as Container).constraints?.maxWidth == 32 &&
            (widget.child! as Container).constraints?.maxHeight == 32,
      ),
    );

Future<void> _openCategories(WidgetTester tester) async {
  await tester.tap(find.text('Transactions'));
  await settle(tester, pumps: 8);
  await tester.tap(find.byTooltip('Categories'));
  // The pushed route's FAB scales in; wait for the transition so its tap
  // target sits under the label.
  await settle(tester, pumps: 30);
}

void main() {
  group('CategoriesPage', () {
    testWidgets('edits the name, colour and icon of a personal category',
        (tester) async {
      final api = FakeApiClient();
      api.onGet(ApiRoutes.categories, (_) => _categories());
      final app = await pumpApp(tester, api: api, signedIn: true, seed: _seed);
      await _openCategories(tester);

      expect(find.text('Pets'), findsOneWidget);
      expect(find.text('Food'), findsOneWidget);
      expect(
        find.byTooltip('Edit'),
        findsOneWidget,
        reason: 'system categories stay read-only',
      );
      expect(find.byTooltip('Delete'), findsOneWidget);

      await tester.tap(find.byTooltip('Edit'));
      await settle(tester, pumps: 8);
      expect(find.text('Edit category'), findsOneWidget);

      await tester.enterText(_nameField(), 'Vet bills');
      expect(_swatches(), findsNWidgets(12));
      await tester.tap(_swatches().at(1)); // #3B82F6
      await tester.tap(find.byTooltip('car'));
      await settle(tester);

      await tester.tap(_saveButton());
      await settle(tester, pumps: 8);

      expect(find.text('Edit category'), findsNothing);
      expect(find.text('Vet bills'), findsOneWidget);

      final row = app.store.listCategories().singleWhere((c) => c.id == _ownId);
      expect(row.name, 'Vet bills');
      expect(row.color, '#3B82F6');
      expect(row.icon, 'car');

      final op = app.store.nextPushBatch().single;
      expect(op.operation, 'UPDATE');
      expect(op.entityType, 'CATEGORY');
      expect(op.entityId, _ownId);
      expect(op.payload['name'], 'Vet bills');
      expect(op.payload['color'], '#3B82F6');
      expect(op.payload['icon'], 'car');
      expect(op.payload['suggestedType'], 'EXPENSE');
    });

    testWidgets('creates a category with a colour and icon', (tester) async {
      final api = FakeApiClient();
      api.onGet(ApiRoutes.categories, (_) => _categories());
      final app = await pumpApp(tester, api: api, signedIn: true, seed: _seed);
      await _openCategories(tester);

      await tester.tap(find.text('New'));
      await settle(tester, pumps: 8);
      expect(find.text('New category'), findsOneWidget);

      await tester.enterText(_nameField(), 'Coffee money');
      await tester.tap(_swatches().at(4)); // #8B5CF6
      await tester.tap(find.byTooltip('bag'));
      await settle(tester);

      await tester.tap(_saveButton());
      await settle(tester, pumps: 8);

      expect(find.text('New category'), findsNothing);
      expect(find.text('Coffee money'), findsOneWidget);

      final created = app.store
          .listCategories()
          .singleWhere((c) => c.name == 'Coffee money');
      expect(created.kind, CategoryKind.user);
      expect(created.color, '#8B5CF6');
      expect(created.icon, 'bag');

      final op = app.store.nextPushBatch().single;
      expect(op.operation, 'CREATE');
      expect(op.entityType, 'CATEGORY');
      expect(op.entityId, created.id);
      expect(op.payload['name'], 'Coffee money');
      expect(op.payload['color'], '#8B5CF6');
      expect(op.payload['icon'], 'bag');
    });
  });
}
