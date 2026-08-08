import { describe, expect, test } from "vitest";
import { canInviteToEvent, canJoinEvent } from "../../common/permissions";

// docs/permissions.md の権限マトリクス「自分の参加登録」「他ユーザーの招待」の行を、
// そのまま写したもの。RLS側の同じ検証は test/db/event-participants.test.ts にある。
// 片方だけ直された状態を検出するため、両方を同時に変更すること。

describe("canJoinEvent", () => {
  test("未削除のイベントには参加登録できる", () => {
    expect(canJoinEvent({ eventIsDeleted: false })).toBe(true);
  });

  // 否定側が本体(docs/permissions.md「弾かれることを確認する」)。issue #54の決定そのもの。
  test("削除済みのイベントには参加登録できない", () => {
    expect(canJoinEvent({ eventIsDeleted: true })).toBe(false);
  });
});

describe("canInviteToEvent", () => {
  test("参加登録していれば招待できる(オーナーかどうかは問わない)", () => {
    expect(canInviteToEvent({ actorIsParticipant: true, eventIsDeleted: false })).toBe(true);
  });

  // 否定側が本体(docs/permissions.md「弾かれることを確認する」)。issue #34の決定そのもの:
  // オーナーであっても参加登録していなければ招待できない。
  test("参加登録していなければ招待できない(オーナーであっても)", () => {
    expect(canInviteToEvent({ actorIsParticipant: false, eventIsDeleted: false })).toBe(false);
  });

  // issue #54の決定そのもの: 参加登録済みでも、イベントが削除済みなら招待できない。
  test("削除済みのイベントには招待できない(参加登録済みの招待者であっても)", () => {
    expect(canInviteToEvent({ actorIsParticipant: true, eventIsDeleted: true })).toBe(false);
  });

  test("参加登録しておらず、かつイベントも削除済みなら招待できない", () => {
    expect(canInviteToEvent({ actorIsParticipant: false, eventIsDeleted: true })).toBe(false);
  });
});
