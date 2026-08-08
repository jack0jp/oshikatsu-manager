import { fileURLToPath } from "node:url";
import path from "node:path";
import { defineConfig, globalIgnores } from "eslint/config";
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import nextVitals from "eslint-config-next/core-web-vitals";
import sonarjs from "eslint-plugin-sonarjs";
import security from "eslint-plugin-security";

// import.meta.dirname はNode.js 20.11+でのみ使えるため、CIのNodeバージョンに
// 依存しないよう fileURLToPath で組み立てる。
const dirname = path.dirname(fileURLToPath(import.meta.url));

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

// ---- 層の境界 (docs/lint-policy.md 「層の境界」) ----
//
// CLAUDE.md「ディレクトリ構成」が定める依存の向きを、importの静的解析で固定する。
// 向きが逆でもTypeScriptは通り、テストも緑になるため、ここで止めないと誰も気づかない。
//
// 内部モジュールは `@/` エイリアスで書く規約だが、相対パス(`../../lib/x`)で書けば
// すり抜けられてしまうので、両方の表記を並べる。
//
// 相対側は階層数を数えず `../**/` で受ける。`../` を必ず先頭に要求するので、
// npmパッケージの深いパス(`somepkg/lib/...`)は巻き込まない。`**/lib/**` のような
// 広いパターンだと巻き込むため使わない。
//
// 副作用として `lib/a/b.ts` から `../common/x`(= `lib/common/x`)のような
// 「同じ名前のサブディレクトリへの相対import」も止まる。層と同名のサブディレクトリは
// そもそも紛らわしいので、この誤検知は許容する。
const layer = (dir) => [`@/${dir}`, `@/${dir}/**`, `../**/${dir}`, `../**/${dir}/**`];

// パッケージ側も `paths` ではなく `patterns` で指定する。`paths` は完全一致しか見ないため、
// `next` を止めても `next/headers` がすり抜ける。
// `next-*` / `react-*` まで含めるのは、`next-auth` `react-hook-form` のようなハイフン系が
// `next/**` `react/**` ではマッチせず抜けるため。
const SUPABASE_CLIENT_PACKAGES = ["@supabase/*", "@supabase/**"];
const WEB_FRAMEWORK_PACKAGES = [
  "next",
  "next/**",
  "next-*",
  "next-*/**",
  "react",
  "react/**",
  "react-*",
  "react-*/**",
];

const MESSAGES = {
  commonPure:
    "common/ は判断ロジック層。I/O(lib/)・UI(app/)・MCP(mcp/)・フレームワーク・" +
    "Supabaseクライアントに依存させない。依存した時点で「Supabaseもブラウザも無しに" +
    "全ルールをテストできる」(docs/roadmap.md フェーズ2の完了条件)が壊れる。" +
    "現在時刻・ユーザーID・DBから読んだ行は引数で受け取る(CLAUDE.md「境界では依存を引数で渡す」)。",
  libNoRules:
    "lib/ にルールを書かない(CLAUDE.md「lib/ — I/O層。ここにルールを書かない」)。" +
    "common/ の判断ロジックを lib/ から呼ぶと、I/O層が判断を持つことになり、" +
    "app/ と mcp/ のどちらを通ったかで結果が変わる余地ができる。" +
    "型だけが必要なら `import type` で書く。",
  libNoCallers:
    "lib/ は I/O層。呼び出し側(app/ / mcp/)に依存させない。依存の向きが逆になると、" +
    "MCPサーバーがNext.jsを丸ごと読み込むことになる。",
  noSupabaseOutsideLib:
    "Supabaseクライアントを直接生成しない。クエリは lib/ に置き、ここはその結果を受け取るだけにする" +
    "(CLAUDE.md「lib/ — I/O層。Supabaseクライアント、外部通信」)。",
  twoRoutes:
    "app/ と mcp/ は同じ操作の2経路。互いにimportせず、共有したい判断は common/ に置く" +
    "(CLAUDE.md「MCPサーバーとWeb UIは同じ操作を2経路持つ」)。",
  mcpNoFramework:
    "mcp/ はstdioサーバー。Next.js / React に依存させない(CLAUDE.md「mcp/ — common/ を" +
    "呼ぶだけの薄い層に保つ」)。",
  noJudgementLogic:
    "取得結果をここでフィルタ・並び替え・集計しない。フィルタ・並び順・検証・集計・権限判定・" +
    "日付計算は common/ のpure関数に切り出し、ここは結果を描画/返却するだけにする" +
    "(CLAUDE.md「ルールをpure関数に切り出す」)。アプリを起動しないと到達できないルールは" +
    "テストされない。表示のための単純な変換は .map() で書く。",
};

