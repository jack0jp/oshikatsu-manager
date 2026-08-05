# 推し活スケジュール・予算管理アプリ

宝塚・歌舞伎・アイドルライブなど複数ジャンルの「推し活」について、公演情報・チケット申込・参加予定・予算/支出をまとめて管理するWebアプリ。

## 技術スタック

- Next.js / TypeScript
- Supabase (PostgreSQL + Auth / Google SSO / RLS)
- Vercel (Hobby)
- MCPサーバー (stdio。PCのClaudeから利用)
- Vitest / ESLint / GitHub Actions

## ドキュメント

| ファイル | 内容 |
|---|---|
| [`docs/prd.md`](docs/prd.md) | 仕様、スコープ、決定事項 |
| [`docs/data-model.md`](docs/data-model.md) | データモデル設計 |
| [`docs/permissions.md`](docs/permissions.md) | 権限マトリクスとRLSの検証要件 |
| [`docs/lint-policy.md`](docs/lint-policy.md) | lint/型の運用方針、例外の作法 |
| [`docs/testing.md`](docs/testing.md) | テストの書き方 |
| [`CLAUDE.md`](CLAUDE.md) | AIエージェント向けの規約 |

## セットアップ

```
yarn install
cp .env.example .env.local   # Supabaseの接続情報を設定
supabase start               # ローカルDB
yarn dev
```

## 開発方針

このリポジトリは**人間がdiffを読まない前提**で運用する。品質は静的解析とテストで担保し、
コードレビューは別モデルによる自動レビューをCIで回す。詳細は `CLAUDE.md` と `docs/` を参照。
