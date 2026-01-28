import js from "@eslint/js";
import boundaries from "eslint-plugin-boundaries";
import importPlugin from "eslint-plugin-import";
import tsPlugin from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";
import vue from "eslint-plugin-vue";
import vueParser from "vue-eslint-parser";
import prettier from "eslint-config-prettier";
import globals from "globals";

export default [
  {
    ignores: ["dist/**", "node_modules/**"],
  },
  js.configs.recommended,
  ...vue.configs["flat/recommended"],
  {
    files: ["**/*.{ts,tsx,vue}"],
    languageOptions: {
      parser: vueParser,
      parserOptions: {
        parser: tsParser,
        sourceType: "module",
        ecmaVersion: "latest",
        extraFileExtensions: [".vue"],
      },
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    plugins: {
      "@typescript-eslint": tsPlugin,
      boundaries,
      import: importPlugin,
    },
    settings: {
      "boundaries/elements": [
        { type: "ui", pattern: "src/ui/*" },
        { type: "features", pattern: "src/features/*" },
        {
          type: "core",
          pattern: [
            "src/api/*",
            "src/auth/*",
            "src/router/*",
            "src/views/*",
            "src/components/*",
            "src/widgets/*",
            "src/composables/*",
            "src/assets/*",
          ],
        },
      ],
    },
    rules: {
      "boundaries/element-types": [
        "error",
        {
          default: "allow",
          rules: [{ from: "ui", disallow: ["features"] }],
        },
      ],
      "no-undef": "off",
      "no-unused-vars": "off",
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "import/no-unresolved": "off",
    },
  },
  prettier,
];
