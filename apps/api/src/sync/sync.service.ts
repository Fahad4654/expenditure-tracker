import { HttpException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Category as PrismaCategory } from '@prisma/client';
import type {
  SyncChangesQueryDto,
  SyncOperationInputDto,
  SyncRequestDto,
} from '../shared/validation';
import type {
  SyncChangesResponse,
  SyncOperationResult,
  SyncResponse,
  SyncServerChange,
} from '../shared/types';
import { SYNC_DEFAULTS } from '../shared/config';
import { PrismaService } from '../prisma/prisma.module';
import { toTransaction, TransactionsService } from '../transactions/transactions.service';
import { toCategory } from '../categories/categories.service';
import { recordChange } from './change-feed';

type Tx = Prisma.TransactionClient;

/** Full category row for the wire: REST shape plus the sync fields. */
function syncCategoryPayload(category: PrismaCategory): Record<string, unknown> {
  return {
    ...toCategory(category),
    version: category.version,
    deletedAt: category.deletedAt?.toISOString() ?? null,
  };
}

function rejectionReason(error: unknown): string | null {
  if (!(error instanceof HttpException)) return null;
  const status = error.getStatus();
  // The only 404 reachable while applying an operation is the category
  // visibility check inside TransactionsService.create.
  if (status === 404) return 'category_not_found';
  if (status === 409) return 'conflict';
  const response = error.getResponse();
  if (typeof response === 'object' && response !== null && 'code' in response) {
    const code = (response as { code?: unknown }).code;
    if (typeof code === 'string') return code.toLowerCase();
  }
  return 'rejected';
}

function rejected(
  op: SyncOperationInputDto,
  reason: string,
): SyncOperationResult {
  return {
    operationId: op.operationId,
    entityId: op.entityId,
    entityType: op.entityType,
    operation: op.operation,
    status: 'REJECTED',
    reason,
  };
}

function finished(
  op: SyncOperationInputDto,
  status: SyncOperationResult['status'],
  entity?: object,
  reason?: string,
): SyncOperationResult {
  return {
    operationId: op.operationId,
    entityId: op.entityId,
    entityType: op.entityType,
    operation: op.operation,
    status,
    ...(reason && { reason }),
    ...(entity && { entity: entity as Record<string, unknown> }),
  };
}

/**
 * `POST /sync` and `GET /sync/changes` — see `docs/synchronization.md`.
 *
 * A push is one database transaction: operations are applied FIFO, each
 * announced by a `SyncOperation` ledger row inserted *before* the write, so a
 * replayed `operationId` is answered from the ledger and never applied twice.
 * The pull happens in the same transaction against the same cursor the client
 * sent, so the response is a consistent snapshot.
 *
 * Conflict policy is last-write-wins on server `version`: a stale
 * `baseVersion` still applies (the client's write wins) but is reported as
 * `CONFLICT` with the authoritative entity; a server tombstone always wins
 * over a later UPDATE (deletes must not disappear).
 */
