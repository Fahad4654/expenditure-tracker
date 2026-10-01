/**
 * Sync tuning constants.
 *
 * The Flutter client mirrors these values in `lib/core/sync/`; they are kept
 * here so the API can reject absurd batches and the web client can show
 * accurate sync-state labels.
 */
export const SYNC_DEFAULTS = {
  /** Max operations per `POST /sync` request. */
  maxOperationsPerBatch: 200,
  /** Base delay for exponential backoff (milliseconds). */
  retryBaseDelayMs: 1000,
  retryMaxDelayMs: 5 * 60 * 1000,
  retryJitterRatio: 0.2,
  /** Max attempts before an operation is marked FAILED (still retried manually). */
  maxRetryAttempts: 8,
  /** How often the client polls for server changes while the app is open. */
  pollIntervalMs: 60_000,
} as const;
