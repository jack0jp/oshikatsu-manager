# lint / 型の運用方針

lintエラーや型エラーを消そうとする前に読むこと。

## 原則

**人間がdiffを読まない前提で運用している。**うるさく言ってくれる仕組みがなければ、誰も気づかない。
「いちいち厳しい」と感じたら、それは設定が間違っているのではなく、この方針が機能している証拠。

**エラーを消す最短経路を取らない。**`@ts-ignore` や `eslint-disable` は最短経路だが、
使うたびに機械が守ってくれる範囲が静かに減る。根本を直す。

## 導入済みのルール

### プリセット

```js
js.configs.recommended
tseslint.configs.strict        // recommended ではなく strict
next/core-web-vitals
sonarjs.configs.recommended    // sonarjs は recommended が最上位
security.configs.recommended   // security も同じ
```

typescript-eslintで `strict` を選んでいるのは、`any` まわりや非nullアサーションのような
「動くけれど後で困る」書き方をerrorにするため。sonarjs / security が `recommended` なのは
手加減ではなく、この2つには strict プリセットが存在しないため。

### サイズ・複雑さ

```js
"max-lines-per-function": ["error", { max: 60, skipBlankLines: true, skipComments: true }],
"complexity": ["error", 20],
"max-depth": ["error", 4],
"max-params": ["warn", 6],
"max-nested-callbacks": ["error", 4],
"sonarjs/cognitive-complexity": ["error", 15],
```

引っかかったら、まず**pure関数として切り出せないか**を考える。
分割の口実として無意味に関数を割るのではなく、判断ロジックがI/Oに埋まっていないかを疑う。

### 型の逃げ道

```js
"@typescript-eslint/no-explicit-any": "error",
"@typescript-eslint/no-non-null-assertion": "error",
"@typescript-eslint/consistent-type-assertions": "error",
```

- `as` によるキャストの代わりに**型ガード**を書く: `const isX = (v: unknown): v is X => ...`
- 非nullアサーション `!` の代わりに、nullの場合の分岐を書く

### 型情報を要するルール(4つだけ)

`projectService` を有効にするとTypeScriptのプログラムを丸ごと構築するため重い。
ただしルール数を増やしてもコストはほぼ変わらない(構築が全部)。
**型情報でなければ原理的に捕まえられないもの**に絞って入れている。

```js
"@typescript-eslint/no-floating-promises": "error",   // await の付け忘れ
"@typescript-eslint/no-misused-promises": "error",    // 同期専用APIに渡されたasyncコールバック
"@typescript-eslint/await-thenable": "error",
"@typescript-eslint/no-base-to-string": "error",      // "[object Object]" になる文字列化
```

`strictTypeChecked` を丸ごと入れないのは、大半がスタイル系のルールで、
上記4つのような**実バグ**が大量の指摘に埋もれるため。

### テスト

```js
"sonarjs/assertions-in-tests": "error",
"sonarjs/no-ignored-exceptions": "error",
```

アサーションのないテストと、握りつぶしたcatchはCIで止める。
以前は人間が目で見つけていたもの。

## 型の出どころ

**同じ型を二重に定義しない。**出どころは3つだけ。

| 出どころ | 用途 |
|---|---|
| `supabase gen types typescript` の生成型 | DBのテーブル行そのもの |
| Zodスキーマ → `z.infer` | 外部入力(フォーム、MCPツール引数)の検証と型 |
| 手書き | 原則なし |

### Supabase生成型の運用

- 生成型(`supabase/types.ts`)は**リポジトリにコミットする**
- **手で編集しない**
- CIで `yarn gen:types` を実行し、差分があればジョブを失敗させる
- これにより「マイグレーションを書いたが型の再生成を忘れた」状態がmainに入らない

### Zodスキーマの共通化

入力検証のZodスキーマは `common/` に1つだけ置き、
**Web UIのフォーム検証とMCPツールの入力スキーマの両方がそこから導出する。**

二重定義すると、片方だけ条件が緩くなったときに、
緩いほうを通ったデータがエラーを出さずに保存される。誰も気づけない。

## 例外の作法

厳しくすれば正当な例外は必ず出る。**ここで `// eslint-disable` を許すと、この方針全体が死ぬ。**

### インラインで消さない

```ts
// ダメ
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const data: any = await client.rpc("...");
```

インラインのdisableは、半年後に「これはまだ必要か？」を判断できない。

### 設定ファイルに理由付きで置く

```js
{
  // 例外リスト。各エントリはルールと構造的に衝突するもの。
  // 理由を最新に保ち、理由が消えたらエントリも消すこと。
  files: [
    "lib/supabase/rpc.ts",   // 生成型が及ばないRPCの戻り値
  ],
  rules: { "@typescript-eslint/no-explicit-any": "off" },
}
```

**1エントリにつき1つの理由**を書く。理由が解消したらエントリを消す。

### 妥協には期限と条件を書く

warnで残すルールがある場合、なぜ今errorにできないのか、いつerrorに上げるのかを書く。

```js
// max-params は WARN のまま。理由: <該当箇所と事情>。
// 解消したら error に上げる。
```

## 新しいルールを追加するとき

**drain してから ratchet する。**

1. まず `warn` で入れる
2. 既存の指摘をゼロにする
3. `error` に上げる

「誰も読まない警告リストに1件足す」ことを許さない。
ゼロにしてからerrorに上げれば、再発した瞬間にCIが落ちる。

新規開発の段階では既存の負債がないので、**最初からerrorで入れられる**。この機会は今しかない。

## 当面入れないもの

- **jscpd(重複検出) / knip(デッドコード検出)** — コード量が増えてから効くもの。
  導入する場合もCIのゲートにはせず、レポートのみにする。
  初日からブロックすると、無視するための作法(`// knip-ignore` を反射的に付ける等)が育つ。
- **複数OSでのCI** — 実行環境がVercel(Linux)に一本化されているため不要。
