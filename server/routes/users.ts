import { Router } from "express";
import { dbInstance } from "../../src/server/db";
import { validate } from "../middleware/validate";
import { userCreateSchema, userUpdateSchema } from "../validation/schemas";

// CRUD for Admin/PM/Coordinator accounts. Visible to Owner + Coordinator
// (see the `users` permission defaults). The Owner account is seeded and
// cannot be created/edited/deleted here.
export const usersRouter = Router();

usersRouter.get("/users", (_req, res) => {
  res.json(dbInstance.users);
});

usersRouter.post("/users", validate(userCreateSchema), (req, res) => {
  const db = dbInstance;
  const { name, email, role, state, managedProjectIds, alsoResource, trade, rate } = req.body || {};
  if (!name || !email || !role) {
    return res.status(400).json({ error: "Missing required fields: name, email and role" });
  }
  if (!["Coordinator", "Admin", "PM"].includes(role)) {
    return res.status(400).json({ error: "role must be Coordinator, Admin or PM" });
  }
  if (db.users.some(u => u.email.toLowerCase() === String(email).toLowerCase())) {
    return res.status(400).json({ error: "A user with this email already exists" });
  }

  let linkedResourceId: string | undefined;
  if (alsoResource) {
    const initials = String(name).split(" ").map((n: string) => n.charAt(0)).join("").toUpperCase().slice(0, 3) || "SR";
    const rateVal = parseInt(rate) || 55;
    linkedResourceId = `r${db.resources.length + 1}`;
    db.resources.push({
      id: linkedResourceId,
      initials,
      name,
      trade: trade || role,
      state: state || "NSW",
      rate: `A$${rateVal}/hr`,
      hourlyRateVal: rateVal,
      util: 0,
      status: "ok" as const,
      email,
      company: "FlowIQ",
      overtimeRateVal: Math.round(rateVal * 1.5),
      dailyAllowanceVal: 0,
      projectRateOverrides: {},
    });
  }

  const newUser = {
    id: `u${Date.now()}`,
    name,
    email,
    role: role as "Coordinator" | "Admin" | "PM",
    state: state || "NSW",
    managedProjectIds: role === "PM" && Array.isArray(managedProjectIds) ? managedProjectIds : [],
    linkedResourceId,
  };
  db.users.push(newUser);
  db.save();
  res.json({ success: true, user: newUser });
});

usersRouter.put("/users/:id", validate(userUpdateSchema), (req, res) => {
  const db = dbInstance;
  const { id } = req.params;
  const user = db.users.find(u => u.id === id);
  if (!user) return res.status(404).json({ error: "User not found" });
  if (user.role === "Owner") return res.status(400).json({ error: "The Owner account can't be edited here" });

  const { name, email, role, state, managedProjectIds } = req.body || {};
  if (role !== undefined) {
    if (!["Coordinator", "Admin", "PM"].includes(role)) {
      return res.status(400).json({ error: "role must be Coordinator, Admin or PM" });
    }
    user.role = role;
  }
  if (name !== undefined) user.name = name;
  if (email !== undefined) user.email = email;
  if (state !== undefined) user.state = state;
  if (managedProjectIds !== undefined) user.managedProjectIds = user.role === "PM" ? managedProjectIds : [];

  db.save();
  res.json({ success: true, user });
});

usersRouter.delete("/users/:id", (req, res) => {
  const db = dbInstance;
  const { id } = req.params;
  const user = db.users.find(u => u.id === id);
  if (!user) return res.status(404).json({ error: "User not found" });
  if (user.role === "Owner") return res.status(400).json({ error: "The Owner account can't be deleted" });

  db.users = db.users.filter(u => u.id !== id);
  db.save();
  res.json({ success: true });
});
