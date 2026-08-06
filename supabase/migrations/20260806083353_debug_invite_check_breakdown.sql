-- 一時的な診断用関数。event_participants_insert_self_or_inviteのWITH CHECKが
-- なぜ失敗するか切り分けるため、各条件を個別に返す。原因判明後に削除する。
create function public.debug_invite_check(
  p_event_id uuid,
  p_invited_by uuid,
  p_visibility text,
  p_participation_state text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_auth_uid uuid := auth.uid();
begin
  return jsonb_build_object(
    'auth_uid', v_auth_uid,
    'invited_by_matches', p_invited_by = v_auth_uid,
    'visibility_matches', p_visibility = 'private',
    'participation_state_matches', p_participation_state = 'joined',
    'is_participant', public.is_event_participant(p_event_id, v_auth_uid)
  );
end;
$$;
