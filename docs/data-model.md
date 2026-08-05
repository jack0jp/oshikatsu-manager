# 推し活管理アプリ データモデル設計 (v0.3)

前提: PostgreSQL (Supabase) / Supabase Auth (Google SSO) / RLSによる行レベル制御

## v0.3 での主な変更点
- 削除ガードの `is_admin` 例外を**MVPスコープ外**に変更。カラムは用意するが、
  それを参照する権限判定はRLSにもアプリ層にも実装しない(フェーズ2へ)

## v0.2 での主な変更点
- `event_participants.role` を廃止(編集権限は `events.owner_id` のみで決まる)
- イベントは**全ユーザー共有のカタログ**として扱う(イベント一覧画面に全件表示)
- 参加登録は原則**各ユーザーが自分で行う**(オーナーによる同行者設定方式を廃止)
- 代わりに**招待機能**を追加(MVPでは承認なしで相手のスケジュールに即時反映)
- 参加情報に**公開/非公開の選択**を追加
- イベントの削除は**論理削除**に変更(`event_snapshot` は廃止)
- 他に参加者がいるイベントは**削除不可**とするガードを追加

---

## ER概要

```
auth.users (Supabase管理)
    │
    ├─< profiles                 … 公開用のユーザー情報
    │
    ├─< events                   … 公演・イベント本体(全ユーザー共有カタログ)
    │       │
    │       └─< event_participants … 誰がそのイベントに参加するか
    │
    ├─< ticket_entries           … 抽選・販売の申込単位(個人スコープ)
    │
    ├─< expenses                 … 支出(予算/実績)。個人スコープ
    │
    └─< budgets                  … 期間・ジャンル単位の予算枠(個人スコープ)
```

**画面との対応**
| 画面 | 表示対象 |
|---|---|
| イベント一覧 | 登録されている全イベント(未削除のもの)。オーナーはここから編集・削除 |
| 自分のスケジュール | 自分が `event_participants` に登録しているイベントのみ |

---

## 1. profiles

| カラム | 型 | 制約 | 説明 |
|---|---|---|---|
| id | uuid | PK, FK → auth.users.id | Supabase Authのユーザーid |
| email | text | UNIQUE, NOT NULL | 検索キー |
| display_name | text | | 表示名 |
| is_admin | boolean | NOT NULL, default false | システム管理者フラグ |
| created_at | timestamptz | NOT NULL, default now() | |
| updated_at | timestamptz | NOT NULL, default now() | |

> auth.usersへのトリガーで、サインアップ時に自動作成する運用を想定。
>
> `is_admin` は**カラムのみMVPで用意し、これを参照する権限判定は一切実装しない**。
> 管理者画面と強制削除はフェーズ2(`docs/roadmap.md`「フェーズ2バックログ」)。
> (後からのカラム追加はマイグレーションが必要なため、先に定義だけしておく)

---

## 2. events

公演・イベント本体。**全ユーザーが閲覧できる共有カタログ**。
編集・削除できるのは `owner_id` のユーザーのみ。

| カラム | 型 | 制約 | 説明 |
|---|---|---|---|
| id | uuid | PK, default gen_random_uuid() | |
| owner_id | uuid | FK → profiles.id, NOT NULL | 登録者。編集権限を持つ唯一のユーザー。参加者かどうかとは無関係 |
| genre | text | NOT NULL | 'takarazuka' / 'kabuki' / 'idol' / 'other' |
| title | text | NOT NULL | 公演名・ライブ名 |
| venue | text | | 会場 |
| starts_at | timestamptz | NOT NULL | 開演日時 |
| ends_at | timestamptz | | 終演日時(任意) |
| source_url | text | | 情報源のURL |
| memo | text | | 備考 |
| deleted_at | timestamptz | | **論理削除**。NULLでなければ削除済み扱い |
| created_at | timestamptz | NOT NULL, default now() | |
| updated_at | timestamptz | NOT NULL, default now() | |

**インデックス**: `(starts_at)`, `(owner_id)`, `(deleted_at)`

> `owner_id` は「情報の管理者」であり、「参加者」ではない。
> 登録だけして自分は参加しない、というケースも表現できる。

**削除のガード条件**
- オーナー本人以外の参加者が1人でもいる場合、そのイベントは削除できない
  (他ユーザーのスケジュールから勝手に消えることを防ぐため)
- 参加者がオーナーのみ、または誰もいない場合に限り論理削除が可能
- **MVPではこのガードに例外を設けない。**管理者であってもバイパスできない

