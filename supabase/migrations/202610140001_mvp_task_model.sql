-- MVP task model (additive). See docs/architecture.md, "Data model" and
-- "Guarded state transitions".
--
--   * dogs table (one dog per family at MVP; multi-dog in v1.1 is additive)
--   * household_members.display_name + server-side name resolution
--   * daily_needs: vet type, amount, one-off date, default assignee,
--     reminder default, soft delete (archived_at), dog_id
--   * claim_series: repeating claims ("Every Thu" / "Every day") stored once
--     instead of being inferred from the latest occurrence row
--   * transition_occurrence(): guarded claim / release / take over / done /
--     undo with typed conflict results
--
-- Safe on top of 202610090001 .. 202610130001. The legacy
-- set_daily_need_occurrence() RPC is left in place for older app builds.

-- ---------------------------------------------------------------------------
-- 1. Dogs
-- ---------------------------------------------------------------------------

create table if not exists public.dogs (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 80),
  photo_path text check (photo_path is null or length(photo_path) <= 300),
  birthday date,
  created_at timestamptz not null default now()
);

create index if not exists dogs_household_idx
  on public.dogs (household_id, created_at);

-- Until now the family name *was* the dog name: seed one dog per family.
insert into public.dogs (household_id, name, created_at)
select household.id, trim(household.name), household.created_at
from public.households as household
where not exists (
  select 1 from public.dogs as dog where dog.household_id = household.id
);

alter table public.dogs enable row level security;

create policy "Household members can read dogs"
  on public.dogs for select to authenticated
  using (public.is_household_member(household_id));

create policy "Household members can update dogs"
  on public.dogs for update to authenticated
  using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));

grant select, update on public.dogs to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Member display names
-- ---------------------------------------------------------------------------

alter table public.household_members
  add column if not exists display_name text
    check (display_name is null or length(trim(display_name)) between 1 and 40);

-- Internal helper: display name for any user id. Not exposed to clients.
create or replace function public.member_display_name(target_user_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (
      select nullif(trim(member.display_name), '')
      from public.household_members as member
      where member.user_id = target_user_id
    ),
    nullif(trim(account.raw_user_meta_data ->> 'full_name'), ''),
    nullif(trim(account.raw_user_meta_data ->> 'name'), ''),
    nullif(split_part(account.email, '@', 1), ''),
    'Family member'
  )
  from auth.users as account
  where account.id = target_user_id;
$$;

