import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ErrorCode } from "./error-code.js";

/** Keeps the enum in lock-step with docs/openapi.yaml (components.schemas.ErrorCode). */
describe("ErrorCode vs docs/openapi.yaml", () => {
  it("lists exactly the codes of the contract", () => {
    const yaml = readFileSync(new URL("../../../../../docs/openapi.yaml", import.meta.url), "utf8");
    const block = /\n {4}ErrorCode:\n([\s\S]*?)\n\n/.exec(yaml)?.[1] ?? "";
    const contractCodes = [...block.matchAll(/^ {8}- ([A-Z_]+)$/gm)].map((match) => match[1]);

    expect(contractCodes.length).toBeGreaterThan(0);
    expect(Object.values(ErrorCode).sort()).toEqual([...contractCodes].sort());
  });
});
