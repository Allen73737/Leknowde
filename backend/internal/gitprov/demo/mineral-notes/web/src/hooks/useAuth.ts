import { useCallback, useEffect, useState } from "react";
import { ApiUser, login as apiLogin, refreshSession } from "../api/client";

export interface AuthState {
  user: ApiUser | null;
  status: "loading" | "authenticated" | "anonymous";
  error: string | null;
}

export function useAuth() {
  const [state, setState] = useState<AuthState>({ user: null, status: "loading", error: null });

  useEffect(() => {
    let cancelled = false;
    refreshSession()
      .then((ok) => {
        if (!cancelled) {
          setState({ user: null, status: ok ? "authenticated" : "anonymous", error: null });
        }
      })
      .catch(() => {
        if (!cancelled) {
          setState({ user: null, status: "anonymous", error: null });
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    setState((prev) => ({ ...prev, status: "loading", error: null }));
    try {
      const user = await apiLogin(email, password);
      setState({ user, status: "authenticated", error: null });
    } catch (error) {
      setState({ user: null, status: "anonymous", error: (error as Error).message });
    }
  }, []);

  return { ...state, login };
}
