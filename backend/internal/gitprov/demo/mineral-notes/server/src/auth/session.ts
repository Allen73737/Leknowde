import type { Response } from "express";
import { isProduction } from "../config";
import { query } from "../db/client";

export const REFRESH_COOKIE = "mn_refresh";

export async function recordAuthEvent(userId: string | null, kind: string, detail: string): Promise<void> {
  await query(`INSERT INTO auth_events (user_id, kind, detail) VALUES ($1, $2, $3)`, [userId, kind, detail]);
}

export function setRefreshCookie(res: Response, token: string, expiresAt: string): void {
  res.cookie(REFRESH_COOKIE, token, {
    httpOnly: true,
    secure: isProduction,
    sameSite: "strict",
    path: "/api/v1/auth",
    expires: new Date(expiresAt),
  });
}

export function clearRefreshCookie(res: Response): void {
  res.clearCookie(REFRESH_COOKIE, { path: "/api/v1/auth" });
}

export async function activeSessionCount(userId: string): Promise<number> {
  const rows = await query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM refresh_tokens
     WHERE user_id = $1 AND revoked_at IS NULL AND expires_at > now()`,
    [userId],
  );
  return Number(rows[0]?.count ?? "0");
}
