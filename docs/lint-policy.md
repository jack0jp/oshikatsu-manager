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

### 層の境界 (`common/` / `lib/` / `app/` / `mcp/`)

`CLAUDE.md`「ディレクトリ構成」が定める依存の向きを、`no-restricted-imports` と
`no-restricted-syntax` で固定する(issue #43)。**向きが逆でもTypeScriptは通り、テストも緑になる。**
人間がdiffを読まない前提では、ここを機械が止めないと誰も気づかない。

許す向きは1方向だけ。

```text
app/ ──┐                     app/ と mcp/ は同じ操作の2経路。互いにimportしない
       ├──> common/ (判断)
mcp/ ──┘                     common/ はどこにも依存しない(npmの純粋な
       │                     ユーティリティを除く)
app/ ──┤
       ├──> lib/ (I/O) ──> common/ は型だけ (`import type`)
mcp/ ──┘
```

| 層 | 禁止するimport | 理由 |
| --- | --- | --- |
| `common/` | `app/` `lib/` `mcp/` / `next*` `react*` / `@supabase/*` | 判断ロジック層。何かに依存した瞬間に「Supabaseもブラウザも無しに全ルールをテストできる」(`docs/roadmap.md` フェーズ2の完了条件)が壊れる |
| `lib/` | `app/` `mcp/` / `common/` の値としてのimport(`import type` は可) | I/O層にルールを持たせない。呼び出し側に依存させない |
| `app/` | `mcp/` / `@supabase/*` | クエリは `lib/` に置く。2経路を直結させない |
| `mcp/` | `app/` / `next*` `react*` / `@supabase/*` | stdioサーバーがNext.jsを丸ごと読み込むのを防ぐ |

`app/` から `lib/` へのimportは**禁止していない。**`app/` が `lib/` のクエリ関数を呼ぶこと自体は
正当なI/O呼び出しで、これを塞ぐと今度はSupabaseクライアントを直接握ったクエリが `app/` に
生えるだけになる。禁止したいのは「importすること」ではなく「結果を使って判断すること」である。

**だからimportの向きだけでは足りない。**判断ロジックの実体である配列操作を、消費側の2層
(`app/` と `mcp/`)で `no-restricted-syntax` により禁止する。`docs/roadmap.md` フェーズ3の
「`app/` から `lib/` のクエリ結果を直接フィルタ・集計するコード」を実際に捕まえているのはこちら。

```text
filter find findIndex findLast findLastIndex flatMap
every some sort toSorted reduce reduceRight
```

`.map()` は描画のための変換として正当なので除いてある。引っかかったら
`common/` のpure関数に切り出す(`CLAUDE.md`「ルールをpure関数に切り出す」の
「フィルタ、並び順、検証、集計、権限判定、日付計算」がそのまま対象)。

**`mcp/` も対象に含めている。**`app/` と同じく `common/` を経由せず `lib/` を直接叩いて
判断する余地があり、そちらだけ古いルールで動き続けるのがこのリポジトリで最も痛い壊れ方
(`CLAUDE.md`「MCPサーバーとWeb UIは同じ操作を2経路持つ」)。着手時点で `mcp/` は空なので、
含めるコストはゼロだった。

#### 設定を書くときの落とし穴

- **パッケージ名も `paths` ではなく `patterns` に書く。**`paths` は完全一致しか見ないため、
  `next` を禁止しても `next/headers` がすり抜ける
- **相対パスも列挙する。**内部モジュールは `@/` エイリアスで書く規約だが、`../../lib/x` と
  書けばエイリアスのパターンをすり抜ける。両方の表記を並べている(相対は5階層まで)。
  逆に `**/lib/**` のような広いパターンは使わない。npmパッケージの深いパスを巻き込む
- **`lib/` の `common/` 制約だけ `@typescript-eslint/no-restricted-imports` を使う。**
  `allowTypeImports` は拡張ルール側にしかない。型を二重定義しない方針(上記「型の出どころ」)と
  両立させるため、型のimportは通す必要がある

#### 残っているギャップ

**`lib/` には構文ルールを掛けていない。**PostgRESTのクエリビルダが `.filter()` を持つため
(`supabase.from(...).select().filter("col", "eq", v)`)、同じ名前で誤検知する。
`lib/` 内での `.reduce()` による集計は機械では止まらない。`lib/` 側は
「`common/` を値としてimportしない」制約だけで押さえている。

導入時点(issue #43)で `app/` はNext.jsの雛形のみ、`lib/` と `mcp/` は空だったため、
違反は1件もなく、drainを挟まず**最初からerror**で入れた。

### markdown (`docs/**/*.md`, `.claude/skills/**/*.md`, ルート直下 `*.md`)

`markdownlint-cli2`(設定は `.markdownlint-cli2.jsonc`)を `yarn lint` に統合している。
CodeRabbitがPR #35〜#39で繰り返し指摘した「コードフェンスに言語識別子がない(MD040)」
「フェンス後に空行がない(MD031)」は、本来ここで無料かつ即座に拾えるべきものだった。

デフォルトルールセット(全ルールon)をそのまま採用し、以下2つだけ理由付きでoffにしている
(理由は `.markdownlint-cli2.jsonc` 内のコメントにも書いてある)。

| ルール | 扱い | 理由 |
| --- | --- | --- |
| MD013 (line-length) | off | 日本語の長文段落には改行位置の慣習がなく、誤検知の温床になるだけで実バグを捕まえない |
| MD036 (no-emphasis-as-heading) | off | `**強調**` を見出し代わりに使う書き方が `docs/` 全体で既に定着している。実見出しへの一括昇格は目次構造を変える意味のある変更で、機械的にやるものではない |

導入時点(Issue #40)で `docs/**/*.md` 等に236件の違反があったが、
すべて `markdownlint-cli2 --fix` で自動修正できるスタイル系(見出し/リスト/テーブル前後の空行、
テーブルのパイプ間隔など)だったため、drainの手作業を挟まず**その場でfixして初日からerror**にした。
言語識別子の欠落(MD040、3件)と引用ブロック内の空行(MD028、1件)だけは自動修正できず手で直した。

## 型の出どころ

**同じ型を二重に定義しない。**出どころは3つだけ。

| 出どころ | 用途 |
| --- | --- |
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

## レビュー指摘から静的解析を強化する

ボット(Claude/Codex/CodeRabbit/Copilot)の指摘往復には、有料枠やレート制限のコストがかかる
(`pr-review-flow` skill参照)。**本来lintのような静的解析で無料かつ即座に拾えたはずの指摘**に
そのコストを払うのは割に合わない。同じ種類の指摘を機械に払い出したら、静的解析側を強化する。

### 「lintルール化を検討すべき」の判定基準

- **該当する**: フォーマット・構文の機械的な誤り(言語識別子の欠落、インデント、
  クォートの統一、未使用importなど)。人間が読まなくても検出できるもの
- **該当しない**: 文章の論理矛盾、設計判断の妥当性、命名の意味的な適切さなど、
  **意味理解を要するもの**。lintルールとして表現できない

目安として、**同じ種類の指摘が別々のPRで2回以上出たら検討する**。ただし今回のMD040/MD031の
ように「機械的に拾える性質」が明白なものは、1回目でも即座に検討してよい。

### 見つけたときのアクション

- 軽微(既存コードへの影響が小さい、例: markdownルールを1つ追加する程度) →
  **そのPRで即座に**ルールを追加し、この節か対応するプリセットの節を更新する
- 既存コードへの影響が大きい(大量の指摘が出る、設定の見直しが要る) →
  別Issueを立て、上記「新しいルールを追加するとき」のdrain-then-ratchetに従う

`pr-review-flow` skillの指摘分類(本物の修正 / 妥当なnitpick / 誤検知)を使うタイミングで、
「この指摘は静的解析で拾えたはずか」も合わせて自問すること。

## 当面入れないもの

- **jscpd(重複検出) / knip(デッドコード検出)** — コード量が増えてから効くもの。
  導入する場合もCIのゲートにはせず、レポートのみにする。
  初日からブロックすると、無視するための作法(`// knip-ignore` を反射的に付ける等)が育つ。
- **複数OSでのCI** — 実行環境がVercel(Linux)に一本化されているため不要。
