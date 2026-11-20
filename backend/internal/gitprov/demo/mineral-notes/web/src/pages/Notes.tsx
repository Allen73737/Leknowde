import { useEffect, useState } from "react";
import { ApiNote, listNotes } from "../api/client";
import { useAuth } from "../hooks/useAuth";

export function NotesPage() {
  const { status } = useAuth();
  const [notes, setNotes] = useState<ApiNote[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status !== "authenticated") {
      return;
    }
    listNotes()
      .then(setNotes)
      .catch((err: Error) => setError(err.message));
  }, [status]);

  if (status === "loading") {
    return <p className="muted">Restoring your session…</p>;
  }
  if (status === "anonymous") {
    return <p className="muted">Please sign in to view your notes.</p>;
  }
  if (error) {
    return <p role="alert">{error}</p>;
  }

  return (
    <section>
      <h1>Notes</h1>
      {notes.length === 0 ? (
        <p className="muted">No notes yet.</p>
      ) : (
        <ul>
          {notes.map((note) => (
            <li key={note.id}>
              <strong>{note.title}</strong>
              <p>{note.body}</p>
              <time dateTime={note.updated_at}>{new Date(note.updated_at).toLocaleDateString()}</time>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
