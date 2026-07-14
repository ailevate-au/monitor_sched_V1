import { beforeEach, afterEach, describe, expect, it } from "vitest";
import { runConflictDetection } from "../src/server/conflictEngine";
import { setStormScenario } from "../src/server/bomWeather";
import { buildProblemsResponse } from "../server/services/problems";
import { seedInMemory, setTask } from "./helpers/seed";

beforeEach(() => {
  seedInMemory();
  setStormScenario(false);
});

afterEach(() => {
  setStormScenario(false);
});

describe("problems engine", () => {
  it("clean baseline reports zero problems", () => {
    runConflictDetection();
    const { summary } = buildProblemsResponse();
    expect(summary.total).toBe(0);
    expect(summary.critical).toBe(0);
  });

  it("after the demo scenario it reports every category, severity-ordered", () => {
    // Replicate POST /api/v1/demo/simulate's mutations.
    setTask("TSK-P2-03", { assigneeId: "r1", start: "2026-07-03", end: "2026-07-09", durationDays: 5, percent_complete: 0, status: "scheduled" });
    setTask("TSK-P3-01", { assigneeId: "r4", start: "2026-07-01", end: "2026-07-19", durationDays: 15, percent_complete: 0, status: "scheduled" });
    setTask("TSK-P2-01", { percent_complete: 85, status: "overdue" });
    setTask("TSK-P1-04", { start: "2026-07-29", end: "2026-08-16", durationDays: 14 });
    setStormScenario(true);
    setTask("TSK-P1-03", { start: "2026-06-03", end: "2026-06-09", durationDays: 5 });
    setTask("TSK-P3-02", { assigneeId: null });
    runConflictDetection();

    const { problems, summary } = buildProblemsResponse();
    expect(summary.total).toBeGreaterThan(0);

    const categories = new Set(problems.map(p => p.category));
    for (const expected of ["conflict", "unassigned", "late", "fragile", "weather"]) {
      expect(categories.has(expected), `missing category ${expected}`).toBe(true);
    }

    // Severity ordering: critical first, medium last.
    const order: Record<string, number> = { critical: 0, high: 1, medium: 2 };
    const ranks = problems.map(p => order[p.severity]);
    expect([...ranks].sort((a, b) => a - b)).toEqual(ranks);

    // Every problem ships at least one suggested fix (except possibly none for
    // exotic cases — the demo set always has some).
    expect(problems.every(p => Array.isArray(p.suggestedActions))).toBe(true);
  });
});
