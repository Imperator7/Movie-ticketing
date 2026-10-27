import type { Element } from "hast";
import { describe, expect, it } from "vitest";
import { MAX_ZOOM, MIN_ZOOM, clampZoom, fitZoom, mermaidSource, svgWidth } from "./diagram";

function pre(className: string[] | undefined, text: string): Element {
  return {
    type: "element",
    tagName: "pre",
    properties: {},
    children: [
      {
        type: "element",
        tagName: "code",
        properties: className ? { className } : {},
        children: [{ type: "text", value: text }],
      },
    ],
  };
}

describe("svgWidth", () => {
  it("reads the width from the viewBox", () => {
    expect(svgWidth('<svg viewBox="0 0 1234.5 600">')).toBe(1234.5);
  });

  it("handles negative origins", () => {
    expect(svgWidth('<svg viewBox="-8 -8 400 300">')).toBe(400);
  });

  it("returns null without a viewBox", () => {
    expect(svgWidth("<svg width='10'>")).toBeNull();
  });
});

describe("clampZoom", () => {
  it("keeps values inside the range", () => {
    expect(clampZoom(1.5)).toBe(1.5);
  });

  it("clamps to the minimum and maximum", () => {
    expect(clampZoom(0.01)).toBe(MIN_ZOOM);
    expect(clampZoom(99)).toBe(MAX_ZOOM);
  });

  it("rounds to two decimals so repeated +/- clicks don't drift", () => {
    expect(clampZoom(0.1 + 0.2 + 0.25)).toBe(0.55);
  });
});

describe("fitZoom", () => {
  it("shrinks a wide diagram to fit", () => {
    expect(fitZoom(500, 1000)).toBe(0.5);
  });

  it("never upscales a small diagram", () => {
    expect(fitZoom(2000, 500)).toBe(1);
  });

  it("never goes below the minimum zoom", () => {
    expect(fitZoom(10, 10_000)).toBe(MIN_ZOOM);
  });
});

describe("mermaidSource", () => {
  it("returns the source of a mermaid block", () => {
    expect(mermaidSource(pre(["language-mermaid"], "graph TD; A-->B"))).toBe("graph TD; A-->B");
  });

  it("ignores other languages", () => {
    expect(mermaidSource(pre(["language-sql"], "SELECT 1"))).toBeNull();
  });

  it("ignores code blocks without a language", () => {
    expect(mermaidSource(pre(undefined, "plain"))).toBeNull();
  });

  it("ignores a missing node", () => {
    expect(mermaidSource(undefined)).toBeNull();
  });
});
