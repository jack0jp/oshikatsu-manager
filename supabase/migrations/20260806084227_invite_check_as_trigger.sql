-- event_participants_insert_self_or_invite のWITH CHECK内で招待経路を検証していたが、
-- 原因不明のままRLS越しに正しく評価されない事象がCIのdb-testで再現した
-- (is_event_participant()を直接RPC呼び出しすると正しくtrueを返し、各条件を実値で
-- 個別検証してもすべてtrueなのに、実際のINSERTだけがRLS違反で失敗する)。
-- WITH CHECKでの自己参照ロジックを諦め、guard_event_deletion()・
-- guard_is_admin_immutable()と同じ「BEFORE INSERTトリガーで検証する」方式に変更する。
-- RLSポリシー自体は粗い門番(本人の行 or 招待者本人)に単純化し、
-- 招待の詳細な検証(visibility/participation_state固定、参加登録済みチェック)は
-- トリガーに寄せる。

drop policy "event_participants_insert_self_or_invite" on public.event_participants;

create policy "event_participants_insert_self_or_invite" on public.event_participants
  for insert to authenticated
  with check (user_id = auth.uid() or invited_by = auth.uid());

create function public.guard_event_participants_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.invited_by is not null then
    if new.visibility <> 'private' then
      raise exception 'invited rows must be created with visibility = private';
    end if;
    if new.participation_state <> 'joined' then
      raise exception 'invited rows must be created with participation_state = joined';
    end if;
    if not public.is_event_participant(new.event_id, new.invited_by) then
      raise exception 'inviter must already be a participant of the event';
    end if;
  end if;
  return new;
end;
$$;

create trigger guard_event_participants_insert_trigger
  before insert on public.event_participants
  for each row execute function public.guard_event_participants_insert();

-- 調査用の診断関数は不要になったため削除する。
drop function public.debug_invite_check(uuid, uuid, text, text);
