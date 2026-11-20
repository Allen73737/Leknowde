export interface Note {
  id: string;
  title: string;
  body: string;
  updatedAt: string;
}

export interface Session {
  userId: string;
  familyId: string;
  expiresAt: string;
}

export type AuthEventKind = "login" | "refresh_rotated" | "family_revoked" | "logout";