> **フェーズ2で追加する例外(MVPでは実装しない)**
> `profiles.is_admin = true` のユーザーが、参加者の有無にかかわらずイベントを
> 強制削除できるようにする(誤登録・重複登録の後始末用)。
>
> カラムだけをMVPで用意し、RLSポリシーもアプリ層の権限判定も**フェーズ1では書かない**。
> 実装するときは `docs/permissions.md` の権限マトリクスに管理者の列を追加し、
> 両層のテストを同時に足すこと。片方だけ実装された状態がいちばん危ない。
>
> 実施タイミングは `docs/roadmap.md`「フェーズ2バックログ」を参照。

> 将来クローラーによる自動登録を行う場合、`owner_id` にシステム用アカウントを
> 割り当てる想定。その場合の編集権限の扱いは別途検討。

---

## 3. event_participants

「誰がそのイベントに参加するか」。自分で登録するほか、**他ユーザーから招待される**こともある。
参加者間に主従関係はない(招待した側が編集権限を持つわけではない)。

| カラム | 型 | 制約 | 説明 |
|---|---|---|---|
| id | uuid | PK | |
| event_id | uuid | FK → events.id, NOT NULL | |
| user_id | uuid | FK → profiles.id, NOT NULL | |
| status | text | NOT NULL | 'considering'(検討中) / 'applied'(申込済) / 'won'(当選) / 'lost'(落選) / 'confirmed'(参戦決定) / 'declined'(見送り) |
| visibility | text | NOT NULL, default 'private' | 'public'(参加を他ユーザーに公開) / 'private'(非公開) |
| invited_by | uuid | FK → profiles.id | 招待された場合の招待元。自分で登録した場合はNULL |
| participation_state | text | NOT NULL, default 'joined' | 'joined'(参加確定) / 'invited'(招待中・承認待ち) / 'rejected'(招待を辞退) |
| created_at | timestamptz | NOT NULL, default now() | |
| updated_at | timestamptz | NOT NULL, default now() | |

**制約**: `UNIQUE (event_id, user_id)`
**インデックス**: `(user_id, event_id)`, `(event_id, visibility)`

> 「自分のスケジュール」はこのテーブルを起点に取得する。
> 参加をやめる = この行のDELETE。他ユーザーの参加情報には影響しない。

### 招待の仕様

- 招待はメールアドレス指定で行う(Google SSOで既にアカウントを持つユーザーのみ)
- 招待できるのは、そのイベントに参加登録している任意のユーザー(オーナー限定ではない)
- 招待された側の行が `event_participants` に作成され、`invited_by` に招待元が入る

**MVPでの挙動**
- 承認フローは設けない。招待した時点で `participation_state = 'joined'` として作成し、
  相手のスケジュールに即時反映される
- 招待された側は、自分の判断でその行を削除できる(参加取りやめ)

**将来拡張(フェーズ2)**
- 招待時に `participation_state = 'invited'` で作成し、相手が承認したら 'joined' に更新する
- そのため participation_state は最初から text型で定義し、状態を増やせるようにしておく

> **将来拡張(nice to have / スコープ外)**
> 「特定のユーザーにだけ公開」を実現する場合は、
> `visibility = 'limited'` を追加し、公開先を保持する子テーブル
> (`event_participant_shares` 等)を新設する。
> そのため visibility は boolean ではなく **text型** で定義しておく。

---

## 4. ticket_entries

チケットの抽選・販売の申込単位。1イベントに複数の申込経路がありうる
(公式先行、協賛企業抽選、一般発売 など)。**個人スコープ**。

| カラム | 型 | 制約 | 説明 |
|---|---|---|---|
| id | uuid | PK | |
| event_id | uuid | FK → events.id, NOT NULL | |
| user_id | uuid | FK → profiles.id, NOT NULL | 誰の申込か |
| entry_type | text | NOT NULL | 'lottery'(抽選) / 'first_come'(先着) |
| provider | text | | 申込元(例: 宝塚友の会、松竹、◯◯株式会社) |
| entry_opens_at | timestamptz | | 受付開始 |
| entry_closes_at | timestamptz | | 受付締切 |
| result_announced_at | timestamptz | | 当落発表日 |
| sale_starts_at | timestamptz | | 一般発売開始 |
| result | text | | 'pending' / 'won' / 'lost' / 'not_applied' |
| memo | text | | |
| created_at | timestamptz | NOT NULL, default now() | |

**インデックス**: `(user_id, entry_closes_at)`, `(user_id, result_announced_at)`

