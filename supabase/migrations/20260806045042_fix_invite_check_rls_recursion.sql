-- event_participants_insert_self_or_invite のEXISTSサブクエリは、呼び出し元(招待者)の
-- RLS越しに評価される。招待者自身の参加行はSELECT時には可視でも、ポリシー内の
-- 自己参照サブクエリからは(RLSの再帰評価により)見えず、正当な招待が
-- 「row-level security policy violation」ですり抜けずに失敗してしまうバグがあった
-- (guard_event_deletion()にsecurity definerが必要だったのと同じ根本原因)。
-- Supabaseが推奨する「SECURITY DEFINER関数でラップする」方式に修正する。
create function public.is_event_participant(p_event_id uuid, p_user_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.event_participants
    where event_id = p_event_id
      and user_id = p_user_id
  );
$$;

drop policy "event_participants_insert_self_or_invite" on public.event_participants;

create policy "event_participants_insert_self_or_invite" on public.event_participants
  for insert to authenticated
  with check (
    (user_id = auth.uid() and invited_by is null)
    or (
      invited_by = auth.uid()
      and visibility = 'private'
      and participation_state = 'joined'
      and public.is_event_participant(event_id, auth.uid())
    )
  );
