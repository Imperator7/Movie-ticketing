import type { Element } from "hast";

export const MIN_ZOOM = 0.25;
export const MAX_ZOOM = 3;

/** Natural width of a mermaid SVG, read from its viewBox. */
export function svgWidth(svg: string): number | null {
  const match = /viewBox="[\d.-]+ [\d.-]+ ([\d.]+) [\d.]+"/.exec(svg);
  return match ? Number(match[1]) : null;
}

/** Clamps a zoom level to [MIN_ZOOM, MAX_ZOOM], rounded to 2 decimals. */
export function clampZoom(zoom: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, +zoom.toFixed(2)));
}

/** Zoom level that fits a diagram of `naturalWidth` into `availableWidth` (never upscales). */
export function fitZoom(availableWidth: number, naturalWidth: number): number {
  return Math.min(1, clampZoom(availableWidth / naturalWidth));
}

/** Returns the source of a ```mermaid fenced block, or null for any other <pre>. */
export function mermaidSource(pre: Element | undefined): string | null {
  const code = pre?.children[0];
  if (code?.type !== "element" || code.tagName !== "code") return null;
  const classes = code.properties.className;
  if (!Array.isArray(classes) || !classes.includes("language-mermaid")) return null;
  return code.children.map((child) => (child.type === "text" ? child.value : "")).join("");
}
