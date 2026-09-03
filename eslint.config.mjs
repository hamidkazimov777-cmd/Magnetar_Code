import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import prettier from "eslint-config-prettier";

/* Flat config for the monorepo. packages/web keeps its own Next config and is
   linted by `next lint` inside that workspace, so it is ignored here. `prettier`
   is last so formatting rules never fight the formatter. */
export default tseslint.config(
  {
    ignores: ["**/node_modules", "**/dist", "packages/web/**", "**/*.config.{js,mjs,ts}"],
  },
  {
    files: ["packages/core/src/**/*.ts"],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: "module",
      globals: { ...globals.node },
    },
    rules: {
      // Underscore-prefixed args/vars are an intentional "unused on purpose"
      // marker; keep the rest as errors.
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
  {
    // The blessed TUI is still plain CommonJS; it gets replaced in phase 2.
    files: ["packages/cli/**/*.js"],
    extends: [js.configs.recommended],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: "commonjs",
      globals: { ...globals.node },
    },
    rules: {
      // Legacy code: blessed handlers take (ch, key) whether or not they use
      // them, and `catch (e) {}` is used as "best effort" throughout. Unused
      // *variables* are still errors. Phase 2 replaces this file with Ink and
      // tightens the rule back to the core settings.
      "no-unused-vars": ["error", { args: "none", caughtErrors: "none", varsIgnorePattern: "^_" }],
      // `catch (e) {}` is used all over index.js as "best effort"; phase 2
      // replaces those with real handling.
      "no-empty": ["error", { allowEmptyCatch: true }],
    },
  },
  prettier,
);
