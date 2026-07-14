/**
 * Thin typed API client over fetch. The global auth wrapper installed by
 * lib/auth.tsx still injects the Bearer token, so this adds no header logic.
 *
 * Semantics deliberately mirror the bare `fetch(url).then(r => r.json())`
 * calls it replaces: the JSON body is returned whatever the status code, so
 * handlers that read `data.error` off a 400/404 keep working unchanged. The
 * one addition: a 401 (invalid/stale token) broadcasts "flowiq:unauthorized"
 * — AuthProvider listens and logs the session out — and rejects.
 */

export const UNAUTHORIZED_EVENT = "flowiq:unauthorized";

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api/v1${path}`, init);
  if (res.status === 401) {
    window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
    throw new ApiError(401, "Session expired");
  }
  return (await res.json()) as T;
}

const json = (body: unknown): RequestInit => ({
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

// The default generic is `any`, matching the bare `res.json()` these calls
// replaced — call sites opt in to types (api.get<Project[]>) incrementally.
/* eslint-disable @typescript-eslint/no-explicit-any */
export const api = {
  get: <T = any>(path: string) => request<T>(path),
  post: <T = any>(path: string, body?: unknown) =>
    request<T>(path, { method: "POST", ...(body !== undefined ? json(body) : {}) }),
  put: <T = any>(path: string, body?: unknown) =>
    request<T>(path, { method: "PUT", ...(body !== undefined ? json(body) : {}) }),
  del: <T = any>(path: string) => request<T>(path, { method: "DELETE" }),
};
/* eslint-enable @typescript-eslint/no-explicit-any */
