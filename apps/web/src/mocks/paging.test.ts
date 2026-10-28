import { describe, expect, it } from "vitest";
import { pagingIssues } from "./handlers";

const issues = (query: string, scope = false) =>
  pagingIssues(new URLSearchParams(query), { scope });

describe("pagingIssues (the mock validates queries like the real API)", () => {
  it("accepts valid and missing values", () => {
    expect(issues("")).toEqual([]);
    expect(issues("page=2&pageSize=50")).toEqual([]);
    expect(issues("scope=past&page=1", true)).toEqual([]);
  });

  it("flags page and pageSize out of range", () => {
    expect(issues("page=0")).toEqual([{ path: ["page"], code: "too_small" }]);
    expect(issues("pageSize=51")).toEqual([{ path: ["pageSize"], code: "too_big" }]);
    expect(issues("pageSize=0")).toEqual([{ path: ["pageSize"], code: "too_small" }]);
    expect(issues("page=abc")).toEqual([{ path: ["page"], code: "invalid_type" }]);
  });

  it("flags an unknown scope only where scope exists", () => {
    expect(issues("scope=all", true)).toEqual([{ path: ["scope"], code: "invalid_value" }]);
    expect(issues("scope=all", false)).toEqual([]);
  });
});
