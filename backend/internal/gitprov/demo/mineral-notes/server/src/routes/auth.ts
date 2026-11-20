import { Router } from "express";
import { authenticate, createUser, findUserById } from "../repositories/userRepository";
import { REFRESH_COOKIE, clearRefreshCookie, recordAuthEvent, setRefreshCookie } from "../auth/session";
import { RefreshTokenError, revokeAllForUser, revokeFamily, rotateRefreshToken } from "../auth/refresh";
import { signAccessToken } from "../auth/tokens";
import { requireAuth } from "../middleware/requireAuth";

export const authRouter = Router();

authRouter.post("/register", async (req, res) => {
  const { email, password, displayName } = req.body ?? {};
  if (typeof email !== "string" || typeof password !== "string" || password.length < 10) {
    res.status(400).json({ error: "invalid_payload" });
    return;
  }
  const user = await createUser(email, password, displayName ?? email.split("@")[0]);
  res.status(201).json({ id: user.id, email: user.email, display_name: user.display_name });
});

authRouter.post("/login", async (req, res) => {
  const { email, password } = req.body ?? {};
  if (typeof email !== "string" || typeof password !== "string") {
    res.status(400).json({ error: "invalid_payload" });
    return;
  }
  try {
    const result = await authenticate(email, password, req.headers["user-agent"] ?? "unknown");
    setRefreshCookie(res, result.refresh.token, result.refresh.expiresAt);
    await recordAuthEvent(result.user.id, "login", `family=${result.refresh.familyId}`);
    res.json({ access_token: result.accessToken, user: result.user });
  } catch {
    res.status(401).json({ error: "invalid_credentials" });
  }
});

authRouter.post("/refresh", async (req, res) => {
  const presented = req.cookies?.[REFRESH_COOKIE];
  if (!presented) {
    res.status(401).json({ error: "missing_refresh_token" });
    return;
  }
  try {
    const rotated = await rotateRefreshToken(presented, req.headers["user-agent"] ?? "unknown");
    const user = await findUserById(rotated.familyId);
    setRefreshCookie(res, rotated.token, rotated.expiresAt);
    res.json({
      access_token: signAccessToken({
        sub: user?.id ?? "",
        email: user?.email ?? "",
        sessionId: rotated.familyId,
      }),
    });
  } catch (error) {
    if (error instanceof RefreshTokenError) {
      clearRefreshCookie(res);
      res.status(401).json({ error: error.code, message: error.message });
      return;
    }
    throw error;
  }
});

authRouter.post("/logout", requireAuth, async (req, res) => {
  if (req.auth) {
    await revokeAllForUser(req.auth.sub);
    await recordAuthEvent(req.auth.sub, "logout", "all_sessions");
  }
  clearRefreshCookie(res);
  res.status(204).end();
});

authRouter.post("/sessions/revoke", requireAuth, async (req, res) => {
  const familyId = String(req.body?.family_id ?? "");
  if (!familyId) {
    res.status(400).json({ error: "family_id_required" });
    return;
  }
  const revoked = await revokeFamily(familyId, "manual_revoke");
  res.json({ revoked });
});
