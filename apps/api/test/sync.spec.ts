import { HttpStatus } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { errors } from '../src/common/http/api-error';
import { SyncService } from '../src/sync/sync.service';

const NOW = new Date('2026-10-01T00:00:00.000Z');

type Spy = ReturnType<typeof vi.fn>;

interface PrismaMock {
  syncOperation: { findUnique: Spy; create: Spy };
  transaction: { findFirst: Spy; findUnique: Spy; update: Spy; count: Spy };
  category: { findFirst: Spy; findUnique: Spy; findMany: Spy; create: Spy; update: Spy };
  changeLog: { findMany: Spy; create: Spy };
  device: { upsert: Spy };
  $transaction: Spy;
}

function buildPrisma(): PrismaMock {
  const prisma: PrismaMock = {
    syncOperation: { findUnique: vi.fn(), create: vi.fn() },
    transaction: { findFirst: vi.fn(), findUnique: vi.fn(), update: vi.fn(), count: vi.fn() },
    category: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    changeLog: { findMany: vi.fn(), create: vi.fn() },
    device: { upsert: vi.fn() },
    $transaction: vi.fn(),
  };
  prisma.$transaction.mockImplementation(async (fn: unknown) =>
    typeof fn === 'function' ? fn(prisma) : fn,
  );
  return prisma;
}

function prismaTransaction(overrides: Record<string, unknown> = {}) {
  return {
    id: 'tx-server-1',
    clientId: 'client-1',
    deviceId: null,
    userId: 'user-1',
    type: 'EXPENSE',
    amount: { toString: () => '250.00' },
    currency: 'BDT',
    categoryId: 'cat-1',
    title: 'Lunch',
    description: null,
    transactionDate: new Date('2026-10-01T00:00:00.000Z'),
    version: 1,
    createdAt: NOW,
    updatedAt: NOW,
    deletedAt: null,
    ...overrides,
  };
}

function prismaCategory(overrides: Record<string, unknown> = {}) {
  return {
    id: 'cat-server-1',
    userId: 'user-1',
    name: 'Coffee',
    kind: 'USER',
    icon: null,
    color: '#A55EEA',
    isSystem: false,
    suggestedType: 'EXPENSE',
    version: 1,
    createdAt: NOW,
    updatedAt: NOW,
    deletedAt: null,
    ...overrides,
  };
}

function createOp(overrides: Record<string, unknown> = {}) {
  return {
    operationId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    entityId: 'client-1',
    entityType: 'TRANSACTION',
    operation: 'CREATE',
    timestamp: '2026-10-01T09:15:00.000Z',
    payload: {
      clientId: 'client-1',
      deviceId: 'device-a',
      type: 'EXPENSE',
      amount: '250.00',
      currency: 'BDT',
      categoryId: 'cat-1',
      title: 'Lunch',
      description: null,
      transactionDate: '2026-10-01',
    },
    ...overrides,
  };
}

function pushDto(operations: unknown[], overrides: Record<string, unknown> = {}) {
  return {
    deviceId: 'device-a',
    cursor: null,
    operations,
    ...overrides,
  } as never;
}

