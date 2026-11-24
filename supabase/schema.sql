-- Institute for Analytical Machines (IAM)
-- Run this SQL in your Supabase project's SQL Editor.

-- 1. Profiles table: maps auth users to their Student/Admin ID and role.
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  student_id text unique not null,
  full_name text not null default '',
  role text not null default 'student' check (role in ('student', 'admin')),
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- Users can read their own profile.
create policy "Users can read own profile"
  on public.profiles
  for select
  using (auth.uid() = id);

-- Users can update their own full_name (but not change their role).
create policy "Users can update own profile name"
  on public.profiles
  for update
  using (auth.uid() = id)
  with check (
    auth.uid() = id
    and role = (select p.role from public.profiles p where p.id = auth.uid())
  );

-- 2. Self-evaluations table: supports IAM's self-evaluation education model.
create table if not exists public.self_evaluations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  course_code text not null,
  topic text not null,
  reflection text not null,
  mastery_score integer not null check (mastery_score between 1 and 5),
  created_at timestamptz not null default now()
);

alter table public.self_evaluations enable row level security;

create policy "Students can view own evaluations"
  on public.self_evaluations
  for select
  using (auth.uid() = user_id);

create policy "Students can insert own evaluations"
  on public.self_evaluations
  for insert
  with check (auth.uid() = user_id);

create policy "Students can delete own evaluations"
  on public.self_evaluations
  for delete
  using (auth.uid() = user_id);

-- 3. Auto-create profile row when a new Auth user is created.
-- When creating users in Supabase Auth, you can pass user_metadata:
--   { "student_id": "IAM-2026-001", "role": "student", "full_name": "..." }
-- Otherwise it derives student_id from the local part of the email.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  derived_id text;
  derived_role text;
begin
  derived_id := coalesce(
    nullif(trim(new.raw_user_meta_data ->> 'student_id'), ''),
    split_part(new.email, '@', 1)
  );
  derived_role := coalesce(
    nullif(trim(new.raw_user_meta_data ->> 'role'), ''),
    'student'
  );
  if derived_role not in ('student', 'admin') then
    derived_role := 'student';
  end if;

  insert into public.profiles (id, student_id, full_name, role)
  values (
    new.id,
    derived_id,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    derived_role
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

