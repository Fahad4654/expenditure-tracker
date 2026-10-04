import { HttpException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CategoriesService } from '../src/categories/categories.service';
import { TransactionsService } from '../src/transactions/transactions.service';
import type { UsersService } from '../src/users/users.service';

const NOW = new Date('2026-01-01T00:00:00.000Z');

type Spy = ReturnType<typeof vi.fn>;

interface CategoryMock {
  findMany: Spy;
  findUnique: Spy;
  create: Spy;
  update: Spy;
}

interface TransactionMock {
  findUnique: Spy;
  findFirst: Spy;
  findMany: Spy;
  create: Spy;
  updateMany: Spy;
  count: Spy;
}

function uniqueViolation(): never {
  throw new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: '6.19.3',
  });
}

async function expectRejection(promise: Promise<unknown>, status: number, code: string) {
  const error = await promise.then(
    () => null,
    (caught: unknown) => caught as HttpException,
  );
  expect(error, 'expected the operation to reject').toBeInstanceOf(HttpException);
  expect(error!.getStatus()).toBe(status);
  expect(error!.getResponse()).toMatchObject({ code });
  return error!;
}

function systemCategory() {
  return {
    id: 'sys-1',
    userId: null,
    name: 'Food',
    kind: 'SYSTEM',
    icon: null,
    color: '#EF4444',
    isSystem: true,
    suggestedType: 'EXPENSE',
    deletedAt: null,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function ownCategory(overrides: Record<string, unknown> = {}) {
  return {
    id: 'own-1',
    version: 1,
    userId: 'user-1',
    name: 'Coffee',
    kind: 'USER',
    icon: 'cup',
    color: '#A55EEA',
    isSystem: false,
    suggestedType: 'EXPENSE',
    deletedAt: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function transactionRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: 'tx-1',
    clientId: 'client-1',
    deviceId: null,
    userId: 'user-1',
    type: 'EXPENSE',
    amount: { toString: () => '125.50' },
    currency: 'BDT',
    categoryId: 'own-1',
    title: 'Lunch',
    description: null,
    noteId: null,
    transactionDate: new Date('2026-09-30T00:00:00.000Z'),
    version: 1,
    createdAt: NOW,
    updatedAt: NOW,
    deletedAt: null,
    ...overrides,
  };
}

describe('CategoriesService', () => {
  let prisma: {
    category: CategoryMock;
    transaction: { count: Spy };
    $transaction: Spy;
    changeLog: { create: Spy };
  };
  let service: CategoriesService;

  beforeEach(() => {
    prisma = {
      category: {
        findMany: vi.fn(),
        findUnique: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
      },
      transaction: { count: vi.fn() },
      $transaction: vi.fn(),
      changeLog: { create: vi.fn() },
    };
    prisma.$transaction.mockImplementation(async (fn: unknown) =>
      typeof fn === 'function' ? fn(prisma) : fn,
    );
    service = new CategoriesService(prisma as never);
  });

  it('lists system categories together with the caller’s own', async () => {
    prisma.category.findMany.mockResolvedValue([systemCategory(), ownCategory()]);

    const list = await service.list('user-1');

    expect(list.map((c) => c.name)).toEqual(['Food', 'Coffee']);
    expect(list[0]).toMatchObject({ isSystem: true, kind: 'SYSTEM' });
    expect(prisma.category.findMany.mock.calls[0]![0].where.OR).toEqual([
      { isSystem: true, userId: null },
      { userId: 'user-1' },
    ]);
  });

  it('maps a duplicate name to 409 rather than leaking Prisma', async () => {
    prisma.category.create.mockImplementation(uniqueViolation);

    await expectRejection(service.create('user-1', { name: 'Coffee' } as never), 409, 'CONFLICT');
  });

  it('marks new categories as USER-owned', async () => {
    prisma.category.create.mockResolvedValue(ownCategory());

    await service.create('user-1', { name: 'Coffee', suggestedType: 'EXPENSE' } as never);

    expect(prisma.category.create.mock.calls[0]![0].data).toMatchObject({
      userId: 'user-1',
      kind: 'USER',
      isSystem: false,
    });
  });

  it('refuses to mutate a system category', async () => {
    prisma.category.findUnique.mockResolvedValue(systemCategory());

    await expectRejection(
      service.update('user-1', 'sys-1', { name: 'Hacked' } as never),
      403,
      'FORBIDDEN',
    );
    expect(prisma.category.update).not.toHaveBeenCalled();
  });

  it('reports another user’s category as missing', async () => {
    prisma.category.findUnique.mockResolvedValue(ownCategory({ userId: 'user-2' }));

    await expectRejection(
      service.update('user-1', 'own-1', { name: 'Stolen' } as never),
      404,
      'NOT_FOUND',
    );
  });

  it('reports a tombstoned category as missing', async () => {
    prisma.category.findUnique.mockResolvedValue(ownCategory({ deletedAt: NOW }));

    await expectRejection(service.remove('user-1', 'own-1'), 404, 'NOT_FOUND');
    expect(prisma.category.update).not.toHaveBeenCalled();
  });

  it('blocks deletion while the category still has transactions', async () => {
    prisma.category.findUnique.mockResolvedValue(ownCategory());
    prisma.transaction.count.mockResolvedValue(3);

    await expectRejection(service.remove('user-1', 'own-1'), 409, 'CONFLICT');
    expect(prisma.category.update).not.toHaveBeenCalled();
  });

  it('soft deletes an unused category', async () => {
    prisma.category.findUnique.mockResolvedValue(ownCategory());
    prisma.transaction.count.mockResolvedValue(0);
    prisma.category.update.mockResolvedValue(ownCategory({ deletedAt: NOW }));

    const deleted = await service.remove('user-1', 'own-1');

    expect(deleted.id).toBe('own-1');
    expect(prisma.category.update.mock.calls[0]![0].data.deletedAt).toBeInstanceOf(Date);
  });

  it('bumps the version and announces category mutations in the change feed', async () => {
    prisma.category.create.mockResolvedValue(ownCategory({ version: 1 }));

    await service.create('user-1', { name: 'Coffee', suggestedType: 'EXPENSE' } as never);

    expect(prisma.changeLog.create).toHaveBeenLastCalledWith({
      data: {
        userId: 'user-1',
        deviceId: null,
        entityType: 'CATEGORY',
        entityId: 'own-1',
        kind: 'UPSERT',
        version: 1,
      },
    });

    prisma.category.findUnique.mockResolvedValue(ownCategory());
    prisma.transaction.count.mockResolvedValue(0);
    prisma.category.update.mockResolvedValue(ownCategory({ deletedAt: NOW, version: 2 }));

    await service.remove('user-1', 'own-1');

    expect(prisma.category.update.mock.calls[0]![0].data.version).toEqual({ increment: 1 });
    expect(prisma.changeLog.create).toHaveBeenLastCalledWith({
      data: {
        userId: 'user-1',
        deviceId: null,
        entityType: 'CATEGORY',
        entityId: 'own-1',
        kind: 'DELETE',
        version: 2,
      },
    });
  });
});


describe('TransactionsService', () => {
  let prisma: {
    transaction: TransactionMock;
    category: { findFirst: Spy };
    note: { findFirst: Spy };
    $transaction: Spy;
    changeLog: { create: Spy };
  };
  let users: { financeDefaults: Spy };
  let service: TransactionsService;

  beforeEach(() => {
    prisma = {
      transaction: {
        findUnique: vi.fn(),
        findFirst: vi.fn(),
        findMany: vi.fn(),
        create: vi.fn(),
        updateMany: vi.fn(),
        count: vi.fn(),
      },
      category: { findFirst: vi.fn() },
      note: { findFirst: vi.fn() },
      $transaction: vi.fn(),
      changeLog: { create: vi.fn() },
    };
    prisma.$transaction.mockImplementation(async (fn: unknown) =>
      typeof fn === 'function' ? fn(prisma) : fn,
    );
    users = {
      financeDefaults: vi.fn().mockResolvedValue({
        timezone: 'Asia/Dhaka',
        defaultCurrency: 'BDT',
      }),
    };
    service = new TransactionsService(prisma as never, users as unknown as UsersService);
  });

  it('replays a create with the same clientId instead of duplicating the row', async () => {
    prisma.transaction.findUnique.mockResolvedValue(transactionRecord());

    const result = await service.create('user-1', {
      clientId: 'client-1',
      type: 'EXPENSE',
      amount: '125.50',
      categoryId: 'own-1',
      title: 'Lunch',
      transactionDate: '2026-09-30',
    } as never);

    expect(result.created).toBe(false);
    expect(result.transaction).toMatchObject({ id: 'tx-1', amount: '125.50' });
    expect(prisma.transaction.create).not.toHaveBeenCalled();
  });

  it('requires a category the caller can actually see', async () => {
    prisma.category.findFirst.mockResolvedValue(null);

    await expectRejection(
      service.create('user-1', {
        type: 'EXPENSE',
        amount: '10.00',
        categoryId: 'someone-elses',
        title: 'x',
        transactionDate: '2026-09-30',
      } as never),
      404,
      'NOT_FOUND',
    );
    expect(prisma.transaction.create).not.toHaveBeenCalled();
  });

  it('scopes the category lookup to system-or-own', async () => {
    prisma.category.findFirst.mockResolvedValue({ id: 'own-1' });
    prisma.transaction.create.mockResolvedValue(transactionRecord());

    await service.create('user-1', {
      type: 'EXPENSE',
      amount: '125.50',
      categoryId: 'own-1',
      title: 'Lunch',
      transactionDate: '2026-09-30',
    } as never);

    expect(prisma.category.findFirst.mock.calls[0]![0].where.OR).toEqual([
      { isSystem: true, userId: null },
      { userId: 'user-1' },
    ]);
  });

  it('loses the race on clientId gracefully and returns the winner', async () => {
    prisma.category.findFirst.mockResolvedValue({ id: 'own-1' });
    prisma.transaction.create.mockImplementation(uniqueViolation);
    prisma.transaction.findUnique.mockResolvedValue(transactionRecord());

    const result = await service.create('user-1', {
      clientId: 'client-1',
      type: 'EXPENSE',
      amount: '125.50',
      categoryId: 'own-1',
      title: 'Lunch',
      transactionDate: '2026-09-30',
    } as never);

    expect(result.created).toBe(false);
    expect(result.transaction.id).toBe('tx-1');
  });

  it('reports another user’s transaction as missing', async () => {
    prisma.transaction.findFirst.mockResolvedValue(null);

    await expectRejection(service.get('user-1', 'someone-elses'), 404, 'NOT_FOUND');
  });

  it('treats a stale baseVersion as a conflict, not a silent overwrite', async () => {
    prisma.category.findFirst.mockResolvedValue({ id: 'own-1' });
    prisma.transaction.updateMany.mockResolvedValue({ count: 0 });
    prisma.transaction.findFirst.mockResolvedValue({ version: 4 });

    const error = await expectRejection(
      service.update('user-1', 'tx-1', { title: 'New', baseVersion: 1 } as never),
      409,
      'CONFLICT',
    );
    expect(error.getResponse()).toMatchObject({
      message: expect.stringContaining('expected version 1, found 4'),
    });
    expect(prisma.transaction.updateMany.mock.calls[0]![0].where).toMatchObject({
      id: 'tx-1',
      userId: 'user-1',
      version: 1,
    });
  });

  it('reports a vanished row during update as 404', async () => {
    prisma.category.findFirst.mockResolvedValue({ id: 'own-1' });
    prisma.transaction.updateMany.mockResolvedValue({ count: 0 });
    prisma.transaction.findFirst.mockResolvedValue(null);

    await expectRejection(
      service.update('user-1', 'tx-1', { title: 'New', baseVersion: 1 } as never),
      404,
      'NOT_FOUND',
    );
  });

  it('bumps the version on a successful update', async () => {
    prisma.category.findFirst.mockResolvedValue({ id: 'own-1' });
    prisma.transaction.updateMany.mockResolvedValue({ count: 1 });
    prisma.transaction.findFirst.mockResolvedValue(transactionRecord({ version: 2 }));

    const updated = await service.update('user-1', 'tx-1', {
      baseVersion: 1,
      title: 'New',
    } as never);

    expect(updated.version).toBe(2);
    expect(prisma.transaction.updateMany.mock.calls[0]![0].data).toMatchObject({
      title: 'New',
      version: { increment: 1 },
    });
  });

  it('tombstones rather than hard-deletes', async () => {
    prisma.transaction.updateMany.mockResolvedValue({ count: 1 });
    const tombstoned = transactionRecord({ version: 2, deletedAt: NOW });
    prisma.transaction.findFirst.mockResolvedValue(tombstoned);

    const deleted = await service.remove('user-1', 'tx-1');

    expect(deleted.deletedAt).toBe(NOW.toISOString());
    expect(prisma.transaction.updateMany.mock.calls[0]![0].data.deletedAt).toBeInstanceOf(Date);
  });

  it('rejects deleting a row that is not visible to the caller', async () => {
    prisma.transaction.updateMany.mockResolvedValue({ count: 0 });

    await expectRejection(service.remove('user-1', 'someone-elses'), 404, 'NOT_FOUND');
  });

  it('uses the caller’s timezone defaults and UTC-midnight bounds when listing', async () => {
    prisma.$transaction.mockResolvedValue([0, []]);

    await service.list('user-1', {
      page: 1,
      limit: 20,
      sort: 'transactionDate',
      order: 'desc',
      from: '2026-09-01',
      to: '2026-09-30',
    } as never);

    expect(users.financeDefaults).toHaveBeenCalledWith('user-1');
    const where = prisma.transaction.count.mock.calls[0]![0].where;
    expect(where).toMatchObject({
      userId: 'user-1',
      deletedAt: null,
      transactionDate: {
        gte: '2026-09-01T00:00:00.000Z',
        lte: '2026-09-30T00:00:00.000Z',
      },
    });
  });

  it('maps an empty page to a zero totalPages rather than NaN', async () => {
    prisma.$transaction.mockResolvedValue([0, []]);

    const page = await service.list('user-1', {
      page: 3,
      limit: 20,
      sort: 'transactionDate',
      order: 'desc',
    } as never);

    expect(page.items).toEqual([]);
    expect(page.meta).toEqual({ page: 3, limit: 20, total: 0, totalPages: 0 });
  });

  it('announces a create in the change feed with the originating device', async () => {
    prisma.category.findFirst.mockResolvedValue({ id: 'own-1' });
    prisma.transaction.create.mockResolvedValue(transactionRecord({ deviceId: 'device-1' }));

    await service.create('user-1', {
      clientId: 'client-1',
      deviceId: 'device-1',
      type: 'EXPENSE',
      amount: '125.50',
      categoryId: 'own-1',
      title: 'Lunch',
      transactionDate: '2026-09-30',
    } as never);

    expect(prisma.changeLog.create).toHaveBeenCalledWith({
      data: {
        userId: 'user-1',
        deviceId: 'device-1',
        entityType: 'TRANSACTION',
        entityId: 'tx-1',
        kind: 'UPSERT',
        version: 1,
      },
    });
  });

  it('records an update in the change feed after the version bump', async () => {
    prisma.category.findFirst.mockResolvedValue({ id: 'own-1' });
    prisma.transaction.updateMany.mockResolvedValue({ count: 1 });
    prisma.transaction.findFirst.mockResolvedValue(transactionRecord({ version: 2 }));

    await service.update('user-1', 'tx-1', { baseVersion: 1, title: 'New' } as never);

    expect(prisma.changeLog.create).toHaveBeenCalledWith({
      data: {
        userId: 'user-1',
        deviceId: null,
        entityType: 'TRANSACTION',
        entityId: 'tx-1',
        kind: 'UPSERT',
        version: 2,
      },
    });
  });

  it('announces a tombstone delete in the change feed', async () => {
    prisma.transaction.updateMany.mockResolvedValue({ count: 1 });
    prisma.transaction.findFirst.mockResolvedValue(
      transactionRecord({ version: 2, deletedAt: NOW }),
    );

    await service.remove('user-1', 'tx-1');

    expect(prisma.changeLog.create).toHaveBeenCalledWith({
      data: {
        userId: 'user-1',
        deviceId: null,
        entityType: 'TRANSACTION',
        entityId: 'tx-1',
        kind: 'DELETE',
        version: 2,
      },
    });
  });

  it('stores a tagged note on create after verifying the caller owns it', async () => {
    prisma.category.findFirst.mockResolvedValue({ id: 'own-1' });
    prisma.note.findFirst.mockResolvedValue({ id: 'note-1' });
    prisma.transaction.create.mockResolvedValue(transactionRecord({ noteId: 'note-1' }));

    const result = await service.create('user-1', {
      clientId: 'client-1',
      type: 'EXPENSE',
      amount: '125.50',
      categoryId: 'own-1',
      title: 'Lunch',
      noteId: 'note-1',
      transactionDate: '2026-09-30',
    } as never);

    expect(prisma.note.findFirst.mock.calls[0]![0].where).toMatchObject({
      id: 'note-1',
      userId: 'user-1',
      deletedAt: null,
    });
    expect(prisma.transaction.create.mock.calls[0]![0].data.noteId).toBe('note-1');
    expect(result.transaction.noteId).toBe('note-1');
  });

  it('rejects tagging a note the caller does not own', async () => {
    prisma.category.findFirst.mockResolvedValue({ id: 'own-1' });
    prisma.note.findFirst.mockResolvedValue(null);

    await expectRejection(
      service.create('user-1', {
        type: 'EXPENSE',
        amount: '10.00',
        categoryId: 'own-1',
        title: 'x',
        noteId: 'someone-elses-note',
        transactionDate: '2026-09-30',
      } as never),
      404,
      'NOT_FOUND',
    );
    expect(prisma.transaction.create).not.toHaveBeenCalled();
  });

  it('validates a tagged note on update before touching the row', async () => {
    prisma.category.findFirst.mockResolvedValue({ id: 'own-1' });
    prisma.note.findFirst.mockResolvedValue(null);

    await expectRejection(
      service.update('user-1', 'tx-1', { noteId: 'someone-elses-note' } as never),
      404,
      'NOT_FOUND',
    );
    expect(prisma.transaction.updateMany).not.toHaveBeenCalled();
  });

  it('clears the tag when noteId is sent as null without a note lookup', async () => {
    prisma.category.findFirst.mockResolvedValue({ id: 'own-1' });
    prisma.transaction.updateMany.mockResolvedValue({ count: 1 });
    prisma.transaction.findFirst.mockResolvedValue(transactionRecord({ version: 2 }));

    await service.update('user-1', 'tx-1', { baseVersion: 1, noteId: null } as never);

    expect(prisma.note.findFirst).not.toHaveBeenCalled();
    expect(prisma.transaction.updateMany.mock.calls[0]![0].data).toMatchObject({
      noteId: null,
    });
  });
});