@Injectable()
export class SyncService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly transactions: TransactionsService,
  ) {}

  async push(userId: string, dto: SyncRequestDto): Promise<SyncResponse> {
    return this.prisma.$transaction(async (tx) => {
      const results: SyncOperationResult[] = [];
      for (const op of dto.operations) {
        results.push(await this.applyOperation(tx, userId, dto.deviceId, op));
      }

      const pull = await this.pullChanges(tx, userId, dto.deviceId, dto.cursor ?? null, SYNC_DEFAULTS.maxOperationsPerBatch);

      await tx.device.upsert({
        where: { id: dto.deviceId },
        create: {
          id: dto.deviceId,
          userId,
          lastCursor: pull.cursor,
          lastSyncAt: new Date(),
        },
        update: {
          userId,
          lastCursor: pull.cursor,
          lastSyncAt: new Date(),
        },
      });

      return {
        results,
        changes: pull.changes,
        cursor: pull.cursor,
        serverTime: new Date().toISOString(),
      };
    });
  }

  async pull(userId: string, query: SyncChangesQueryDto): Promise<SyncChangesResponse> {
    const pull = await this.pullChanges(
      this.prisma,
      userId,
      query.deviceId ?? null,
      query.cursor ?? null,
      query.limit,
    );
    if (query.deviceId) {
      await this.prisma.device.upsert({
        where: { id: query.deviceId },
        create: { id: query.deviceId, userId, lastCursor: pull.cursor, lastSyncAt: new Date() },
        update: { userId, lastCursor: pull.cursor, lastSyncAt: new Date() },
      });
    }
    return {
      changes: pull.changes,
      cursor: pull.cursor,
      hasMore: pull.hasMore,
      serverTime: new Date().toISOString(),
    };
  }

  // --- change feed -----------------------------------------------------------

  private async pullChanges(
    db: Tx,
    userId: string,
    deviceId: string | null,
    cursorRaw: string | null,
    limit: number,
  ): Promise<{ changes: SyncServerChange[]; cursor: string; hasMore: boolean }> {
    const changes: SyncServerChange[] = [];

    // A fresh device (cursor null) gets the shared system categories first:
    // they have no per-user ChangeLog rows to drain.
    if (cursorRaw === null) {
      changes.push(...(await this.systemCategoryChanges(db)));
    }

    const rows = await db.changeLog.findMany({
      where: { userId, id: { gt: BigInt(cursorRaw ?? '0') } },
      orderBy: { id: 'asc' },
      take: limit,
    });

    for (const row of rows) {
      // Never echo a device's own writes back to it.
      if (deviceId !== null && row.deviceId === deviceId) continue;
      const change = await this.buildChange(db, row.entityType, row.entityId);
      if (change) changes.push(change);
    }

    // The cursor advances past every examined row — including own-device rows
    // that were filtered out — so a page of own writes cannot stall the pull.
    const cursor =
      rows.length > 0 ? rows[rows.length - 1]!.id.toString() : (cursorRaw ?? '0');
    return { changes, cursor, hasMore: rows.length === limit };
  }

  private async systemCategoryChanges(db: Tx): Promise<SyncServerChange[]> {
    const categories = await db.category.findMany({
      where: { isSystem: true },
      orderBy: [{ name: 'asc' }],
    });
    return categories.map((category) => ({
      entityId: category.id,
      entityType: 'CATEGORY' as const,
      operation: category.deletedAt ? ('DELETE' as const) : ('UPSERT' as const),
      version: category.version,
      updatedAt: category.updatedAt.toISOString(),
      payload: syncCategoryPayload(category),
    }));
  }

  /**
   * Builds the *current* state of an entity announced by a ChangeLog row.
   * Older rows for the same entity re-send the latest state — applying them in
   * order converges on exactly the server's version, which is what the client
   * stores for `baseVersion`.
   */
  private async buildChange(
    db: Tx,
    entityType: 'TRANSACTION' | 'CATEGORY',
    entityId: string,
  ): Promise<SyncServerChange | null> {
    if (entityType === 'TRANSACTION') {
      const entity = await db.transaction.findUnique({ where: { id: entityId } });
      if (!entity) return null;
      return {
        entityId: entity.id,
        entityType: 'TRANSACTION',
        operation: entity.deletedAt ? 'DELETE' : 'UPSERT',
        version: entity.version,
        updatedAt: entity.updatedAt.toISOString(),
        payload: toTransaction(entity) as unknown as Record<string, unknown>,
      };
    }
    const entity = await db.category.findUnique({ where: { id: entityId } });
    if (!entity) return null;
    return {
      entityId: entity.id,
      entityType: 'CATEGORY',
      operation: entity.deletedAt ? 'DELETE' : 'UPSERT',
      version: entity.version,
      updatedAt: entity.updatedAt.toISOString(),
      payload: syncCategoryPayload(entity),
    };
  }

  // --- operation application -------------------------------------------------

  private async applyOperation(
    tx: Tx,
    userId: string,
    deviceId: string,
    op: SyncOperationInputDto,
  ): Promise<SyncOperationResult> {
    // Ledger first: if this operationId was already received, answer DUPLICATE
    // and do no other work — the replay must not write a second time.
    const existing = await tx.syncOperation.findUnique({
      where: { userId_operationId: { userId, operationId: op.operationId } },
      select: { id: true },
    });
    if (existing) return finished(op, 'DUPLICATE');

    let result: SyncOperationResult;
    try {
      result =
        op.entityType === 'TRANSACTION'
          ? await this.applyTransaction(tx, userId, deviceId, op)
          : await this.applyCategory(tx, userId, deviceId, op);
    } catch (error) {
      const reason = rejectionReason(error);
      // Non-domain failures (database, bug) abort the whole batch: everything
      // rolls back and the client retries with the same operationIds.
      if (reason === null) throw error;
      result = rejected(op, reason);
    }

    // Ledger row carries the final status. It is written in the same
    // transaction as the apply, so either both exist or neither does; a later
    // replay sees the committed row and answers DUPLICATE from the pre-check.
    await tx.syncOperation.create({
      data: {
        operationId: op.operationId,
        userId,
        deviceId,
        entityType: op.entityType,
        entityId: op.entityId,
        operation: op.operation,
        status: result.status,
        reason: result.reason ?? null,
        clientTimestamp: new Date(op.timestamp),
        payload: op.payload as Prisma.InputJsonValue,
      },
    });
    return result;
  }

  private async applyTransaction(
    tx: Tx,
    userId: string,
    deviceId: string,
    op: SyncOperationInputDto,
  ): Promise<SyncOperationResult> {
    if (op.operation === 'DELETE') return this.deleteTransaction(tx, userId, deviceId, op);

    const payload = op.payload as {
      clientId?: string;
      deviceId?: string | null;
      type: 'INCOME' | 'EXPENSE';
      amount: string;
      currency?: string;
      categoryId: string;
      title: string;
      description?: string | null;
      transactionDate: string;
    };

    if (op.operation === 'CREATE') {
      const { transaction, created } = await this.transactions.create(
        userId,
        {
          clientId: payload.clientId ?? op.entityId,
          deviceId: payload.deviceId ?? deviceId,
          type: payload.type,
          amount: payload.amount,
          ...(payload.currency !== undefined && { currency: payload.currency }),
          categoryId: payload.categoryId,
          title: payload.title,
          description: payload.description ?? null,
          transactionDate: payload.transactionDate,
        },
        tx,
      );
      // The change feed is announced by TransactionsService.create itself —
      // with the originating device, so this device never receives it back.
      return finished(op, created ? 'APPLIED' : 'DUPLICATE', transaction);
    }

    // UPDATE --------------------------------------------------------------
    const row = await tx.transaction.findFirst({
      where: { userId, clientId: op.entityId },
    });
    if (!row) return rejected(op, 'transaction_not_found');
    // Server tombstone wins: an edit must not resurrect a deleted row.
    if (row.deletedAt) return finished(op, 'CONFLICT', toTransaction(row));

    if (payload.categoryId) {
      const category = await tx.category.findFirst({
        where: {
          id: payload.categoryId,
          deletedAt: null,
          OR: [{ isSystem: true, userId: null }, { userId }],
        },
        select: { id: true },
      });
      if (!category) return rejected(op, 'category_not_found');
    }

    const stale =
      op.baseVersion !== undefined && op.baseVersion !== row.version;

    const updated = await tx.transaction.update({
      where: { id: row.id },
      data: {
        type: payload.type,
        amount: payload.amount,
        ...(payload.currency !== undefined && { currency: payload.currency }),
        categoryId: payload.categoryId,
        title: payload.title,
        description: payload.description ?? null,
        transactionDate: `${payload.transactionDate}T00:00:00.000Z`,
        version: { increment: 1 },
      },
    });
    await recordChange(tx, {
      userId,
      deviceId,
      entityType: 'TRANSACTION',
      entityId: updated.id,
      kind: 'UPSERT',
      version: updated.version,
    });
    return finished(
      op,
      stale ? 'CONFLICT' : 'APPLIED',
      toTransaction(updated),
      stale ? 'stale_version' : undefined,
    );
  }

  private async deleteTransaction(
    tx: Tx,
    userId: string,
    deviceId: string,
    op: SyncOperationInputDto,
  ): Promise<SyncOperationResult> {
    const row = await tx.transaction.findFirst({
      where: { userId, clientId: op.entityId },
    });
    // Deleting a row the server never saw (its CREATE was rejected) is a
    // no-op — the client's local row can go either way.
    if (!row) return finished(op, 'APPLIED');
    if (row.deletedAt) return finished(op, 'APPLIED', toTransaction(row));

    const deleted = await tx.transaction.update({
      where: { id: row.id },
      data: { deletedAt: new Date(), version: { increment: 1 } },
    });
    await recordChange(tx, {
      userId,
      deviceId,
      entityType: 'TRANSACTION',
      entityId: deleted.id,
      kind: 'DELETE',
      version: deleted.version,
    });
    return finished(op, 'APPLIED', toTransaction(deleted));
  }

  private async applyCategory(
    tx: Tx,
    userId: string,
    deviceId: string,
    op: SyncOperationInputDto,
  ): Promise<SyncOperationResult> {
    if (op.operation === 'DELETE') return this.deleteCategory(tx, userId, deviceId, op);

    const payload = op.payload as {
      name: string;
      icon?: string | null;
      color?: string | null;
      suggestedType?: 'INCOME' | 'EXPENSE';
    };

    if (op.operation === 'CREATE') {
      const existing = await tx.category.findUnique({ where: { id: op.entityId } });
      if (existing) return finished(op, 'DUPLICATE', syncCategoryPayload(existing));
      const named = await tx.category.findFirst({
        where: { userId, name: payload.name },
      });
      // The (userId, name) unique constraint would reject this — report it as
      // a domain rejection instead of poisoning the batch with a P2002.
      if (named) return rejected(op, 'name_conflict');
      const created = await tx.category.create({
        data: {
          // The client generated this id while offline; adopting it keeps
          // local foreign keys (transactions.categoryId) stable across sync.
          id: op.entityId,
          userId,
          name: payload.name,
          kind: 'USER',
          isSystem: false,
          icon: payload.icon ?? null,
          color: payload.color ?? null,
          suggestedType: payload.suggestedType ?? 'EXPENSE',
        },
      });
      await recordChange(tx, {
        userId,
        deviceId,
        entityType: 'CATEGORY',
        entityId: created.id,
        kind: 'UPSERT',
        version: created.version,
      });
      return finished(op, 'APPLIED', syncCategoryPayload(created));
    }

    // UPDATE --------------------------------------------------------------
    const row = await tx.category.findUnique({ where: { id: op.entityId } });
    if (!row || (row.userId !== null && row.userId !== userId)) {
      return rejected(op, 'category_not_found');
    }
    if (row.isSystem) return rejected(op, 'system_category');
    if (row.deletedAt) return finished(op, 'CONFLICT', syncCategoryPayload(row));

    if (payload.name !== undefined && payload.name !== row.name) {
      const named = await tx.category.findFirst({
        where: { userId, name: payload.name, NOT: { id: row.id } },
      });
      if (named) return rejected(op, 'name_conflict');
    }

    const stale = op.baseVersion !== undefined && op.baseVersion !== row.version;
    const updated = await tx.category.update({
      where: { id: row.id },
      data: {
        ...(payload.name !== undefined && { name: payload.name }),
        ...(payload.icon !== undefined && { icon: payload.icon }),
        ...(payload.color !== undefined && { color: payload.color }),
        ...(payload.suggestedType !== undefined && { suggestedType: payload.suggestedType }),
        version: { increment: 1 },
      },
    });
    await recordChange(tx, {
      userId,
      deviceId,
      entityType: 'CATEGORY',
      entityId: updated.id,
      kind: 'UPSERT',
      version: updated.version,
    });
    return finished(
      op,
      stale ? 'CONFLICT' : 'APPLIED',
      syncCategoryPayload(updated),
      stale ? 'stale_version' : undefined,
    );
  }

  private async deleteCategory(
    tx: Tx,
    userId: string,
    deviceId: string,
    op: SyncOperationInputDto,
  ): Promise<SyncOperationResult> {
    const row = await tx.category.findUnique({ where: { id: op.entityId } });
    if (!row || (row.userId !== null && row.userId !== userId)) {
      // Nothing to delete — idempotent no-op (the client drops its local row).
      return finished(op, 'APPLIED');
    }
    if (row.isSystem) return rejected(op, 'system_category');
    if (row.deletedAt) return finished(op, 'APPLIED', syncCategoryPayload(row));

    const inUse = await tx.transaction.count({
      where: { userId, categoryId: row.id, deletedAt: null },
    });
    if (inUse > 0) return rejected(op, 'category_in_use');

    const deleted = await tx.category.update({
      where: { id: row.id },
      data: { deletedAt: new Date(), version: { increment: 1 } },
    });
    await recordChange(tx, {
      userId,
      deviceId,
      entityType: 'CATEGORY',
      entityId: deleted.id,
      kind: 'DELETE',
      version: deleted.version,
    });
    return finished(op, 'APPLIED', syncCategoryPayload(deleted));
  }
}
