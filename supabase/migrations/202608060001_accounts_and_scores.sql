begin;

create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text check (display_name is null or char_length(display_name) between 2 and 32),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.game_scores (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  game_id text not null check (game_id in ('tractor-dash', 'feed-run', 'order-rush', 'fence-frenzy')),
  session_id text not null check (session_id ~ '^[a-zA-Z0-9-]{8,100}$'),
  score integer not null check (score >= 0),
  game_version text not null check (char_length(game_version) between 1 and 40),
  outcome text not null check (char_length(outcome) between 1 and 40),
  elapsed_seconds numeric(7,3) not null check (elapsed_seconds between 0 and 121),
  round_started_at timestamptz not null,
  round_completed_at timestamptz not null,
  event_summary jsonb not null default '{}'::jsonb,
  submitted_at timestamptz not null default now(),
  unique (user_id, session_id)
);

create table public.best_scores (
  user_id uuid not null references auth.users(id) on delete cascade,
  game_id text not null check (game_id in ('tractor-dash', 'feed-run', 'order-rush', 'fence-frenzy')),
  score integer not null check (score >= 0),
  game_version text not null check (char_length(game_version) between 1 and 40),
  score_session_id text not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, game_id)
);

create index game_scores_user_game_submitted_idx
  on public.game_scores (user_id, game_id, submitted_at desc);

alter table public.profiles enable row level security;
alter table public.game_scores enable row level security;
alter table public.best_scores enable row level security;

revoke all on public.profiles, public.game_scores, public.best_scores from anon, authenticated;
grant select, update on public.profiles to authenticated;
grant select on public.game_scores, public.best_scores to authenticated;
grant all on public.profiles, public.game_scores, public.best_scores to service_role;
grant usage, select on sequence public.game_scores_id_seq to service_role;

create policy "users read their profile"
  on public.profiles for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "users update their profile"
  on public.profiles for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "users read their score history"
  on public.game_scores for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "users read their best scores"
  on public.best_scores for select to authenticated
  using ((select auth.uid()) = user_id);

create or replace function public.create_profile_for_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (user_id) values (new.id)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

revoke all on function public.create_profile_for_new_user() from public, anon, authenticated;

create trigger create_profile_after_signup
  after insert on auth.users
  for each row execute function public.create_profile_for_new_user();

insert into public.profiles (user_id)
select id from auth.users
on conflict (user_id) do nothing;

create or replace function public.record_best_score(
  score_user_id uuid,
  score_game_id text,
  score_value integer,
  score_game_version text,
  score_session_id text
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  saved_score integer;
begin
  insert into public.best_scores (user_id, game_id, score, game_version, score_session_id)
  values (score_user_id, score_game_id, score_value, score_game_version, score_session_id)
  on conflict (user_id, game_id) do update
    set score = excluded.score,
        game_version = excluded.game_version,
        score_session_id = excluded.score_session_id,
        updated_at = now()
    where excluded.score > public.best_scores.score;

  select score into saved_score
    from public.best_scores
    where user_id = score_user_id and game_id = score_game_id;
  return saved_score;
end;
$$;

revoke all on function public.record_best_score(uuid, text, integer, text, text) from public, anon, authenticated;
grant execute on function public.record_best_score(uuid, text, integer, text, text) to service_role;

commit;
