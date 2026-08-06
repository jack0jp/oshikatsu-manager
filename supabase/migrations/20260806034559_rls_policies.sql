-- docs/permissions.md の権限マトリクスと docs/data-model.md「RLSポリシー方針」に基づく
-- RLSポリシー。全ポリシーは authenticated ロールのみを対象とする(このアプリはGoogle SSO
-- ログイン前提で、匿名ユーザー向けの公開閲覧機能は無い)。
--
-- profiles.is_admin を参照する条件は一切書かない(MVPスコープ外。docs/permissions.md参照)。

-- 1. profiles (docs/data-model.md「RLSポリシー方針」)
alter table public.profiles enable row level security;

create policy "profiles_select_all" on public.profiles
  for select to authenticated
  using (true);

create policy "profiles_insert_self" on public.profiles
  for insert to authenticated
  with check (id = auth.uid());

create policy "profiles_update_self" on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- 2. events (docs/data-model.md「RLSポリシー方針」、削除ガードはdocs/data-model.md 2章)
alter table public.events enable row level security;

create policy "events_select_not_deleted" on public.events
  for select to authenticated
  using (deleted_at is null);

create policy "events_insert_as_owner" on public.events
  for insert to authenticated
  with check (owner_id = auth.uid());

create policy "events_update_owner_only" on public.events
  for update to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

-- イベント削除(論理削除)のガード。オーナー本人以外の参加者が1人でもいる場合、
-- deleted_at をNULLから設定する更新を拒否する。MVPでは例外を設けない(管理者もバイパス不可)。
create function public.guard_event_deletion()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.deleted_at is not null and old.deleted_at is null then
    if exists (
      select 1
      from public.event_participants ep
      where ep.event_id = new.id
        and ep.user_id <> new.owner_id
    ) then
      raise exception 'event % has participants other than the owner and cannot be deleted', new.id;
    end if;
  end if;
  return new;
end;
$$;

create trigger guard_event_deletion_trigger
  before update on public.events
  for each row execute function public.guard_event_deletion();

-- 3. event_participants (docs/data-model.md「RLSポリシー方針」、招待の仕様は3章)
alter table public.event_participants enable row level security;

create policy "event_participants_select_own_or_public" on public.event_participants
  for select to authenticated
  using (user_id = auth.uid() or visibility = 'public');

-- 自分で登録する経路(invited_byなし) と、参加登録済みユーザーによる招待経路
-- (invited_by=自分。招待できるのは参加登録している任意のユーザー)の2通りのみ許可する。
create policy "event_participants_insert_self_or_invite" on public.event_participants
  for insert to authenticated
  with check (
    (user_id = auth.uid() and invited_by is null)
    or (
      invited_by = auth.uid()
      and exists (
        select 1
        from public.event_participants ep
        where ep.event_id = event_participants.event_id
          and ep.user_id = auth.uid()
      )
    )
  );

create policy "event_participants_update_self" on public.event_participants
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "event_participants_delete_self" on public.event_participants
  for delete to authenticated
  using (user_id = auth.uid());

-- 4. ticket_entries (docs/data-model.md「RLSポリシー方針」。個人スコープ)
alter table public.ticket_entries enable row level security;

create policy "ticket_entries_select_own" on public.ticket_entries
  for select to authenticated
  using (user_id = auth.uid());

create policy "ticket_entries_insert_own" on public.ticket_entries
  for insert to authenticated
  with check (user_id = auth.uid());

create policy "ticket_entries_update_own" on public.ticket_entries
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "ticket_entries_delete_own" on public.ticket_entries
  for delete to authenticated
  using (user_id = auth.uid());

-- 5. expenses (docs/data-model.md「RLSポリシー方針」。個人スコープ)
alter table public.expenses enable row level security;

create policy "expenses_select_own" on public.expenses
  for select to authenticated
  using (user_id = auth.uid());

create policy "expenses_insert_own" on public.expenses
  for insert to authenticated
  with check (user_id = auth.uid());

create policy "expenses_update_own" on public.expenses
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "expenses_delete_own" on public.expenses
  for delete to authenticated
  using (user_id = auth.uid());

-- 6. budgets (docs/data-model.md「RLSポリシー方針」。個人スコープ)
alter table public.budgets enable row level security;

create policy "budgets_select_own" on public.budgets
  for select to authenticated
  using (user_id = auth.uid());

create policy "budgets_insert_own" on public.budgets
  for insert to authenticated
  with check (user_id = auth.uid());

create policy "budgets_update_own" on public.budgets
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "budgets_delete_own" on public.budgets
  for delete to authenticated
  using (user_id = auth.uid());
