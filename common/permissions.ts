// docs/permissions.md の権限マトリクスを、アプリ層(Web UIとMCPの両方)から使う判定として
// 実装したもの。RLS(supabase/migrations/)と同じマトリクスを二重に持ち、両方をテストする
// (docs/permissions.md「前提」)。
//
// マトリクス全体のpure関数化はフェーズ2の作業(docs/roadmap.md フェーズ2)。
// ここには issue #34 で決定した「招待できる条件」だけを置き、残りはフェーズ2で追加する。
// 追加するときは、必ずRLS側と test/db/ にも同じ行を足すこと。

import type { Database } from "@/supabase/types";

type EventRow = Database["public"]["Tables"]["events"]["Row"];

export type InviteContext = {
  /** 招待を実行しようとしているユーザー。境界から引数で受け取る(import時に掴まない) */
  actorUserId: string;
  /** 招待先のイベント。判定に必要な列だけを受け取る */
  event: Pick<EventRow, "owner_id">;
  /** 実行者がそのイベントに参加登録しているか */
  actorIsParticipant: boolean;
};

/**
 * 他ユーザーをイベントに招待できるか。
 *
 * 招待できるのは「そのイベントのオーナー」または「そのイベントに参加登録しているユーザー」。
 * オーナーは自分が参加登録していなくても招待できる(`owner_id` は「情報の管理者」であって
 * 参加者ではないため。docs/data-model.md 2章 / docs/permissions.md「招待できる条件」)。
 *
 * RLS側の対応: `event_participants_insert_self_or_invite` の招待経路。
 */
export const canInviteToEvent = ({
  actorUserId,
  event,
  actorIsParticipant,
}: InviteContext): boolean => {
  // 未ログイン相当(空のユーザーID)は、owner_idが同じく空だったとしても許可しない。
  if (actorUserId === "") {
    return false;
  }
  return actorUserId === event.owner_id || actorIsParticipant;
};
