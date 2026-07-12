import { RequestHandler } from "express";
import { verifyToken } from "../auth/token";

/**
 * Every /api/v1 route (except login) requires a valid signed token — Bearer
 * header for normal calls, or ?access_token= for report downloads opened via
 * window.open (no way to attach a header there). The decoded user lands on
 * res.locals.user for reference; role GATING stays client-driven, exactly as
 * before this middleware existed.
 */
export const requireAuth: RequestHandler = (req, res, next) => {
  const header = req.headers.authorization;
  const bearer = header?.startsWith("Bearer ") ? header.slice(7) : undefined;
  const query = typeof req.query.access_token === "string" ? req.query.access_token : undefined;
  const user = verifyToken(bearer ?? query);
  if (!user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  res.locals.user = user;
  next();
};
