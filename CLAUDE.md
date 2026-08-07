# CLAUDE.md

推し活スケジュール・予算管理アプリ。Next.js + Supabase + Vercel。

このリポジトリは**人間がdiffを読まない前提**で運用する。壊れたらCIが赤くなることで品質を担保する。
迷ったら「これは機械が止められるか？」を先に考えること。

## ドキュメント

- 仕様・スコープ・決定事項 → `docs/prd.md`
- 開発の進め方とフェーズ分割 → `docs/roadmap.md`
- データモデル → `docs/data-model.md`
- **権限マトリクスとRLSの検証要件 → `docs/permissions.md`。権限に関わるコードを触る前に必ず読む**
- **lint/型の運用方針と例外の作法 → `docs/lint-policy.md`。lintエラーを消す前に必ず読む**
- **テストの書き方とカバーすべきパターン → `docs/testing.md`。テストを書く/直す前に必ず読む**

## ディレクトリ構成

- `common/` — Web UIとMCPサーバーの**両方が判断に使う**ものを置く。ドメインロジック、Zodスキーマ、型。
  片側にコピーして「同期を保つこと」とコメントするのは**禁止**。あれは必ずいつか片方だけ直される。
- `app/` — Next.js。UIとルートハンドラ。判断ロジックを書かない。
- `mcp/` — MCPサーバー(stdio)。`common/` を呼ぶだけの薄い層に保つ。
- `lib/` — I/O層。Supabaseクライアント、外部通信。ここにルールを書かない。
- `test/` — Vitest。`test/unit/`(依存なし)と`test/db/`(Supabaseローカル起動が必要)を分ける。
- `supabase/` — マイグレーションと生成型。

## 絶対に守ること

- **`as` によるキャストを使わない。**型ガード(`const isX = (v: unknown): v is X => ...`)を書く。
- **`any` を使わない。**
- **`@ts-ignore` / `@ts-expect-error` / `eslint-disable` でエラーを黙らせない。**根本を直す。
  例外が本当に必要なら、インラインではなく設定ファイルに理由付きで書く(`docs/lint-policy.md`)。
- **型を二重に定義しない。**DBの行は `supabase gen types typescript` の生成型、外部入力はZodスキーマから `z.infer` で導出する。
- **`supabase/types.ts` を手で編集しない。**`yarn gen:types` で再生成する。CIが差分を検出したら落ちる。
- **ルールをpure関数に切り出す。**フィルタ、並び順、検証、集計、権限判定、日付計算。
  I/Oは呼び出し側に残す。アプリを起動しないと到達できないルールは、テストされない。
- **境界では依存を引数で渡す。**現在時刻、ユーザーID。import時に時計やプロセスを掴まない。

## このリポジトリ固有の注意

- **MCPサーバーとWeb UIは同じ操作を2経路持つ。**片方だけルールを直すと、もう片方は
  エラーを出さずに古い判断のまま動き続ける。`common/` を経由しているか毎回確認すること。
- **イベントは論理削除。**物理削除を書かない。削除時の支出データの扱いは分岐がある(`docs/prd.md` 4.6)。
- **参加登録の公開設定はデフォルト非公開。**既定値を反転させても何もエラーにならないので、テストで固定する。
- **RLSはservice_roleキーでバイパスされる。**テストで使わない。使うと何も検証していないことになる。

## ブランチとPR

**mainへの直接pushは禁止。**必ずブランチを作成し、PRを経由してmainにマージする。
mainはRulesetで保護されており、リポジトリ管理者(あなた)のみ緊急時にバイパスできる。

**PRはまずDraftで作成する。**Draftでレビューボットと反復し、指摘が尽きてから
`gh pr ready`でReady化してGitHub Copilotの最終レビューを1回だけ受ける。
**手順の詳細(ボットの発火条件、レート制限、quota失敗時の対処、Ready後の運用、
指摘の分類とマージ)は `pr-review-flow` skillを読む。PR作業の前に必ず呼ぶこと。**

## タスク管理とモデルの使い分け

タスクはGitHub Issues + Projects(`推し活管理アプリ 開発`ボード)で管理する。人に確認せず
自律的に何十分〜何時間か作業を進めることを前提にするため、着手前にIssue化されていることを必須とする。

- **設計・方針決定はOpus、実装はSonnet。**
  データモデルの変更、権限マトリクスの変更、フェーズ分割、ドキュメント間の矛盾の解消など
  「何を選ぶか」を判断する作業はOpusが行う。方針が`docs/`に書かれていて、
  それに沿って実装・修正するだけの作業はSonnetに任せる。
- **エスカレーション: 同じ問題に3回試して解決しない場合、Opusにエスカレーションする。**
  闇雲なリトライを重ねない。エスカレーション後は、なぜ3回失敗したかを引き継ぐこと
  (何を試して何が起きたか)。
- Issueには `agent:opus` / `agent:sonnet` ラベルを付け、Projectの `Model` フィールドにも反映する。
  着手する側のモデルが変わったら、両方を更新する。
- Issueには `phase:N` ラベルを付け、`docs/roadmap.md` のフェーズと対応させる。
  フェーズ2バックログは `phase:2-backlog`。
- Projectの `Status` は Todo / In Progress / Blocked / Done。着手時にIn Progressへ、
  他Issueの完了待ちなどで進められない場合はBlockedへ移す。

## コマンド

```
yarn dev              # 開発サーバー
yarn lint             # ESLint
yarn typecheck        # tsc
yarn test             # Vitest (unit)
yarn test:db          # Vitest (DB統合。事前に supabase start が必要)
yarn gen:types        # Supabase生成型の再生成
```

## 作業の終わり方

コミット前に `yarn lint && yarn typecheck && yarn test` を通す。
テストを新しく書いたら、**対象を壊して赤くなることを確認してから戻す**。
壊れたコードでも通るテストは、何か別のものをテストしている。

PRを作成したらCIとレビューボットの結果を待ち、指摘を分類してから自分でマージする(手順は`pr-review-flow` skill)。
mainに直接pushしない。
