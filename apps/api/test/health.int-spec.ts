import type { NestExpressApplication } from "@nestjs/platform-express";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestApp } from "./create-test-app.js";

describe("GET /api/v1/health/ready (real database)", () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it("returns 200 with the database up and generates a request id", async () => {
    const res = await request(app.getHttpServer()).get("/api/v1/health/ready");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok", checks: { database: "up" } });
    expect(res.headers["x-request-id"]).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("echoes a valid incoming X-Request-Id", async () => {
    const id = "6f1c0a52-3c8e-4f0e-9a52-0d9f3b1f2a10";
    const res = await request(app.getHttpServer())
      .get("/api/v1/health/ready")
      .set("X-Request-Id", id);

    expect(res.headers["x-request-id"]).toBe(id);
  });

  it("replaces an invalid X-Request-Id instead of echoing it", async () => {
    const res = await request(app.getHttpServer())
      .get("/api/v1/health/ready")
      .set("X-Request-Id", "not-a-uuid");

    expect(res.headers["x-request-id"]).not.toBe("not-a-uuid");
    expect(res.headers["x-request-id"]).toMatch(/^[0-9a-f-]{36}$/);
  });
});
