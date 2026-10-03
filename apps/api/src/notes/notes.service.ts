import { Injectable } from '@nestjs/common';
import type { Note } from '../shared/types';
import type { CreateNoteInputDto, UpdateNoteInputDto } from '../shared/validation';
import { errors } from '../common/http/api-error';
import { PrismaService } from '../prisma/prisma.module';

interface NoteRecord {
  id: string;
  userId: string;
  title: string;
  content: string | null;
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
    createdAt: note.createdAt.toISOString(),
    updatedAt: note.updatedAt.toISOString(),
  };
}

/**
 * Private free-form notes, always scoped to the caller. Another user's note is
 * reported as 404 so its existence is never disclosed. Deletes are soft so a
 * tombstone can later feed the sync change log.
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
    });
    return notes.map(toNote);
  }

  async create(userId: string, input: CreateNoteInputDto): Promise<Note> {
    const note = await this.prisma.note.create({
      data: {
        userId,
        title: input.title,
        content: input.content ?? null,
      },
    });
    return toNote(note);
  }

  async update(userId: string, id: string, input: UpdateNoteInputDto): Promise<Note> {
    const note = await this.requireOwned(userId, id);
    const updated = await this.prisma.note.update({
      where: { id: note.id },
      data: {
        ...(input.title !== undefined && { title: input.title }),
        ...(input.content !== undefined && { content: input.content }),
        version: { increment: 1 },
      },
    });
    return toNote(updated);
  }

  async remove(userId: string, id: string): Promise<Note> {
    const note = await this.requireOwned(userId, id);
    const deleted = await this.prisma.note.update({
      where: { id: note.id },
      data: { deletedAt: new Date(), version: { increment: 1 } },
    });
    return toNote(deleted);
  }

  private async requireOwned(userId: string, id: string): Promise<NoteRecord> {
    const note = await this.prisma.note.findUnique({ where: { id } });
    if (!note || note.deletedAt || note.userId !== userId) {
      // Another user's note — indistinguishable from "does not exist".
      throw errors.notFound('Note not found');
    }
    return note;
  }
}
