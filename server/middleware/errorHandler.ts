import { ErrorRequestHandler } from "express";

/** Final safety net — an uncaught handler error becomes a 500 JSON, not a hang. */
export const errorHandler: ErrorRequestHandler = (err, _req, res, next) => {
  if (res.headersSent) {
    next(err);
    return;
  }
  console.error("Unhandled route error:", err);
  res.status(500).json({ error: err instanceof Error ? err.message : "Internal server error" });
};
