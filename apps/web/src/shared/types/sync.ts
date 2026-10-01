import type { IsoDateTime, Uuid } from './common';

export const SYNC_ENTITY_TYPES = ['TRANSACTION', 'CATEGORY'] as const;
export type SyncEntityType = (typeof SYNC_ENTITY_TYPES)[number];

export const SYNC_OPERATIONS = ['CREATE', 'UPDATE', 'DELETE'] as const;
export type SyncOperationKind = (typeof SYNC_OPERATIONS)[number];

export const SYNC_STATUSES = ['SYNCED', 'SYNCING', 'PENDING', 'FAILED'] as const;
export type SyncStatus = (typeof SYNC_STATUSES)[number];

/** Client-generated UUID of the operation itself (idempotency key). */
export type OperationId = Uuid;

export interface SyncOperationEnvelope {
  operationId: OperationId;
  entityId: Uuid;
  entityType: SyncEntityType;
  operation: SyncOperationKind;
  /** Client wall-clock time the change was made (ISO-8601). Advisory only. */
  timestamp: IsoDateTime;
  /**
   * Entity version observed by the client when it made the change.
   * Used for optimistic concurrency / conflict detection.
   */
  baseVersion?: number;
  payload: Record<string, unknown>;
}

export interface SyncRequest {
  deviceId: string;
  /** Server cursor from the previous successful sync. */
  cursor?: string | null;
  operations: SyncOperationEnvelope[];
}

export interface SyncOperationResult {
  operationId: OperationId;
  entityId: Uuid;
  entityType: SyncEntityType;
  operation: SyncOperationKind;
  status: 'APPLIED' | 'DUPLICATE' | 'REJECTED' | 'CONFLICT';
  /** Present when `status` is `REJECTED` or `CONFLICT`. */
  reason?: string;
  /** Authoritative server entity after processing (for CONFLICT, the winner). */
  entity?: Record<string, unknown>;
}

export interface SyncServerChange {
  entityId: Uuid;
  entityType: SyncEntityType;
  operation: 'UPSERT' | 'DELETE';
  version: number;
  updatedAt: IsoDateTime;
  payload: Record<string, unknown>;
}

export interface SyncResponse {
  /** Echo of accepted operation ids already present on the server. */
  results: SyncOperationResult[];
  /** Entities changed on the server since `cursor` that the client must apply. */
  changes: SyncServerChange[];
  /** Opaque cursor to send on the next sync. */
  cursor: string;
  serverTime: IsoDateTime;
}

export interface SyncChangesQuery {
  cursor?: string | null;
  limit?: number;
}

/** `GET /sync/changes` response. */
export interface SyncChangesResponse {
  changes: SyncServerChange[];
  /** Cursor to send next — advances past every examined row. */
  cursor: string;
  hasMore: boolean;
  serverTime: IsoDateTime;
}
