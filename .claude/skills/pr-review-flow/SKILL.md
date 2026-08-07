---
name: pr-review-flow
description: このリポジトリのPR運用手順。PRを作成する / Draftで出す / gh pr ready でReady化する / レビューボット(Claude, Codex, CodeRabbit, GitHub Copilot)の指摘を分類して対応する / Copilotのプレミアムリクエストやquota上限・レート制限に対処する / PRをマージする、といった作業のときに読む。「PR作って」「レビュー通して」「ready にして」「copilot レビュー」「マージして」で発火。
---

# PRレビューフロー

## 原則

Draft先行の目的は、**Copilotのプレミアムリクエスト消費を「Ready化時の1回」に限定すること**。
Claude/Codex/CodeRabbitはDraft中に何度反復してもプレミアムリクエストを消費しない。
PR #18〜#32の実績分析(Claude/Copilotの指摘重複率、Copilotのクレジット消費が
実測で1レビューあたりプレミアムリクエスト13回相当。公式の固定値ではなく実績値)に基づく判断。

## Draftフェーズ

PRはまず`gh pr create --draft`でDraft作成する。

- **Claude**(`claude-review.yml`): `CLAUDE_CODE_OAUTH_TOKEN`設定時にdraftのpushごとに走る。未設定時はスキップ
- **Codex**(`codex-review.yml`): `OPENAI_API_KEY`設定時のみ走る。未設定の間は自動でスキップ(意図的。`docs/roadmap.md`「保留: 外部アカウント待ち」参照)
- **CodeRabbit**(`.coderabbit.yaml`): `drafts: true`でdraft中もレビュー対象。ただしFreeプランはGitHub連携のPRレビューが**1回/時/開発者**に制限されている(PR #35で実際にレート制限を確認済み。詳細は`docs/roadmap.md`「CodeRabbitの導入」参照)。Draftで短時間に何度もpushしても2回目以降はスキップされうる。反復の主力はClaude/Codexで、CodeRabbitは取れたときに追加の視点が入る、という位置づけで期待値を持つこと
- **GitHub Copilot**(`copilot_code_review` Ruleset): `review_draft_pull_requests: false`のためdraft中は走らない

Draftで指摘がなくなるまで反復する。

## Ready化

指摘が尽きたら`gh pr ready`でReady for reviewに変える。このタイミングでCopilotの最終レビューが1回走る(`review_draft_pull_requests: false`、Ready化がトリガー)。

## Ready後の運用

Ready化後の追加修正は、ローカルで全部直してからまとめて1回でpushする。
`copilot_code_review` Rulesetの`review_on_push`を`false`にしておけば、
Ready後のpushではCopilotの自動レビューは走らない(CIとClaudeレビュー、CodeRabbitは
上記のとおり通常どおり走るので、機械的なバックストップは失われない)。
**この設定は2026-08-07時点でリポジトリに未適用。**`gh api`でのRuleset書き込みは
Claude Codeのauto mode分類器にブロックされるため、人間が手動で適用する必要がある
(適用状況は`gh api repos/{owner}/{repo}/rulesets`で`review_on_push`の値を確認できる)。
未適用のままだとReady後のpushのたびにCopilotの自動レビューが走り、
プレミアムリクエストを消費し続ける点に注意。

Copilotの再レビューが必要なのは次の2つの場合だけで、マージ直前に手動で1回だけ行う。

1. 最初のCopilotレビューがquota上限で失敗し、中身のないコメントしか返っていない
2. Ready後にコードの実装を変更した(ドキュメント・コメント・テスト名のみの修正は対象外)

再リクエストは以下のコマンドで行う。1PRにつき手動再リクエストは1回まで。
2回目が必要だと感じたらDraftに戻し(`gh pr ready --undo`)、Claude/Codex/CodeRabbitで反復し直す。

```bash
gh api repos/{owner}/{repo}/pulls/{number}/requested_reviewers -X POST \
  -f 'reviewers[]=copilot-pull-request-reviewer[bot]'
```

## quota失敗時の見分け方

Copilotの最終レビューは「プレミアムリクエストのquota上限に達したため実行できなかった」
という形で失敗することがある(PR #35で発生)。この場合レビューコメントは投稿されるが
中身のないもので、コードは実際にはレビューされていない。quotaを追加してから上記コマンドで
再リクエストする。

## 指摘の扱いとマージ

- 人間の承認レビューは必須にしていない(現状は開発者本人のみのため。GitHubはPR作成者自身の
  承認をカウントしない)。マージの実行自体が「人間の確認」に当たる(`docs/prd.md` 8.5)
- ボットの指摘は機械的に全適用しない。「本物の修正 / 妥当なnitpick / 誤検知」に分類し、
  何を直して何を意図的に見送ったかをPRにコメントする
- PRを作成したらCIとレビューボットの結果を待ち、指摘を分類してから自分でマージする。
  mainに直接pushしない
