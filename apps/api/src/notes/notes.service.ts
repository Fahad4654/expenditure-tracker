import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Note } from '../shared/types';
import type { CreateNoteInputDto, UpdateNoteInputDto } from '../shared/validation';
import { errors } from '../common/http/api-error';
import { withTx } from '../common/utils/with-tx';
import { recordChange } from '../sync/change-feed';
import { PrismaService } from '../prisma/prisma.module';

interface NoteRecord {
  id: string;
  userId: string;
  title: string;
  content: string | null;
  transactions?: { id: string; title: string; transactionDate: Date }[];
  version: number;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

function toNote(note: NoteRecord): Note {
  return {
    id: note.id,
    title: note.title,
    content: note.content,
    transactions: (note.transactions ?? [])
      .slice()
      .sort((a, b) => b.transactionDate.getTime() - a.transactionDate.getTime())
      .map((transaction) => ({
        id: transaction.id,
        title: transaction.title,
        transactionDate: transaction.transactionDate.toISOString().slice(0, 10),
      })),
    createdAt: note.createdAt.toISOString(),
    updatedAt: note.updatedAt.toISOString(),
  };
}

/** Live transactions tagged with these notes, scoped to the same owner. */
function taggedTransactions(userId: string): Prisma.NoteInclude {
  return {
    transactions: {
      where: { userId, deletedAt: null },
      select: { id: true, title: true, transactionDate: true },
    },
  };
}

/**
 * Private free-form notes, always scoped to the caller. Another user's note is
 * reported as 404 so its existence is never disclosed. Deletes are soft so a
 * tombstone can later feed the sync change log.
 *
 * A note can be tagged on any number of transactions; the link lives on
 * `Transaction.noteId`, and deleting the note clears those tags (announced
 * through the change feed so other devices converge). Create/update accept an
 * optional `transactionIds` array that replaces the whole tag set from the
 * note side.
 *
 * Notes are not part of the Phase 5 sync feed yet; the `version` counter is
 * bumped on every write so sync can adopt them without a schema change.
 */
@Injectable()
export class NotesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string): Promise<Note[]> {
    const notes = await this.prisma.note.findMany({
      where: { userId, deletedAt: null },
      orderBy: { updatedAt: 'desc' },
      include: taggedTransactions(userId),
    });
    return notes.map(toNote);
  }

  async create(userId: string, input: CreateNoteInputDto): Promise<Note> {
    return withTx(this.prisma, undefined, async (tx) => {
      const note = await tx.note.create({
        data: {
          userId,
          title: input.title,
          content: input.content ?? null,
        },
        include: taggedTransactions(userId),
      });
      if (input.transactionIds == null) return toNote(note);
      await this.applyTags(tx, userId, note.id, input.transactionIds);
      return toNote(await this.reload(tx, userId, note.id));
    });
  }

  async update(userId: string, id: string, input: UpdateNoteInputDto): Promise<Note> {
    const note = await this.requireOwned(userId, id);
    return withTx(this.prisma, undefined, async (tx) => {
      const updated = await tx.note.update({
        where: { id: note.id },
        data: {
          ...(input.title !== undefined && { title: input.title }),
          ...(input.content !== undefined && { content: input.content }),
          version: { increment: 1 },
        },
        include: taggedTransactions(userId),
      });
      // Absent key = leave the tag set alone; `null`/array replaces it.
      if (input.transactionIds === undefined) return toNote(updated);
      await this.applyTags(tx, userId, note.id, input.transactionIds ?? []);
      return toNote(await this.reload(tx, userId, note.id));
    });
  }

  async remove(userId: string, id: string): Promise<Note> {
    const note = await this.requireOwned(userId, id);
    return withTx(this.prisma, undefined, async (tx) => {
      const deleted = await tx.note.update({
        where: { id: note.id },
        data: { deletedAt: new Date(), version: { increment: 1 } },
      });

      // A tombstoned note must not leave a dangling tag behind — clear it on
      // every transaction that references it and announce each change.
      const tagged = await tx.transaction.findMany({
        where: { noteId: note.id, userId },
        select: { id: true },
      });
      for (const { id: transactionId } of tagged) {
        const updated = await tx.transaction.update({
          where: { id: transactionId },
          data: { noteId: null, version: { increment: 1 } },
        });
        await recordChange(tx, {
          userId,
          deviceId: null,
          entityType: 'TRANSACTION',
          entityId: updated.id,
          kind: 'UPSERT',
          version: updated.version,
        });
      }

      return toNote({ ...deleted, transactions: [] });
    });
  }

  private async requireOwned(userId: string, id: string): Promise<NoteRecord> {
    const note = await this.prisma.note.findUnique({ where: { id } });
    if (!note || note.deletedAt || note.userId !== userId) {
      // Another user's note — indistinguishable from "does not exist".
      throw errors.notFound('Note not found');
    }
    return note;
  }

  /**
   * Makes `transactionIds` the note's complete tag set: tags every missing
   * transaction, clears tags that dropped out, and announces each transaction
   * write through the change feed. Every id must be a live transaction owned
   * by the caller — a foreign or deleted one is a 404, never a silent skip.
   * A transaction already tagged with another note is re-pointed here (the FK
   * allows only one note per transaction).
   */
  private async applyTags(
    tx: Prisma.TransactionClient,
    userId: string,
    noteId: string,
    transactionIds: string[],
  ): Promise<void> {
    const desired = [...new Set(transactionIds)];
    if (desired.length > 0) {
      const owned = await tx.transaction.findMany({
        where: { id: { in: desired }, userId, deletedAt: null },
        select: { id: true },
      });
      if (owned.length !== desired.length) {
        throw errors.notFound('Transaction not found');
      }
    }

    const current = await tx.transaction.findMany({
      where: { noteId, userId },
      select: { id: true },
    });
    const desiredSet = new Set(desired);
    const currentSet = new Set(current.map((row) => row.id));

    for (const { id } of current) {
      if (!desiredSet.has(id)) await this.retag(tx, userId, id, null);
    }
    for (const id of desired) {
      if (!currentSet.has(id)) await this.retag(tx, userId, id, noteId);
    }
  }

  private async retag(
    tx: Prisma.TransactionClient,
    userId: string,
    transactionId: string,
    noteId: string | null,
  ): Promise<void> {
    const updated = await tx.transaction.update({
      where: { id: transactionId },
      data: { noteId, version: { increment: 1 } },
    });
    await recordChange(tx, {
      userId,
      deviceId: null,
      entityType: 'TRANSACTION',
      entityId: updated.id,
      kind: 'UPSERT',
      version: updated.version,
    });
  }

  private async reload(
    tx: Prisma.TransactionClient,
    userId: string,
    noteId: string,
  ): Promise<NoteRecord> {
    const fresh = await tx.note.findUnique({
      where: { id: noteId },
      include: taggedTransactions(userId),
    });
    if (!fresh) throw errors.notFound('Note not found');
    return fresh;
  }
}
