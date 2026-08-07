// docs/permissions.md の権限マトリクスを、アプリ層(Web UIとMCPの両方)から使う判定として
// 実装したもの。RLS(supabase/migrations/)と同じマトリクスを二重に持ち、両方をテストする
// (docs/permissions.md「前提」)。
//
// マトリクス全体のpure関数化はフェーズ2の作業(docs/roadmap.md フェーズ2)。
// ここには issue #34 で確定した「招待できる条件」だけを置き、残りはフェーズ2で追加する。
// 追加するときは、必ずRLS側と test/db/ にも同じ行を足すこと。

export type InviteContext = {
  /** 実行者がそのイベントに参加登録しているか */
  actorIsParticipant: boolean;
};

/**
 * 他ユーザーをイベントに招待できるか。
 *
 * 招待できるのは、そのイベントに参加登録しているユーザーのみ。オーナー(`events.owner_id`)
 * であっても、自分自身が参加登録していなければ招待できない(issue #34)。`owner_id` は
 * 「情報の管理者」であって、イベントの主催や招待の権限を意味しない
 * (docs/data-model.md 2章 / docs/permissions.md「招待できる条件」)。
 *
 * RLS側の対応: `event_participants_insert_self_or_invite` の招待経路。
 */
export const canInviteToEvent = ({ actorIsParticipant }: InviteContext): boolean =>
  actorIsParticipant;
