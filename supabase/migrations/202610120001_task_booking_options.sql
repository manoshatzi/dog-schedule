alter table public.daily_need_occurrences
  add column assigned_user_id uuid references auth.users(id) on delete set null,
  add column assigned_name text,
  add column repeat_rule text not null default 'today'
    check (repeat_rule in ('today', 'weekday', 'daily')),
  add column reminder_enabled boolean not null default false;

drop function public.set_daily_need_occurrence(uuid, date, text, text);

create or replace function public.get_household_members()
returns table (user_id uuid, display_name text)
language sql
stable
security definer
set search_path = ''
as $$
  select
    member.user_id,
    coalesce(
      nullif(trim(account.raw_user_meta_data ->> 'full_name'), ''),
      nullif(trim(account.raw_user_meta_data ->> 'name'), ''),
      nullif(split_part(account.email, '@', 1), ''),
      'Household member'
    ) as display_name
  from public.household_members as member
  join auth.users as account on account.id = member.user_id
  where member.household_id = (
    select mine.household_id
    from public.household_members as mine
    where mine.user_id = (select auth.uid())
  )
  order by (member.user_id = (select auth.uid())) desc, display_name;
$$;

create or replace function public.set_daily_need_occurrence(
  target_need_id uuid,
  target_date date,
  next_status text,
  actor_name text,
  target_member_id uuid,
  target_repeat_rule text,
  reminder_enabled boolean
)
returns setof public.daily_need_occurrences
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  target_household_id uuid;
  resolved_assignee_id uuid;
  resolved_assignee_name text;
  saved public.daily_need_occurrences%rowtype;
begin
  if current_user_id is null then
    raise exception 'Sign in before updating a daily need';
  end if;

  if next_status not in ('open', 'booked', 'done') then
    raise exception 'Invalid daily need status';
  end if;

  if target_repeat_rule not in ('today', 'weekday', 'daily') then
    raise exception 'Invalid booking repeat option';
  end if;

  select need.household_id into target_household_id
  from public.daily_needs as need
  where need.id = target_need_id;

  if target_household_id is null
    or not public.is_household_member(target_household_id) then
    raise exception 'You are not a member of this household';
  end if;

  resolved_assignee_id := coalesce(target_member_id, current_user_id);

  select coalesce(
    nullif(trim(account.raw_user_meta_data ->> 'full_name'), ''),
    nullif(trim(account.raw_user_meta_data ->> 'name'), ''),
    nullif(split_part(account.email, '@', 1), ''),
    'Household member'
  ) into resolved_assignee_name
  from public.household_members as member
  join auth.users as account on account.id = member.user_id
  where member.household_id = target_household_id
    and member.user_id = resolved_assignee_id;

  if resolved_assignee_name is null then
    raise exception 'Choose a member of this household';
  end if;

  insert into public.daily_need_occurrences (
    household_id, daily_need_id, occurrence_date, status,
    booked_by, booked_name, assigned_user_id, assigned_name,
    repeat_rule, reminder_enabled,
    completed_by, completed_name, completed_at, updated_at
  ) values (
    target_household_id,
    target_need_id,
    target_date,
    next_status,
    case when next_status = 'booked' then current_user_id end,
    case when next_status = 'booked' then left(trim(actor_name), 80) end,
    case when next_status = 'booked' then resolved_assignee_id end,
    case when next_status = 'booked' then resolved_assignee_name end,
    case when next_status = 'booked' then target_repeat_rule else 'today' end,
    case when next_status = 'booked' then reminder_enabled else false end,
    case when next_status = 'done' then current_user_id end,
    case when next_status = 'done' then left(trim(actor_name), 80) end,
    case when next_status = 'done' then now() end,
    now()
  )
  on conflict (daily_need_id, occurrence_date) do update set
    status = excluded.status,
    booked_by = excluded.booked_by,
    booked_name = excluded.booked_name,
    assigned_user_id = excluded.assigned_user_id,
    assigned_name = excluded.assigned_name,
    repeat_rule = excluded.repeat_rule,
    reminder_enabled = excluded.reminder_enabled,
    completed_by = excluded.completed_by,
    completed_name = excluded.completed_name,
    completed_at = excluded.completed_at,
    updated_at = now()
  where next_status <> 'booked'
    or public.daily_need_occurrences.status <> 'booked'
    or public.daily_need_occurrences.booked_by = current_user_id
  returning * into saved;

  if saved.daily_need_id is null then
    raise exception 'This need has already been booked by another household member';
  end if;

  return next saved;
end;
$$;

revoke all on function public.get_household_members() from public;
grant execute on function public.get_household_members() to authenticated;
revoke all on function public.set_daily_need_occurrence(uuid, date, text, text, uuid, text, boolean) from public;
grant execute on function public.set_daily_need_occurrence(uuid, date, text, text, uuid, text, boolean) to authenticated;