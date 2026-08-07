-- イベントのオーナーは、自分が参加登録していなくても他ユーザーを招待できるようにする。
--
-- 背景 (issue #34): docs/permissions.md の権限マトリクスはオーナーの「他ユーザーの招待」を
-- 無条件に○としているが、20260806034559_rls_policies.sql の招待経路は招待者自身が
-- event_participants に行を持つことを必須にしていたため、docs/data-model.md 2章が
-- 明示的にサポートする「登録だけして自分は参加しないオーナー」が招待できなかった。
--
-- ドキュメント側ではなく実装側を修正した理由:
--   - owner_id は「情報の管理者」であって参加者ではない、という定義がデータモデルの前提
--     (docs/data-model.md 2章)。招待のためだけに自分の参加行を作らせると
--     「自分のスケジュール」に参加しないイベントが並び、データが実態と食い違う
--   - 参加登録は誰でも自由にでき、招待後に自分の行を削除すれば同じ状態に到達できるため、
--     「オーナーにも参加登録を要求する」制限はセキュリティ境界として機能しない
--
-- 招待経路の他の条件(invited_by=自分、visibility='private'、participation_state='joined')は
-- そのまま維持する。events への EXISTS は呼び出し元のRLS越しに評価されるが、
-- events_select_not_deleted_or_referenced が owner_id = auth.uid() の行を常に許可するため
-- security definer は不要(オーナーは自分のイベントを必ず参照できる)。

drop policy "event_participants_insert_self_or_invite" on public.event_participants;

create policy "event_participants_insert_self_or_invite" on public.event_participants
  for insert to authenticated
  with check (
    (user_id = auth.uid() and invited_by is null)
    or (
      invited_by = auth.uid()
      and visibility = 'private'
      and participation_state = 'joined'
      and (
        exists (
          select 1
          from public.event_participants ep
          where ep.event_id = event_participants.event_id
            and ep.user_id = auth.uid()
        )
        or exists (
          select 1
          from public.events e
          where e.id = event_participants.event_id
            and e.owner_id = auth.uid()
        )
      )
    )
  );
