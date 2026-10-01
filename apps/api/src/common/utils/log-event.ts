import type { Logger } from '@nestjs/common';

/**
 * Structured audit line for state-changing endpoints (AGENTS.md: every
 * state-changing controller must call `logEvent`).
 *
 * There is no audit table in this schema — the event is emitted through the
 * Nest logger, while durable provenance for offline writes lives in the
 * `SyncOperation` ledger and the `ChangeLog` feed. The signature mirrors the
 * AGENTS contract with the logger standing in for the persistence handle.
 */
export function logEvent(
  logger: Logger,
  userId: string,
  type: string,
  description: string,
  metadata?: Record<string, unknown>,
  entityType?: string,
  entityId?: string,
): void {
  const line: Record<string, unknown> = { type, userId, description };
  if (metadata && Object.keys(metadata).length > 0) line.metadata = metadata;
  if (entityType) line.entityType = entityType;
  if (entityId) line.entityId = entityId;
  logger.log(JSON.stringify(line));
}
