import http from "http";
import path from "path";
import express from "express";
import { dbInstance } from "../src/server/db";
import { runConflictDetection } from "../src/server/conflictEngine";
import { createApp } from "./app";

async function startServer() {
  await dbInstance.init();
  runConflictDetection();

  const app = createApp();
  const httpServer = http.createServer(app);
  const PORT = Number(process.env.PORT) || 3001;

  if (process.env.DISABLE_HMR === "true" || process.env.NODE_ENV === "production") {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  } else {
    // Dynamic import keeps vite out of the production bundle/runtime entirely
    // (it's a devDependency; prod never executes this branch).
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: { server: httpServer },
      },
      appType: "spa",
    });
    app.use(vite.middlewares);
  }

  httpServer.listen({ port: PORT, host: "::", ipv6Only: false }, () => {
    console.log(`FlowIQ server ready:`);
    console.log(`  → http://127.0.0.1:${PORT}`);
    console.log(`  → http://localhost:${PORT}`);
  });
}

startServer();
