import { describe, expect, it } from "vitest";
import { safeNextPath } from "./safe-redirect";

describe("safeNextPath", () => {
  it.each([
    "/th",
    "/en",
    "/th/movies/dune-part-two",
    "/en/showtime?id=abc&seats=A5,A6",
    "/th/checkout?bookingId=1#pay",
    "/th/movies/%E0%B8%94%E0%B8%B9%E0%B8%99",
  ])("accepts %s", (path) => {
    expect(safeNextPath(path, "th")).toBe(path);
  });

  it.each([
    ["//evil.com"],
    ["//evil.com/th/x"],
    ["https://evil.com"],
    ["https://evil.com/th/x"],
    ["javascript:alert(1)"],
    ["/\\evil.com"],
    ["/th\\..\\evil"],
    ["/th/../x"],
    ["/th/%2e%2e/x"],
    ["/th/./x"],
    ["/th/%2e%2E%2fx"],
    ["/fr/movies"],
    ["/movies"],
    ["/thx"],
    ["/ th/x"],
    ["/th/x\n"],
    ["/th/%zz"],
    ["th/movies"],
    ["evil.com"],
    [""],
  ])("rejects %j", (path) => {
    expect(safeNextPath(path, "th")).toBe("/th");
  });

  it("falls back to the given locale for null and undefined", () => {
    expect(safeNextPath(null, "en")).toBe("/en");
    expect(safeNextPath(undefined, "en")).toBe("/en");
  });
});
