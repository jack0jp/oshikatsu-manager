import { describe, expect, test } from "vitest";
import { canInviteToEvent } from "../../common/permissions";

// docs/permissions.md の権限マトリクス「他ユーザーの招待」の行を、そのまま写したもの。
// RLS側の同じ検証は test/db/event-participants.test.ts にある。
// 片方だけ直された状態を検出するため、両方を同時に変更すること。

const OWNER_ID = "00000000-0000-4000-8000-000000000001";
const OTHER_ID = "00000000-0000-4000-8000-000000000002";

describe("canInviteToEvent", () => {
  test("オーナーは参加登録していれば招待できる", () => {
    expect(
      canInviteToEvent({
        actorUserId: OWNER_ID,
        event: { owner_id: OWNER_ID },
        actorIsParticipant: true,
      }),
    ).toBe(true);
  });

  // issue #34 の決定そのもの。オーナーは「情報の管理者」であって参加者とは限らないため、
  // 自分の参加行が無くても招待できる(docs/data-model.md 2章)。
  test("オーナーは参加登録していなくても招待できる", () => {
    expect(
      canInviteToEvent({
        actorUserId: OWNER_ID,
        event: { owner_id: OWNER_ID },
        actorIsParticipant: false,
      }),
    ).toBe(true);
  });

  test("オーナーでなくても参加登録していれば招待できる", () => {
    expect(
      canInviteToEvent({
        actorUserId: OTHER_ID,
        event: { owner_id: OWNER_ID },
        actorIsParticipant: true,
      }),
    ).toBe(true);
  });

  // 否定側が本体(docs/permissions.md「弾かれることを確認する」)。
  test("オーナーでも参加者でもないユーザーは招待できない", () => {
    expect(
      canInviteToEvent({
        actorUserId: OTHER_ID,
        event: { owner_id: OWNER_ID },
        actorIsParticipant: false,
      }),
    ).toBe(false);
  });

  test("ユーザーIDが空なら、イベントのowner_idが空でも招待できない", () => {
    expect(
      canInviteToEvent({
        actorUserId: "",
        event: { owner_id: "" },
        actorIsParticipant: false,
      }),
    ).toBe(false);
  });

  test("ユーザーIDが空なら、参加登録済みとして渡されても招待できない", () => {
    expect(
      canInviteToEvent({
        actorUserId: "",
        event: { owner_id: OWNER_ID },
        actorIsParticipant: true,
      }),
    ).toBe(false);
  });
});
