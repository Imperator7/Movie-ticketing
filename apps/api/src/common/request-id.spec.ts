import type { IncomingMessage, ServerResponse } from "node:http";
import { describe, expect, it, vi } from "vitest";
import { genReqId, resolveRequestId } from "./request-id.js";

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const VALID = "6f1c0a52-3c8e-4f0e-9a52-0d9f3b1f2a10";

describe("resolveRequestId", () => {
  it("keeps a valid incoming UUID", () => {
    expect(resolveRequestId(VALID)).toBe(VALID);
  });

  it("generates a UUID when the header is missing", () => {
    expect(resolveRequestId(undefined)).toMatch(UUID_V4);
  });

  it.each([
    "",
    "abc",
    "123",
    "6f1c0a52-3c8e-4f0e-9a52",
    "<script>alert(1)</script>",
    `${VALID}\r\nSet-Cookie: x=1`,
  ])("replaces the invalid value %j", (value) => {
    const id = resolveRequestId(value);

    expect(id).not.toBe(value);
    expect(id).toMatch(UUID_V4);
  });

  it("uses the first value when the header is repeated", () => {
    expect(resolveRequestId([VALID, "other"])).toBe(VALID);
  });

  it("generates a different id each time", () => {
    expect(resolveRequestId(undefined)).not.toBe(resolveRequestId(undefined));
  });
});

describe("genReqId", () => {
  it("echoes the id in the X-Request-Id response header", () => {
    const setHeader = vi.fn();
    const req = { headers: { "x-request-id": VALID } } as unknown as IncomingMessage;
    const res = { setHeader } as unknown as ServerResponse;

    expect(genReqId(req, res)).toBe(VALID);
    expect(setHeader).toHaveBeenCalledWith("X-Request-Id", VALID);
  });

  it("sets a generated id when the request has none", () => {
    const setHeader = vi.fn();
    const req = { headers: {} } as unknown as IncomingMessage;

    const id = genReqId(req, { setHeader } as unknown as ServerResponse);

    expect(id).toMatch(UUID_V4);
    expect(setHeader).toHaveBeenCalledWith("X-Request-Id", id);
  });
});
