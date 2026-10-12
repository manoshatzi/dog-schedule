create table public.daily_need_occurrences (
  household_id uuid not null references public.households(id) on delete cascade,
  daily_need_id uuid not null references public.daily_needs(id) on delete cascade,
  occurrence_date date not null,
  status text not null default 'open' check (status in ('open', 'booked', 'done')),
  booked_by uuid references auth.users(id) on delete set null,
  booked_name text,
  completed_by uuid references auth.users(id) on delete set null,
  completed_name text,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (daily_need_id, occurrence_date),
  check ((booked_by is null) = (booked_name is null)),
  check ((completed_by is null) = (completed_name is null)),
  check ((completed_by is null) = (completed_at is null))
);

create index daily_need_occurrences_household_date_idx
  on public.daily_need_occurrences (household_id, occurrence_date);

alter table public.daily_need_occurrences enable row level security;

create policy "Household members can read daily need occurrences"
  on public.daily_need_occurrences for select to authenticated
  using (
    public.is_household_member(household_id)
    and exists (
      select 1 from public.daily_needs as need
      where need.id = daily_need_id and need.household_id = household_id
    )
  );

grant select on public.daily_need_occurrences to authenticated;

create or replace function public.set_daily_need_occurrence(
  target_need_id uuid,
  target_date date,
  next_status text,
  actor_name text
)
returns setof public.daily_need_occurrences
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  target_household_id uuid;
  saved public.daily_need_occurrences%rowtype;
begin
  if current_user_id is null then
    raise exception 'Sign in before updating a daily need';
  end if;

  if next_status not in ('open', 'booked', 'done') then
    raise exception 'Invalid daily need status';
  end if;

  select need.household_id into target_household_id
  from public.daily_needs as need
  where need.id = target_need_id;

  if target_household_id is null
    or not public.is_household_member(target_household_id) then
    raise exception 'You are not a member of this household';
  end if;

  insert into public.daily_need_occurrences (
    household_id, daily_need_id, occurrence_date, status,
    booked_by, booked_name, completed_by, completed_name, completed_at,
    updated_at
  ) values (
    target_household_id,
    target_need_id,
    target_date,
    next_status,
    case when next_status = 'booked' then current_user_id end,
    case when next_status = 'booked' then left(trim(actor_name), 80) end,
    case when next_status = 'done' then current_user_id end,
    case when next_status = 'done' then left(trim(actor_name), 80) end,
    case when next_status = 'done' then now() end,
    now()
  )
  on conflict (daily_need_id, occurrence_date) do update set
    status = excluded.status,
    booked_by = excluded.booked_by,
    booked_name = excluded.booked_name,
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

revoke all on function public.set_daily_need_occurrence(uuid, date, text, text) from public;
grant execute on function public.set_daily_need_occurrence(uuid, date, text, text) to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'daily_need_occurrences'
  ) then
    alter publication supabase_realtime add table public.daily_need_occurrences;
  end if;
end;
$$;