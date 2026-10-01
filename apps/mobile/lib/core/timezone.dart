import 'dart:typed_data';

import 'package:flutter/services.dart' show rootBundle;
import 'package:timezone/timezone.dart' as tz;

/// "Today" in the user's IANA timezone.
///
/// The tz database ships as a package asset (see `pubspec.yaml`) and is loaded
/// lazily on first use. If the database cannot be loaded or the zone is
/// unknown, the device's local calendar is used — reports still work, they
/// just follow the device rather than the profile.
///
/// Flutter widget tests run inside a fake-async zone where real I/O (like
/// `rootBundle.load`) never completes, and awaiting a future completed in a
/// *different* zone poisons subsequent `tester.pump()` calls. [preload] is
/// therefore awaited from real-async contexts (e.g. `tester.runAsync`), after
/// which [ensureReady] only ever completes via zone-local microtasks.
abstract final class Timezones {
  static Future<void>? _ready;
  static bool _initialized = false;

  /// Loads and installs the tz database from a real-async context. Idempotent;
  /// after it returns, [ensureReady] needs no I/O at all.
  static Future<void> preload() async {
    if (_initialized) return;
    tz.initializeDatabase(await _fetch());
    _initialized = true;
  }

  /// Ensures the tz database has been (attempted) once. Safe to await
  /// repeatedly; also kicked off by every [todayIn] call.
  static Future<void> ensureReady() {
    if (_initialized) return Future<void>.value();
    return _ready ??= _load();
  }

  static Future<void> _load() async {
    try {
      tz.initializeDatabase(await _fetch());
      _initialized = true;
    } on Object {
      // Leave the database empty — todayIn falls back to the device calendar.
    }
  }

  static Future<Uint8List> _fetch() async {
    final data = await rootBundle.load('packages/timezone/data/latest.tzf');
    return data.buffer.asUint8List(data.offsetInBytes, data.lengthInBytes);
  }

  /// `2026-10-02` as observed in [timezone]. Always safe to call synchronously
  /// once [ensureReady] has completed (report queries await it first).
  static String todayIn(String? timezone, {DateTime? now}) {
    final ref = now ?? DateTime.now();
    if (timezone != null && timezone.toUpperCase() == 'UTC') {
      // The tzf database ships no "UTC" key (only "Etc/UTC"), so answer
      // directly instead of paying for a lookup that would fall back.
      return ref.toUtc().toIso8601String().substring(0, 10);
    }
    if (timezone != null && timezone.isNotEmpty) {
      try {
        final local = tz.TZDateTime.from(ref.toUtc(), tz.getLocation(timezone));
        return local.toIso8601String().substring(0, 10);
      } on Object {
        // Unknown zone or unloaded database: fall through to the device.
      }
    }
    return ref.toLocal().toIso8601String().substring(0, 10);
  }
}
