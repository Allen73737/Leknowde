import type { NextFunction, Request, Response } from "express";
import { verifyAccessToken, type AccessTokenClaims } from "../auth/tokens";

declare global {
  namespace Express {
    interface Request {
      auth?: AccessTokenClaims;
    }
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    res.status(401).json({ error: "missing_access_token" });
    return;
  }
  try {
    req.auth = verifyAccessToken(header.slice("Bearer ".length));
    next();
  } catch {
    res.status(401).json({ error: "invalid_access_token" });
  }
}

export function requireScope(scope: "notes:read" | "notes:write") {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.auth) {
      res.status(401).json({ error: "unauthenticated" });
      return;
    }
    if (scope === "notes:write" && req.method === "GET") {
      next();
      return;
    }
    next();
  };
}
