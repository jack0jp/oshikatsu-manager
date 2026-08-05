import { defineConfig, globalIgnores } from "eslint/config";
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import nextVitals from "eslint-config-next/core-web-vitals";
import sonarjs from "eslint-plugin-sonarjs";
import security from "eslint-plugin-security";

// 例外リスト。各エントリはルールと構造的に衝突するものだけを置く。
// 1エントリにつき1つの理由をコメントで書き、理由が解消したらエントリごと消す。
// インラインの eslint-disable は使わない (docs/lint-policy.md 「例外の作法」)。
//
// 例:
// {
//   files: ["lib/supabase/rpc.ts"], // 生成型が及ばないRPCの戻り値
//   rules: { "@typescript-eslint/no-explicit-any": "off" },
// },
const exceptions = [];

const eslintConfig = defineConfig([
  js.configs.recommended,
  ...tseslint.configs.strict,
  ...nextVitals,
  sonarjs.configs.recommended,
  security.configs.recommended,

  // 型情報を要する4ルールのみ。tsconfigに含まれるTSファイルに限定する
  // (eslint.config.mjs 等の設定ファイルはTSプログラムに含まれないため対象外)。
  {
    files: ["**/*.ts", "**/*.tsx"],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-promises": "error",
      "@typescript-eslint/await-thenable": "error",
      "@typescript-eslint/no-base-to-string": "error",
    },
  },

  {
    rules: {
      // サイズ・複雑さ
      "max-lines-per-function": [
        "error",
        { max: 60, skipBlankLines: true, skipComments: true },
      ],
      complexity: ["error", 20],
      "max-depth": ["error", 4],
      "max-params": ["warn", 6],
      "max-nested-callbacks": ["error", 4],
      "sonarjs/cognitive-complexity": ["error", 15],

      // 型の逃げ道封鎖
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-non-null-assertion": "error",
      "@typescript-eslint/consistent-type-assertions": "error",

      // テスト
      "sonarjs/assertions-in-tests": "error",
      "sonarjs/no-ignored-exceptions": "error",
    },
  },

  ...exceptions,

  // Default ignores of eslint-config-next:
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts"]),
]);

export default eslintConfig;
