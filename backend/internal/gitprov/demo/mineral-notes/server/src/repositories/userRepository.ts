import bcrypt from "bcryptjs";
import { query } from "../db/client";
import { issueRefreshToken, type IssuedRefreshToken } from "../auth/refresh";
import { signAccessToken } from "../auth/tokens";

export interface User {
  id: string;
  email: string;
  display_name: string;
  password_hash: string;
}

export interface LoginResult {
  accessToken: string;
  refresh: IssuedRefreshToken;
  user: Pick<User, "id" | "email" | "display_name">;
}

export async function findUserByEmail(email: string): Promise<User | undefined> {
  const rows = await query<User>(`SELECT id, email, display_name, password_hash FROM users WHERE email = $1`, [
    email.trim().toLowerCase(),
  ]);
  return rows[0];
}

export async function createUser(email: string, password: string, displayName: string): Promise<User> {
  const passwordHash = await bcrypt.hash(password, 12);
  const rows = await query<User>(
    `INSERT INTO users (email, password_hash, display_name)
     VALUES ($1, $2, $3) RETURNING id, email, display_name, password_hash`,
    [email.trim().toLowerCase(), passwordHash, displayName],
  );
  return rows[0];
}

export async function authenticate(email: string, password: string, userAgent: string): Promise<LoginResult> {
  const user = await findUserByEmail(email);
  if (!user) {
    throw new Error("invalid_credentials");
  }
  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) {
    throw new Error("invalid_credentials");
  }
  const refresh = await issueRefreshToken(user.id, userAgent);
  const accessToken = signAccessToken({ sub: user.id, email: user.email, sessionId: refresh.familyId });
  return {
    accessToken,
    refresh,
    user: { id: user.id, email: user.email, display_name: user.display_name },
  };
}

export async function findUserById(id: string): Promise<Pick<User, "id" | "email" | "display_name"> | undefined> {
  const rows = await query<Pick<User, "id" | "email" | "display_name">>(
    `SELECT id, email, display_name FROM users WHERE id = $1`,
    [id],
  );
  return rows[0];
}
