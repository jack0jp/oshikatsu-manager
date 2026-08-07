---
name: pr-review-flow
description: このリポジトリのPR運用手順。PRを作成する / Draftで出す / gh pr ready でReady化する / レビューボット(Claude, Codex, CodeRabbit, GitHub Copilot)の指摘を分類して対応する / Copilotのプレミアムリクエストやquota上限・レート制限に対処する / PRをマージする、といった作業のときに読む。「PR作って」「レビュー通して」「ready にして」「copilot レビュー」「マージして」で発火。
---

# PRレビューフロー

## 原則

Draft先行の目的は、**Copilotのプレミアムリクエスト消費を「Ready化時の1回」に限定すること**
(ただしquota失敗時・実装変更時は、後述の「Ready後の運用」の条件でマージ直前に手動再リクエストを最大1回まで許容する)。
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
`copilot_code_review` Rulesetの`review_on_push`は`false`に設定済み(2026-08-07適用)なので、
Ready後のpushではCopilotの自動レビューは走らない(CIとClaudeレビュー、CodeRabbitは
上記のとおり通常どおり走るので、機械的なバックストップは失われない)。
`gh api`でのRuleset書き込みはClaude Codeのauto mode分類器にブロックされるため、
この設定を変更する場合は人間が手動で行う。適用状況の確認は一覧系エンドポイント
(`gh api repos/{owner}/{repo}/rulesets`)では`rules`が返らず誤判定するため、
各Rulesetの`id`を控えたうえで詳細エンドポイントを使う。`id`はブランチ単位のルール一覧
エンドポイントから取得できる(各ルールに`ruleset_id`が付き、`type`で`copilot_code_review`を
特定できる)。

```bash
# 1. mainに効いているRulesetのidを特定する
gh api repos/{owner}/{repo}/rules/branches/main \
  --jq '.[] | select(.type == "copilot_code_review") | .ruleset_id'

# 2. そのidで詳細を取得し、実際に適用されている値を確認する
gh api repos/{owner}/{repo}/rulesets/{id} \
  --jq '{enforcement, target, conditions, copilot_rules: [.rules[] | select(.type == "copilot_code_review") | .parameters]}'
```

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

## マージ後の振り返り

PRがマージされ、紐づくIssueがクローズされたら、その作業を短く振り返って報告する。

- **うまくいった点**: 今回有効だった進め方(委譲・分業・検証方法など)
- **次回改善したい点**: 同じ問題が再発しないようにするための具体的な変更点
  (プロンプトの書き方、確認の順序、待ち方など)

長い分析は不要。数行程度でよい。目的は同じ非効率を繰り返さないことなので、
気づきが大きい場合はこのskillや`CLAUDE.md`、メモリへの反映も検討する。
