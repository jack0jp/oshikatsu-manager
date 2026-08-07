import { describe, expect, test } from "vitest";
import { canInviteToEvent } from "../../common/permissions";

// docs/permissions.md の権限マトリクス「他ユーザーの招待」の行を、そのまま写したもの。
// RLS側の同じ検証は test/db/event-participants.test.ts にある。
// 片方だけ直された状態を検出するため、両方を同時に変更すること。

describe("canInviteToEvent", () => {
  test("参加登録していれば招待できる(オーナーかどうかは問わない)", () => {
    expect(canInviteToEvent({ actorIsParticipant: true })).toBe(true);
  });

  // 否定側が本体(docs/permissions.md「弾かれることを確認する」)。issue #34の決定そのもの:
  // オーナーであっても参加登録していなければ招待できない。
  test("参加登録していなければ招待できない(オーナーであっても)", () => {
    expect(canInviteToEvent({ actorIsParticipant: false })).toBe(false);
  });
});
