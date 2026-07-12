import PDFDocument from "pdfkit";
import ExcelJS from "exceljs";

export function toSafeExportName(input: string): string {
  const normalized = input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || "report";
}

export interface ReportParams {
  reportType: string;
  reportFormat: "PDF" | "Excel";
  projectName: string;
  projectId: string;
  generatedAt: string;
  totalTasks: number;
  completedTasks: number;
  totalClaims: number;
  pendingClaims: number;
}

export function buildPdfBuffer(params: ReportParams): Promise<Buffer> {
  const {
    reportType,
    reportFormat,
    projectName,
    projectId,
    generatedAt,
    totalTasks,
    completedTasks,
    totalClaims,
    pendingClaims,
  } = params;

  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const doc = new PDFDocument({ margin: 50, size: "A4" });

    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc.fontSize(18).text("SITEWISE REPORT EXPORT", { align: "left" });
    doc.moveDown(0.6);
    doc.fontSize(11).text("Generated from live application context");
    doc.moveDown(1.2);

    doc.fontSize(13).text("Report Overview", { underline: true });
    doc.moveDown(0.5);
    doc.fontSize(11);
    doc.text(`Report Type: ${reportType}`);
    doc.text(`Requested Format: ${reportFormat}`);
    doc.text(`Generated At: ${generatedAt}`);
    doc.moveDown(1.0);

    doc.fontSize(13).text("Project Context", { underline: true });
    doc.moveDown(0.5);
    doc.fontSize(11);
    doc.text(`Project: ${projectName}`);
    doc.text(`Project ID: ${projectId || "-"}`);
    doc.moveDown(1.0);

    doc.fontSize(13).text("Summary Metrics", { underline: true });
    doc.moveDown(0.5);
    doc.fontSize(11);
    doc.text(`Total tasks: ${totalTasks}`);
    doc.text(`Completed tasks: ${completedTasks}`);
    doc.text(`Total progress claims: ${totalClaims}`);
    doc.text(`Pending claims: ${pendingClaims}`);
    doc.moveDown(1.0);
    doc.fontSize(10).fillColor("#666666");
    doc.text("Note: This export reflects data available at generation time.");

    doc.end();
  });
}

export async function buildExcelBuffer(
  params: ReportParams,
  tasks: Array<{ id: string; name: string; status: string; projectId: string }>,
  claims: Array<{ id: string; projectId: string; status: string; certifiedVal?: number; retentionVal?: number }>,
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "SiteWise";
  workbook.created = new Date();

  const summarySheet = workbook.addWorksheet("Summary");
  summarySheet.columns = [
    { header: "Field", key: "field", width: 28 },
    { header: "Value", key: "value", width: 50 },
  ];
  summarySheet.addRows([
    { field: "Report Type", value: params.reportType },
    { field: "Requested Format", value: params.reportFormat },
    { field: "Generated At", value: params.generatedAt },
    { field: "Project", value: params.projectName },
    { field: "Project ID", value: params.projectId || "-" },
    { field: "Total tasks", value: params.totalTasks },
    { field: "Completed tasks", value: params.completedTasks },
    { field: "Total progress claims", value: params.totalClaims },
    { field: "Pending claims", value: params.pendingClaims },
  ]);
  summarySheet.getRow(1).font = { bold: true };

  const tasksSheet = workbook.addWorksheet("Tasks");
  tasksSheet.columns = [
    { header: "Task ID", key: "id", width: 14 },
    { header: "Task Name", key: "name", width: 38 },
    { header: "Status", key: "status", width: 16 },
    { header: "Project ID", key: "projectId", width: 16 },
  ];
  for (const task of tasks) {
    tasksSheet.addRow({ id: task.id, name: task.name, status: task.status, projectId: task.projectId });
  }
  tasksSheet.getRow(1).font = { bold: true };

  const claimsSheet = workbook.addWorksheet("Claims");
  claimsSheet.columns = [
    { header: "Claim ID", key: "id", width: 14 },
    { header: "Project ID", key: "projectId", width: 16 },
    { header: "Status", key: "status", width: 16 },
    { header: "Certified Amount", key: "certifiedVal", width: 20 },
    { header: "Retention", key: "retentionVal", width: 16 },
  ];
  for (const claim of claims) {
    claimsSheet.addRow({
      id: claim.id,
      projectId: claim.projectId,
      status: claim.status,
      certifiedVal: claim.certifiedVal ?? 0,
      retentionVal: claim.retentionVal ?? 0,
    });
  }
  claimsSheet.getRow(1).font = { bold: true };

  const xlsx = await workbook.xlsx.writeBuffer();
  return Buffer.from(xlsx);
}
