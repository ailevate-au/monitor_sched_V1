import { beforeEach, afterEach, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../server/app";
import { setStormScenario } from "../src/server/bomWeather";
import { runConflictDetection } from "../src/server/conflictEngine";
import { seedInMemory } from "./helpers/seed";

const app = createApp();

async function loginToken(email = "owner@flowiq.com.au"): Promise<string> {
  const res = await request(app).post("/api/v1/auth/login").send({ email, password: "x" });
  return res.body.token;
}

beforeEach(() => {
  seedInMemory();
  setStormScenario(false);
  runConflictDetection();
});

afterEach(() => {
  setStormScenario(false);
});

describe("API auth", () => {
  it("rejects requests without a token", async () => {
    const res = await request(app).get("/api/v1/projects");
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: "Unauthorized" });
  });

  it("rejects the old hardcoded mock token", async () => {
    const res = await request(app)
      .get("/api/v1/projects")
      .set("Authorization", "Bearer mock-jwt-token-xyz123");
    expect(res.status).toBe(401);
  });

  it("login returns the same { token, user } contract, with a verifiable token", async () => {
    const res = await request(app).post("/api/v1/auth/login").send({ email: "owner@flowiq.com.au", password: "x" });
    expect(res.status).toBe(200);
    expect(typeof res.body.token).toBe("string");
    expect(res.body.user).toMatchObject({ role: "Owner" });

    const authed = await request(app)
      .get("/api/v1/projects")
      .set("Authorization", `Bearer ${res.body.token}`);
    expect(authed.status).toBe(200);
    expect(Array.isArray(authed.body)).toBe(true);
    expect(authed.body.length).toBeGreaterThan(0);
  });
});

describe("demo round-trip", () => {
  it("simulate raises problems, resolve fixes one, reset returns to zero", async () => {
    const token = await loginToken();
    const auth = (r: request.Test) => r.set("Authorization", `Bearer ${token}`);

    const clean = await auth(request(app).get("/api/v1/problems"));
    expect(clean.body.summary.total).toBe(0);

    const sim = await auth(request(app).post("/api/v1/demo/simulate"));
    expect(sim.status).toBe(200);
    expect(sim.body.summary.total).toBeGreaterThan(0);

    // Resolve the first problem with its recommended action.
    const prob = sim.body.problems.find((p: { suggestedActions: Array<{ id: string }> }) => p.suggestedActions.length > 0);
    const action = prob.suggestedActions.find((a: { recommended?: boolean }) => a.recommended) || prob.suggestedActions[0];
    const resolved = await auth(request(app).post(`/api/v1/problems/${prob.id}/resolve`).send({ actionId: action.id }));
    expect(resolved.status).toBe(200);
    expect(resolved.body.success).toBe(true);
    expect(resolved.body.summary.total).toBeLessThan(sim.body.summary.total);

    const reset = await auth(request(app).post("/api/v1/demo/reset"));
    expect(reset.status).toBe(200);
    expect(reset.body.summary.total).toBe(0);
  });
});

describe("zod body validation", () => {
  it("rejects wrong-typed fields with a 400 instead of a 500", async () => {
    const token = await loginToken();
    const res = await request(app)
      .post("/api/v1/users")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: { nested: "object" }, email: "x@y.z", role: "Admin" });
    expect(res.status).toBe(400);
    expect(String(res.body.error)).toContain("Invalid request body");
  });

  it("keeps the handler's own required-field message", async () => {
    const token = await loginToken();
    const res = await request(app)
      .post("/api/v1/users")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "No Role" });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Missing required fields: name, email and role");
  });
});

describe("report export", () => {
  it("downloads a PDF via ?access_token= (the window.open path)", async () => {
    const token = await loginToken();
    const res = await request(app)
      .get(`/api/v1/reports/export?type=Programme&format=PDF&projectId=p1&access_token=${encodeURIComponent(token)}`)
      .buffer(true);
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("application/pdf");
  });

  it("still 401s a report download without any token", async () => {
    const res = await request(app).get("/api/v1/reports/export?type=Programme&format=PDF&projectId=p1");
    expect(res.status).toBe(401);
  });
});

describe("API 404", () => {
  it("unmatched /api/v1 routes return JSON, not HTML", async () => {
    const token = await loginToken();
    const res = await request(app)
      .get("/api/v1/definitely-not-a-route")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "Not found" });
  });
});
