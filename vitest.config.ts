import { defineConfig } from "vitest/config";

// test/unit・test/component・test/db を独立したprojectとして分離する。
// test/db は Supabase ローカル起動が必要なため、`yarn test` からは除外し
// `yarn test:db` でのみ実行する(docs/testing.md「構成」)。
export default defineConfig({
  test: {
    passWithNoTests: true,
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          environment: "node",
          include: ["test/unit/**/*.{test,spec}.ts"],
        },
      },
      {
        extends: true,
        test: {
          name: "component",
          environment: "jsdom",
          include: ["test/component/**/*.{test,spec}.{ts,tsx}"],
        },
      },
      {
        extends: true,
        test: {
          name: "db",
          environment: "node",
          include: ["test/db/**/*.{test,spec}.ts"],
        },
      },
    ],
  },
});
