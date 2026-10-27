import globals from "globals";
import tseslint from "typescript-eslint";
import { base } from "./base.js";

/** NestJS: Node globals, and the class/decorator patterns Nest relies on. */
export const nest = tseslint.config(...base, {
  languageOptions: { globals: { ...globals.node } },
  rules: {
    // Nest modules are empty decorated classes by design.
    "@typescript-eslint/no-extraneous-class": ["error", { allowWithDecorator: true }],
    // Nest DI needs runtime class references in constructor params, so keep value imports for them.
    "@typescript-eslint/consistent-type-imports": "off",
  },
});

export default nest;
