import express from "express";
import { requireAuth } from "./middleware/requireAuth";
import { errorHandler } from "./middleware/errorHandler";
import { authRouter } from "./routes/auth";
import { usersRouter } from "./routes/users";
import { permissionsRouter } from "./routes/permissions";
import { dashboardRouter } from "./routes/dashboard";
import { projectsRouter } from "./routes/projects";
import { tasksRouter } from "./routes/tasks";
import { resourcesRouter } from "./routes/resources";
import { conflictsRouter } from "./routes/conflicts";
import { problemsRouter } from "./routes/problems";
import { settingsRouter } from "./routes/settings";
import { demoRouter } from "./routes/demo";
import { financialRouter } from "./routes/financial";
import { claimsRouter } from "./routes/claims";
import { mastersRouter } from "./routes/masters";
import { costCategoriesRouter } from "./routes/costCategories";
import { myRouter } from "./routes/my";
import { weatherRouter } from "./routes/weather";
import { reportsRouter } from "./routes/reports";

/**
 * Build the Express app: json → login (open) → requireAuth → domain routers →
 * JSON 404 → error handler. No vite/listen here, so tests can drive it with
 * supertest directly.
 */
export function createApp() {
  const app = express();
  app.use(express.json());

  // Login is the only open endpoint; everything else under /api/v1 needs a token.
  app.use("/api/v1", authRouter);
  app.use("/api/v1", requireAuth);

  app.use("/api/v1", usersRouter);
  app.use("/api/v1", permissionsRouter);
  app.use("/api/v1", dashboardRouter);
  app.use("/api/v1", projectsRouter);
  app.use("/api/v1", tasksRouter);
  app.use("/api/v1", resourcesRouter);
  app.use("/api/v1", conflictsRouter);
  app.use("/api/v1", problemsRouter);
  app.use("/api/v1", settingsRouter);
  app.use("/api/v1", demoRouter);
  app.use("/api/v1", financialRouter);
  app.use("/api/v1", claimsRouter);
  app.use("/api/v1", mastersRouter);
  app.use("/api/v1", costCategoriesRouter);
  app.use("/api/v1", myRouter);
  app.use("/api/v1", weatherRouter);
  app.use("/api/v1", reportsRouter);

  // Unmatched API routes get JSON, not the SPA's index.html.
  app.use("/api/v1", (_req, res) => {
    res.status(404).json({ error: "Not found" });
  });

  app.use(errorHandler);
  return app;
}