// 判断ロジックの持ち出しを検出する配列メソッド。`.map()` は描画のための変換として
// 正当なので除く。`lib/` には掛けない: PostgRESTのクエリビルダが `.filter()` を持つため
// (`supabase.from(...).select().filter("col", "eq", v)`)、同じ名前で誤検知する。
// lib/ 側は上の「common/ の判断ロジックをruntime importしない」制約で押さえる。
const JUDGEMENT_ARRAY_METHODS = [
  "filter",
  "find",
  "findIndex",
  "findLast",
  "findLastIndex",
  "flatMap",
  "every",
  "some",
  "sort",
  "toSorted",
  "reduce",
  "reduceRight",
];

const layerBoundaries = [
  {
    files: ["common/**/*.ts", "common/**/*.tsx"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                ...layer("app"),
                ...layer("lib"),
                ...layer("mcp"),
                ...SUPABASE_CLIENT_PACKAGES,
                ...WEB_FRAMEWORK_PACKAGES,
              ],
              message: MESSAGES.commonPure,
            },
          ],
        },
      ],
    },
  },

  {
    files: ["lib/**/*.ts", "lib/**/*.tsx"],
    rules: {
      "@typescript-eslint/no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: layer("common"),
              message: MESSAGES.libNoRules,
              // 型は二重定義しない(CLAUDE.md)。値としての判断ロジックだけを止める。
              allowTypeImports: true,
            },
            {
              group: [...layer("app"), ...layer("mcp")],
              message: MESSAGES.libNoCallers,
            },
          ],
        },
      ],
    },
  },

  {
    files: ["app/**/*.ts", "app/**/*.tsx"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            { group: SUPABASE_CLIENT_PACKAGES, message: MESSAGES.noSupabaseOutsideLib },
            { group: layer("mcp"), message: MESSAGES.twoRoutes },
          ],
        },
      ],
    },
  },

  {
    files: ["mcp/**/*.ts", "mcp/**/*.tsx"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            { group: SUPABASE_CLIENT_PACKAGES, message: MESSAGES.noSupabaseOutsideLib },
            { group: WEB_FRAMEWORK_PACKAGES, message: MESSAGES.mcpNoFramework },
            { group: layer("app"), message: MESSAGES.twoRoutes },
          ],
        },
      ],
    },
  },

  // importの向きだけでは「lib/ から受け取った配列を app/ で絞り込む」形の層越えを
  // 捕まえられない(app/ が lib/ をimportすること自体は正当な I/O 呼び出しのため)。
  // 判断ロジックの実体である配列操作そのものを、消費側の2層で禁止する。
  {
    files: ["app/**/*.ts", "app/**/*.tsx", "mcp/**/*.ts", "mcp/**/*.tsx"],
    rules: {
      "no-restricted-syntax": [
        "error",
        ...JUDGEMENT_ARRAY_METHODS.map((method) => ({
          selector: `CallExpression[callee.type="MemberExpression"][callee.property.name="${method}"]`,
          message: `.${method}() — ${MESSAGES.noJudgementLogic}`,
        })),
      ],
    },
  },
];

const eslintConfig = defineConfig([
  js.configs.recommended,
  ...tseslint.configs.strict,
  ...nextVitals,
  sonarjs.configs.recommended,
  security.configs.recommended,

  // 型情報を要する4ルールのみ。tsconfigに含まれるTSファイルに限定する
  // (eslint.config.mjs 等の設定ファイルはTSプログラムに含まれないため対象外)。
  {
    files: ["**/*.ts", "**/*.tsx", "**/*.mts"],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: dirname,
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

  ...layerBoundaries,

  ...exceptions,

  // Default ignores of eslint-config-next:
  // supabase/.temp/** は `supabase start` が生成するローカル成果物(.gitignore済み)。
  // tsconfigのプログラムに含まれないため projectService が解析できずParsing errorになる。
  // `yarn test:db` のためにSupabaseを起動しているだけで `yarn lint` が落ちるのを防ぐ。
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "supabase/.temp/**",
  ]),
]);

export default eslintConfig;
