import { Injectable } from '@nestjs/common';
import type { Reminder } from '../shared/types';
import type { CreateReminderInputDto, UpdateReminderInputDto } from '../shared/validation';
import { errors } from '../common/http/api-error';
import { PrismaService } from '../prisma/prisma.module';

interface ReminderRecord {
  id: string;
  userId: string;
  title: string;
  details: string | null;
  dueDate: Date;
  completedAt: Date | null;
  version: number;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

function toReminder(reminder: ReminderRecord): Reminder {
  return {
    id: reminder.id,
    title: reminder.title,
    details: reminder.details,
    dueDate: reminder.dueDate.toISOString().slice(0, 10),
    completedAt: reminder.completedAt ? reminder.completedAt.toISOString() : null,
    createdAt: reminder.createdAt.toISOString(),
    updatedAt: reminder.updatedAt.toISOString(),
  };
}

function dateOnly(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

/**
 * Dated reminders scoped to the caller; a foreign id is a 404, never a 403.
 * `completed: true/false` on update toggles `completedAt` so the client never
 * has to manufacture timestamps. Deletes are soft.
 */
@Injectable()
export class RemindersService {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string): Promise<Reminder[]> {
    const reminders = await this.prisma.reminder.findMany({
      where: { userId, deletedAt: null },
      orderBy: [{ dueDate: 'asc' }],
    });
    return reminders.map(toReminder);
  }

  async create(userId: string, input: CreateReminderInputDto): Promise<Reminder> {
    const reminder = await this.prisma.reminder.create({
      data: {
        userId,
        title: input.title,
        details: input.details ?? null,
        dueDate: dateOnly(input.dueDate),
      },
    });
    return toReminder(reminder);
  }

  async update(userId: string, id: string, input: UpdateReminderInputDto): Promise<Reminder> {
    const reminder = await this.requireOwned(userId, id);
    const updated = await this.prisma.reminder.update({
      where: { id: reminder.id },
      data: {
        ...(input.title !== undefined && { title: input.title }),
        ...(input.details !== undefined && { details: input.details }),
        ...(input.dueDate !== undefined && { dueDate: dateOnly(input.dueDate) }),
        ...(input.completed !== undefined && {
          completedAt: input.completed ? new Date() : null,
        }),
        version: { increment: 1 },
      },
    });
    return toReminder(updated);
  }

  async remove(userId: string, id: string): Promise<Reminder> {
    const reminder = await this.requireOwned(userId, id);
    const deleted = await this.prisma.reminder.update({
      where: { id: reminder.id },
      data: { deletedAt: new Date(), version: { increment: 1 } },
    });
    return toReminder(deleted);
  }

  private async requireOwned(userId: string, id: string): Promise<ReminderRecord> {
    const reminder = await this.prisma.reminder.findUnique({ where: { id } });
    if (!reminder || reminder.deletedAt || reminder.userId !== userId) {
      throw errors.notFound('Reminder not found');
    }
    return reminder;
  }
}
