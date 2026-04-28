create extension if not exists "pgcrypto";

create table if not exists public.entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  title text,
  content text not null,
  mood text not null,
  mood_category text not null,
  tags text[] not null default '{}',
  entry_date date not null,
  entry_time time not null,
  image_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references public.entries(id) on delete cascade,
  user_id uuid not null default auth.uid(),
  content text not null,
  created_at timestamptz not null default now()
);

alter table public.entries enable row level security;
alter table public.comments enable row level security;

create policy "Users can read own entries"
on public.entries for select
using (auth.uid() = user_id);

create policy "Users can insert own entries"
on public.entries for insert
with check (auth.uid() = user_id);

create policy "Users can update own entries"
on public.entries for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "Users can delete own entries"
on public.entries for delete
using (auth.uid() = user_id);

create policy "Users can read own comments"
on public.comments for select
using (
  auth.uid() = user_id
  and exists (
    select 1 from public.entries
    where entries.id = comments.entry_id
    and entries.user_id = auth.uid()
  )
);

create policy "Users can insert comments on own entries"
on public.comments for insert
with check (
  auth.uid() = user_id
  and exists (
    select 1 from public.entries
    where entries.id = comments.entry_id
    and entries.user_id = auth.uid()
  )
);

create policy "Users can delete own comments"
on public.comments for delete
using (auth.uid() = user_id);

create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists set_entries_updated_at on public.entries;
create trigger set_entries_updated_at
before update on public.entries
for each row
execute function public.set_updated_at();
