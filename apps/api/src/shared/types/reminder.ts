import type { IsoDate, IsoDateTime, Uuid } from './common';

export interface Reminder {
  id: Uuid;
  title: string;
  details: string | null;
  /** `YYYY-MM-DD` — the day the reminder is due, in the owner's timezone. */
  dueDate: IsoDate;
  /** `HH:mm` (24-hour) on `dueDate`; `null` for a date-only reminder. */
  dueTime: string | null;
  /** Set when marked done; `null` while pending. */
  completedAt: IsoDateTime | null;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

export interface CreateReminderInput {
  title: string;
  details?: string | null;
  dueDate: IsoDate;
  dueTime?: string | null;
}

export interface UpdateReminderInput {
  title?: string;
  details?: string | null;
  dueDate?: IsoDate;
  dueTime?: string | null;
  completed?: boolean;
}
