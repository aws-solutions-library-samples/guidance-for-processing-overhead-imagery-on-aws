import js from "@eslint/js";
import tseslint from "@typescript-eslint/eslint-plugin";
import tsparser from "@typescript-eslint/parser";
import importPlugin from "eslint-plugin-import";
import prettierPlugin from "eslint-plugin-prettier";
import jestPlugin from "eslint-plugin-jest";
import simpleImportSortPlugin from "eslint-plugin-simple-import-sort";
import globals from "globals";

export default [
  {
    ignores: [
      "**/cdk.out/**",
      "cdk.out/**",
      "**/node_modules/**",
      "**/dist/**",
      "dist/**",
      // External components (cloned by deploy script)
      "lib/osml-model-runner/**",
      "lib/osml-tile-server/**",
      "lib/osml-data-intake/**"
      // Native components like lib/osml-vpc/ are NOT ignored
    ]
  },
  js.configs.recommended,
  // Configuration for JavaScript files
  {
    files: ["**/*.js", "**/*.mjs"],
    languageOptions: {
      ecmaVersion: 2020,
      sourceType: "module",
      globals: { ...globals.node, ...globals.es2020, ...globals.jest }
    },
    plugins: {
      import: importPlugin,
      prettier: prettierPlugin,
      jest: jestPlugin,
      "simple-import-sort": simpleImportSortPlugin
    },
    rules: {
      "import/default": "off",
      "import/order": "off",
      "import/no-namespace": "error",
      "simple-import-sort/imports": "error",
      "prettier/prettier": "error"
    }
  },
  // Configuration for TypeScript files
  {
    files: ["**/*.ts"],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        project: "./tsconfig.json",
        ecmaVersion: 2020,
        sourceType: "module"
      },
      globals: { ...globals.node, ...globals.es2020, ...globals.jest }
    },
    plugins: {
      "@typescript-eslint": tseslint,
      import: importPlugin,
      prettier: prettierPlugin,
      jest: jestPlugin,
      "simple-import-sort": simpleImportSortPlugin
    },
    rules: {
      "import/default": "off",
      "import/order": "off",
      "import/no-namespace": "error",
      "simple-import-sort/imports": "error",
      "@typescript-eslint/no-unused-vars": "error",
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-expressions": ["error", { allowTernary: true }],
      "@typescript-eslint/no-unsafe-assignment": "warn",
      "@typescript-eslint/interface-name-prefix": "off",
      "@typescript-eslint/no-empty-interface": "off",
      "@typescript-eslint/no-inferrable-types": "off",
      "@typescript-eslint/no-non-null-assertion": "off",
      "@typescript-eslint/require-await": "error",
      "@typescript-eslint/no-empty-function": "off",
      "jest/no-done-callback": "off",
      "jest/no-conditional-expect": "off",
      "prettier/prettier": "error",
      "require-await": "off"
    },
    settings: {
      "import/resolver": {
        typescript: {
          alwaysTryTypes: true
        }
      }
    }
  }
];
