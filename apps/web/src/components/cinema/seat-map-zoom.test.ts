import { describe, expect, it } from "vitest";
import {
  anchoredScroll,
  clampZoom,
  defaultZoom,
  distanceBetween,
  MAX_ZOOM,
  MIN_DEFAULT_ZOOM,
  MIN_ZOOM,
  pinchScale,
  zoomReducer,
} from "./seat-map-zoom";

describe("clampZoom", () => {
  it("keeps the zoom between the limits and rounds to 2 decimals", () => {
    expect(clampZoom(10)).toBe(MAX_ZOOM);
    expect(clampZoom(0.01)).toBe(MIN_ZOOM);
    expect(clampZoom(1.23456)).toBe(1.23);
    expect(clampZoom(Number.NaN)).toBe(1);
    expect(clampZoom(Infinity)).toBe(1);
  });
});

describe("zoomReducer", () => {
  it("steps in and out by 25% and clamps at both ends", () => {
    expect(zoomReducer(1, { type: "in" })).toBe(1.25);
    expect(zoomReducer(1, { type: "out" })).toBe(0.8);
    let value = 1;
    for (let i = 0; i < 30; i++) value = zoomReducer(value, { type: "in" });
    expect(value).toBe(MAX_ZOOM);
    for (let i = 0; i < 30; i++) value = zoomReducer(value, { type: "out" });
    expect(value).toBe(MIN_ZOOM);
  });

  it("set and reset are clamped too", () => {
    expect(zoomReducer(1, { type: "set", value: 99 })).toBe(MAX_ZOOM);
    expect(zoomReducer(2, { type: "reset", to: 0.8 })).toBe(0.8);
    expect(zoomReducer(2, { type: "reset", to: 0 })).toBe(MIN_ZOOM);
  });
});

describe("defaultZoom", () => {
  it("is 1 when the map fits or the sizes are unknown", () => {
    expect(defaultZoom(800, 600)).toBe(1);
    expect(defaultZoom(0, 600)).toBe(1);
    expect(defaultZoom(300, 0)).toBe(1);
  });

  it("shrinks on a narrow screen but never below 80% (a 32 px seat stays above 24 px)", () => {
    expect(defaultZoom(450, 600)).toBe(MIN_DEFAULT_ZOOM); // 450/600 = 0.75 is below the floor
    expect(defaultZoom(300, 600)).toBe(MIN_DEFAULT_ZOOM);
    expect(32 * defaultZoom(300, 600)).toBeGreaterThanOrEqual(24);
  });

  it("fits exactly when the map is only a little wider than the screen", () => {
    expect(defaultZoom(540, 600)).toBe(0.9);
  });
});

describe("pinch", () => {
  it("scales by how much the fingers moved apart, clamped", () => {
    expect(pinchScale(1, 100, 150)).toBe(1.5);
    expect(pinchScale(1, 100, 50)).toBe(0.5);
    expect(pinchScale(2, 100, 400)).toBe(MAX_ZOOM);
    expect(pinchScale(1, 0, 100)).toBe(1);
  });

  it("anchoredScroll keeps the content point under the fingers fixed", () => {
    // 100 px scrolled, fingers at x=50, zoom 1 -> 2: the point at content x=150 stays at viewport x=50.
    expect(anchoredScroll(100, 50, 1, 2)).toBe(250);
    expect((250 + 50) / 2).toBe(150);
    expect(anchoredScroll(0, 0, 1, 0.5)).toBe(0);
    expect(anchoredScroll(10, 100, 1, 0.5)).toBe(0); // never negative
    expect(anchoredScroll(10, 5, 0, 2)).toBe(10);
  });

  it("distanceBetween", () => {
    expect(distanceBetween({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
  });
});
