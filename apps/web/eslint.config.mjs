import { globalIgnores } from "eslint/config";
import { next } from "@movie/eslint-config/next";

const config = [
  globalIgnores([".next/**", "out/**", "build/**", "coverage/**", "next-env.d.ts"]),
  ...next,
  {
    languageOptions: {
      parserOptions: {
        projectService: { allowDefaultProject: ["*.js", "*.mjs"] },
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
];

export default config;
