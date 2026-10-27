import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "./password.js";
import { PasswordService } from "./password.service.js";

describe("password hashing", () => {
  it("produces an argon2id hash with m=19456 (19 MiB), t=2, p=1", async () => {
    const hash = await hashPassword("correct horse battery staple");

    expect(hash).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
  });

  it("verifies the right password and rejects a wrong one", async () => {
    const hash = await hashPassword("s3cret-pass");

    expect(await verifyPassword(hash, "s3cret-pass")).toBe(true);
    expect(await verifyPassword(hash, "s3cret-pasS")).toBe(false);
    expect(await verifyPassword(hash, "")).toBe(false);
  });

  it("salts: the same password hashes differently each time", async () => {
    expect(await hashPassword("same")).not.toBe(await hashPassword("same"));
  });

  it("returns false (does not throw) for a malformed stored hash", async () => {
    expect(await verifyPassword("not-a-hash", "x")).toBe(false);
    expect(await verifyPassword("", "x")).toBe(false);
  });

  it("handles unicode passwords", async () => {
    const hash = await hashPassword("รหัสผ่านลับ-🔐");

    expect(await verifyPassword(hash, "รหัสผ่านลับ-🔐")).toBe(true);
  });
});

describe("PasswordService dummy path", () => {
  it("verifyDummy always returns false, even for the dummy's own source, and does real hashing work", async () => {
    const service = new PasswordService();
    await service.onModuleInit();

    const started = performance.now();
    const result = await service.verifyDummy("whatever");
    const dummyMs = performance.now() - started;

    const real = await service.hash("whatever");
    const realStarted = performance.now();
    await service.verify(real, "whatever");
    const realMs = performance.now() - realStarted;

    expect(result).toBe(false);
    // Same order of magnitude as a real verification (both run argon2id), not a no-op.
    expect(dummyMs).toBeGreaterThan(realMs / 5);
  });

  it("verifyDummy works even before onModuleInit (empty hash) without throwing", async () => {
    expect(await new PasswordService().verifyDummy("x")).toBe(false);
  });
});
