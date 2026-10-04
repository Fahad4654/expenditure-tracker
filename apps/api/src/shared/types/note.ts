import type { IsoDate, IsoDateTime, Uuid } from './common';

/** A transaction a note is tagged on — just enough to link from the note card. */
export interface NoteTransactionRef {
  id: Uuid;
  title: string;
  /** Calendar date in the owner's timezone: `YYYY-MM-DD`. */
  transactionDate: IsoDate;
}

export interface Note {
  id: Uuid;
  title: string;
  content: string | null;
  /** Live transactions this note is tagged on, newest first. */
  transactions: NoteTransactionRef[];
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

export interface CreateNoteInput {
  title: string;
  content?: string | null;
}

export interface UpdateNoteInput {
  title?: string;
  content?: string | null;
}
