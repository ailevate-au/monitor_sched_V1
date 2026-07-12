import { RequestHandler } from "express";
import { ZodSchema } from "zod";

/**
 * Body validation: reject with a 400 + the first issue when the body doesn't
 * match. Schemas are deliberately LOOSE (see validation/schemas.ts) — they
 * type-check fields when present but leave required-field checks and bespoke
 * error messages to the handlers, so no UI-visible string changes. req.body is
 * never reassigned; handlers keep reading the raw body.
 */
export const validate = (schema: ZodSchema): RequestHandler => (req, res, next) => {
  const result = schema.safeParse(req.body ?? {});
  if (!result.success) {
    const issue = result.error.issues[0];
    const where = issue.path.length ? `${issue.path.join(".")}: ` : "";
    res.status(400).json({ error: `Invalid request body — ${where}${issue.message}` });
    return;
  }
  next();
};
