export default {
  extends: ["@commitlint/config-conventional"],
  rules: {
    // Commit bodies carry AI attribution lines and longer explanations.
    "body-max-line-length": [0],
  },
};
