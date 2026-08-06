-- 一時的な調査用: RLSポリシーそのものが原因かを切り分けるため、
-- INSERTポリシーを完全に許可(true)にしてトリガーだけで検証させてみる。
drop policy "event_participants_insert_self_or_invite" on public.event_participants;

create policy "event_participants_insert_self_or_invite" on public.event_participants
  for insert to authenticated
  with check (true);
