/// Sync tuning constants — mirrored from `apps/api/src/shared/config/sync.ts`
/// so client backoff and server batch limits stay in lockstep.
abstract final class SyncConfig {
  /// Max operations per `POST /sync` request.
  static const int maxOperationsPerBatch = 200;

  /// Base delay for exponential backoff (milliseconds).
  static const int retryBaseDelayMs = 1000;

  /// Upper bound for a single backoff delay (5 minutes).
  static const int retryMaxDelayMs = 5 * 60 * 1000;

  /// Jitter applied to every delay: `delay * (1 ± ratio)`.
  static const double retryJitterRatio = 0.2;

  /// Attempts before an operation parks as `FAILED` (still re-armed by
  /// connectivity, app start and manual sync).
  static const int maxRetryAttempts = 8;

  /// How often the engine polls for server changes while the app is open.
  static const int pollIntervalMs = 60000;

  /// Safety caps for one sync cycle so a runaway server cannot spin forever.
  static const int maxPushRounds = 10;
  static const int maxPullPages = 20;
}
