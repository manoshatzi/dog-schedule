alter table public.daily_needs
  add column type text not null default 'other'
    check (type in ('walk', 'food', 'medicine', 'potty', 'play', 'grooming', 'other')),
  add column duration_minutes integer not null default 15
    check (duration_minutes in (10, 15, 30, 45)),
  add column repeat_days text[] not null default array['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']
    check (
      cardinality(repeat_days) between 1 and 7
      and repeat_days <@ array['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']::text[]
    );