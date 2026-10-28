import { describe, expect, it } from "vitest";
import { AppException } from "../errors/app.exception.js";
import { SlugParamPipe, UuidParamPipe } from "./param-pipes.js";

function expectNotFound(fn: () => unknown): void {
  try {
    fn();
    expect.unreachable("should have thrown");
  } catch (error) {
    expect(error).toBeInstanceOf(AppException);
    expect((error as AppException).getStatus()).toBe(404);
    expect(error).toMatchObject({ code: "NOT_FOUND" });
  }
}

describe("UuidParamPipe", () => {
  const pipe = new UuidParamPipe();

  it("lets a UUID through", () => {
    expect(pipe.transform("6f1c0a52-3c8e-4f0e-9a52-0d9f3b1f2a10")).toBe(
      "6f1c0a52-3c8e-4f0e-9a52-0d9f3b1f2a10",
    );
  });

  it.each([
    "",
    "abc",
    "123",
    "6f1c0a52-3c8e-4f0e-9a52",
    "6f1c0a52-3c8e-4f0e-9a52-0d9f3b1f2a10x",
    "'; drop",
  ])("answers 404 for %j", (value) => {
    expectNotFound(() => pipe.transform(value));
  });
});

describe("SlugParamPipe", () => {
  const pipe = new SlugParamPipe();

  it.each(["dune-part-two", "ebenezer", "movie-2026", "a", "x".repeat(120)])(
    "accepts %j",
    (value) => {
      expect(pipe.transform(value)).toBe(value);
    },
  );

  it.each(["", "Dune", "under_score", "dots.in.slug", "ดูน", "a b", "x".repeat(121), "../etc"])(
    "answers 404 for %j",
    (value) => {
      expectNotFound(() => pipe.transform(value));
    },
  );
});
