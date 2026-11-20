import { randomUUID } from "crypto";
import { query, withTransaction } from "../db/client";
import { hashRefreshToken, mintRefreshToken, refreshExpiry } from "./tokens";
import { recordAuthEvent } from "./session";

export interface IssuedRefreshToken {
  token: string;
  familyId: string;
  expiresAt: string;
}

interface RefreshTokenRow {
  id: string;
  user_id: string;
  family_id: string;
  expires_at: string;
  revoked_at: string | null;
  replaced_by: string | null;
}

/** Issues the first refresh token of a new rotation family. */
export async function issueRefreshToken(userId: string, userAgent: string): Promise<IssuedRefreshToken> {
  const token = mintRefreshToken();
  const familyId = randomUUID();
  const expiresAt = refreshExpiry();

  await query(
    `INSERT INTO refresh_tokens (user_id, token_hash, family_id, user_agent, expires_at)
     VALUES ($1, $2, $3, $4, $5)`,
    [userId, hashRefreshToken(token), familyId, userAgent, expiresAt.toISOString()],
  );

  return { token, familyId, expiresAt: expiresAt.toISOString() };
}

/**
 * Rotates a refresh token. Replays are treated as theft: the entire token
 * family is revoked so both the attacker and the victim must re-authenticate.
 */
export async function rotateRefreshToken(presentedToken: string, userAgent: string): Promise<IssuedRefreshToken> {
  const tokenHash = hashRefreshToken(presentedToken);

  return withTransaction(async (client) => {
    const { rows } = await client.query(
      `SELECT id, user_id, family_id, expires_at, revoked_at, replaced_by
       FROM refresh_tokens WHERE token_hash = $1 FOR UPDATE`,
      [tokenHash],
    );
    const existing = rows[0] as RefreshTokenRow | undefined;

    if (!existing) {
      throw new RefreshTokenError("unknown_token", "Refresh token is not recognised.");
    }
    if (existing.revoked_at || existing.replaced_by) {
      await revokeFamily(existing.family_id, "reuse_detected");
      throw new RefreshTokenError("token_reuse", "Refresh token was already used. Session family revoked.");
    }
    if (new Date(existing.expires_at).getTime() <= Date.now()) {
      throw new RefreshTokenError("token_expired", "Refresh token has expired.");
    }

    const nextToken = mintRefreshToken();
    const expiresAt = refreshExpiry();
    const nextId = randomUUID();

    await client.query(
      `INSERT INTO refresh_tokens (id, user_id, token_hash, family_id, parent_token_id, user_agent, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [nextId, existing.user_id, hashRefreshToken(nextToken), existing.family_id, existing.id, userAgent, expiresAt.toISOString()],
    );

    await client.query(
      `UPDATE refresh_tokens SET revoked_at = now(), replaced_by = $1 WHERE id = $2`,
      [nextId, existing.id],
    );

    await recordAuthEvent(existing.user_id, "refresh_rotated", `family=${existing.family_id}`);

    return { token: nextToken, familyId: existing.family_id, expiresAt: expiresAt.toISOString() };
  });
}

/** Revokes every active token in a rotation family. */
export async function revokeFamily(familyId: string, reason: string): Promise<number> {
  const rows = await query<{ id: string }>(
    `UPDATE refresh_tokens SET revoked_at = now()
     WHERE family_id = $1 AND revoked_at IS NULL RETURNING id`,
    [familyId],
  );
  await recordAuthEvent(null, "family_revoked", `family=${familyId} reason=${reason} count=${rows.length}`);
  return rows.length;
}

export async function revokeAllForUser(userId: string): Promise<void> {
  await query(`UPDATE refresh_tokens SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL`, [userId]);
}

export class RefreshTokenError extends Error {
  constructor(
    public readonly code: "unknown_token" | "token_reuse" | "token_expired",
    message: string,
  ) {
    super(message);
    this.name = "RefreshTokenError";
  }
}
