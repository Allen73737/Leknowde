import { createHash, randomBytes } from "crypto";
import jwt from "jsonwebtoken";
import { env } from "../config";

export interface AccessTokenClaims {
  sub: string;
  email: string;
  sessionId: string;
}

export function signAccessToken(claims: AccessTokenClaims): string {
  return jwt.sign(claims, env.JWT_ACCESS_SECRET, {
    expiresIn: env.ACCESS_TOKEN_TTL_SECONDS,
    issuer: "mineral-notes",
    audience: "mineral-notes-client",
  });
}

export function verifyAccessToken(token: string): AccessTokenClaims {
  const decoded = jwt.verify(token, env.JWT_ACCESS_SECRET, {
    issuer: "mineral-notes",
    audience: "mineral-notes-client",
  });
  if (typeof decoded === "string") {
    throw new Error("invalid_token_payload");
  }
  return {
    sub: String(decoded.sub),
    email: String((decoded as AccessTokenClaims).email),
    sessionId: String((decoded as AccessTokenClaims).sessionId),
  };
}

/** Refresh tokens are opaque, high-entropy and never stored in plaintext. */
export function mintRefreshToken(): string {
  return randomBytes(48).toString("base64url");
}

export function hashRefreshToken(token: string): string {
  return createHash("sha256")
    .update(token + env.REFRESH_TOKEN_PEPPER)
    .digest("hex");
}

export function refreshExpiry(): Date {
  return new Date(Date.now() + env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);
}
