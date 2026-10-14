-- Push notifications (additive). See docs/architecture.md, "Push notifications".
--
--   * households.timezone: quiet hours and due times use the family's clock
--   * push_tokens: one row per device (Expo push token), written via RPCs
--   * notification_preferences: the 5 toggles from screens.md #22, per member
--   * notification_outbox: one row per (recipient, event); dedupe_key unique
--   * push_tickets: Expo push tickets, checked for receipts after 15 minutes
--   * triggers enqueue event pushes (claimed for you, taken over, done on
--     your claim, released near due, reopened, family activity, member
--     joined, task deleted / moved) and cancel pending ones on state change
--   * enqueue_due_notifications(): claimer reminder, must-do unclaimed T-60,
--     due and unclaimed, overdue. Run every minute by pg_cron.
--   * push_kick(): pg_net call to the send-push Edge Function when there is
--     work. The function drains the outbox with the service role.
--
-- Requires 202610140001_mvp_task_model.sql. pg_cron, pg_net and Vault are
-- optional at migration time: if pg_cron is missing, nothing is scheduled and
-- `select public.schedule_push_jobs();` can be run after enabling it (README).

-- ---------------------------------------------------------------------------
-- 1. Family time zone
-- ---------------------------------------------------------------------------

alter table public.households
  add column if not exists timezone text;

create or replace function public.family_timezone(target_household_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select household.timezone from public.households as household
     where household.id = target_household_id),
    'Europe/Athens'
  );
$$;

