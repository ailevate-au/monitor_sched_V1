import { Router } from "express";
import { dbInstance } from "../../src/server/db";
import { toSafeExportName, buildPdfBuffer, buildExcelBuffer } from "../services/reportExport";

export const reportsRouter = Router();

// GET /api/v1/reports/export: PDF & spreadsheet generation. Opened via
// window.open on the client, so auth arrives as ?access_token= (see requireAuth).
reportsRouter.get("/reports/export", async (req, res) => {
  const db = dbInstance;
  const { type, format, projectId } = req.query;
  const selectedProjectId = typeof projectId === "string" ? projectId : "";
  const reportType = typeof type === "string" ? decodeURIComponent(type) : "Report";
  const reportFormat: "PDF" | "Excel" = format === "Excel" ? "Excel" : "PDF";
  const project = selectedProjectId ? db.projects.find(p => p.id === selectedProjectId) : null;
  const projectTasks = selectedProjectId ? db.tasks.filter(t => t.projectId === selectedProjectId) : db.tasks;
  const projectClaims = selectedProjectId ? db.claims.filter(c => c.projectId === selectedProjectId) : db.claims;
  const completedTasks = projectTasks.filter(t => t.status === "completed").length;
  const pendingClaims = projectClaims.filter(c => c.status === "pending").length;
  const projectName = project ? project.name : "All projects";
  const generatedAt = new Date().toISOString();
  const safeName = toSafeExportName(reportType);

  const params = {
    reportType,
    reportFormat,
    projectName,
    projectId: project ? project.id : "",
    generatedAt,
    totalTasks: projectTasks.length,
    completedTasks,
    totalClaims: projectClaims.length,
    pendingClaims,
  };

  try {
    if (reportFormat === "Excel") {
      const xlsx = await buildExcelBuffer(params, projectTasks, projectClaims);
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition", `attachment; filename="${safeName}-export.xlsx"`);
      res.send(xlsx);
      return;
    }

    const pdf = await buildPdfBuffer(params);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${safeName}-export.pdf"`);
    res.send(pdf);
  } catch (error) {
    console.error("Report export failed", error);
    res.status(500).json({ error: "Failed to generate report export" });
  }
});
