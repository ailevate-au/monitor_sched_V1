import { PrismaClient } from "@prisma/client";
import {
  DEFAULT_ALERTS,
  DEFAULT_CLAIMS,
  DEFAULT_COST_CATEGORIES,
  DEFAULT_PROJECTS,
  DEFAULT_RESOURCES,
  DEFAULT_TASKS,
  DEFAULT_USERS,
  getDefaultMasters,
} from "../src/server/seedData";

const prisma = new PrismaClient();

async function main() {
  await prisma.undoEntry.deleteMany();
  await prisma.alert.deleteMany();
  await prisma.conflictRecord.deleteMany();
  await prisma.progressClaim.deleteMany();
  await prisma.task.deleteMany();
  await prisma.projectRateOverride.deleteMany();
  await prisma.resource.deleteMany();
  await prisma.project.deleteMany();
  await prisma.costCategory.deleteMany();
  await prisma.masterItem.deleteMany();
  await prisma.appUser.deleteMany();

  for (const c of DEFAULT_COST_CATEGORIES) {
    await prisma.costCategory.create({
      data: {
        id: c.id,
        name: c.name,
        isActive: c.is_active,
        sortOrder: c.sort_order,
      },
    });
  }

  for (const p of DEFAULT_PROJECTS) {
    await prisma.project.create({
      data: {
        id: p.id,
        name: p.name,
        type: p.type,
        location: p.location,
        contractor: p.contractor,
        state: p.state,
        originalContractSum: p.originalContractSum,
        finalContractSum: p.finalContractSum,
        plannedCost: p.plannedCost,
        actualCost: p.actualCost,
        ldRatePerDay: p.ldRatePerDay,
        pcStartDate: p.pcStartDate,
        pcEndDate: p.pcEndDate,
        retentionPercent: p.retentionPercent,
        status: p.status,
        progress: p.progress,
        weatherRisk: p.weatherRisk,
        overBudget: p.overBudget,
        budgetLinesJson: JSON.stringify((p as any).budgetLines ?? []),
        actualLinesJson: JSON.stringify((p as any).actualLines ?? []),
        revenueReceived: (p as any).revenueReceived ?? null,
      },
    });
  }

  for (const r of DEFAULT_RESOURCES) {
    await prisma.resource.create({
      data: {
        id: r.id,
        initials: r.initials,
        name: r.name,
        trade: r.trade,
        state: r.state,
        rate: r.rate,
        hourlyRateVal: r.hourlyRateVal,
        util: r.util,
        status: r.status,
        rateType: "hourly",
      },
    });
  }

  for (const t of DEFAULT_TASKS) {
    await prisma.task.create({
      data: {
        id: t.id,
        projectId: t.projectId,
        name: t.name,
        assigneeId: t.assigneeId,
        tradeRequired: t.tradeRequired,
        start: t.start,
        end: t.end,
        deadline: (t as any).deadline ?? t.end,
        durationDays: t.durationDays,
        dependencies: t.dependencies,
        status: t.status,
        dependencyType: "FS",
        lagDays: 0,
        percentComplete:
          (t as any).percent_complete ??
          (t.status === "completed" ? 100 : t.status === "inprogress" ? 40 : 0),
      },
    });
  }

  for (const c of DEFAULT_CLAIMS) {
    await prisma.progressClaim.create({
      data: {
        id: c.id,
        claimNumber: c.claimNumber,
        projectId: c.projectId,
        projectName: c.project,
        period: c.period,
        claimedAmount: c.claimedAmount,
        certifiedAmount: c.certifiedAmount,
        claimedVal: c.claimedVal,
        certifiedVal: c.certifiedVal,
        retentionVal: c.retentionVal,
        dueDate: c.dueDate,
        status: c.status,
        costCategoryId: c.costCategoryId,
        costCategoryName: c.costCategoryName,
      },
    });
  }

  const masters = getDefaultMasters();
  for (const type of ["states", "sectors", "trades", "companies"] as const) {
    for (const item of masters[type]) {
      await prisma.masterItem.create({
        data: {
          id: item.id,
          type,
          label: item.label,
          code: item.code ?? null,
          value: item.value ?? null,
          isActive: item.is_active,
          isSystem: item.is_system ?? false,
          sortOrder: item.sort_order,
        },
      });
    }
  }

  for (const a of DEFAULT_ALERTS) {
    await prisma.alert.create({
      data: {
        id: a.id,
        taskId: a.taskId,
        taskName: a.taskName,
        reporterName: a.reporterName,
        message: a.message,
        type: a.type,
        timestamp: a.timestamp,
      },
    });
  }

  for (const u of DEFAULT_USERS) {
    await prisma.appUser.create({
      data: {
        id: u.id,
        name: u.name,
        email: u.email,
        role: u.role,
        state: u.state,
        managedProjectIds: (u.managedProjectIds || []).join(","),
        linkedResourceId: u.linkedResourceId,
      },
    });
  }

  console.log("Seed complete.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
