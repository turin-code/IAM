-- Institute for Analytical Machines (IAM)
-- Run this SQL in your Supabase project's SQL Editor.
-- Safe to re-run on an existing database.

-- 1. Profiles table: maps auth users to their Student/Admin ID, department, and role.
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  student_id text unique not null,
  full_name text not null default '',
  contact_email text not null default '',
  department_code text not null default '',
  role text not null default 'student' check (role in ('student', 'admin')),
  created_at timestamptz not null default now()
);

alter table public.profiles add column if not exists contact_email text not null default '';
alter table public.profiles add column if not exists department_code text not null default '';

alter table public.profiles enable row level security;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

drop policy if exists "Users can read own profile" on public.profiles;
create policy "Users can read own profile"
  on public.profiles
  for select
  using (auth.uid() = id or public.is_admin());

drop policy if exists "Users can update own profile name" on public.profiles;
create policy "Users can update own profile name"
  on public.profiles
  for update
  using (auth.uid() = id)
  with check (
    auth.uid() = id
    and role = (select p.role from public.profiles p where p.id = auth.uid())
  );

-- 2. Applications table: prospective students apply; admin approves and assigns ID.
create table if not exists public.applications (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  email text not null,
  department_code text not null check (department_code in ('01', '10')),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  generated_student_id text unique,
  claimed boolean not null default false,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz
);

alter table public.applications enable row level security;

drop policy if exists "Anyone can submit an application" on public.applications;
create policy "Anyone can submit an application"
  on public.applications
  for insert
  with check (
    status = 'pending'
    and generated_student_id is null
    and claimed = false
  );

drop policy if exists "Admins can view all applications" on public.applications;
create policy "Admins can view all applications"
  on public.applications
  for select
  using (public.is_admin());

drop policy if exists "Admins can update applications" on public.applications;
create policy "Admins can update applications"
  on public.applications
  for update
  using (public.is_admin());

