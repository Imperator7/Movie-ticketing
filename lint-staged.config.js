export default {
  "*.{ts,tsx,js,mjs,cjs,json,md,yaml,yml,css}": "prettier --write",
  "docs/openapi.yaml": () => "npm run lint:openapi",
};
