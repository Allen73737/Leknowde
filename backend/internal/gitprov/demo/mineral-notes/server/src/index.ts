import express from "express";
import cookieParser from "cookie-parser";
import { env } from "./config";
import { authRouter } from "./routes/auth";
import { notesRouter } from "./routes/notes";
import { requestLogger } from "./middleware/requestLogger";

const app = express();

app.use(express.json({ limit: "256kb" }));
app.use(cookieParser());
app.use(requestLogger);

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "mineral-notes" });
});

app.use("/api/v1/auth", authRouter);
app.use("/api/v1/notes", notesRouter);

app.use((_req, res) => {
  res.status(404).json({ error: "not_found" });
});

app.listen(env.PORT, () => {
  console.log(`mineral-notes listening on ${env.PORT} (${env.NODE_ENV})`);
});

export { app };
