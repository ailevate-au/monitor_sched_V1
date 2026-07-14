import { Router } from "express";
import { validate } from "../middleware/validate";
import { permissionsUpdateSchema } from "../validation/schemas";
import { PERM_FEATURES, PERM_ROLES, getMatrix, isPermRole, applyRolePermissions, resetMatrix } from "../services/permissions";

export const permissionsRouter = Router();

permissionsRouter.get("/permissions", (_req, res) => {
  res.json({ features: PERM_FEATURES, roles: PERM_ROLES, matrix: getMatrix() });
});

permissionsRouter.put("/permissions/:role", validate(permissionsUpdateSchema), (req, res) => {
  const role = req.params.role;
  if (!isPermRole(role)) {
    return res.status(404).json({ success: false, error: `Unknown role: ${req.params.role}` });
  }
  const incoming = (req.body && req.body.permissions) || {};
  const permissions = applyRolePermissions(role, incoming);
  res.json({ success: true, role, permissions, matrix: getMatrix() });
});

permissionsRouter.post("/permissions/reset", (_req, res) => {
  res.json({ success: true, features: PERM_FEATURES, roles: PERM_ROLES, matrix: resetMatrix() });
});
