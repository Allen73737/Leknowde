import { Router } from "express";
import { requireAuth, requireScope } from "../middleware/requireAuth";
import { createNote, deleteNote, getNote, listNotes, updateNote } from "../repositories/noteRepository";

export const notesRouter = Router();

notesRouter.use(requireAuth);

notesRouter.get("/", requireScope("notes:read"), async (req, res) => {
  const notes = await listNotes(req.auth!.sub);
  res.json({ notes });
});

notesRouter.get("/:id", requireScope("notes:read"), async (req, res) => {
  const note = await getNote(req.auth!.sub, req.params.id);
  if (!note) {
    res.status(404).json({ error: "note_not_found" });
    return;
  }
  res.json(note);
});

notesRouter.post("/", requireScope("notes:write"), async (req, res) => {
  const { title, body } = req.body ?? {};
  if (typeof title !== "string" || title.trim().length === 0) {
    res.status(400).json({ error: "title_required" });
    return;
  }
  const note = await createNote(req.auth!.sub, title.trim(), typeof body === "string" ? body : "");
  res.status(201).json(note);
});

notesRouter.put("/:id", requireScope("notes:write"), async (req, res) => {
  const { title, body } = req.body ?? {};
  if (typeof title !== "string") {
    res.status(400).json({ error: "title_required" });
    return;
  }
  const note = await updateNote(req.auth!.sub, req.params.id, title, typeof body === "string" ? body : "");
  if (!note) {
    res.status(404).json({ error: "note_not_found" });
    return;
  }
  res.json(note);
});

notesRouter.delete("/:id", requireScope("notes:write"), async (req, res) => {
  const removed = await deleteNote(req.auth!.sub, req.params.id);
  res.status(removed ? 204 : 404).end();
});