> 「今週締切の申込」「明日当落発表」といったリマインドの起点になる。
> 複数ルートに応募し、いずれかが当選したら `event_participants.status` を
> 'confirmed' に更新する運用(二重管理は許容)。

---

## 5. expenses

支出。予算と実績を1行で持ち、実績はNULL許容。**個人スコープ**。

| カラム | 型 | 制約 | 説明 |
|---|---|---|---|
| id | uuid | PK | |
| user_id | uuid | FK → profiles.id, NOT NULL | |
| event_id | uuid | FK → events.id, NOT NULL | events は論理削除のため参照は保たれる |
| category | text | NOT NULL | 'ticket' / 'travel' / 'goods' / 'lodging' / 'other' |
| planned_amount | integer | | 予算額(円) |
| actual_amount | integer | | 実績額(円)。NULLなら未確定 |
| spent_on | date | | 実績の支出日 |
| memo | text | | |
| created_at | timestamptz | NOT NULL, default now() | |
| updated_at | timestamptz | NOT NULL, default now() | |

**インデックス**: `(user_id, spent_on)`, `(user_id, event_id)`

> **削除時の分岐ロジック(アプリ層で実装)**
> 参加取りやめ / イベントの論理削除の際、対象ユーザーの expenses を確認する。
> - `actual_amount IS NULL` の行 → 物理削除(予算は見込み値のため)
> - `actual_amount IS NOT NULL` の行 → 残す(実績は家計の記録として保全)
>
> events は論理削除なので、支出から辿ってイベント名などは常に参照できる。
> 集計時は `deleted_at` を無視して実績を数える。

---

## 6. budgets

期間・ジャンル単位の予算枠。**個人スコープ**。

| カラム | 型 | 制約 | 説明 |
|---|---|---|---|
| id | uuid | PK | |
| user_id | uuid | FK → profiles.id, NOT NULL | |
| period_type | text | NOT NULL | 'monthly' / 'yearly' |
| period_start | date | NOT NULL | 対象期間の開始日 |
| genre | text | | NULLなら全ジャンル合算の枠 |
| amount | integer | NOT NULL | 予算額(円) |
| created_at | timestamptz | NOT NULL, default now() | |

**制約**: `UNIQUE (user_id, period_type, period_start, genre)`

---

## RLSポリシー方針

| テーブル | SELECT | INSERT | UPDATE / DELETE |
|---|---|---|---|
| profiles | 全ユーザー(公開カラムは限定) | 本人のみ | 本人のみ |
| events | 全ユーザー(`deleted_at IS NULL`) | ログインユーザー | `owner_id` = 本人のみ(削除は上記ガード条件つき) |
| event_participants | 本人の行 + 他ユーザーの `visibility = 'public'` の行 | 本人の行 + 招待による他ユーザーの行 | 本人の行のみ |
| ticket_entries | 本人のみ | 本人のみ | 本人のみ |
| expenses | 本人のみ | 本人のみ | 本人のみ |
| budgets | 本人のみ | 本人のみ | 本人のみ |

> RLSは「保険」として設定し、権限チェックはアプリ層にも実装する
> (将来的なピボット余地を残すため)
>
> event_participants の INSERT は招待のため他ユーザーの行も作成できる。
> ただし作成できるのは `participation_state` と `invited_by` を伴う招待経路のみとし、
> 他人のステータスや公開設定を勝手に書き換えられないよう UPDATE は本人限定とする。

---

## 検討ポイント(要フィードバック)

1. **招待は誰でも実行できる**
   MVPでは承認フローがないため、アカウントを知っている相手のスケジュールに
   一方的にイベントを追加できる状態になる。
   個人〜家族・友人の範囲では問題ないが、利用者が広がる場合は承認フローの導入が前提。

2. **イベントの重複登録**
   全ユーザー共有カタログのため、同じ公演を複数人が別々に登録する可能性がある。
   MVPでは許容し、必要なら後から名寄せ機能を検討する。
   (当面はクローラーまたは開発者本人が登録するため、実害は少ない想定)

3. **削除できないイベントの扱い**
   参加者がいるイベントは削除できないため、誤登録・重複登録が残り続ける可能性がある。
   MVPでは運用でカバーし、フェーズ2で管理者画面(`is_admin` ユーザー向け)を用意して
   強制削除できるようにする(`docs/roadmap.md`「フェーズ2バックログ」)。
   なお強制削除時、他ユーザーのスケジュールから消えることになるため、
   実行前の確認や影響範囲の表示は必要。
