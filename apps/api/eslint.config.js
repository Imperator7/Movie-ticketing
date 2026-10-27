import { nest } from "@movie/eslint-config/nest";

export default [
  { ignores: ["dist/**", "coverage/**", "src/generated/**"] },
  ...nest,
  {
    languageOptions: {
      parserOptions: {
        projectService: { allowDefaultProject: ["*.js", "*.mjs"] },
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
];
