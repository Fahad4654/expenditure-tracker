import { HttpException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NotesService } from '../src/notes/notes.service';
import { RemindersService } from '../src/reminders/reminders.service';

const NOW = new Date('2026-01-01T00:00:00.000Z');

type Spy = ReturnType<typeof vi.fn>;

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

function noteRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: 'note-1',
    userId: 'user-1',
    title: 'Groceries',
    content: 'milk, eggs',
    version: 1,
    deletedAt: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function reminderRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: 'rem-1',
    userId: 'user-1',
    title: 'Pay internet bill',
    details: null,
    dueDate: new Date('2026-10-05T00:00:00.000Z'),
    dueTime: null,
    completedAt: null,
    version: 1,
    deletedAt: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

interface NoteMock {
  findMany: Spy;
  findUnique: Spy;
  create: Spy;
  update: Spy;
}

interface ReminderMock {
  findMany: Spy;
  findUnique: Spy;
  create: Spy;
  update: Spy;
}

describe('NotesService', () => {
  let prisma: {
    note: NoteMock;
    transaction: { findMany: Spy; update: Spy };
    changeLog: { create: Spy };
    $transaction: Spy;
  };
  let service: NotesService;

  beforeEach(() => {
    prisma = {
      note: {
        findMany: vi.fn(),
        findUnique: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
      },
      transaction: { findMany: vi.fn(), update: vi.fn() },
      changeLog: { create: vi.fn() },
      $transaction: vi.fn(),
    };
    prisma.$transaction.mockImplementation(async (fn: unknown) =>
      typeof fn === 'function' ? fn(prisma) : fn,
    );
    service = new NotesService(prisma as never);
  });

  it('lists only the caller’s notes, newest first', async () => {
    prisma.note.findMany.mockResolvedValue([noteRecord()]);

    const list = await service.list('user-1');

    expect(list).toHaveLength(1);
    expect(prisma.note.findMany.mock.calls[0]![0]).toMatchObject({
      where: { userId: 'user-1', deletedAt: null },
      orderBy: { updatedAt: 'desc' },
    });
  });

  it('creates a note scoped to the caller with an empty body stored as null', async () => {
    prisma.note.create.mockResolvedValue(noteRecord({ content: null }));

    const created = await service.create('user-1', { title: 'Groceries' } as never);

    expect(prisma.note.create.mock.calls[0]![0].data).toMatchObject({
      userId: 'user-1',
      title: 'Groceries',
      content: null,
    });
    expect(created.id).toBe('note-1');
    expect(created.createdAt).toBe(NOW.toISOString());
  });

  it('reports another user’s note as missing', async () => {
    prisma.note.findUnique.mockResolvedValue(noteRecord({ userId: 'user-2' }));

    await expectRejection(
      service.update('user-1', 'note-1', { title: 'Stolen' } as never),
      404,
      'NOT_FOUND',
    );
    expect(prisma.note.update).not.toHaveBeenCalled();
  });

  it('reports a tombstoned note as missing', async () => {
    prisma.note.findUnique.mockResolvedValue(noteRecord({ deletedAt: NOW }));

    await expectRejection(service.remove('user-1', 'note-1'), 404, 'NOT_FOUND');
    expect(prisma.note.update).not.toHaveBeenCalled();
  });

  it('applies only the provided fields and bumps the version', async () => {
    prisma.note.findUnique.mockResolvedValue(noteRecord());
    prisma.note.update.mockResolvedValue(noteRecord({ title: 'Groceries list', version: 2 }));

    const updated = await service.update('user-1', 'note-1', { title: 'Groceries list' } as never);

    expect(prisma.note.update.mock.calls[0]![0].data).toMatchObject({
      title: 'Groceries list',
      version: { increment: 1 },
    });
    expect(prisma.note.update.mock.calls[0]![0].data).not.toHaveProperty('content');
    expect(updated.title).toBe('Groceries list');
  });

  it('tombstones rather than hard-deletes', async () => {
    prisma.note.findUnique.mockResolvedValue(noteRecord());
    prisma.note.update.mockResolvedValue(noteRecord({ deletedAt: NOW, version: 2 }));
    prisma.transaction.findMany.mockResolvedValue([]);

    const deleted = await service.remove('user-1', 'note-1');

    expect(prisma.note.update.mock.calls[0]![0].data.deletedAt).toBeInstanceOf(Date);
    expect(prisma.note.update.mock.calls[0]![0].data.version).toEqual({ increment: 1 });
    expect(deleted.id).toBe('note-1');
  });

  it('includes the transactions a note is tagged on, newest first', async () => {
    prisma.note.findMany.mockResolvedValue([
      noteRecord({
        transactions: [
          { id: 'tx-old', title: 'Rent', transactionDate: new Date('2026-09-01T00:00:00.000Z') },
          { id: 'tx-new', title: 'Groceries', transactionDate: new Date('2026-10-02T00:00:00.000Z') },
        ],
      }),
    ]);

    const list = await service.list('user-1');

    const include = prisma.note.findMany.mock.calls[0]![0].include;
    expect(include.transactions.where).toMatchObject({ userId: 'user-1', deletedAt: null });
    expect(list[0]!.transactions).toEqual([
      { id: 'tx-new', title: 'Groceries', transactionDate: '2026-10-02' },
      { id: 'tx-old', title: 'Rent', transactionDate: '2026-09-01' },
    ]);
  });

  it('tags the selected transactions when a note is created with transactionIds', async () => {
    prisma.note.create.mockResolvedValue(noteRecord());
    prisma.transaction.findMany
      .mockResolvedValueOnce([{ id: 'tx-1' }, { id: 'tx-2' }]) // owned & live
      .mockResolvedValueOnce([]); // currently tagged with this new note
    prisma.transaction.update.mockImplementation(async (args: { where: { id: string } }) => ({
      id: args.where.id,
      version: 2,
    }));
    prisma.note.findUnique.mockImplementation(
      async (args: { include?: unknown }) =>
        args.include
          ? noteRecord({
              transactions: [
                { id: 'tx-2', title: 'B', transactionDate: NOW },
                { id: 'tx-1', title: 'A', transactionDate: NOW },
              ],
            })
          : noteRecord(),
    );

    const created = await service.create('user-1', {
      title: 'Groceries',
      transactionIds: ['tx-1', 'tx-2'],
    } as never);

    expect(prisma.transaction.update).toHaveBeenCalledTimes(2);
    expect(prisma.transaction.update.mock.calls[0]![0]).toMatchObject({
      where: { id: 'tx-1' },
      data: { noteId: 'note-1' },
    });
    expect(prisma.changeLog.create).toHaveBeenCalledTimes(2);
    expect(created.transactions.map((t) => t.id)).toEqual(['tx-2', 'tx-1']);
  });

  it('rejects a foreign or deleted transaction id when tagging', async () => {
    prisma.note.create.mockResolvedValue(noteRecord());
    prisma.transaction.findMany.mockResolvedValueOnce([{ id: 'tx-1' }]); // only one of two

    await expectRejection(
      service.create('user-1', {
        title: 'Groceries',
        transactionIds: ['tx-1', 'tx-2'],
      } as never),
      404,
      'NOT_FOUND',
    );
    expect(prisma.transaction.update).not.toHaveBeenCalled();
    expect(prisma.changeLog.create).not.toHaveBeenCalled();
  });

  it('replaces the tag set on update, clearing dropped transactions', async () => {
    prisma.note.findUnique.mockImplementation(
      async (args: { include?: unknown }) =>
        args.include
          ? noteRecord({
              transactions: [{ id: 'tx-keep', title: 'Rent', transactionDate: NOW }],
            })
          : noteRecord(),
    );
    prisma.note.update.mockResolvedValue(noteRecord({ version: 2 }));
    prisma.transaction.findMany
      .mockResolvedValueOnce([{ id: 'tx-keep' }]) // owned & live
      .mockResolvedValueOnce([
        { id: 'tx-keep' },
        { id: 'tx-drop' },
      ]); // currently tagged with the note
    prisma.transaction.update.mockImplementation(async (args: { where: { id: string } }) => ({
      id: args.where.id,
      version: 3,
    }));

    const updated = await service.update('user-1', 'note-1', {
      transactionIds: ['tx-keep'],
    } as never);

    expect(prisma.transaction.update).toHaveBeenCalledTimes(1);
    expect(prisma.transaction.update.mock.calls[0]![0]).toMatchObject({
      where: { id: 'tx-drop' },
      data: { noteId: null },
    });
    expect(prisma.changeLog.create).toHaveBeenCalledTimes(1);
    expect(updated.transactions.map((t) => t.id)).toEqual(['tx-keep']);
  });

  it('clears every tag when transactionIds is sent as null on update', async () => {
    prisma.note.findUnique.mockImplementation(
      async (args: { include?: unknown }) =>
        args.include
          ? noteRecord({ transactions: [] })
          : noteRecord(),
    );
    prisma.note.update.mockResolvedValue(noteRecord({ version: 2 }));
    // No ids to validate, so the first query is the currently-tagged set.
    prisma.transaction.findMany.mockResolvedValueOnce([
      { id: 'tx-1' },
      { id: 'tx-2' },
    ]);
    prisma.transaction.update.mockImplementation(async (args: { where: { id: string } }) => ({
      id: args.where.id,
      version: 3,
    }));

    await service.update('user-1', 'note-1', { transactionIds: null } as never);

    expect(prisma.transaction.update).toHaveBeenCalledTimes(2);
    expect(prisma.transaction.update.mock.calls[0]![0].data).toMatchObject({ noteId: null });
    expect(prisma.transaction.update.mock.calls[1]![0].data).toMatchObject({ noteId: null });
  });

  it('clears the tag on every referencing transaction when a note is deleted', async () => {
    prisma.note.findUnique.mockResolvedValue(noteRecord());
    prisma.note.update.mockResolvedValue(noteRecord({ deletedAt: NOW, version: 2 }));
    prisma.transaction.findMany.mockResolvedValue([{ id: 'tx-1' }, { id: 'tx-2' }]);
    prisma.transaction.update.mockImplementation(async (args: { where: { id: string } }) => ({
      id: args.where.id,
      version: 2,
    }));

    await service.remove('user-1', 'note-1');

    expect(prisma.transaction.findMany.mock.calls[0]![0]).toMatchObject({
      where: { noteId: 'note-1', userId: 'user-1' },
    });
    expect(prisma.transaction.update).toHaveBeenCalledTimes(2);
    expect(prisma.transaction.update.mock.calls[0]![0].data).toMatchObject({ noteId: null });
    expect(prisma.changeLog.create).toHaveBeenCalledTimes(2);
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
});

describe('RemindersService', () => {
  let prisma: { reminder: ReminderMock };
  let service: RemindersService;

  beforeEach(() => {
    prisma = {
      reminder: {
        findMany: vi.fn(),
        findUnique: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
      },
    };
    service = new RemindersService(prisma as never);
  });

  it('lists the caller’s reminders ordered by due date', async () => {
    prisma.reminder.findMany.mockResolvedValue([reminderRecord()]);

    await service.list('user-1');

    expect(prisma.reminder.findMany.mock.calls[0]![0]).toMatchObject({
      where: { userId: 'user-1', deletedAt: null },
      orderBy: [{ dueDate: 'asc' }, { dueTime: { sort: 'asc', nulls: 'last' } }],
    });
  });

  it('stores the due date as UTC midnight and echoes it back as YYYY-MM-DD', async () => {
    prisma.reminder.create.mockResolvedValue(reminderRecord());

    const created = await service.create('user-1', {
      title: 'Pay internet bill',
      dueDate: '2026-10-05',
    } as never);

    expect(prisma.reminder.create.mock.calls[0]![0].data.dueDate).toEqual(
      new Date('2026-10-05T00:00:00.000Z'),
    );
    expect(created.dueDate).toBe('2026-10-05');
    expect(created.completedAt).toBeNull();
  });

  it('stores an optional due time and echoes it back', async () => {
    prisma.reminder.create.mockResolvedValue(reminderRecord({ dueTime: '18:30' }));

    const created = await service.create('user-1', {
      title: 'Pay internet bill',
      dueDate: '2026-10-05',
      dueTime: '18:30',
    } as never);

    expect(prisma.reminder.create.mock.calls[0]![0].data.dueTime).toBe('18:30');
    expect(created.dueTime).toBe('18:30');
  });

  it('creates a date-only reminder with no time involved', async () => {
    prisma.reminder.create.mockResolvedValue(reminderRecord({ dueTime: null }));

    const created = await service.create('user-1', {
      title: 'Pay internet bill',
      dueDate: '2026-10-05',
    } as never);

    expect(prisma.reminder.create.mock.calls[0]![0].data.dueTime).toBeNull();
    expect(created.dueTime).toBeNull();
  });

  it('clears the time when dueTime is sent as null on update', async () => {
    prisma.reminder.findUnique.mockResolvedValue(reminderRecord({ dueTime: '18:30' }));
    prisma.reminder.update.mockResolvedValue(reminderRecord({ dueTime: null, version: 2 }));

    const updated = await service.update('user-1', 'rem-1', { dueTime: null } as never);

    expect(prisma.reminder.update.mock.calls[0]![0].data).toMatchObject({ dueTime: null });
    expect(updated.dueTime).toBeNull();
  });

  it('toggles completion without the client manufacturing a timestamp', async () => {
    prisma.reminder.findUnique.mockResolvedValue(reminderRecord());
    prisma.reminder.update.mockResolvedValue(reminderRecord({ completedAt: NOW, version: 2 }));

    await service.update('user-1', 'rem-1', { completed: true } as never);

    expect(prisma.reminder.update.mock.calls[0]![0].data.completedAt).toBeInstanceOf(Date);

    prisma.reminder.update.mockClear();
    prisma.reminder.update.mockResolvedValue(reminderRecord({ completedAt: null, version: 3 }));

    await service.update('user-1', 'rem-1', { completed: false } as never);

    expect(prisma.reminder.update.mock.calls[0]![0].data.completedAt).toBeNull();
  });

  it('reports another user’s reminder as missing', async () => {
    prisma.reminder.findUnique.mockResolvedValue(reminderRecord({ userId: 'user-2' }));

    await expectRejection(service.remove('user-1', 'rem-1'), 404, 'NOT_FOUND');
    expect(prisma.reminder.update).not.toHaveBeenCalled();
  });

  it('soft deletes an owned reminder', async () => {
    prisma.reminder.findUnique.mockResolvedValue(reminderRecord());
    prisma.reminder.update.mockResolvedValue(reminderRecord({ deletedAt: NOW, version: 2 }));

    await service.remove('user-1', 'rem-1');

    expect(prisma.reminder.update.mock.calls[0]![0].data.deletedAt).toBeInstanceOf(Date);
  });
});
