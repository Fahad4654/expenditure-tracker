import type { IsoDate, IsoDateTime, Uuid } from './common';

export interface Reminder {
  id: Uuid;
  title: string;
  details: string | null;
  /** `YYYY-MM-DD` — the day the reminder is due, in the owner's timezone. */
  dueDate: IsoDate;
  /** Set when marked done; `null` while pending. */
  completedAt: IsoDateTime | null;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

export interface CreateReminderInput {
  title: string;
  details?: string | null;
  dueDate: IsoDate;
}

export interface UpdateReminderInput {
  title?: string;
  details?: string | null;
  dueDate?: IsoDate;
  completed?: boolean;
}
