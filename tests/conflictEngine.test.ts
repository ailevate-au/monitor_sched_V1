import { beforeEach, afterEach, describe, expect, it } from "vitest";
import { dbInstance } from "../src/server/db";
import { runConflictDetection, computeCascade } from "../src/server/conflictEngine";
import { setStormScenario } from "../src/server/bomWeather";
import { seedInMemory, setTask } from "./helpers/seed";

beforeEach(() => {
  seedInMemory();
  setStormScenario(false);
});

afterEach(() => {
  setStormScenario(false);
});

describe("conflict engine", () => {
  it("clean baseline has no double-bookings", () => {
    runConflictDetection();
    expect(dbInstance.conflicts).toHaveLength(0);
    expect(dbInstance.tasks.filter(t => t.status === "conflict")).toHaveLength(0);
  });

  it("detects a double-booked resource and clears it when the overlap is removed", () => {
    // Same move the demo Simulate makes: pull Ben's basement formwork onto his
    // Level-4 pour week.
    setTask("TSK-P2-03", { assigneeId: "r1", start: "2026-06-03", end: "2026-06-09", durationDays: 5, percent_complete: 0, status: "scheduled" });
    runConflictDetection();

    expect(dbInstance.conflicts.some(c => c.resourceId === "r1")).toBe(true);
    const conflicted = dbInstance.tasks.filter(t => t.assigneeId === "r1" && t.status === "conflict");
    expect(conflicted.length).toBeGreaterThanOrEqual(2);

    // Give the job to someone else — the clash disappears on the next pass.
    setTask("TSK-P2-03", { assigneeId: "r7" });
    runConflictDetection();
    expect(dbInstance.conflicts.some(c => c.resourceId === "r1")).toBe(false);
  });

  it("cascades a delay through dependent tasks on working days", () => {
    // Find a task that something else depends on.
    const parent = dbInstance.tasks.find(p =>
      dbInstance.tasks.some(t => (t.dependencies || "").split(",").map(d => d.trim()).includes(p.id))
    );
    expect(parent).toBeTruthy();
    const dependent = dbInstance.tasks.find(t =>
      (t.dependencies || "").split(",").map(d => d.trim()).includes(parent!.id)
    )!;
    const dependentStartBefore = dependent.start;

    const shifted = computeCascade(dbInstance.tasks, parent!.id, 5, "NSW");
    const parentAfter = shifted.find(t => t.id === parent!.id)!;
    const dependentAfter = shifted.find(t => t.id === dependent.id)!;

    expect(parentAfter.start > parent!.start).toBe(true);
    // Working-day cascade: the dependent moves out (never in).
    expect(dependentAfter.start >= dependentStartBefore).toBe(true);
  });

  it("flags tight handovers only when the setting is on and the gap is under the threshold", () => {
    // The demo's tight handover: fitout pulled hard against the steel frame.
    setTask("TSK-P1-04", { start: "2026-06-29", end: "2026-07-17", durationDays: 14 });
    runConflictDetection();
    expect(dbInstance.fragileTasks.length).toBeGreaterThan(0);

    dbInstance.settings.tightHandover.enabled = false;
    runConflictDetection();
    expect(dbInstance.fragileTasks).toHaveLength(0);
  });
});
