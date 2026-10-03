import type { IsoDateTime, Uuid } from './common';

export interface Note {
  id: Uuid;
  title: string;
  content: string | null;
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
