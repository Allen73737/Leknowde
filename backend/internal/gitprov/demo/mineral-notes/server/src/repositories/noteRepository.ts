import { query } from "../db/client";

export interface Note {
  id: string;
  owner_id: string;
  title: string;
  body: string;
  created_at: string;
  updated_at: string;
}

export async function listNotes(ownerId: string, limit = 50): Promise<Note[]> {
  return query<Note>(
    `SELECT id, owner_id, title, body, created_at, updated_at
     FROM notes WHERE owner_id = $1 ORDER BY updated_at DESC LIMIT $2`,
    [ownerId, limit],
  );
}

export async function getNote(ownerId: string, noteId: string): Promise<Note | undefined> {
  const rows = await query<Note>(
    `SELECT id, owner_id, title, body, created_at, updated_at
     FROM notes WHERE id = $1 AND owner_id = $2`,
    [noteId, ownerId],
  );
  return rows[0];
}

export async function createNote(ownerId: string, title: string, body: string): Promise<Note> {
  const rows = await query<Note>(
    `INSERT INTO notes (owner_id, title, body) VALUES ($1, $2, $3)
     RETURNING id, owner_id, title, body, created_at, updated_at`,
    [ownerId, title, body],
  );
  return rows[0];
}

export async function updateNote(
  ownerId: string,
  noteId: string,
  title: string,
  body: string,
): Promise<Note | undefined> {
  const rows = await query<Note>(
    `UPDATE notes SET title = $3, body = $4, updated_at = now()
     WHERE id = $1 AND owner_id = $2
     RETURNING id, owner_id, title, body, created_at, updated_at`,
    [noteId, ownerId, title, body],
  );
  return rows[0];
}

export async function deleteNote(ownerId: string, noteId: string): Promise<boolean> {
  const rows = await query<{ id: string }>(`DELETE FROM notes WHERE id = $1 AND owner_id = $2 RETURNING id`, [
    noteId,
    ownerId,
  ]);
  return rows.length > 0;
}
