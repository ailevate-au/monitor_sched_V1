import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Stateless HMAC-SHA256-signed session token: base64url(payload).base64url(sig).
 * No expiry — this is a demo app; the win over the old hardcoded string is that
 * a token can actually be VERIFIED (and a forged/stale one rejected), while
 * still surviving server restarts with no session store.
 */

const SECRET = process.env.AUTH_SECRET || "flowiq-demo-secret";

export interface TokenUser {
  name: string;
  email: string;
  role: string;
  state?: string;
}

export function issueToken(user: TokenUser): string {
  const payload = Buffer.from(JSON.stringify(user)).toString("base64url");
  const sig = createHmac("sha256", SECRET).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}

export function verifyToken(token: string | undefined | null): TokenUser | null {
  if (!token) return null;
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;
  const payload = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = createHmac("sha256", SECRET).update(payload).digest();
  let given: Buffer;
  try {
    given = Buffer.from(sig, "base64url");
  } catch {
    return null;
  }
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    const user = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return user && typeof user.email === "string" ? (user as TokenUser) : null;
  } catch {
    return null;
  }
}
