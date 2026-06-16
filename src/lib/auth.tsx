import React, { createContext, useCallback, useContext, useState } from "react";

/**
 * Front-end auth layer for FlowIQ.
 *
 * Task 1 (Login) scope: hold the authenticated session in app state + storage and
 * make every API call carry the token. Backend JWT/RBAC enforcement is out of
 * scope here — this runs against the existing baseline mock at
 * POST /api/v1/auth/login, whose contract ({ token, user }) is kept identical so a
 * real backend is a drop-in later.
 */

export interface AuthUser {
  name: string;
  email: string;
  /** "Owner" | "Admin" | "PM" | "Worker" (legacy: "Resource"). Kept open for the v1.1 role matrix. */
  role: string;
  state?: string;
}

interface AuthContextValue {
  token: string | null;
  user: AuthUser | null;
  isAuthenticated: boolean;
  loading: boolean;
  error: string | null;
  login: (email: string, password: string) => Promise<boolean>;
  logout: () => void;
  clearError: () => void;
}

const TOKEN_KEY = "flowiq.auth.token";
const USER_KEY = "flowiq.auth.user";
const LOGIN_ENDPOINT = "/api/v1/auth/login";

// ── Storage helpers ──────────────────────────────────────────────────────────
export function getStoredToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

function getStoredUser(): AuthUser | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as AuthUser) : null;
  } catch {
    return null;
  }
}

function persistSession(token: string, user: AuthUser): void {
  try {
    window.localStorage.setItem(TOKEN_KEY, token);
    window.localStorage.setItem(USER_KEY, JSON.stringify(user));
  } catch {
    /* private mode / quota — session still lives in memory for this tab */
  }
}

function clearSession(): void {
  try {
    window.localStorage.removeItem(TOKEN_KEY);
    window.localStorage.removeItem(USER_KEY);
  } catch {
    /* no-op */
  }
}

/**
 * Install a one-time global fetch wrapper that attaches `Authorization: Bearer
 * <token>` to same-origin /api/ requests whenever a session token exists. This
 * means every existing bare `fetch("/api/v1/...")` call across the app becomes
 * authenticated with no per-call changes — a clean drop-in for real RBAC.
 */
function installAuthFetch(): void {
  if (typeof window === "undefined") return;
  const w = window as unknown as { __flowiqAuthFetch?: boolean };
  if (w.__flowiqAuthFetch) return;
  w.__flowiqAuthFetch = true;

  const originalFetch = window.fetch.bind(window);
  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    try {
      const url =
        typeof input === "string" ? input : input instanceof URL ? input.toString() : null;
      const token = getStoredToken();
      if (token && url && url.startsWith("/api/") && !url.includes(LOGIN_ENDPOINT)) {
        const headers = new Headers(init?.headers);
        if (!headers.has("Authorization")) headers.set("Authorization", `Bearer ${token}`);
        return originalFetch(input, { ...init, headers });
      }
    } catch {
      /* fall through to an unmodified call */
    }
    return originalFetch(input, init);
  };
}

installAuthFetch();

// ── Context ──────────────────────────────────────────────────────────────────
const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(() => getStoredToken());
  const [user, setUser] = useState<AuthUser | null>(() => getStoredUser());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const login = useCallback(async (email: string, password: string): Promise<boolean> => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(LOGIN_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      if (!res.ok) {
        throw new Error(
          res.status === 401 || res.status === 403
            ? "Invalid email or password."
            : "Could not sign in. Please try again."
        );
      }

      const data = await res.json();
      if (!data?.token || !data?.user) {
        throw new Error("Unexpected response from the server.");
      }

      persistSession(data.token, data.user as AuthUser);
      setToken(data.token);
      setUser(data.user as AuthUser);
      return true;
    } catch (err) {
      const message =
        err instanceof TypeError
          ? "Network error — is the server running?"
          : err instanceof Error
            ? err.message
            : "Could not sign in. Please try again.";
      setError(message);
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  const logout = useCallback(() => {
    clearSession();
    setToken(null);
    setUser(null);
    setError(null);
  }, []);

  const clearError = useCallback(() => setError(null), []);

  const value: AuthContextValue = {
    token,
    user,
    isAuthenticated: !!token,
    loading,
    error,
    login,
    logout,
    clearError,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an <AuthProvider>");
  return ctx;
}
