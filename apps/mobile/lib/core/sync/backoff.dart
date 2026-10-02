import 'dart:math';

import 'sync_config.dart';

/// Exponential backoff with symmetric jitter, per `docs/synchronization.md` §6:
///
/// ```text
/// delay = min(retryBaseDelayMs * 2^attempt, retryMaxDelayMs)
/// delay = delay * (1 ± retryJitterRatio)
/// ```
///
/// Attempt `0` is the first retry (base delay ~1 s); the cap lands at 5 minutes.
/// The [random] source is injectable so tests can assert the bounds.
int backoffDelayMs(int attempt, {Random? random}) {
  final exponent = attempt.clamp(0, 30);
  final grown = SyncConfig.retryBaseDelayMs * pow(2, exponent);
  final capped = grown > SyncConfig.retryMaxDelayMs ? SyncConfig.retryMaxDelayMs : grown;
  final unit = (random ?? Random()).nextDouble() * 2 - 1; // [-1, 1)
  final jittered = capped * (1 + unit * SyncConfig.retryJitterRatio);
  return jittered.round();
}