-- Sets the family's IANA time zone from a member's device. Only fills an
-- empty value, except for the owner, who can change it.
create or replace function public.set_family_timezone(new_timezone text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  membership public.household_members%rowtype;
begin
  if current_user_id is null then
    raise exception 'Sign in before changing the time zone';
  end if;
  if not exists (
    select 1 from pg_catalog.pg_timezone_names as zone where zone.name = new_timezone
  ) then
    raise exception 'Unknown time zone %', new_timezone;
  end if;

  select * into membership
  from public.household_members as member
  where member.user_id = current_user_id;
  if membership.household_id is null then
    raise exception 'Join a family first';
  end if;

  update public.households as household
  set timezone = new_timezone
  where household.id = membership.household_id
    and (household.timezone is null or membership.role = 'owner');

  return public.family_timezone(membership.household_id);
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Device tokens
-- ---------------------------------------------------------------------------

create table if not exists public.push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  expo_token text not null unique
    check (expo_token ~ '^Expo(nent)?PushToken\[[^\]]+\]$'),
  platform text not null check (platform in ('ios', 'android')),
  locale text not null default 'en' check (length(locale) between 2 and 20),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists push_tokens_user_idx on public.push_tokens (user_id);

alter table public.push_tokens enable row level security;

drop policy if exists "Users can read their own push tokens" on public.push_tokens;
create policy "Users can read their own push tokens"
  on public.push_tokens for select to authenticated
  using (user_id = (select auth.uid()));

revoke all on public.push_tokens from anon, authenticated;
grant select on public.push_tokens to authenticated;

-- Upsert by token: a phone that switches accounts moves to the new user.
create or replace function public.register_push_token(
  token text,
  token_platform text,
  token_locale text default 'en'
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
begin
  if current_user_id is null then
    raise exception 'Sign in before turning on reminders';
  end if;

  insert into public.push_tokens (user_id, expo_token, platform, locale)
  values (current_user_id, token, token_platform, coalesce(nullif(token_locale, ''), 'en'))
  on conflict (expo_token) do update
    set user_id = excluded.user_id,
        platform = excluded.platform,
        locale = excluded.locale,
        updated_at = now();
end;
$$;

create or replace function public.unregister_push_token(token text)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.push_tokens as device
  where device.expo_token = token
    and device.user_id = (select auth.uid());
$$;

-- ---------------------------------------------------------------------------
-- 3. Preferences (screens.md #22). No row = defaults.
-- ---------------------------------------------------------------------------

create table if not exists public.notification_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  claimed_tasks boolean not null default true,
  open_tasks boolean not null default true,
  overdue_tasks boolean not null default true,
  family_activity text not null default 'must_do'
    check (family_activity in ('off', 'must_do', 'all')),
  new_members boolean not null default true,
  updated_at timestamptz not null default now()
);

alter table public.notification_preferences enable row level security;

drop policy if exists "Users can read their notification preferences" on public.notification_preferences;
create policy "Users can read their notification preferences"
  on public.notification_preferences for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "Users can add their notification preferences" on public.notification_preferences;
create policy "Users can add their notification preferences"
  on public.notification_preferences for insert to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists "Users can update their notification preferences" on public.notification_preferences;
create policy "Users can update their notification preferences"
  on public.notification_preferences for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

revoke all on public.notification_preferences from anon, authenticated;
grant select, insert, update on public.notification_preferences to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Outbox and tickets (server only: RLS on, no policies, no grants)
-- ---------------------------------------------------------------------------

create table if not exists public.notification_outbox (
  id bigint generated always as identity primary key,
  household_id uuid not null references public.households(id) on delete cascade,
  recipient_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in (
    'claimer_reminder', 'must_do_unclaimed', 'due_unclaimed', 'overdue',
    'assigned', 'taken_over', 'done_on_your_claim', 'released_near_due',
    'reopened', 'family_done', 'member_joined', 'task_deleted', 'task_moved'
  )),
  daily_need_id uuid references public.daily_needs(id) on delete cascade,
  occurrence_date date,
  -- Template parameters (task, dog, time, actor, ...) plus needId / date.
  -- The Edge Function renders the copy in the recipient's locale.
  data jsonb not null default '{}'::jsonb,
  dedupe_key text not null unique,
  send_after timestamptz not null default now(),
  expires_at timestamptz,
  -- Claimer reminders the user asked for ignore quiet hours (flow d).
  bypass_quiet_hours boolean not null default false,
  status text not null default 'pending'
    check (status in ('pending', 'sending', 'sent', 'skipped', 'failed')),
  skip_reason text,
  attempts smallint not null default 0,
  last_error text,
  locked_at timestamptz,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);

create index if not exists notification_outbox_pending_idx
  on public.notification_outbox (send_after)
  where status in ('pending', 'sending');
create index if not exists notification_outbox_occurrence_idx
  on public.notification_outbox (daily_need_id, occurrence_date)
  where status = 'pending';

create table if not exists public.push_tickets (
  id bigint generated always as identity primary key,
  outbox_id bigint references public.notification_outbox(id) on delete cascade,
  expo_token text not null,
  ticket_id text not null unique,
  receipt_status text check (receipt_status in ('ok', 'error', 'expired')),
  receipt_error text,
  created_at timestamptz not null default now(),
  checked_at timestamptz
);

create index if not exists push_tickets_unchecked_idx
  on public.push_tickets (created_at) where checked_at is null;

alter table public.notification_outbox enable row level security;
alter table public.push_tickets enable row level security;
revoke all on public.notification_outbox from anon, authenticated;
revoke all on public.push_tickets from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5. Helpers
-- ---------------------------------------------------------------------------

-- Due moment of a task on a family-local date.
create or replace function public.occurrence_due_at(
  target_date date,
  target_time time,
  target_timezone text
)
returns timestamptz
language sql
stable
set search_path = ''
as $$
  select (target_date + target_time) at time zone target_timezone;
$$;

-- Grace period before "overdue": task duration, min 30, max 60 minutes
-- (user-flows.md status model; mirrors getTimingState in src/lib/tasks.ts).
create or replace function public.overdue_grace(duration integer)
returns interval
language sql
immutable
set search_path = ''
as $$
  select make_interval(mins => least(60, greatest(30, coalesce(duration, 30))));
$$;

create or replace function public.is_need_scheduled_on(
  target_need public.daily_needs,
  target_date date
)
returns boolean
language sql
stable
set search_path = ''
as $$
  select case
    when target_need.one_off_date is not null
      then target_need.one_off_date = target_date
    else target_need.repeat_days @> array[
      (array['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'])
        [extract(dow from target_date)::int + 1]
    ]
  end;
$$;

-- Which preference toggle governs a kind.
create or replace function public.push_kind_category(target_kind text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when target_kind in ('must_do_unclaimed', 'due_unclaimed', 'released_near_due')
      then 'open_tasks'
    when target_kind = 'overdue' then 'overdue_tasks'
    when target_kind = 'family_done' then 'family_activity'
    when target_kind = 'member_joined' then 'new_members'
    else 'claimed_tasks'
  end;
$$;

create or replace function public.push_preference_allows(
  target_user_id uuid,
  target_kind text,
  target_required boolean
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (
      select case public.push_kind_category(target_kind)
        when 'open_tasks' then pref.open_tasks
        when 'overdue_tasks' then pref.overdue_tasks
        when 'new_members' then pref.new_members
        when 'family_activity' then
          pref.family_activity = 'all'
          or (pref.family_activity = 'must_do' and coalesce(target_required, false))
        else pref.claimed_tasks
      end
      from public.notification_preferences as pref
      where pref.user_id = target_user_id
    ),
    -- Defaults: everything on; family activity for must-do tasks only.
    case
      when public.push_kind_category(target_kind) = 'family_activity'
        then coalesce(target_required, false)
      else true
    end
  );
$$;

-- Does a queued notification still make sense for the occurrence state?
create or replace function public.push_is_relevant(
  target_kind text,
  target_recipient uuid,
  current_status text,
  current_assignee uuid
)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case target_kind
    when 'claimer_reminder' then
      current_status = 'booked' and current_assignee = target_recipient
    when 'assigned' then
      current_status = 'booked' and current_assignee = target_recipient
    when 'task_moved' then
      current_status = 'booked' and current_assignee = target_recipient
    when 'must_do_unclaimed' then current_status = 'open'
    when 'due_unclaimed' then current_status = 'open'
    when 'released_near_due' then current_status = 'open'
    when 'overdue' then current_status <> 'done'
    when 'reopened' then current_status <> 'done'
    when 'done_on_your_claim' then current_status = 'done'
    when 'family_done' then current_status = 'done'
    else true
  end;
$$;

-- Queue one notification. Silently ignores duplicates (dedupe_key) and
-- recipients who are not (or no longer) members of the family.
create or replace function public.push_enqueue(
  target_household_id uuid,
  target_recipient uuid,
  target_kind text,
  target_need_id uuid,
  target_date date,
  target_data jsonb,
  target_dedupe_key text,
  target_send_after timestamptz default now(),
  target_expires_at timestamptz default null,
  target_bypass_quiet_hours boolean default false
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if target_recipient is null or not exists (
    select 1 from public.household_members as member
    where member.user_id = target_recipient
      and member.household_id = target_household_id
  ) then
    return;
  end if;

  insert into public.notification_outbox (
    household_id, recipient_id, kind, daily_need_id, occurrence_date, data,
    dedupe_key, send_after, expires_at, bypass_quiet_hours
  ) values (
    target_household_id, target_recipient, target_kind, target_need_id,
    target_date,
    coalesce(target_data, '{}'::jsonb)
      || jsonb_strip_nulls(jsonb_build_object(
        'needId', target_need_id, 'date', target_date
      )),
    target_dedupe_key, coalesce(target_send_after, now()), target_expires_at,
    target_bypass_quiet_hours
  )
  on conflict (dedupe_key) do nothing;
end;
$$;

-- Template parameters shared by every task notification.
create or replace function public.push_task_data(
  target_need public.daily_needs,
  actor_id uuid default null
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'task', target_need.title,
    'time', to_char(target_need.time, 'HH24:MI'),
    'required', target_need.required,
    'dog', coalesce(
      (select dog.name from public.dogs as dog where dog.id = target_need.dog_id),
      (select household.name from public.households as household
       where household.id = target_need.household_id)
    ),
    'actor', case when actor_id is not null then public.member_display_name(actor_id) end
  ));
$$;

-- ---------------------------------------------------------------------------
-- 6. Event pushes from state changes (replaces the TODO(push) markers in
--    202610140001: transition_occurrence, join_household; and the client's
--    saveNeed / archiveNeed)
-- ---------------------------------------------------------------------------

create or replace function public.push_on_occurrence_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  need public.daily_needs%rowtype;
  zone text;
  due_at timestamptz;
  payload jsonb;
  stamp text := to_char(new.updated_at at time zone 'UTC', 'YYYYMMDDHH24MISSUS');
  key_tail text := new.daily_need_id || ':' || new.occurrence_date || ':';
  member_row record;
begin
  -- Cancel queued pushes that no longer fit the new state, e.g. a reminder
  -- for a claim that was released, or "nobody's on it" once claimed.
  update public.notification_outbox as outbox
  set status = 'skipped', skip_reason = 'state_changed'
  where outbox.daily_need_id = new.daily_need_id
    and outbox.occurrence_date = new.occurrence_date
    and outbox.status = 'pending'
    and not public.push_is_relevant(
      outbox.kind, outbox.recipient_id, new.status, new.assigned_user_id
    );

  if new.status is not distinct from old.status
    and new.assigned_user_id is not distinct from old.assigned_user_id then
    return null;
  end if;

  select * into need from public.daily_needs where id = new.daily_need_id;
  if need.id is null or need.archived_at is not null then
    return null;
  end if;
  zone := public.family_timezone(need.household_id);
  due_at := public.occurrence_due_at(new.occurrence_date, need.time, zone);
  payload := public.push_task_data(need, actor_id)
    || jsonb_strip_nulls(jsonb_build_object('assignee', new.assigned_name));

  -- Claimed for someone else ("Eleni signed you up for ...").
  if new.status = 'booked'
    and new.assigned_user_id is distinct from actor_id
    and new.assigned_user_id is distinct from old.assigned_user_id then
    perform public.push_enqueue(
      need.household_id, new.assigned_user_id, 'assigned', need.id,
      new.occurrence_date, payload,
      'assigned:' || key_tail || new.assigned_user_id || ':' || stamp,
      now(), due_at + public.overdue_grace(need.duration_minutes)
    );
  end if;

  -- Taken over: tell the previous claimer.
  if old.status = 'booked' and new.status = 'booked'
    and old.assigned_user_id is distinct from new.assigned_user_id
    and old.assigned_user_id is distinct from actor_id then
    perform public.push_enqueue(
      need.household_id, old.assigned_user_id, 'taken_over', need.id,
      new.occurrence_date, payload,
      'taken_over:' || key_tail || old.assigned_user_id || ':' || stamp,
      now(), due_at + public.overdue_grace(need.duration_minutes)
    );
  end if;

  -- Released close to due time (30 min before, until overdue): tell the family.
  if old.status = 'booked' and new.status = 'open'
    and now() >= due_at - interval '30 minutes'
    and now() < due_at + public.overdue_grace(need.duration_minutes) then
    for member_row in
      select member.user_id from public.household_members as member
      where member.household_id = need.household_id
        and member.user_id is distinct from actor_id
    loop
      perform public.push_enqueue(
        need.household_id, member_row.user_id, 'released_near_due', need.id,
        new.occurrence_date, payload,
        'released_near_due:' || key_tail || member_row.user_id || ':' || stamp,
        now(), due_at + public.overdue_grace(need.duration_minutes)
      );
    end loop;
  end if;

  -- Done. Short delay so a 5-second Undo cancels these before they go out.
  if new.status = 'done' and old.status <> 'done' then
    if old.status = 'booked' and old.assigned_user_id is distinct from actor_id then
      perform public.push_enqueue(
        need.household_id, old.assigned_user_id, 'done_on_your_claim', need.id,
        new.occurrence_date, payload,
        'done_on_your_claim:' || key_tail || old.assigned_user_id || ':' || stamp,
        now() + interval '30 seconds', null
      );
    end if;
    for member_row in
      select member.user_id from public.household_members as member
      where member.household_id = need.household_id
        and member.user_id is distinct from actor_id
        and (old.status <> 'booked' or member.user_id is distinct from old.assigned_user_id)
    loop
      perform public.push_enqueue(
        need.household_id, member_row.user_id, 'family_done', need.id,
        new.occurrence_date, payload,
        'family_done:' || key_tail || member_row.user_id || ':' || stamp,
        now() + interval '30 seconds',
        (new.occurrence_date + 1 + time '00:00') at time zone zone
      );
    end loop;
  end if;

  -- "Mark as not done" by someone else: tell the completer.
  if old.status = 'done' and new.status <> 'done'
    and old.completed_by is distinct from actor_id then
    perform public.push_enqueue(
      need.household_id, old.completed_by, 'reopened', need.id,
      new.occurrence_date, payload,
      'reopened:' || key_tail || old.completed_by || ':' || stamp,
      now(), (new.occurrence_date + 1 + time '00:00') at time zone zone
    );
  end if;

  return null;
end;
$$;

drop trigger if exists push_on_occurrence_change on public.daily_need_occurrences;
create trigger push_on_occurrence_change
  after update on public.daily_need_occurrences
  for each row execute function public.push_on_occurrence_change();

-- Task edited or deleted while someone has claimed today's occurrence.
create or replace function public.push_on_need_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  zone text := public.family_timezone(new.household_id);
  local_today date := (now() at time zone zone)::date;
  today public.daily_need_occurrences%rowtype;
  stamp text := to_char(now() at time zone 'UTC', 'YYYYMMDDHH24MISSUS');
  payload jsonb;
begin
  if new.archived_at is not null and old.archived_at is null then
    update public.notification_outbox as outbox
    set status = 'skipped', skip_reason = 'task_deleted'
    where outbox.daily_need_id = new.id
      and outbox.status = 'pending'
      and outbox.kind <> 'task_deleted';

    if public.is_need_scheduled_on(old, local_today) then
      today := public.resolve_occurrence(new.id, local_today);
      if today.status = 'booked' and today.assigned_user_id is distinct from actor_id then
        perform public.push_enqueue(
          new.household_id, today.assigned_user_id, 'task_deleted', new.id,
          local_today, public.push_task_data(old, actor_id),
          'task_deleted:' || new.id || ':' || local_today || ':' || today.assigned_user_id,
          now(), (local_today + 1 + time '00:00') at time zone zone
        );
      end if;
    end if;
  elsif new.archived_at is null and new.time is distinct from old.time then
    if public.is_need_scheduled_on(new, local_today) then
      today := public.resolve_occurrence(new.id, local_today);
      if today.status = 'booked' and today.assigned_user_id is distinct from actor_id then
        payload := public.push_task_data(new, actor_id)
          || jsonb_build_object('oldTime', to_char(old.time, 'HH24:MI'));
        perform public.push_enqueue(
          new.household_id, today.assigned_user_id, 'task_moved', new.id,
          local_today, payload,
          'task_moved:' || new.id || ':' || local_today || ':'
            || today.assigned_user_id || ':' || stamp,
          now(),
          public.occurrence_due_at(local_today, new.time, zone)
            + public.overdue_grace(new.duration_minutes)
        );
      end if;
    end if;
  end if;
  return null;
end;
$$;

drop trigger if exists push_on_need_change on public.daily_needs;
create trigger push_on_need_change
  after update of time, archived_at on public.daily_needs
  for each row execute function public.push_on_need_change();

-- "Maria joined Max's family."
create or replace function public.push_on_member_joined()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  member_row record;
  payload jsonb := jsonb_build_object(
    'actor', public.member_display_name(new.user_id),
    'dog', coalesce(
      (select dog.name from public.dogs as dog
       where dog.household_id = new.household_id
       order by dog.created_at limit 1),
      (select household.name from public.households as household
       where household.id = new.household_id)
    )
  );
begin
  for member_row in
    select member.user_id from public.household_members as member
    where member.household_id = new.household_id
      and member.user_id <> new.user_id
  loop
    perform public.push_enqueue(
      new.household_id, member_row.user_id, 'member_joined', null, null,
      payload,
      'member_joined:' || new.household_id || ':' || new.user_id || ':' || member_row.user_id,
      now(), now() + interval '2 days'
    );
  end loop;
  return null;
end;
$$;

drop trigger if exists push_on_member_joined on public.household_members;
create trigger push_on_member_joined
  after insert on public.household_members
  for each row execute function public.push_on_member_joined();

-- ---------------------------------------------------------------------------
-- 7. Scheduled pushes (pg_cron, every minute)
-- ---------------------------------------------------------------------------

-- Each scheduled push fires once, inside a 15-minute window after its
-- trigger time, so a late or missed cron run still catches up but never
-- sends stale alerts. dedupe_key includes the task time, so moving a task
-- re-arms its reminders.
create or replace function public.enqueue_due_notifications(at_time timestamptz default now())
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  window_size constant interval := interval '15 minutes';
  candidate record;
  occurrence public.daily_need_occurrences%rowtype;
  stored_updated_at timestamptz;
  trigger_at timestamptz;
  grace interval;
  payload jsonb;
  key_tail text;
  member_row record;
  queued_before bigint;
  queued_after bigint;
begin
  select count(*) into queued_before from public.notification_outbox;

  for candidate in
    select need, need.id as need_id, need.household_id, slot.day, slot.zone,
      public.occurrence_due_at(slot.day, need.time, slot.zone) as due_at
    from public.daily_needs as need
    cross join lateral (
      select public.family_timezone(need.household_id) as zone
    ) as family
    cross join lateral (
      select ((at_time at time zone family.zone)::date + offset_days) as day,
        family.zone
      from generate_series(-1, 1) as offset_days
    ) as slot
    where need.archived_at is null
      and public.is_need_scheduled_on(need, slot.day)
      and public.occurrence_due_at(slot.day, need.time, slot.zone)
        between at_time - interval '2 hours' and at_time + interval '75 minutes'
  loop
    occurrence := public.resolve_occurrence(candidate.need_id, candidate.day);
    grace := public.overdue_grace((candidate.need).duration_minutes);
    payload := public.push_task_data(candidate.need);
    key_tail := candidate.need_id || ':' || candidate.day || ':'
      || to_char((candidate.need).time, 'HH24MI') || ':';

    -- Claimer reminder N minutes before (if on for this claim). Skipped when
    -- the claim was made after the reminder time.
    if occurrence.status = 'booked'
      and occurrence.reminder_enabled
      and (candidate.need).reminder_minutes_before is not null then
      trigger_at := candidate.due_at
        - make_interval(mins => (candidate.need).reminder_minutes_before);
      select stored.updated_at into stored_updated_at
      from public.daily_need_occurrences as stored
      where stored.daily_need_id = candidate.need_id
        and stored.occurrence_date = candidate.day;
      if at_time >= trigger_at and at_time < least(trigger_at + window_size, candidate.due_at)
        and (stored_updated_at is null or stored_updated_at <= trigger_at) then
        perform public.push_enqueue(
          candidate.household_id, occurrence.assigned_user_id, 'claimer_reminder',
          candidate.need_id, candidate.day, payload,
          'claimer_reminder:' || key_tail || occurrence.assigned_user_id,
          at_time, candidate.due_at, true
        );
      end if;
    end if;

    -- Must-do task still unclaimed 1 hour before: everyone.
    if occurrence.status = 'open' and (candidate.need).required then
      trigger_at := candidate.due_at - interval '60 minutes';
      if at_time >= trigger_at and at_time < trigger_at + window_size then
        for member_row in
          select member.user_id from public.household_members as member
          where member.household_id = candidate.household_id
        loop
          perform public.push_enqueue(
            candidate.household_id, member_row.user_id, 'must_do_unclaimed',
            candidate.need_id, candidate.day, payload,
            'must_do_unclaimed:' || key_tail || member_row.user_id,
            at_time, candidate.due_at
          );
        end loop;
      end if;
    end if;

    -- Due and nobody's on it: everyone.
    if occurrence.status = 'open' then
      trigger_at := candidate.due_at;
      if at_time >= trigger_at and at_time < trigger_at + window_size then
        for member_row in
          select member.user_id from public.household_members as member
          where member.household_id = candidate.household_id
        loop
          perform public.push_enqueue(
            candidate.household_id, member_row.user_id, 'due_unclaimed',
            candidate.need_id, candidate.day, payload,
            'due_unclaimed:' || key_tail || member_row.user_id,
            at_time, candidate.due_at + grace
          );
        end loop;
      end if;
    end if;

    -- Overdue (due + grace) and not done: the claimer; for must-do tasks
    -- the whole family as well.
    if occurrence.status <> 'done' then
      trigger_at := candidate.due_at + grace;
      if at_time >= trigger_at and at_time < trigger_at + window_size then
        for member_row in
          select member.user_id from public.household_members as member
          where member.household_id = candidate.household_id
            and (
              (candidate.need).required
              or (occurrence.status = 'booked'
                  and member.user_id = occurrence.assigned_user_id)
            )
        loop
          perform public.push_enqueue(
            candidate.household_id, member_row.user_id, 'overdue',
            candidate.need_id, candidate.day, payload,
            'overdue:' || key_tail || member_row.user_id,
            at_time,
            (candidate.day + 1 + time '00:00') at time zone candidate.zone
          );
        end loop;
      end if;
    end if;
  end loop;

  select count(*) into queued_after from public.notification_outbox;
  return (queued_after - queued_before)::integer;
end;
$$;

-- ---------------------------------------------------------------------------
-- 8. Outbox draining (called by the send-push Edge Function, service role)
-- ---------------------------------------------------------------------------

-- Claims up to batch_size due rows. Re-checks state, preferences, quiet hours
-- (23:00-07:00 family time) and expiry; skipped rows are marked with a
-- reason, quiet-hour rows are pushed to 07:00. Returns rows to send with the
-- recipient's device tokens.
create or replace function public.push_claim_batch(batch_size integer default 100)
returns table (
  outbox_id bigint,
  kind text,
  data jsonb,
  expires_at timestamptz,
  tokens jsonb
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  row_item public.notification_outbox%rowtype;
  need public.daily_needs%rowtype;
  current_state public.daily_need_occurrences%rowtype;
  zone text;
  local_now timestamp;
  morning timestamptz;
  device_tokens jsonb;
  returned integer := 0;
  skip text;
begin
  -- Rows left in 'sending' by a crashed run go back to the queue (3 tries).
  update public.notification_outbox as outbox
  set status = case when outbox.attempts >= 3 then 'failed' else 'pending' end,
      last_error = coalesce(outbox.last_error, 'send timed out'),
      locked_at = null
  where outbox.status = 'sending'
    and outbox.locked_at < now() - interval '5 minutes';

  for row_item in
    select * from public.notification_outbox as outbox
    where outbox.status = 'pending' and outbox.send_after <= now()
    order by outbox.send_after, outbox.id
    limit greatest(batch_size, 1) * 3
    for update skip locked
  loop
    exit when returned >= batch_size;
    skip := null;
    need := null;
    zone := public.family_timezone(row_item.household_id);
    local_now := now() at time zone zone;

    if row_item.expires_at is not null and row_item.expires_at <= now() then
      skip := 'expired';
    elsif not exists (
      select 1 from public.household_members as member
      where member.user_id = row_item.recipient_id
        and member.household_id = row_item.household_id
    ) then
      skip := 'not_member';
    end if;

    if skip is null and row_item.daily_need_id is not null then
      select * into need from public.daily_needs where id = row_item.daily_need_id;
      if need.id is null
        or (need.archived_at is not null and row_item.kind <> 'task_deleted') then
        skip := 'task_deleted';
      elsif row_item.kind in ('claimer_reminder', 'must_do_unclaimed', 'due_unclaimed', 'overdue')
        and row_item.data ->> 'time' is distinct from to_char(need.time, 'HH24:MI') then
        skip := 'time_changed';
      elsif row_item.kind <> 'task_deleted' then
        current_state := public.resolve_occurrence(need.id, row_item.occurrence_date);
        if not public.push_is_relevant(
          row_item.kind, row_item.recipient_id,
          current_state.status, current_state.assigned_user_id
        ) then
          skip := 'state_changed';
        end if;
      end if;
    end if;

    if skip is null and not public.push_preference_allows(
      row_item.recipient_id, row_item.kind,
      coalesce(need.required, (row_item.data ->> 'required')::boolean)
    ) then
      skip := 'muted';
    end if;

    if skip is null and not row_item.bypass_quiet_hours
      and (local_now::time >= time '23:00' or local_now::time < time '07:00') then
      morning := (
        (local_now::date + case when local_now::time >= time '23:00' then 1 else 0 end)
        + time '07:00'
      ) at time zone zone;
      if row_item.expires_at is not null and row_item.expires_at <= morning then
        skip := 'quiet_hours';
      else
        update public.notification_outbox as outbox
        set send_after = morning
        where outbox.id = row_item.id;
        continue;
      end if;
    end if;

    if skip is null then
      select jsonb_agg(jsonb_build_object(
        'token', device.expo_token,
        'platform', device.platform,
        'locale', device.locale
      ) order by device.updated_at desc)
      into device_tokens
      from public.push_tokens as device
      where device.user_id = row_item.recipient_id;
      if device_tokens is null then
        skip := 'no_device';
      end if;
    end if;

    if skip is not null then
      update public.notification_outbox as outbox
      set status = 'skipped', skip_reason = skip
      where outbox.id = row_item.id;
      continue;
    end if;

    update public.notification_outbox as outbox
    set status = 'sending', locked_at = now(), attempts = outbox.attempts + 1
    where outbox.id = row_item.id;

    outbox_id := row_item.id;
    kind := row_item.kind;
    data := row_item.data;
    expires_at := row_item.expires_at;
    tokens := device_tokens;
    returned := returned + 1;
    return next;
  end loop;
end;
$$;

-- Records the outcome of one outbox row.
--   outcome: 'sent' | 'failed' | 'retry' (429 / 5xx / network: backoff)
--   tickets: [{ token, ticketId?, status: 'ok' | 'error', error? }]
-- Ticket errors of DeviceNotRegistered delete that token right away.
create or replace function public.push_finish(
  target_outbox_id bigint,
  outcome text,
  error_message text default null,
  tickets jsonb default '[]'::jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  ticket jsonb;
begin
  if outcome not in ('sent', 'failed', 'retry') then
    raise exception 'Invalid outcome %', outcome;
  end if;

  for ticket in select * from jsonb_array_elements(coalesce(tickets, '[]'::jsonb)) loop
    if ticket ->> 'status' = 'ok' and ticket ->> 'ticketId' is not null then
      insert into public.push_tickets (outbox_id, expo_token, ticket_id)
      values (target_outbox_id, ticket ->> 'token', ticket ->> 'ticketId')
      on conflict (ticket_id) do nothing;
    elsif ticket ->> 'error' = 'DeviceNotRegistered' then
      delete from public.push_tokens as device
      where device.expo_token = ticket ->> 'token';
    end if;
  end loop;

  update public.notification_outbox as outbox
  set status = case outcome
        when 'sent' then 'sent'
        when 'failed' then 'failed'
        else case when outbox.attempts >= 3 then 'failed' else 'pending' end
      end,
      sent_at = case when outcome = 'sent' then now() end,
      send_after = case
        when outcome = 'retry'
          then now() + make_interval(mins => power(2, outbox.attempts)::integer)
        else outbox.send_after
      end,
      last_error = error_message,
      locked_at = null
  where outbox.id = target_outbox_id;
end;
$$;

-- Ticket ids that are ready for a receipt check (15 min to 24 h old).
create or replace function public.push_pending_receipts(max_ids integer default 1000)
returns table (ticket_id text)
language sql
stable
security definer
set search_path = ''
as $$
  select ticket.ticket_id
  from public.push_tickets as ticket
  where ticket.checked_at is null
    and ticket.created_at < now() - interval '15 minutes'
    and ticket.created_at > now() - interval '24 hours'
  order by ticket.created_at
  limit least(greatest(max_ids, 1), 1000);
$$;

-- receipts: [{ ticketId, status: 'ok' | 'error', error? }]
create or replace function public.push_record_receipts(receipts jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  receipt jsonb;
  removed integer := 0;
  removed_now integer;
begin
  for receipt in select * from jsonb_array_elements(coalesce(receipts, '[]'::jsonb)) loop
    update public.push_tickets as ticket
    set receipt_status = case when receipt ->> 'status' = 'ok' then 'ok' else 'error' end,
        receipt_error = receipt ->> 'error',
        checked_at = now()
    where ticket.ticket_id = receipt ->> 'ticketId';

    if receipt ->> 'error' = 'DeviceNotRegistered' then
      delete from public.push_tokens as device
      where device.expo_token = (
        select ticket.expo_token from public.push_tickets as ticket
        where ticket.ticket_id = receipt ->> 'ticketId'
      );
      get diagnostics removed_now = row_count;
      removed := removed + removed_now;
    end if;
  end loop;
  return removed;
end;
$$;

-- Housekeeping, daily: Expo forgets receipts after 24 h.
create or replace function public.push_cleanup()
returns void
language sql
security definer
set search_path = ''
as $$
  update public.push_tickets
  set receipt_status = 'expired', checked_at = now()
  where checked_at is null and created_at < now() - interval '24 hours';
  delete from public.push_tickets where created_at < now() - interval '7 days';
  delete from public.notification_outbox where created_at < now() - interval '30 days';
$$;

-- ---------------------------------------------------------------------------
-- 9. pg_cron + pg_net wiring
-- ---------------------------------------------------------------------------

-- Calls the Edge Function when there is something to send or check. The URL
-- and shared secret live in Supabase Vault (README, "Push notifications"):
--   push_send_url    https://<project-ref>.supabase.co/functions/v1/send-push
--   push_cron_secret same value as the function's PUSH_CRON_SECRET secret
create or replace function public.push_kick()
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  function_url text;
  cron_secret text;
  request_id bigint;
begin
  if not exists (
    select 1 from public.notification_outbox as outbox
    where outbox.status = 'pending' and outbox.send_after <= now()
  ) and not exists (
    select 1 from public.push_tickets as ticket
    where ticket.checked_at is null
      and ticket.created_at < now() - interval '15 minutes'
  ) then
    return null;
  end if;

  if to_regclass('vault.decrypted_secrets') is null
    or to_regnamespace('net') is null then
    raise warning 'push_kick: enable pg_net and Supabase Vault';
    return null;
  end if;

  execute $sql$
    select
      (select decrypted_secret from vault.decrypted_secrets where name = 'push_send_url'),
      (select decrypted_secret from vault.decrypted_secrets where name = 'push_cron_secret')
  $sql$ into function_url, cron_secret;

  if function_url is null or cron_secret is null then
    raise warning 'push_kick: add push_send_url and push_cron_secret to Vault';
    return null;
  end if;

  execute $sql$
    select net.http_post(
      url := $1,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-secret', $2
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 30000
    )
  $sql$ into request_id using function_url, cron_secret;
  return request_id;
end;
$$;

-- Idempotent: cron.schedule() replaces jobs with the same name.
create or replace function public.schedule_push_jobs()
returns text
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from pg_catalog.pg_extension where extname = 'pg_cron') then
    return 'pg_cron is not enabled: enable pg_cron and pg_net, then run select public.schedule_push_jobs();';
  end if;
  if not exists (select 1 from pg_catalog.pg_extension where extname = 'pg_net') then
    return 'pg_net is not enabled: enable pg_net, then run select public.schedule_push_jobs();';
  end if;

  execute $sql$
    select cron.schedule(
      'push-tick',
      '* * * * *',
      'select public.enqueue_due_notifications(); select public.push_kick();'
    )
  $sql$;
  execute $sql$
    select cron.schedule('push-cleanup', '17 3 * * *', 'select public.push_cleanup();')
  $sql$;
  return 'scheduled push-tick (every minute) and push-cleanup (daily)';
end;
$$;

do $$
begin
  raise notice '%', public.schedule_push_jobs();
end;
$$;

-- ---------------------------------------------------------------------------
-- 10. Grants
-- ---------------------------------------------------------------------------

revoke all on function public.family_timezone(uuid) from public, anon, authenticated;
revoke all on function public.occurrence_due_at(date, time, text) from public, anon, authenticated;
revoke all on function public.overdue_grace(integer) from public, anon, authenticated;
revoke all on function public.is_need_scheduled_on(public.daily_needs, date) from public, anon, authenticated;
revoke all on function public.push_kind_category(text) from public, anon, authenticated;
revoke all on function public.push_preference_allows(uuid, text, boolean) from public, anon, authenticated;
revoke all on function public.push_is_relevant(text, uuid, text, uuid) from public, anon, authenticated;
revoke all on function public.push_enqueue(uuid, uuid, text, uuid, date, jsonb, text, timestamptz, timestamptz, boolean) from public, anon, authenticated;
revoke all on function public.push_task_data(public.daily_needs, uuid) from public, anon, authenticated;
revoke all on function public.push_on_occurrence_change() from public, anon, authenticated;
revoke all on function public.push_on_need_change() from public, anon, authenticated;
revoke all on function public.push_on_member_joined() from public, anon, authenticated;
revoke all on function public.enqueue_due_notifications(timestamptz) from public, anon, authenticated;
revoke all on function public.push_kick() from public, anon, authenticated;
revoke all on function public.push_cleanup() from public, anon, authenticated;
revoke all on function public.schedule_push_jobs() from public, anon, authenticated;

-- Edge Function only (service role).
revoke all on function public.push_claim_batch(integer) from public, anon, authenticated;
revoke all on function public.push_finish(bigint, text, text, jsonb) from public, anon, authenticated;
revoke all on function public.push_pending_receipts(integer) from public, anon, authenticated;
revoke all on function public.push_record_receipts(jsonb) from public, anon, authenticated;
do $$
begin
  if exists (select 1 from pg_catalog.pg_roles where rolname = 'service_role') then
    grant execute on function public.push_claim_batch(integer) to service_role;
    grant execute on function public.push_finish(bigint, text, text, jsonb) to service_role;
    grant execute on function public.push_pending_receipts(integer) to service_role;
    grant execute on function public.push_record_receipts(jsonb) to service_role;
  end if;
end;
$$;

-- App.
revoke all on function public.set_family_timezone(text) from public, anon;
grant execute on function public.set_family_timezone(text) to authenticated;
revoke all on function public.register_push_token(text, text, text) from public, anon;
grant execute on function public.register_push_token(text, text, text) to authenticated;
revoke all on function public.unregister_push_token(text) from public, anon;
grant execute on function public.unregister_push_token(text) to authenticated;
