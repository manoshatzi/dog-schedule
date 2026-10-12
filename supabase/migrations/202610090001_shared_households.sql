create table public.households (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 80),
  invite_code text not null unique default upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 16)),
  created_at timestamptz not null default now()
);

create table public.household_members (
  household_id uuid not null references public.households(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  created_at timestamptz not null default now(),
  primary key (household_id, user_id),
  unique (user_id)
);

create table public.daily_needs (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  title text not null check (length(trim(title)) between 1 and 120),
  time time without time zone not null,
  details text not null default '' check (length(details) <= 240),
  required boolean not null default false,
  created_at timestamptz not null default now()
);

create index daily_needs_household_time_idx
  on public.daily_needs (household_id, time);

create or replace function public.is_household_member(target_household_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.household_members as member
    where member.household_id = target_household_id
      and member.user_id = (select auth.uid())
  );
$$;

create or replace function public.create_household(household_name text)
returns table (id uuid, name text, invite_code text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  new_household public.households%rowtype;
begin
  if current_user_id is null then
    raise exception 'Sign in before creating a household';
  end if;

  if exists (
    select 1 from public.household_members as member
    where member.user_id = current_user_id
  ) then
    raise exception 'This account already belongs to a household';
  end if;

  insert into public.households (name)
  values (trim(household_name))
  returning * into new_household;

  insert into public.household_members (household_id, user_id, role)
  values (new_household.id, current_user_id, 'owner');

  return query
  select new_household.id, new_household.name, new_household.invite_code;
end;
$$;

create or replace function public.join_household(invite_code text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  target_household_id uuid;
  existing_household_id uuid;
begin
  if current_user_id is null then
    raise exception 'Sign in before joining a household';
  end if;

  select member.household_id into existing_household_id
  from public.household_members as member
  where member.user_id = current_user_id;

  select household.id into target_household_id
  from public.households as household
  where household.invite_code = upper(trim($1));

  if target_household_id is null then
    raise exception 'That household invite code is not valid';
  end if;

  if existing_household_id is not null then
    if existing_household_id = target_household_id then
      return target_household_id;
    end if;
    raise exception 'This account already belongs to another household';
  end if;

  insert into public.household_members (household_id, user_id, role)
  values (target_household_id, current_user_id, 'member');

  return target_household_id;
end;
$$;

alter table public.households enable row level security;
alter table public.household_members enable row level security;
alter table public.daily_needs enable row level security;

create policy "Household members can read their household"
  on public.households for select to authenticated
  using (public.is_household_member(id));

create policy "Household members can read membership"
  on public.household_members for select to authenticated
  using (public.is_household_member(household_id));

create policy "Household members can read daily needs"
  on public.daily_needs for select to authenticated
  using (public.is_household_member(household_id));

create policy "Household members can add daily needs"
  on public.daily_needs for insert to authenticated
  with check (public.is_household_member(household_id));

create policy "Household members can update daily needs"
  on public.daily_needs for update to authenticated
  using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));

create policy "Household members can delete daily needs"
  on public.daily_needs for delete to authenticated
  using (public.is_household_member(household_id));

grant select on public.households, public.household_members to authenticated;
grant select, insert, update, delete on public.daily_needs to authenticated;
revoke all on function public.is_household_member(uuid) from public;
grant execute on function public.is_household_member(uuid) to authenticated;
revoke all on function public.create_household(text) from public;
grant execute on function public.create_household(text) to authenticated;
revoke all on function public.join_household(text) from public;
grant execute on function public.join_household(text) to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'daily_needs'
  ) then
    alter publication supabase_realtime add table public.daily_needs;
  end if;
end;
$$;