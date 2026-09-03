import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import prettier from "eslint-config-prettier";

/* Flat config for the monorepo. `prettier` is last so formatting rules never
   fight the formatter. */

// Underscore-prefixed args/vars are an intentional "unused on purpose" marker;
// keep the rest as errors.
const shared = {
  "@typescript-eslint/no-unused-vars": [
    "error",
    { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrors: "none" },
  ],
};

// The classic Rules of Hooks stay as errors; the dependency check is a warning
// because it has real false positives on deliberate one-shot effects.
const hooks = {
  "react-hooks/rules-of-hooks": "error",
  "react-hooks/exhaustive-deps": "warn",
};

export default tseslint.config(
  {
    ignores: ["**/node_modules", "**/dist", "**/*.config.js", "**/*.config.mjs", "**/*.config.ts"],
  },
  {
    files: ["packages/core/src/**/*.ts"],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: "module",
      globals: { ...globals.node },
    },
    rules: shared,
  },
  {
    files: ["packages/cli/src/**/*.ts", "packages/cli/src/**/*.tsx"],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: "module",
      globals: { ...globals.node },
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    plugins: { "react-hooks": reactHooks },
    rules: { ...shared, ...hooks },
  },
  {
    files: ["packages/web/src/**/*.ts", "packages/web/src/**/*.tsx"],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: "module",
      globals: { ...globals.browser },
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    plugins: { "react-hooks": reactHooks },
    rules: { ...shared, ...hooks },
  },
  prettier,
);
