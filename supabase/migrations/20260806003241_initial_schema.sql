-- docs/data-model.md の6テーブルを定義する。
-- RLSポリシー・イベント削除ガードは別マイグレーション(Issue #25)で追加する。

-- 1. profiles (docs/data-model.md 1)
-- auth.usersへのトリガーでサインアップ時に自動作成する。
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null unique,
  display_name text,
  is_admin boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger set_profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- 2. events (docs/data-model.md 2)
-- 全ユーザー共有カタログ。編集・削除できるのはowner_idのみ(RLSはIssue #25)。
create table public.events (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id),
  genre text not null check (genre in ('takarazuka', 'kabuki', 'idol', 'other')),
  title text not null,
  venue text,
  starts_at timestamptz not null,
  ends_at timestamptz,
  source_url text,
  memo text,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index events_starts_at_idx on public.events (starts_at);
create index events_owner_id_idx on public.events (owner_id);
create index events_deleted_at_idx on public.events (deleted_at);

create trigger set_events_updated_at
  before update on public.events
  for each row execute function public.set_updated_at();

-- 3. event_participants (docs/data-model.md 3)
-- 自分で登録するほか、他ユーザーから招待されることもある。
create table public.event_participants (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id),
  user_id uuid not null references public.profiles (id),
  status text not null
    check (status in ('considering', 'applied', 'won', 'lost', 'confirmed', 'declined')),
  visibility text not null default 'private' check (visibility in ('public', 'private')),
  invited_by uuid references public.profiles (id),
  participation_state text not null default 'joined'
    check (participation_state in ('joined', 'invited', 'rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_id, user_id)
);

create index event_participants_user_event_idx on public.event_participants (user_id, event_id);
create index event_participants_event_visibility_idx on public.event_participants (event_id, visibility);

create trigger set_event_participants_updated_at
  before update on public.event_participants
  for each row execute function public.set_updated_at();

-- 4. ticket_entries (docs/data-model.md 4)
-- 個人スコープ。1イベントに複数の申込経路がありうる。
create table public.ticket_entries (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id),
  user_id uuid not null references public.profiles (id),
  entry_type text not null check (entry_type in ('lottery', 'first_come')),
  provider text,
  entry_opens_at timestamptz,
  entry_closes_at timestamptz,
  result_announced_at timestamptz,
  sale_starts_at timestamptz,
  result text check (result in ('pending', 'won', 'lost', 'not_applied')),
  memo text,
  created_at timestamptz not null default now()
);

create index ticket_entries_user_closes_idx on public.ticket_entries (user_id, entry_closes_at);
create index ticket_entries_user_result_idx on public.ticket_entries (user_id, result_announced_at);

-- 5. expenses (docs/data-model.md 5)
-- 個人スコープ。予算と実績を1行で持ち、実績はNULL許容。
create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id),
  event_id uuid not null references public.events (id),
  category text not null check (category in ('ticket', 'travel', 'goods', 'lodging', 'other')),
  planned_amount integer,
  actual_amount integer,
  spent_on date,
  memo text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index expenses_user_spent_on_idx on public.expenses (user_id, spent_on);
create index expenses_user_event_idx on public.expenses (user_id, event_id);

create trigger set_expenses_updated_at
  before update on public.expenses
  for each row execute function public.set_updated_at();

-- 6. budgets (docs/data-model.md 6)
-- 個人スコープ。genreがNULLなら全ジャンル合算の枠。
create table public.budgets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id),
  period_type text not null check (period_type in ('monthly', 'yearly')),
  period_start date not null,
  genre text check (genre in ('takarazuka', 'kabuki', 'idol', 'other')),
  amount integer not null,
  created_at timestamptz not null default now(),
  -- genreがNULL(全ジャンル合算の枠)の行も重複禁止の対象にするため
  -- NULLS NOT DISTINCTでNULLどうしも同一視する(PG15+、major_version=17で利用可)。
  unique nulls not distinct (user_id, period_type, period_start, genre)
);
