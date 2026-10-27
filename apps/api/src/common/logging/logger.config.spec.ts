import { Writable } from "node:stream";
import pino from "pino";
import { describe, expect, it } from "vitest";
import { REDACT_PATHS, buildLoggerParams } from "./logger.config.js";

function logLines(entry: Record<string, unknown>): Record<string, unknown> {
  const chunks: string[] = [];
  const stream = new Writable({
    write(chunk: Buffer, _enc, done) {
      chunks.push(chunk.toString());
      done();
    },
  });
  pino({ redact: { paths: REDACT_PATHS, censor: "[REDACTED]" } }, stream).info(entry);
  return JSON.parse(chunks.join("")) as Record<string, unknown>;
}

describe("log redaction (API-8)", () => {
  it("redacts credentials, cookies, signatures and personal data", () => {
    const line = logLines({
      req: {
        headers: {
          authorization: "Bearer abc",
          cookie: "rt=secret",
          "stripe-signature": "t=1,v1=sig",
          host: "x",
        },
      },
      res: { headers: { "set-cookie": ["rt=secret"], "content-type": "application/json" } },
      body: {
        password: "hunter2",
        token: "t",
        refreshToken: "r",
        email: "a@b.co",
        phone: "0812345678",
        name: "ok",
      },
    });

    const serialized = JSON.stringify(line);
    for (const secret of [
      "Bearer abc",
      "rt=secret",
      "t=1,v1=sig",
      "hunter2",
      "a@b.co",
      "0812345678",
    ]) {
      expect(serialized).not.toContain(secret);
    }
    expect(serialized).toContain("[REDACTED]");
    // Harmless fields stay readable.
    expect(serialized).toContain('"host":"x"');
    expect(serialized).toContain('"name":"ok"');
  });
});

describe("buildLoggerParams", () => {
  it("uses pino-pretty only in development", () => {
    const dev = buildLoggerParams({ NODE_ENV: "development", LOG_LEVEL: "info" });
    const prod = buildLoggerParams({ NODE_ENV: "production", LOG_LEVEL: "info" });

    expect(JSON.stringify(dev.pinoHttp)).toContain("pino-pretty");
    expect(JSON.stringify(prod.pinoHttp)).not.toContain("pino-pretty");
  });
});
