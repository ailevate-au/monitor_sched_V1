import { Router } from "express";
import { dbInstance } from "../../src/server/db";
import { issueToken } from "../auth/token";

// Role is inferred from the email prefix so role-gated screens can be tested
// (owner@… → Owner, coordinator@/coord@ → Coordinator, admin@… → Admin, otherwise PM).
function roleFromEmail(email: string): "Owner" | "Coordinator" | "Admin" | "PM" {
  const e = (email || "").toLowerCase();
  if (e.startsWith("owner")) return "Owner";
  if (e.startsWith("coordinator") || e.startsWith("coord")) return "Coordinator";
  if (e.startsWith("admin")) return "Admin";
  return "PM";
}

export const authRouter = Router();

authRouter.post("/auth/login", (req, res) => {
  const { email } = req.body || {};
  const db = dbInstance;
  // A managed account (created via User Management) takes priority over the
  // email-prefix inference, so a Coordinator/Owner-created user logs in with
  // exactly the role/name/state they were given.
  const account = db.users.find(u => u.email.toLowerCase() === String(email || "").toLowerCase());
  const name = account?.name || (email ? email.split("@")[0] : "Director");
  const user = {
    name: account ? account.name : name.charAt(0).toUpperCase() + name.slice(1),
    email: email || "director@interscale.com.au",
    role: account?.role || roleFromEmail(email),
    state: account?.state || "NSW",
  };
  // Same { token, user } contract as the old mock — but the token is now a
  // real HMAC-signed credential that requireAuth verifies on every request.
  res.json({ token: issueToken(user), user });
});