describe('SyncService', () => {
  let prisma: PrismaMock;
  let transactions: { create: Spy };
  let service: SyncService;

  beforeEach(() => {
    prisma = buildPrisma();
    transactions = { create: vi.fn() };
    service = new SyncService(prisma as never, transactions as never);
    // Defaults for a pull with no changes and no system categories.
    prisma.changeLog.findMany.mockResolvedValue([]);
    prisma.category.findMany.mockResolvedValue([]);
  });

  describe('idempotency', () => {
    it('answers a replayed operationId from the ledger without applying', async () => {
      prisma.syncOperation.findUnique.mockResolvedValue({ id: 'led-1' });

      const response = await service.push('user-1', pushDto([createOp()]));

      expect(response.results).toEqual([
        expect.objectContaining({ operationId: createOp().operationId, status: 'DUPLICATE' }),
      ]);
      expect(transactions.create).not.toHaveBeenCalled();
      expect(prisma.syncOperation.create).not.toHaveBeenCalled();
    });

    it('records an applied create in the ledger with its final status', async () => {
      prisma.syncOperation.findUnique.mockResolvedValue(null);
      transactions.create.mockResolvedValue({
        transaction: { id: 'tx-server-1', version: 1 },
        created: true,
      });

      const response = await service.push('user-1', pushDto([createOp()]));

      expect(response.results[0]).toMatchObject({ status: 'APPLIED', entity: { version: 1 } });
      expect(prisma.syncOperation.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            operationId: createOp().operationId,
            status: 'APPLIED',
            deviceId: 'device-a',
          }),
        }),
      );
      expect(prisma.device.upsert).toHaveBeenCalled();
    });

    it('maps a domain failure from the service to REJECTED and keeps going', async () => {
      prisma.syncOperation.findUnique.mockResolvedValue(null);
      transactions.create
        .mockRejectedValueOnce(errors.notFound('Category not found'))
        .mockResolvedValueOnce({ transaction: { id: 'tx-2', version: 1 }, created: true });

      const second = createOp({ operationId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' });
      const response = await service.push('user-1', pushDto([createOp(), second]));

      expect(response.results[0]).toMatchObject({
        status: 'REJECTED',
        reason: 'category_not_found',
      });
      expect(response.results[1]).toMatchObject({ status: 'APPLIED' });
      expect(prisma.syncOperation.create).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({ data: expect.objectContaining({ status: 'REJECTED' }) }),
      );
    });
  });

  describe('transaction updates', () => {
    it('applies a stale update (incoming wins) but reports CONFLICT', async () => {
      prisma.syncOperation.findUnique.mockResolvedValue(null);
      prisma.transaction.findFirst.mockResolvedValue(prismaTransaction({ version: 3 }));
      prisma.category.findFirst.mockResolvedValue({ id: 'cat-1' });
      prisma.transaction.update.mockResolvedValue(prismaTransaction({ version: 4 }));

      const op = createOp({
        operation: 'UPDATE',
        baseVersion: 1,
        payload: {
          clientId: 'client-1',
          type: 'EXPENSE',
          amount: '300.00',
          currency: 'BDT',
          categoryId: 'cat-1',
          title: 'Lunch v2',
          description: null,
          transactionDate: '2026-10-01',
        },
      });
      const response = await service.push('user-1', pushDto([op]));

      expect(response.results[0]).toMatchObject({
        status: 'CONFLICT',
        reason: 'stale_version',
        entity: { version: 4 },
      });
      expect(prisma.transaction.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ version: { increment: 1 } }) }),
      );
      expect(prisma.changeLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ kind: 'UPSERT', version: 4, deviceId: 'device-a' }),
        }),
      );
    });

    it('lets the server tombstone win over a later update', async () => {
      prisma.syncOperation.findUnique.mockResolvedValue(null);
      prisma.transaction.findFirst.mockResolvedValue(
        prismaTransaction({ deletedAt: NOW, version: 2 }),
      );

      const op = createOp({ operation: 'UPDATE', baseVersion: 1 });
      const response = await service.push('user-1', pushDto([op]));

      expect(response.results[0]).toMatchObject({ status: 'CONFLICT' });
      expect(response.results[0]!.entity).toMatchObject({ deletedAt: NOW.toISOString() });
      expect(prisma.transaction.update).not.toHaveBeenCalled();
      expect(prisma.syncOperation.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'CONFLICT' }) }),
      );
    });

    it('treats deleting a row the server never saw as an idempotent no-op', async () => {
      prisma.syncOperation.findUnique.mockResolvedValue(null);
      prisma.transaction.findFirst.mockResolvedValue(null);

      const op = createOp({ operation: 'DELETE' });
      const response = await service.push('user-1', pushDto([op]));

      expect(response.results[0]).toMatchObject({ status: 'APPLIED' });
      expect(prisma.transaction.update).not.toHaveBeenCalled();
      expect(prisma.syncOperation.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'APPLIED' }) }),
      );
    });

    it('tombstones a delete and announces it in the change feed', async () => {
      prisma.syncOperation.findUnique.mockResolvedValue(null);
      prisma.transaction.findFirst.mockResolvedValue(prismaTransaction());
      prisma.transaction.update.mockResolvedValue(prismaTransaction({ version: 2, deletedAt: NOW }));

      const op = createOp({ operation: 'DELETE' });
      const response = await service.push('user-1', pushDto([op]));

      expect(response.results[0]).toMatchObject({ status: 'APPLIED' });
      expect(prisma.changeLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ kind: 'DELETE', version: 2 }),
        }),
      );
    });
  });

  describe('category operations', () => {
    it('rejects a create whose name is taken instead of hitting the unique constraint', async () => {
      prisma.syncOperation.findUnique.mockResolvedValue(null);
      prisma.category.findUnique.mockResolvedValue(null);
      prisma.category.findFirst.mockResolvedValue(prismaCategory({ id: 'cat-existing' }));

      const op = createOp({
        entityType: 'CATEGORY',
        entityId: 'cat-client-1',
        payload: { name: 'Coffee' },
      });
      const response = await service.push('user-1', pushDto([op]));

      expect(response.results[0]).toMatchObject({ status: 'REJECTED', reason: 'name_conflict' });
      expect(prisma.category.create).not.toHaveBeenCalled();
    });

    it('creates a category under the client-generated id', async () => {
      prisma.syncOperation.findUnique.mockResolvedValue(null);
      prisma.category.findUnique.mockResolvedValue(null);
      prisma.category.findFirst.mockResolvedValue(null);
      prisma.category.create.mockResolvedValue(prismaCategory({ id: 'cat-client-1' }));

      const op = createOp({
        entityType: 'CATEGORY',
        entityId: 'cat-client-1',
        payload: { name: 'Coffee', suggestedType: 'EXPENSE' },
      });
      const response = await service.push('user-1', pushDto([op]));

      expect(response.results[0]).toMatchObject({ status: 'APPLIED' });
      expect(prisma.category.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ id: 'cat-client-1', userId: 'user-1' }),
        }),
      );
    });

    it('refuses to touch system categories', async () => {
      prisma.syncOperation.findUnique.mockResolvedValue(null);
      prisma.category.findUnique.mockResolvedValue(prismaCategory({ isSystem: true, userId: null }));

      const op = createOp({
        entityType: 'CATEGORY',
        entityId: 'sys-cat',
        operation: 'DELETE',
      });
      const response = await service.push('user-1', pushDto([op]));

      expect(response.results[0]).toMatchObject({
        status: 'REJECTED',
        reason: 'system_category',
      });
    });

    it('rejects deleting a category that still has transactions', async () => {
      prisma.syncOperation.findUnique.mockResolvedValue(null);
      prisma.category.findUnique.mockResolvedValue(prismaCategory());
      prisma.transaction.count.mockResolvedValue(2);

      const op = createOp({ entityType: 'CATEGORY', entityId: 'cat-server-1', operation: 'DELETE' });
      const response = await service.push('user-1', pushDto([op]));

      expect(response.results[0]).toMatchObject({ status: 'REJECTED', reason: 'category_in_use' });
      expect(prisma.category.update).not.toHaveBeenCalled();
    });
  });

  describe('pull', () => {
    it('excludes the pulling device’s own writes but still advances the cursor', async () => {
      prisma.changeLog.findMany.mockResolvedValue([
        { id: BigInt(11), deviceId: 'device-a', entityType: 'TRANSACTION', entityId: 'tx-1', kind: 'UPSERT' },
        { id: BigInt(12), deviceId: 'device-b', entityType: 'TRANSACTION', entityId: 'tx-2', kind: 'UPSERT' },
      ]);
      prisma.transaction.findUnique.mockResolvedValue(prismaTransaction({ id: 'tx-2', clientId: 'client-2' }));

      const response = await service.pull('user-1', {
        cursor: '10',
        limit: 200,
        deviceId: 'device-a',
      } as never);

      expect(response.changes).toHaveLength(1);
      expect(response.changes[0]).toMatchObject({
        entityId: 'tx-2',
        operation: 'UPSERT',
        payload: expect.objectContaining({ clientId: 'client-2' }),
      });
      expect(response.cursor).toBe('12');
      expect(response.hasMore).toBe(false);
    });

    it('prepends system categories on a cursor-null pull and settles on cursor 0', async () => {
      prisma.category.findMany.mockResolvedValue([
        prismaCategory({ id: 'sys-1', userId: null, name: 'Food', isSystem: true }),
      ]);

      const response = await service.pull('user-1', {
        cursor: null,
        limit: 200,
        deviceId: 'device-a',
      } as never);

      expect(response.changes[0]).toMatchObject({
        entityId: 'sys-1',
        operation: 'UPSERT',
        payload: expect.objectContaining({ isSystem: true }),
      });
      expect(response.cursor).toBe('0');
      expect(response.hasMore).toBe(false);
    });

    it('reports hasMore when the page is full', async () => {
      prisma.changeLog.findMany.mockResolvedValue(
        Array.from({ length: 200 }, (_, i) => ({
          id: BigInt(i + 1),
          deviceId: 'device-b',
          entityType: 'TRANSACTION',
          entityId: `tx-${i}`,
          kind: 'UPSERT',
        })),
      );
      prisma.transaction.findUnique.mockResolvedValue(prismaTransaction());

      const response = await service.pull('user-1', {
        cursor: '0',
        limit: 200,
        deviceId: 'device-a',
      } as never);

      expect(response.hasMore).toBe(true);
      expect(response.cursor).toBe('200');
    });

    it('turns a tombstoned entity into a DELETE change', async () => {
      prisma.changeLog.findMany.mockResolvedValue([
        { id: BigInt(21), deviceId: 'device-b', entityType: 'TRANSACTION', entityId: 'tx-1', kind: 'UPSERT' },
      ]);
      prisma.transaction.findUnique.mockResolvedValue(
        prismaTransaction({ deletedAt: NOW, version: 5 }),
      );

      const response = await service.pull('user-1', {
        cursor: '20',
        limit: 200,
        deviceId: 'device-a',
      } as never);

      expect(response.changes[0]).toMatchObject({ operation: 'DELETE', version: 5 });
    });
  });

  it('serialises nothing from the batch when the transaction aborts', async () => {
    prisma.$transaction.mockImplementation(async (fn: (t: unknown) => Promise<unknown>) =>
      fn(prisma).then(
        (value) => value,
        (error: unknown) => {
          throw error;
        },
      ),
    );
    prisma.syncOperation.findUnique.mockResolvedValue(null);
    transactions.create.mockResolvedValue({ transaction: { id: 'tx-1' }, created: true });
    // Infrastructure failure (not a domain rejection): must abort the batch.
    prisma.syncOperation.create.mockImplementation(() => {
      throw new Error('connection lost');
    });

    await expect(service.push('user-1', pushDto([createOp()]))).rejects.toThrow('connection lost');
    expect(prisma.device.upsert).not.toHaveBeenCalled();
  });

  it('exposes the HTTP conflict status used by domain errors', () => {
    expect(errors.conflict('x').getStatus()).toBe(HttpStatus.CONFLICT);
  });
});
