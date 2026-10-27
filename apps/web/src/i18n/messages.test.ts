import { describe, expect, it } from "vitest";
import { ErrorCode } from "@/api/generated/model";
import en from "../../messages/en.json";
import th from "../../messages/th.json";

interface Tree {
  [key: string]: string | Tree;
}

function keys(tree: Tree, prefix = ""): string[] {
  return Object.entries(tree).flatMap(([key, value]) =>
    typeof value === "string" ? [`${prefix}${key}`] : keys(value, `${prefix}${key}.`),
  );
}

function leaves(tree: Tree, prefix = ""): [string, string][] {
  return Object.entries(tree).flatMap(([key, value]) =>
    typeof value === "string" ? [[`${prefix}${key}`, value]] : leaves(value, `${prefix}${key}.`),
  );
}

describe("messages", () => {
  it("th.json and en.json have identical key sets", () => {
    expect(keys(th).sort()).toEqual(keys(en).sort());
  });

  it("has an errors.<CODE> entry for every API ErrorCode in both languages", () => {
    for (const code of Object.values(ErrorCode)) {
      expect(th.errors, `th ${code}`).toHaveProperty(code);
      expect(en.errors, `en ${code}`).toHaveProperty(code);
    }
  });

  it("has no unknown error entries", () => {
    const codes = new Set<string>(Object.values(ErrorCode));
    for (const key of Object.keys(th.errors)) expect(codes.has(key), key).toBe(true);
  });

  it("has no empty strings", () => {
    for (const [key, value] of [...leaves(th), ...leaves(en)]) {
      expect(value.trim(), key).not.toBe("");
    }
  });

  it("Thai error messages are written in Thai", () => {
    for (const message of Object.values(th.errors)) expect(message).toMatch(/[฀-๿]/);
  });
});