create or replace function public.set_my_display_name(new_name text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
begin
  if current_user_id is null then
    raise exception 'Sign in before changing your name';
  end if;

  update public.household_members
  set display_name = nullif(left(trim(new_name), 40), '')
  where user_id = current_user_id;
end;
$$;

-- Same signature as before; now honours display_name.
create or replace function public.get_household_members()
returns table (user_id uuid, display_name text)
language sql
stable
security definer
set search_path = ''
as $$
  select member.user_id, public.member_display_name(member.user_id)
  from public.household_members as member
  where member.household_id = (
    select mine.household_id
    from public.household_members as mine
    where mine.user_id = (select auth.uid())
  )
  order by (member.user_id = (select auth.uid())) desc, 2;
$$;

-- Members in join order, so member colours stay stable across screens.
create or replace function public.get_family_members()
returns table (
  user_id uuid,
  display_name text,
  role text,
  joined_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    member.user_id,
    public.member_display_name(member.user_id),
    member.role,
    member.created_at
  from public.household_members as member
  where member.household_id = (
    select mine.household_id
    from public.household_members as mine
    where mine.user_id = (select auth.uid())
  )
  order by member.created_at, member.user_id;
$$;

-- ---------------------------------------------------------------------------
-- 3. Families: create with a dog; tolerant invite codes
-- ---------------------------------------------------------------------------

create or replace function public.create_family(dog_name text, family_name text default null)
returns table (id uuid, name text, invite_code text)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  current_user_id uuid := (select auth.uid());
  new_household public.households%rowtype;
begin
  if current_user_id is null then
    raise exception 'Sign in before creating a family';
  end if;

  if exists (
    select 1 from public.household_members as member
    where member.user_id = current_user_id
  ) then
    raise exception 'This account already belongs to a family';
  end if;

  insert into public.households (name)
  values (left(trim(coalesce(nullif(trim(family_name), ''), dog_name)), 80))
  returning * into new_household;

  insert into public.household_members (household_id, user_id, role)
  values (new_household.id, current_user_id, 'owner');

  insert into public.dogs (household_id, name)
  values (new_household.id, left(trim(dog_name), 80));

  return query
  select new_household.id, new_household.name, new_household.invite_code;
end;
$$;

-- Older app builds still call create_household(); give them a dog too.
create or replace function public.create_household(household_name text)
returns table (id uuid, name text, invite_code text)
language sql
security definer
set search_path = ''
as $$
  select * from public.create_family(household_name, household_name);
$$;

-- Same behaviour as before, but ignores spaces in typed codes.
create or replace function public.join_household(invite_code text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  normalized_code text := upper(regexp_replace(coalesce($1, ''), '\s+', '', 'g'));
  target_household_id uuid;
  existing_household_id uuid;
begin
  if current_user_id is null then
    raise exception 'Sign in before joining a family';
  end if;

  select member.household_id into existing_household_id
  from public.household_members as member
  where member.user_id = current_user_id;

  select household.id into target_household_id
  from public.households as household
  where household.invite_code = normalized_code;

  if target_household_id is null then
    raise exception 'That invite code is not valid';
  end if;

  if existing_household_id is not null then
    if existing_household_id = target_household_id then
      return target_household_id;
    end if;
    raise exception 'This account already belongs to another family';
  end if;

  insert into public.household_members (household_id, user_id, role)
  values (target_household_id, current_user_id, 'member');

  -- Push: "{name} joined {dog}'s family" is queued by the
  -- push_on_member_joined trigger (202610150001_push_notifications.sql).
  return target_household_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Tasks (daily_needs)
-- ---------------------------------------------------------------------------

-- Widen the type and duration checks (constraint names were generated, so
-- look them up instead of guessing).
do $$
declare
  constraint_row record;
begin
  for constraint_row in
    select con.conname
    from pg_constraint as con
    where con.conrelid = 'public.daily_needs'::regclass
      and con.contype = 'c'
      and (
        pg_get_constraintdef(con.oid) like '%grooming%'
        or pg_get_constraintdef(con.oid) like '%duration_minutes%'
      )
  loop
    execute format(
      'alter table public.daily_needs drop constraint %I',
      constraint_row.conname
    );
  end loop;
end;
$$;

alter table public.daily_needs
  add constraint daily_needs_type_check
    check (type in ('walk', 'food', 'medicine', 'potty', 'play', 'grooming', 'vet', 'other')),
  add constraint daily_needs_duration_minutes_check
    check (duration_minutes between 5 and 240);

alter table public.daily_needs
  add column if not exists dog_id uuid references public.dogs(id) on delete set null,
  add column if not exists amount_value numeric(7, 2)
    check (amount_value is null or amount_value > 0),
  add column if not exists amount_unit text
    check (amount_unit is null or amount_unit in ('g', 'ml', 'cup', 'pill', 'drop')),
  add column if not exists one_off_date date,
  add column if not exists default_assignee_id uuid references auth.users(id) on delete set null,
  add column if not exists reminder_minutes_before integer default 15
    check (reminder_minutes_before is null or reminder_minutes_before in (5, 10, 15, 30, 60)),
  add column if not exists archived_at timestamptz;

alter table public.daily_needs
  add constraint daily_needs_amount_pair_check
    check ((amount_value is null) = (amount_unit is null));

update public.daily_needs as need
set dog_id = dog.id
from public.dogs as dog
where dog.household_id = need.household_id
  and need.dog_id is null;

create or replace function public.daily_needs_before_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.dog_id is null then
    select dog.id into new.dog_id
    from public.dogs as dog
    where dog.household_id = new.household_id
    order by dog.created_at
    limit 1;
  elsif not exists (
    select 1 from public.dogs as dog
    where dog.id = new.dog_id and dog.household_id = new.household_id
  ) then
    raise exception 'That dog belongs to another family';
  end if;

  if new.default_assignee_id is not null
    and (tg_op = 'INSERT' or new.default_assignee_id is distinct from old.default_assignee_id)
    and not exists (
    select 1 from public.household_members as member
    where member.user_id = new.default_assignee_id
      and member.household_id = new.household_id
  ) then
    raise exception 'Choose a member of this family';
  end if;

  return new;
end;
$$;

drop trigger if exists daily_needs_before_write on public.daily_needs;
create trigger daily_needs_before_write
  before insert or update on public.daily_needs
  for each row execute function public.daily_needs_before_write();

-- ---------------------------------------------------------------------------
-- 5. Occurrences and repeating claims
-- ---------------------------------------------------------------------------

-- What a done task returns to on Undo / "Mark as not done".
alter table public.daily_need_occurrences
  add column if not exists previous_status text
    check (previous_status is null or previous_status in ('open', 'booked'));

create table if not exists public.claim_series (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  daily_need_id uuid not null references public.daily_needs(id) on delete cascade,
  assigned_user_id uuid references auth.users(id) on delete set null,
  assigned_name text not null,
  repeat_rule text not null check (repeat_rule in ('weekday', 'daily')),
  weekday smallint check (weekday between 0 and 6),
  starts_on date not null,
  ends_on date,
  reminder_enabled boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  check ((repeat_rule = 'weekday') = (weekday is not null)),
  check (ends_on is null or ends_on >= starts_on)
);

create index if not exists claim_series_need_idx
  on public.claim_series (daily_need_id, starts_on);
create index if not exists claim_series_household_idx
  on public.claim_series (household_id);

-- Backfill: a need whose most recent occurrence was a repeating claim keeps
-- repeating (this is what the app inferred before).
insert into public.claim_series (
  household_id, daily_need_id, assigned_user_id, assigned_name,
  repeat_rule, weekday, starts_on, reminder_enabled, created_by
)
select
  latest.household_id,
  latest.daily_need_id,
  latest.assigned_user_id,
  coalesce(latest.assigned_name, 'Family member'),
  latest.repeat_rule,
  case when latest.repeat_rule = 'weekday'
    then extract(dow from latest.occurrence_date)::smallint end,
  latest.occurrence_date,
  latest.reminder_enabled,
  coalesce(latest.booked_by, latest.assigned_user_id)
from (
  select distinct on (occurrence.daily_need_id) occurrence.*
  from public.daily_need_occurrences as occurrence
  order by occurrence.daily_need_id, occurrence.occurrence_date desc
) as latest
where latest.repeat_rule in ('daily', 'weekday')
  and latest.status in ('booked', 'done')
  and latest.assigned_user_id is not null
  and not exists (
    select 1 from public.claim_series as series
    where series.daily_need_id = latest.daily_need_id
  );

alter table public.claim_series enable row level security;

create policy "Household members can read claim series"
  on public.claim_series for select to authenticated
  using (public.is_household_member(household_id));

grant select on public.claim_series to authenticated;

-- Effective state of one task on one day, whether or not a row exists:
-- stored row > repeating claim > task's default assignee > open.
-- Mirrored on the client in src/lib/occurrences.ts (resolveOccurrence).
create or replace function public.resolve_occurrence(target_need_id uuid, target_date date)
returns public.daily_need_occurrences
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  need public.daily_needs%rowtype;
  existing public.daily_need_occurrences%rowtype;
  series public.claim_series%rowtype;
  result public.daily_need_occurrences%rowtype;
begin
  select * into need from public.daily_needs where id = target_need_id;
  if need.id is null then
    return null;
  end if;

  select * into existing
  from public.daily_need_occurrences as occurrence
  where occurrence.daily_need_id = target_need_id
    and occurrence.occurrence_date = target_date;
  if existing.daily_need_id is not null then
    return existing;
  end if;

  result.household_id := need.household_id;
  result.daily_need_id := need.id;
  result.occurrence_date := target_date;
  result.status := 'open';
  result.repeat_rule := 'today';
  result.reminder_enabled := false;
  result.created_at := now();
  result.updated_at := now();

  select * into series
  from public.claim_series as candidate
  where candidate.daily_need_id = target_need_id
    and candidate.starts_on <= target_date
    and (candidate.ends_on is null or candidate.ends_on >= target_date)
    and (
      candidate.repeat_rule = 'daily'
      or candidate.weekday = extract(dow from target_date)::smallint
    )
    and candidate.assigned_user_id is not null
    and exists (
      select 1 from public.household_members as member
      where member.user_id = candidate.assigned_user_id
        and member.household_id = candidate.household_id
    )
  order by candidate.starts_on desc, candidate.created_at desc
  limit 1;

  if series.id is not null then
    result.status := 'booked';
    result.assigned_user_id := series.assigned_user_id;
    result.assigned_name := public.member_display_name(series.assigned_user_id);
    result.booked_by := coalesce(series.created_by, series.assigned_user_id);
    result.booked_name := public.member_display_name(result.booked_by);
    result.repeat_rule := series.repeat_rule;
    result.reminder_enabled := series.reminder_enabled;
    return result;
  end if;

  if need.default_assignee_id is not null and exists (
    select 1 from public.household_members as member
    where member.user_id = need.default_assignee_id
      and member.household_id = need.household_id
  ) then
    result.status := 'booked';
    result.assigned_user_id := need.default_assignee_id;
    result.assigned_name := public.member_display_name(need.default_assignee_id);
    result.booked_by := need.default_assignee_id;
    result.booked_name := result.assigned_name;
    result.reminder_enabled := need.reminder_minutes_before is not null;
  end if;

  return result;
end;
$$;

-- Ends repeating claims of one task from target_date on. When only_user_id is
-- given, only that member's series are ended; when only_weekday is given,
-- only "Every <weekday>" series for that weekday (plus none of the daily ones).
create or replace function public.end_claim_series(
  target_need_id uuid,
  target_date date,
  only_user_id uuid default null,
  only_weekday smallint default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.claim_series as series
  where series.daily_need_id = target_need_id
    and series.starts_on >= target_date
    and (only_user_id is null or series.assigned_user_id = only_user_id)
    and (only_weekday is null or series.weekday = only_weekday);

  update public.claim_series as series
  set ends_on = target_date - 1
  where series.daily_need_id = target_need_id
    and series.starts_on < target_date
    and (series.ends_on is null or series.ends_on >= target_date)
    and (only_user_id is null or series.assigned_user_id = only_user_id)
    and (only_weekday is null or series.weekday = only_weekday);
end;
$$;

-- Guarded state transition. The client sends the state it saw
-- (expected_status + expected_actor); if the server state differs the call
-- changes nothing and returns
--   { ok: false, error: 'already_claimed' | 'already_done' | 'state_changed'
--                      | 'not_allowed', occurrence: <current row> }
-- On success: { ok: true, error: null, occurrence: <new row> }.
-- expected_actor is the claimer (assigned_user_id) for 'booked' and the
-- completer (completed_by) for 'done'; null skips the actor check.
create or replace function public.transition_occurrence(
  target_need_id uuid,
  target_date date,
  target_action text,
  expected_status text,
  expected_actor uuid default null,
  target_member_id uuid default null,
  target_repeat_rule text default 'today',
  target_reminder_enabled boolean default true,
  target_release_scope text default 'day'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  target_need public.daily_needs%rowtype;
  effective public.daily_need_occurrences%rowtype;
  locked_row public.daily_need_occurrences%rowtype;
  current_actor uuid;
  conflict_code text;
  assignee_id uuid;
  my_name text;
  assignee_name text;
  restored_status text;
  day_of_week smallint := extract(dow from target_date)::smallint;
begin
  if current_user_id is null then
    raise exception 'Sign in before updating a task';
  end if;
  if target_action not in ('claim', 'take_over', 'release', 'complete', 'undo', 'reopen') then
    raise exception 'Invalid action %', target_action;
  end if;
  if expected_status not in ('open', 'booked', 'done') then
    raise exception 'Invalid expected status %', expected_status;
  end if;
  if target_repeat_rule not in ('today', 'weekday', 'daily') then
    raise exception 'Invalid repeat option %', target_repeat_rule;
  end if;
  if target_release_scope not in ('day', 'series') then
    raise exception 'Invalid release scope %', target_release_scope;
  end if;

  select * into target_need from public.daily_needs where id = target_need_id;
  if target_need.id is null
    or not public.is_household_member(target_need.household_id) then
    raise exception 'You are not a member of this family';
  end if;
  if target_need.archived_at is not null then
    raise exception 'This task was deleted';
  end if;

  -- Materialise the effective state so there is a row to lock. Concurrent
  -- callers serialise on the primary key, then on the row lock below.
  effective := public.resolve_occurrence(target_need_id, target_date);
  insert into public.daily_need_occurrences (
    household_id, daily_need_id, occurrence_date, status,
    booked_by, booked_name, assigned_user_id, assigned_name,
    repeat_rule, reminder_enabled
  ) values (
    target_need.household_id, target_need_id, target_date, effective.status,
    effective.booked_by, effective.booked_name,
    effective.assigned_user_id, effective.assigned_name,
    'today', coalesce(effective.reminder_enabled, false)
  )
  on conflict (daily_need_id, occurrence_date) do nothing;

  select * into locked_row
  from public.daily_need_occurrences as occurrence
  where occurrence.daily_need_id = target_need_id
    and occurrence.occurrence_date = target_date
  for update;

  current_actor := case locked_row.status
    when 'booked' then locked_row.assigned_user_id
    when 'done' then locked_row.completed_by
  end;

  if locked_row.status <> expected_status
    or (
      expected_status <> 'open'
      and expected_actor is not null
      and current_actor is distinct from expected_actor
    ) then
    conflict_code := case
      when locked_row.status = 'done' then 'already_done'
      when locked_row.status = 'booked'
        and (expected_status = 'open' or target_action in ('claim', 'take_over'))
        then 'already_claimed'
      else 'state_changed'
    end;
    return jsonb_build_object(
      'ok', false, 'error', conflict_code, 'occurrence', to_jsonb(locked_row)
    );
  end if;

  if (target_action = 'claim' and locked_row.status <> 'open')
    or (target_action in ('take_over', 'release') and locked_row.status <> 'booked')
    or (target_action = 'complete' and locked_row.status = 'done')
    or (target_action in ('undo', 'reopen') and locked_row.status <> 'done') then
    return jsonb_build_object(
      'ok', false, 'error', 'state_changed', 'occurrence', to_jsonb(locked_row)
    );
  end if;

  if (
    target_action = 'release'
    and locked_row.assigned_user_id is distinct from current_user_id
    and locked_row.booked_by is distinct from current_user_id
  ) or (
    target_action = 'undo'
    and locked_row.completed_by is distinct from current_user_id
  ) then
    return jsonb_build_object(
      'ok', false, 'error', 'not_allowed', 'occurrence', to_jsonb(locked_row)
    );
  end if;

  my_name := public.member_display_name(current_user_id);

  if target_action in ('claim', 'take_over') then
    assignee_id := coalesce(target_member_id, current_user_id);
    if not exists (
      select 1 from public.household_members as member
      where member.user_id = assignee_id
        and member.household_id = target_need.household_id
    ) then
      raise exception 'Choose a member of this family';
    end if;
    assignee_name := public.member_display_name(assignee_id);

    update public.daily_need_occurrences as occurrence
    set status = 'booked',
        booked_by = current_user_id,
        booked_name = my_name,
        assigned_user_id = assignee_id,
        assigned_name = assignee_name,
        repeat_rule = target_repeat_rule,
        reminder_enabled = target_reminder_enabled,
        previous_status = null,
        completed_by = null,
        completed_name = null,
        completed_at = null,
        updated_at = now()
    where occurrence.daily_need_id = target_need_id
      and occurrence.occurrence_date = target_date;

    if target_repeat_rule = 'daily' then
      perform public.end_claim_series(target_need_id, target_date);
    elsif target_repeat_rule = 'weekday' then
      perform public.end_claim_series(target_need_id, target_date, null, day_of_week);
    end if;

    if target_repeat_rule in ('daily', 'weekday') then
      insert into public.claim_series (
        household_id, daily_need_id, assigned_user_id, assigned_name,
        repeat_rule, weekday, starts_on, reminder_enabled, created_by
      ) values (
        target_need.household_id, target_need_id, assignee_id, assignee_name,
        target_repeat_rule,
        case when target_repeat_rule = 'weekday' then day_of_week end,
        target_date, target_reminder_enabled, current_user_id
      );
    end if;

    -- Push: "signed you up" (assignee) and "taken over" (previous claimer)
    -- are queued by the push_on_occurrence_change trigger
    -- (202610150001_push_notifications.sql).
  elsif target_action = 'release' then
    update public.daily_need_occurrences as occurrence
    set status = 'open',
        booked_by = null,
        booked_name = null,
        assigned_user_id = null,
        assigned_name = null,
        repeat_rule = 'today',
        reminder_enabled = false,
        previous_status = null,
        updated_at = now()
    where occurrence.daily_need_id = target_need_id
      and occurrence.occurrence_date = target_date;

    if target_release_scope = 'series' then
      perform public.end_claim_series(
        target_need_id, target_date + 1, locked_row.assigned_user_id
      );
    end if;
    -- Push: within 30 min of due the family gets "{task} is open again"
    -- (push_on_occurrence_change trigger, 202610150001).
  elsif target_action = 'complete' then
    update public.daily_need_occurrences as occurrence
    set status = 'done',
        previous_status = locked_row.status,
        completed_by = current_user_id,
        completed_name = my_name,
        completed_at = now(),
        updated_at = now()
    where occurrence.daily_need_id = target_need_id
      and occurrence.occurrence_date = target_date;
    -- Push: the claimer gets "{my_name} did the {task} you claimed"
    -- (push_on_occurrence_change trigger, 202610150001).
  else
    -- undo (completer only) / reopen ("Mark as not done", anyone)
    restored_status := coalesce(locked_row.previous_status, 'open');
    update public.daily_need_occurrences as occurrence
    set status = restored_status,
        previous_status = null,
        completed_by = null,
        completed_name = null,
        completed_at = null,
        booked_by = case when restored_status = 'booked' then occurrence.booked_by end,
        booked_name = case when restored_status = 'booked' then occurrence.booked_name end,
        assigned_user_id = case when restored_status = 'booked' then occurrence.assigned_user_id end,
        assigned_name = case when restored_status = 'booked' then occurrence.assigned_name end,
        updated_at = now()
    where occurrence.daily_need_id = target_need_id
      and occurrence.occurrence_date = target_date;
    -- Push: on reopen the completer is notified (push_on_occurrence_change
    -- trigger, 202610150001).
  end if;

  select * into locked_row
  from public.daily_need_occurrences as occurrence
  where occurrence.daily_need_id = target_need_id
    and occurrence.occurrence_date = target_date;

  return jsonb_build_object(
    'ok', true, 'error', null, 'occurrence', to_jsonb(locked_row)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. Grants and Realtime
-- ---------------------------------------------------------------------------

revoke all on function public.member_display_name(uuid) from public, anon, authenticated;
revoke all on function public.resolve_occurrence(uuid, date) from public, anon, authenticated;
revoke all on function public.end_claim_series(uuid, date, uuid, smallint) from public, anon, authenticated;
revoke all on function public.daily_needs_before_write() from public, anon, authenticated;

revoke all on function public.set_my_display_name(text) from public, anon;
grant execute on function public.set_my_display_name(text) to authenticated;
revoke all on function public.get_family_members() from public, anon;
grant execute on function public.get_family_members() to authenticated;
revoke all on function public.create_family(text, text) from public, anon;
grant execute on function public.create_family(text, text) to authenticated;
revoke all on function public.create_household(text) from public, anon;
grant execute on function public.create_household(text) to authenticated;
revoke all on function public.join_household(text) from public, anon;
grant execute on function public.join_household(text) to authenticated;
revoke all on function public.get_household_members() from public, anon;
grant execute on function public.get_household_members() to authenticated;
revoke all on function
  public.transition_occurrence(uuid, date, text, text, uuid, uuid, text, boolean, text)
  from public, anon;
grant execute on function
  public.transition_occurrence(uuid, date, text, text, uuid, uuid, text, boolean, text)
  to authenticated;

do $$
declare
  table_name text;
begin
  foreach table_name in array array['dogs', 'claim_series'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = table_name
    ) then
      execute format(
        'alter publication supabase_realtime add table public.%I',
        table_name
      );
    end if;
  end loop;
end;
$$;
