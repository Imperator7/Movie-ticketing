import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import tseslint from "typescript-eslint";
import { base } from "./base.js";

/** Next.js: Next's own rules (React, hooks, a11y basics) plus the shared strict TypeScript rules. */
export const next = tseslint.config(...nextVitals, ...nextTs, ...base);

export default next;
