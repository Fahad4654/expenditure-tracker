import type { Prisma, ChangeKind, SyncEntityType } from '@prisma/client';

export interface ChangeInput {
  userId: string;
  /**
   * Device that originated the write. `null` for REST/web writes — those must
   * reach every device, including the one that happened to make the request.
   * The sync service passes the push's `deviceId` so a device never receives
   * its own write back.
   */
  deviceId?: string | null;
  entityType: SyncEntityType;
  entityId: string;
  kind: ChangeKind;
  /** Entity version *after* the write (post-increment). */
  version: number;
}

/**
 * Appends one row to the `ChangeLog` feed. Must be called with the same
 * transaction client as the write it announces, so a committed write can never
 * exist without its change-feed entry (and vice versa).
 */
export async function recordChange(
  tx: Prisma.TransactionClient,
  change: ChangeInput,
): Promise<void> {
  await tx.changeLog.create({
    data: {
      userId: change.userId,
      deviceId: change.deviceId ?? null,
      entityType: change.entityType,
      entityId: change.entityId,
      kind: change.kind,
      version: change.version,
    },
  });
}
