begin;

create table public.games (
  id text primary key check (id ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  title text not null,
  current_version text not null,
  status text not null default 'active' check (status in ('active', 'hidden', 'retired')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.game_versions (
  game_id text not null references public.games(id) on delete cascade,
  version text not null check (char_length(version) between 1 and 40),
  round_seconds integer not null check (round_seconds > 0),
  maximum_score integer not null check (maximum_score >= 0),
  enabled_for_submission boolean not null default true,
  released_at timestamptz not null default now(),
  primary key (game_id, version)
);

insert into public.games (id, title, current_version) values
  ('tractor-dash', 'Tractor Dash', '1.1.0'),
  ('feed-run', 'Feed Run', '1.1.0'),
  ('order-rush', 'Order Rush', '1.1.0'),
  ('fence-frenzy', 'Fence Frenzy', '1.1.0');

insert into public.game_versions (game_id, version, round_seconds, maximum_score) values
  ('tractor-dash', '1.1.0', 120, 13000),
  ('feed-run', '1.1.0', 120, 12000),
  ('order-rush', '1.1.0', 120, 8000),
  ('fence-frenzy', '1.1.0', 120, 20000);

alter table public.games
  add constraint games_current_version_fkey
  foreign key (id, current_version) references public.game_versions(game_id, version);

alter table public.game_scores
  add constraint game_scores_game_version_fkey
  foreign key (game_id, game_version) references public.game_versions(game_id, version);

alter table public.best_scores
  add constraint best_scores_game_version_fkey
  foreign key (game_id, game_version) references public.game_versions(game_id, version);

alter table public.best_scores
  add column created_at timestamptz not null default now();

alter table public.profiles rename column display_name to username;
alter table public.profiles add column full_name text;

create or replace function public.normalise_username(candidate text)
returns text
language sql
immutable
set search_path = ''
as $$
  select nullif(left(trim(both '-' from regexp_replace(lower(coalesce(candidate, '')), '[^a-z0-9._-]+', '-', 'g')), 24), '');
$$;

revoke all on function public.normalise_username(text) from public, anon, authenticated;

create or replace function public.create_profile_for_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  requested_username text;
  generated_username text;
begin
  requested_username := public.normalise_username(new.raw_user_meta_data ->> 'username');

  if requested_username is not null and char_length(requested_username) < 3 then
    raise exception 'Username must contain at least 3 characters';
  end if;

  if requested_username is null then
    generated_username := public.normalise_username(split_part(new.email, '@', 1));
    if generated_username is null or char_length(generated_username) < 3 then
      generated_username := 'farmer';
    end if;
    if exists (select 1 from public.profiles where lower(username) = lower(generated_username)) then
      generated_username := left(generated_username, 17) || '-' || left(replace(new.id::text, '-', ''), 6);
    end if;
  else
    generated_username := requested_username;
  end if;

  insert into public.profiles (user_id, username)
  values (new.id, generated_username)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

update public.profiles profile
set username = candidate.username
from (
  select
    profile_source.user_id,
    case
      when count(*) over (partition by lower(base_username)) = 1 then base_username
      else left(base_username, 17) || '-' || left(replace(profile_source.user_id::text, '-', ''), 6)
    end as username
  from (
    select
      profile_row.user_id,
      case
        when char_length(coalesce(public.normalise_username(profile_row.username), '')) >= 3
          then public.normalise_username(profile_row.username)
        when char_length(coalesce(public.normalise_username(split_part(auth_user.email, '@', 1)), '')) >= 3
          then public.normalise_username(split_part(auth_user.email, '@', 1))
        else 'farmer'
      end as base_username
    from public.profiles profile_row
    join auth.users auth_user on auth_user.id = profile_row.user_id
  ) profile_source
) candidate
where profile.user_id = candidate.user_id;

alter table public.profiles
  alter column username set not null,
  add constraint profiles_username_format_check
    check (username ~ '^[a-z0-9][a-z0-9._-]{2,23}$'),
  add constraint profiles_full_name_length_check
    check (full_name is null or char_length(btrim(full_name)) between 2 and 80);

create unique index profiles_username_lower_key
  on public.profiles (lower(username));

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger set_profile_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

create trigger set_game_updated_at
  before update on public.games
  for each row execute function public.set_updated_at();

revoke all on function public.set_updated_at() from public, anon, authenticated;

alter table public.game_scores rename column outcome to outcome_code;
alter table public.game_scores
  add column outcome_detail jsonb not null default '{}'::jsonb,
  add column round_facts jsonb not null default '{}'::jsonb,
  add constraint game_scores_outcome_code_check
    check (outcome_code in ('completed', 'collision', 'starvation', 'abandoned')) not valid;

update public.game_scores
set
  outcome_detail = case
    when outcome_code in ('cow', 'sheep') then jsonb_build_object('collidedWith', outcome_code)
    else '{}'::jsonb
  end,
  outcome_code = case
    when outcome_code in ('timer', 'victory') then 'completed'
    when outcome_code in ('cow', 'sheep') then 'collision'
    when outcome_code = 'defeat' then 'starvation'
    else outcome_code
  end;

alter table public.game_scores validate constraint game_scores_outcome_code_check;

alter table public.games enable row level security;
alter table public.game_versions enable row level security;
revoke all on public.games, public.game_versions from anon, authenticated;
grant select on public.games, public.game_versions to anon, authenticated;
grant all on public.games, public.game_versions to service_role;

create policy "game catalogue is publicly readable"
  on public.games for select to anon, authenticated using (true);

create policy "game versions are publicly readable"
  on public.game_versions for select to anon, authenticated using (true);

commit;