-- Check application status by email without exposing other applicants' rows.
create or replace function public.check_application_status(p_email text)
returns table (
  full_name text,
  department_code text,
  status text,
  generated_student_id text,
  claimed boolean,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    a.full_name,
    a.department_code,
    a.status,
    a.generated_student_id,
    a.claimed,
    a.created_at
  from public.applications a
  where lower(a.email) = lower(trim(p_email))
  order by a.created_at desc
  limit 1;
$$;

grant execute on function public.check_application_status(text) to anon, authenticated;

-- Approve an application and atomically generate YYPPRRR student ID:
--   2601001 -> year 26, dept 01 (BSc in Analytical Machines), roll 001
--   2610001 -> year 26, dept 10 (BSc in Computer Science), roll 001
create or replace function public.approve_application(p_app_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_app public.applications%rowtype;
  v_prefix text;
  v_max_roll integer;
  v_next_id text;
begin
  if not public.is_admin() then
    raise exception 'Admin privileges required.';
  end if;

  select * into v_app
  from public.applications
  where id = p_app_id
  for update;

  if not found then
    raise exception 'Application not found.';
  end if;

  if v_app.status = 'approved' and v_app.generated_student_id is not null then
    return v_app.generated_student_id;
  end if;

  v_prefix := to_char(now(), 'YY') || v_app.department_code;

  -- Serialize ID generation per prefix across concurrent approvals.
  perform pg_advisory_xact_lock(hashtext(v_prefix));

  select coalesce(max(roll_num), 0) into v_max_roll
  from (
    select substring(student_id from 5 for 3)::integer as roll_num
    from public.profiles
    where student_id ~ ('^' || v_prefix || '[0-9]{3}$')
    union all
    select substring(generated_student_id from 5 for 3)::integer as roll_num
    from public.applications
    where generated_student_id ~ ('^' || v_prefix || '[0-9]{3}$')
  ) t;

  v_next_id := v_prefix || lpad((v_max_roll + 1)::text, 3, '0');

  update public.applications
  set status = 'approved',
      generated_student_id = v_next_id,
      reviewed_at = now()
  where id = p_app_id;

  return v_next_id;
end;
$$;

grant execute on function public.approve_application(uuid) to authenticated;

create or replace function public.reject_application(p_app_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Admin privileges required.';
  end if;

  update public.applications
  set status = 'rejected',
      reviewed_at = now()
  where id = p_app_id;
end;
$$;

grant execute on function public.reject_application(uuid) to authenticated;

-- 3. Courses table: managed by admins, readable by authenticated users.
create table if not exists public.courses (
  id uuid primary key default gen_random_uuid(),
  course_code text unique not null,
  title text not null,
  department_code text not null check (department_code in ('01', '10', 'ALL')),
  credit numeric(3,1) not null default 3.0 check (credit > 0),
  outline text not null default '',
  exam_question_url text not null default '',
  assignments_url text not null default '',
  solutions_url text not null default '',
  created_at timestamptz not null default now()
);

alter table public.courses enable row level security;

drop policy if exists "Authenticated users can view courses" on public.courses;
create policy "Authenticated users can view courses"
  on public.courses
  for select
  using (auth.uid() is not null);

drop policy if exists "Admins can insert courses" on public.courses;
create policy "Admins can insert courses"
  on public.courses
  for insert
  with check (public.is_admin());

drop policy if exists "Admins can update courses" on public.courses;
create policy "Admins can update courses"
  on public.courses
  for update
  using (public.is_admin());

drop policy if exists "Admins can delete courses" on public.courses;
create policy "Admins can delete courses"
  on public.courses
  for delete
  using (public.is_admin());

-- 4. Enrollments table: tracks taken courses, credits, and grades for CGPA.
create table if not exists public.enrollments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  course_id uuid not null references public.courses (id) on delete cascade,
  status text not null default 'enrolled' check (status in ('enrolled', 'completed')),
  grade_point numeric(3,2) check (grade_point is null or (grade_point >= 0.00 and grade_point <= 4.00)),
  letter_grade text not null default '',
  created_at timestamptz not null default now(),
  unique (user_id, course_id)
);

alter table public.enrollments enable row level security;

drop policy if exists "Students read own enrollments and admins read all" on public.enrollments;
create policy "Students read own enrollments and admins read all"
  on public.enrollments
  for select
  using (auth.uid() = user_id or public.is_admin());

drop policy if exists "Students can enroll in courses" on public.enrollments;
create policy "Students can enroll in courses"
  on public.enrollments
  for insert
  with check (
    auth.uid() = user_id
    and status = 'enrolled'
    and grade_point is null
  );

drop policy if exists "Students can drop ungraded enrolled courses" on public.enrollments;
create policy "Students can drop ungraded enrolled courses"
  on public.enrollments
  for delete
  using (
    (auth.uid() = user_id and status = 'enrolled' and grade_point is null)
    or public.is_admin()
  );

drop policy if exists "Admins can grade or update enrollments" on public.enrollments;
create policy "Admins can grade or update enrollments"
  on public.enrollments
  for update
  using (public.is_admin());

-- 5. Self-evaluations table: supports IAM's self-evaluation education model.
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

drop policy if exists "Students can view own evaluations" on public.self_evaluations;
create policy "Students can view own evaluations"
  on public.self_evaluations
  for select
  using (auth.uid() = user_id);

drop policy if exists "Students can insert own evaluations" on public.self_evaluations;
create policy "Students can insert own evaluations"
  on public.self_evaluations
  for insert
  with check (auth.uid() = user_id);

drop policy if exists "Students can delete own evaluations" on public.self_evaluations;
create policy "Students can delete own evaluations"
  on public.self_evaluations
  for delete
  using (auth.uid() = user_id);

-- 6. Storage bucket for course PDFs (exam questions, assignments, solutions).
insert into storage.buckets (id, name, public)
values ('course-materials', 'course-materials', true)
on conflict (id) do nothing;

drop policy if exists "Public can read course materials" on storage.objects;
create policy "Public can read course materials"
  on storage.objects
  for select
  using (bucket_id = 'course-materials');

drop policy if exists "Admins can upload course materials" on storage.objects;
create policy "Admins can upload course materials"
  on storage.objects
  for insert
  with check (bucket_id = 'course-materials' and public.is_admin());

drop policy if exists "Admins can update course materials" on storage.objects;
create policy "Admins can update course materials"
  on storage.objects
  for update
  using (bucket_id = 'course-materials' and public.is_admin());

drop policy if exists "Admins can delete course materials" on storage.objects;
create policy "Admins can delete course materials"
  on storage.objects
  for delete
  using (bucket_id = 'course-materials' and public.is_admin());

-- 7. Auto-create profile row when a new Auth user is created.
-- Links matching approved application details automatically.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  derived_id text;
  derived_role text;
  v_app public.applications%rowtype;
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

  select * into v_app
  from public.applications
  where generated_student_id = derived_id
    and status = 'approved'
  limit 1;

  insert into public.profiles (id, student_id, full_name, contact_email, department_code, role)
  values (
    new.id,
    derived_id,
    coalesce(nullif(v_app.full_name, ''), new.raw_user_meta_data ->> 'full_name', ''),
    coalesce(nullif(v_app.email, ''), new.raw_user_meta_data ->> 'contact_email', ''),
    coalesce(nullif(v_app.department_code, ''), new.raw_user_meta_data ->> 'department_code', ''),
    derived_role
  )
  on conflict (id) do nothing;

  if v_app.id is not null then
    update public.applications
    set claimed = true
    where id = v_app.id;
  end if;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
