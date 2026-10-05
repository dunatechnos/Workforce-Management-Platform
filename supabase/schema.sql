-- HV Attendance v1. Run ONCE in a NEW Supabase project's SQL Editor.
-- Further schema changes must be separate, versioned migrations. Do not reset production data.
begin;

create table public.settings (
 id boolean primary key default true check(id), company_name text not null default 'HV Attendance',
 allowed_domains text[] not null default '{}', bootstrap_email text not null default '',
 full_minutes integer not null default 480 check(full_minutes between 1 and 1440),
 half_minutes integer not null default 240 check(half_minutes > 0 and half_minutes <= full_minutes),
 break_minutes integer not null default 60 check(break_minutes between 0 and 480),
 late_cutoff time not null default '12:00', regularization_days integer not null default 30 check(regularization_days between 1 and 365),
 updated_at timestamptz not null default now()
);
insert into public.settings default values;
create table public.profiles (
 id uuid primary key default gen_random_uuid(), user_id uuid unique references auth.users(id) on delete set null,
 email text not null unique check(email = lower(trim(email))), name text not null,
 role text not null default 'employee' check(role in ('manager','employee')),
 employee_code text unique, department text not null default '', designation text not null default '',
 joining_date date not null default (now() at time zone 'Asia/Kolkata')::date,
 exit_date date, active boolean not null default true,
 weekly_quota integer not null default 1 check(weekly_quota between 0 and 7),
 fixed_off integer[] not null default '{}' check(fixed_off <@ array[0,1,2,3,4,5,6]),
 created_at timestamptz not null default now(), check(exit_date is null or exit_date >= joining_date)
);
create table public.holidays (
 id uuid primary key default gen_random_uuid(), day date not null unique, name text not null,
 created_at timestamptz not null default now()
);
-- Effective-dated weekly schedules keep historical calendars stable after roster edits.
create table public.schedule_history (
 id uuid primary key default gen_random_uuid(), profile_id uuid not null references public.profiles(id) on delete restrict,
 effective_from date not null, fixed_off integer[] not null, unique(profile_id,effective_from)
);
create table public.leave_types (
 id uuid primary key default gen_random_uuid(), name text not null, tag text not null unique,
 color text not null default '#6d7cdd', annual_quota numeric(6,1) not null default 12 check(annual_quota >= 0),
 unlimited boolean not null default false, paid boolean not null default true, active boolean not null default true,
 created_at timestamptz not null default now()
);
insert into public.leave_types(name,tag,annual_quota,unlimited,paid,color) values
 ('Casual Leave','CL',12,false,true,'#6d7cdd'),('Sick Leave','SL',12,false,true,'#d28b35'),('Loss of Pay','LOP',0,true,false,'#c86464');
create table public.leave_balances (
 id uuid primary key default gen_random_uuid(), profile_id uuid not null references public.profiles(id) on delete restrict,
 type_id uuid not null references public.leave_types(id) on delete restrict,
 year integer not null check(year between 2000 and 2200), entitlement numeric(6,1) not null check(entitlement >= 0),
 unique(profile_id,type_id,year)
);
create table public.leaves (
 id uuid primary key default gen_random_uuid(), profile_id uuid not null references public.profiles(id) on delete restrict,
 type_id uuid not null references public.leave_types(id) on delete restrict,
 start_date date not null, end_date date not null, half_day boolean not null default false,
 days numeric(6,1) not null check(days > 0), reason text not null check(length(trim(reason)) >= 3),
 status text not null default 'pending' check(status in ('pending','approved','rejected','cancelled')),
 reviewed_by uuid references public.profiles(id), review_note text, reviewed_at timestamptz,
 created_at timestamptz not null default now(), check(end_date >= start_date)
);
create table public.weekoffs (
 id uuid primary key default gen_random_uuid(), profile_id uuid not null references public.profiles(id) on delete restrict,
 day date not null, created_by uuid references public.profiles(id), created_at timestamptz not null default now(),
 unique(profile_id,day)
);
-- Save the exact chargeable dates rather than recalculating old leave on each read.
create table public.leave_days (
 id uuid primary key default gen_random_uuid(), leave_id uuid not null references public.leaves(id) on delete restrict,
 day date not null, amount numeric(2,1) not null check(amount in (0.5,1)), unique(leave_id,day)
);
create table public.attendance (
 id uuid primary key default gen_random_uuid(), profile_id uuid not null references public.profiles(id) on delete restrict,
 day date not null, check_in timestamptz not null, check_out timestamptz,
 -- Rules are snapshotted so changing settings does not rewrite history.
 full_minutes integer not null, half_minutes integer not null, allowed_break integer not null, late_cutoff time not null,
 source text not null default 'punch' check(source in ('punch','correction')),
 unique(profile_id,day), check(check_out is null or check_out > check_in)
);
create table public.breaks (
 id uuid primary key default gen_random_uuid(), attendance_id uuid not null references public.attendance(id) on delete restrict,
 started_at timestamptz not null, ended_at timestamptz, check(ended_at is null or ended_at >= started_at)
);
create unique index one_open_break on public.breaks(attendance_id) where ended_at is null;
create table public.overrides (
 id uuid primary key default gen_random_uuid(), profile_id uuid not null references public.profiles(id) on delete restrict,
 day date not null, status text not null check(status in ('present','half_day','absent','weekoff')),
 reason text not null check(length(trim(reason)) >= 3), changed_by uuid references public.profiles(id),
 unique(profile_id,day), updated_at timestamptz not null default now()
);
create table public.regularizations (
 id uuid primary key default gen_random_uuid(), profile_id uuid not null references public.profiles(id) on delete restrict,
 day date not null, requested_in timestamptz not null, requested_out timestamptz not null,
 break_minutes integer not null default 60 check(break_minutes between 0 and 480),
 reason text not null check(length(trim(reason)) >= 3),
 status text not null default 'pending' check(status in ('pending','approved','rejected','cancelled')),
 review_note text, reviewed_by uuid references public.profiles(id), reviewed_at timestamptz,
 created_at timestamptz not null default now(), check(requested_out > requested_in)
);
create unique index one_pending_correction on public.regularizations(profile_id,day) where status='pending';
create table public.audit_logs (
 id bigint generated always as identity primary key, actor uuid, table_name text not null, action text not null,
 record_id text, old_data jsonb, new_data jsonb, created_at timestamptz not null default now()
);
create index attendance_day_idx on public.attendance(day,profile_id);
create index breaks_attendance_idx on public.breaks(attendance_id);
create index leaves_profile_dates_idx on public.leaves(profile_id,start_date,end_date);
create index leaves_status_idx on public.leaves(status,created_at desc);
create index regularizations_status_idx on public.regularizations(status,created_at desc);
create index audit_created_idx on public.audit_logs(created_at desc);

create function public.today() returns date language sql stable set search_path = '' as $$
 select (now() at time zone 'Asia/Kolkata')::date
$$;
create function public.me() returns uuid language sql stable security definer set search_path = '' as $$
 select id from public.profiles where user_id=auth.uid() and active
$$;
create function public.is_manager() returns boolean language sql stable security definer set search_path = '' as $$
 select exists(select 1 from public.profiles where user_id=auth.uid() and active and role='manager')
$$;
create function public.allowed(p_id uuid) returns boolean language sql stable set search_path = '' as $$
 select public.me() is not null and (p_id=public.me() or public.is_manager())
$$;
create function public.audit_change() returns trigger language plpgsql security definer set search_path = '' as $$
begin
 insert into public.audit_logs(actor,table_name,action,record_id,old_data,new_data)
 values(auth.uid(),tg_table_name,tg_op,coalesce(to_jsonb(new)->>'id',to_jsonb(old)->>'id'),
 case when tg_op<>'INSERT' then to_jsonb(old) end,case when tg_op<>'DELETE' then to_jsonb(new) end);
 return coalesce(new,old);
end $$;
do $$ declare t text; begin
 foreach t in array array['settings','profiles','schedule_history','holidays','leave_types','leave_balances','leaves','leave_days','weekoffs','attendance','breaks','overrides','regularizations'] loop
 execute format('create trigger audit after insert or update or delete on public.%I for each row execute function public.audit_change()',t);
 end loop;
end $$;

create function public.snapshot_schedule() returns trigger language plpgsql security definer set search_path = '' as $$
begin
 if tg_op='INSERT' or new.fixed_off is distinct from old.fixed_off then
   insert into public.schedule_history(profile_id,effective_from,fixed_off)
   values(new.id,case when tg_op='INSERT' then new.joining_date else public.today() end,new.fixed_off)
   on conflict(profile_id,effective_from) do update set fixed_off=excluded.fixed_off;
 end if;
 return new;
end $$;
create trigger snapshot_schedule after insert or update on public.profiles for each row execute function public.snapshot_schedule();
create function public.fixed_days(p_profile uuid,p_day date) returns integer[] language sql stable set search_path = '' as $$
 select coalesce((select fixed_off from public.schedule_history where profile_id=p_profile and effective_from<=p_day order by effective_from desc limit 1),'{}'::integer[])
$$;

-- Domain restrictions are enforced in the database, not just in the UI.
-- Set bootstrap_email BEFORE the first login; first manager creation is serialized.
create function public.on_signup() returns trigger language plpgsql security definer set search_path = '' as $$
declare s public.settings; p public.profiles; mail text := lower(new.email); manager_exists boolean;
begin
 select * into s from public.settings where id for update;
 if coalesce(new.raw_app_meta_data->>'provider','') not in ('email','google') then raise exception 'Use company email sign-in'; end if;
 select exists(select 1 from public.profiles where role='manager' and user_id is not null) into manager_exists;
 if not manager_exists and (s.bootstrap_email='' or mail<>lower(s.bootstrap_email)) then
   raise exception 'The configured bootstrap manager must sign in first';
 end if;
 if cardinality(s.allowed_domains)>0 and not(split_part(mail,'@',2)=any(s.allowed_domains)) then
   raise exception 'Your company email domain is not allowed';
 end if;
 select * into p from public.profiles where email=mail for update;
 if p.id is not null then
   if not p.active then raise exception 'Account deactivated'; end if;
   update public.profiles set user_id=new.id, role=case when not manager_exists then 'manager' else role end where id=p.id;
 else
   insert into public.profiles(user_id,email,name,role) values(new.id,mail,
     coalesce(new.raw_user_meta_data->>'full_name',split_part(mail,'@',1)),case when manager_exists then 'employee' else 'manager' end);
 end if;
 return new;
end $$;
create trigger attendance_signup after insert on auth.users for each row execute function public.on_signup();

create function public.guard_profile() returns trigger language plpgsql security definer set search_path = '' as $$
begin
 -- All application writes are manager-only. Serialize demotions of managers.
 if old.role='manager' and old.active and (new.role<>'manager' or not new.active) then
   perform pg_advisory_xact_lock(918372);
   if not exists(select 1 from public.profiles where role='manager' and active and user_id is not null and id<>old.id) then
     raise exception 'The last active manager cannot be removed';
   end if;
 end if;
 if new.user_id is distinct from old.user_id and auth.uid() is not null then raise exception 'Account link cannot be edited'; end if;
 return new;
end $$;
create trigger guard_profile before update on public.profiles for each row execute function public.guard_profile();

-- State transitions run under a profile row lock to serialize simultaneous punches.
create function public.punch(p_action text) returns void language plpgsql security definer set search_path = '' as $$
declare pid uuid:=public.me(); a public.attendance; s public.settings; b public.breaks; t timestamptz:=clock_timestamp();
begin
 if pid is null then raise exception 'Active account required'; end if;
 perform 1 from public.profiles where id=pid for update;
 select * into s from public.settings where id;
 select * into a from public.attendance where profile_id=pid and check_out is null order by day desc limit 1;
 if p_action='check_in' then
   if not exists(select 1 from public.profiles where id=pid and public.today()>=joining_date and (exit_date is null or public.today()<=exit_date)) then raise exception 'Today is outside employment dates'; end if;
   if a.id is not null then raise exception 'An open shift exists. Check out or request regularization first.'; end if;
   if exists(select 1 from public.attendance where profile_id=pid and day=public.today()) then raise exception 'Today is already completed. Request a correction if needed.'; end if;
   if exists(select 1 from public.leaves l join public.leave_days d on d.leave_id=l.id where l.profile_id=pid and l.status='approved' and not l.half_day and d.day=public.today())
     or exists(select 1 from public.weekoffs where profile_id=pid and day=public.today()) then raise exception 'Cancel today’s leave or flexible week-off before checking in'; end if;
   insert into public.attendance(profile_id,day,check_in,full_minutes,half_minutes,allowed_break,late_cutoff)
    values(pid,public.today(),t,s.full_minutes,s.half_minutes,s.break_minutes,s.late_cutoff);
   return;
 end if;
 if a.id is null then raise exception 'Check in first'; end if;
 if t-a.check_in>interval '20 hours' then raise exception 'Shift is older than 20 hours. Submit regularization.'; end if;
 select * into b from public.breaks where attendance_id=a.id and ended_at is null;
 if p_action='break_start' then
   if b.id is not null then raise exception 'Break already started'; end if;
   insert into public.breaks(attendance_id,started_at) values(a.id,t);
 elsif p_action='break_end' then
   if b.id is null then raise exception 'No active break'; end if;
   update public.breaks set ended_at=t where id=b.id;
 elsif p_action='check_out' then
   if b.id is not null then update public.breaks set ended_at=t where id=b.id; end if;
   update public.attendance set check_out=t where id=a.id;
 else raise exception 'Invalid punch action'; end if;
end $$;

create function public.leave_balance(p_profile uuid,p_year integer)
returns table(type_id uuid,name text,tag text,unlimited boolean,entitlement numeric,used numeric,pending numeric,available numeric)
language sql stable set search_path = '' as $$
 select t.id,t.name,t.tag,t.unlimited,coalesce(b.entitlement,t.annual_quota),
 coalesce(l.used,0),coalesce(l.pending,0),coalesce(b.entitlement,t.annual_quota)-coalesce(l.used,0)-coalesce(l.pending,0)
 from public.leave_types t left join public.leave_balances b on b.type_id=t.id and b.profile_id=p_profile and b.year=p_year
 left join lateral (select sum(r.days) filter(where r.status='approved') used,sum(r.days) filter(where r.status='pending') pending
   from public.leaves r where r.profile_id=p_profile and r.type_id=t.id and extract(year from r.start_date)=p_year) l on true
 where public.allowed(p_profile)
$$;
create function public.apply_leave(p_profile uuid,p_type uuid,p_start date,p_end date,p_half boolean,p_reason text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare p public.profiles; t public.leave_types; n numeric; bal record; rid uuid;
begin
 if not public.allowed(p_profile) then raise exception 'Not authorized'; end if;
 select * into p from public.profiles where id=p_profile and active for update;
 if not found then raise exception 'Employee is inactive'; end if;
 select * into t from public.leave_types where id=p_type and active;
 if not found then raise exception 'Leave type is inactive'; end if;
 if p_start is null or p_end is null or p_half is null or p_end<p_start or p_end-p_start>366 or extract(year from p_start)<>extract(year from p_end)
   or p_start<p.joining_date or (p.exit_date is not null and p_end>p.exit_date) or (p_half and p_start<>p_end) then raise exception 'Invalid dates. Split cross-year requests and use one date for half-day.'; end if;
 if not public.is_manager() and p_start<public.today() then raise exception 'Ask a manager to add past leave'; end if;
 if exists(select 1 from public.leaves where profile_id=p_profile and status in ('pending','approved') and start_date<=p_end and end_date>=p_start) then raise exception 'Overlapping leave request'; end if;
 if exists(select 1 from public.attendance where profile_id=p_profile and day between p_start and p_end) and not p_half then raise exception 'Attendance already exists on these dates'; end if;
 select count(*) into n from generate_series(p_start::timestamp,p_end::timestamp,interval '1 day') d
 where not exists(select 1 from public.holidays h where h.day=d::date)
 and not(extract(dow from d)::integer=any(public.fixed_days(p_profile,d::date)))
 and not exists(select 1 from public.weekoffs w where w.profile_id=p_profile and w.day=d::date);
 if p_half then n:=n/2; end if;
 if n<=0 then raise exception 'No working days in selection'; end if;
 select * into bal from public.leave_balance(p_profile,extract(year from p_start)::integer) x where x.type_id=p_type;
 if not t.unlimited and n>bal.available then raise exception 'Insufficient leave balance (pending requests also reserve balance)'; end if;
 insert into public.leaves(profile_id,type_id,start_date,end_date,half_day,days,reason,status,reviewed_by,reviewed_at)
 values(p_profile,p_type,p_start,p_end,p_half,n,p_reason,case when public.is_manager() then 'approved' else 'pending' end,
 case when public.is_manager() then public.me() end,case when public.is_manager() then now() end) returning id into rid;
 insert into public.leave_days(leave_id,day,amount)
 select rid,d::date,case when p_half then .5 else 1 end from generate_series(p_start::timestamp,p_end::timestamp,interval '1 day') d
 where not exists(select 1 from public.holidays h where h.day=d::date)
 and not(extract(dow from d)::integer=any(public.fixed_days(p_profile,d::date)))
 and not exists(select 1 from public.weekoffs w where w.profile_id=p_profile and w.day=d::date);
 return rid;
end $$;
create function public.review_leave(p_id uuid,p_approve boolean,p_note text) returns void language plpgsql security definer set search_path = '' as $$
declare l public.leaves; bal record; pid uuid;
begin
 if not public.is_manager() then raise exception 'Manager required'; end if;
 select profile_id into pid from public.leaves where id=p_id;
 perform 1 from public.profiles where id=pid for update;
 select * into l from public.leaves where id=p_id and status='pending' for update;
 if not found then raise exception 'Pending request not found'; end if;
 if p_approve then
   if exists(select 1 from public.attendance a join public.leave_days d on d.day=a.day where a.profile_id=l.profile_id and d.leave_id=l.id) and not l.half_day then raise exception 'Attendance conflicts with leave'; end if;
   select * into bal from public.leave_balance(l.profile_id,extract(year from l.start_date)::integer) x where x.type_id=l.type_id;
   if not bal.unlimited and bal.available<0 then raise exception 'Balance changed. Adjust balance before approving'; end if;
 end if;
 update public.leaves set status=case when p_approve then 'approved' else 'rejected' end,reviewed_by=public.me(),reviewed_at=now(),review_note=p_note where id=p_id;
end $$;
create function public.cancel_leave(p_id uuid) returns void language plpgsql security definer set search_path = '' as $$
declare l public.leaves; pid uuid;
begin
 select profile_id into pid from public.leaves where id=p_id;
 perform 1 from public.profiles where id=pid for update;
 select * into l from public.leaves where id=p_id for update;
 if not found or not public.allowed(l.profile_id) then raise exception 'Not authorized'; end if;
 if l.status not in ('pending','approved') then raise exception 'Request already closed'; end if;
 if not public.is_manager() and l.status='approved' and l.start_date<public.today() then raise exception 'Manager must cancel past leave'; end if;
 update public.leaves set status='cancelled',reviewed_by=public.me(),reviewed_at=now() where id=p_id;
end $$;

create function public.set_weekoff(p_profile uuid,p_day date,p_remove boolean default false) returns void language plpgsql security definer set search_path = '' as $$
declare p public.profiles; ws date:=date_trunc('week',p_day)::date; n integer;
begin
 if not public.allowed(p_profile) or p_day is null then raise exception 'Not authorized or invalid date'; end if;
 select * into p from public.profiles where id=p_profile for update;
 if p_day<p.joining_date or not p.active or (p.exit_date is not null and p_day>p.exit_date) then raise exception 'Outside employment dates'; end if;
 if not public.is_manager() and (p_day<public.today() or p_day>public.today()+90) then raise exception 'Choose today or a date in the next 90 days'; end if;
 if p_remove then delete from public.weekoffs where profile_id=p_profile and day=p_day; return; end if;
 if exists(select 1 from public.attendance where profile_id=p_profile and day=p_day)
   or exists(select 1 from public.leaves where profile_id=p_profile and status in ('pending','approved') and p_day between start_date and end_date)
   or exists(select 1 from public.holidays where day=p_day) or extract(dow from p_day)::integer=any(public.fixed_days(p_profile,p_day))
   then raise exception 'Date already has attendance, leave, holiday or fixed week-off'; end if;
 select count(*) into n from public.weekoffs where profile_id=p_profile and day between ws and ws+6;
 if not public.is_manager() and n>=p.weekly_quota then raise exception 'Weekly quota exhausted. Apply for leave instead.'; end if;
 insert into public.weekoffs(profile_id,day,created_by) values(p_profile,p_day,public.me());
end $$;

create function public.request_correction(p_day date,p_in timestamptz,p_out timestamptz,p_break integer,p_reason text,p_profile uuid default null)
returns void language plpgsql security definer set search_path = '' as $$
declare pid uuid:=coalesce(p_profile,public.me()); lim integer;
begin
 if pid is null or not public.allowed(pid) then raise exception 'Active authorized account required'; end if;
 perform 1 from public.profiles where id=pid for update;
 select regularization_days into lim from public.settings where id;
 if p_day is null or p_in is null or p_out is null or p_break is null or (not public.is_manager() and p_day<public.today()-lim) or p_day>public.today()
   or (p_in at time zone 'Asia/Kolkata')::date<>p_day or p_out>clock_timestamp() or p_out<=p_in
   or p_out-p_in>interval '20 hours' or p_break<0 or p_break>=extract(epoch from (p_out-p_in))/60 then raise exception 'Invalid correction dates, times or break duration'; end if;
 if p_day<(select joining_date from public.profiles where id=pid) then raise exception 'Date precedes joining date'; end if;
 insert into public.regularizations(profile_id,day,requested_in,requested_out,break_minutes,reason) values(pid,p_day,p_in,p_out,p_break,p_reason);
end $$;
create function public.review_correction(p_id uuid,p_approve boolean,p_note text) returns void language plpgsql security definer set search_path = '' as $$
declare r public.regularizations; s public.settings; aid uuid; pid uuid;
begin
 if not public.is_manager() then raise exception 'Manager required'; end if;
 select profile_id into pid from public.regularizations where id=p_id;
 perform 1 from public.profiles where id=pid for update;
 select * into r from public.regularizations where id=p_id and status='pending' for update;
 if not found then raise exception 'Pending correction not found'; end if;
 if p_approve then
   if exists(select 1 from public.leaves l join public.leave_days d on d.leave_id=l.id where l.profile_id=pid and l.status='approved' and not l.half_day and d.day=r.day)
     or exists(select 1 from public.weekoffs where profile_id=pid and day=r.day) then raise exception 'Cancel conflicting leave or week-off first'; end if;
   select * into s from public.settings where id;
   insert into public.attendance(profile_id,day,check_in,check_out,full_minutes,half_minutes,allowed_break,late_cutoff,source)
   values(pid,r.day,r.requested_in,r.requested_out,s.full_minutes,s.half_minutes,s.break_minutes,s.late_cutoff,'correction')
   on conflict(profile_id,day) do update set check_in=excluded.check_in,check_out=excluded.check_out,source='correction' returning id into aid;
   -- Previous break records are preserved in immutable audit history.
   delete from public.breaks where attendance_id=aid;
   if r.break_minutes>0 then
     insert into public.breaks(attendance_id,started_at,ended_at) values(aid,r.requested_in+(r.requested_out-r.requested_in)/2-make_interval(mins=>r.break_minutes)/2,
       r.requested_in+(r.requested_out-r.requested_in)/2+make_interval(mins=>r.break_minutes)/2);
   end if;
 end if;
 update public.regularizations set status=case when p_approve then 'approved' else 'rejected' end,reviewed_by=public.me(),reviewed_at=now(),review_note=p_note where id=p_id;
end $$;
create function public.cancel_correction(p_id uuid) returns void language plpgsql security definer set search_path = '' as $$
begin
 update public.regularizations set status='cancelled' where id=p_id and status='pending' and public.allowed(profile_id);
 if not found then raise exception 'Pending correction not found'; end if;
end $$;

-- Calendar is derived at query time: absence appears without requiring a midnight cron job.
create function public.calendar(p_profile uuid,p_from date,p_to date)
returns table(day date,status text,leave_tag text,holiday text,check_in timestamptz,check_out timestamptz,
 work_minutes integer,break_minutes integer,late boolean,excess_break boolean,missing_checkout boolean,override_reason text,source text,half_required integer)
language sql stable set search_path = '' as $$
 with base as (
 select d::date as day,p.joining_date,p.exit_date,a.check_in,a.check_out,a.source,
 a.full_minutes,a.half_minutes,a.late_cutoff,a.allowed_break,
 coalesce(b.mins,0)::integer bm,
 case when a.id is null then 0 else greatest(0,floor(extract(epoch from(coalesce(a.check_out,least(now(),a.check_in+interval '20 hours'))-a.check_in))/60)-coalesce(b.mins,0))::integer end wm,
 h.name holiday,o.status os,o.reason,
 (w.id is not null or extract(dow from d)::integer=any(public.fixed_days(p.id,d::date))) offday,
 l.half_day,l.tag
 from public.profiles p cross join generate_series(p_from::timestamp,p_to::timestamp,interval '1 day') d
 left join public.attendance a on a.profile_id=p.id and a.day=d::date
 left join lateral (select floor(sum(extract(epoch from(coalesce(z.ended_at,least(now(),a.check_in+interval '20 hours'))-z.started_at)))/60) mins from public.breaks z where z.attendance_id=a.id) b on true
 left join public.holidays h on h.day=d::date left join public.weekoffs w on w.profile_id=p.id and w.day=d::date
 left join public.overrides o on o.profile_id=p.id and o.day=d::date
 left join lateral(select v.half_day,t.tag from public.leaves v join public.leave_types t on t.id=v.type_id join public.leave_days ld on ld.leave_id=v.id
   where v.profile_id=p.id and v.status='approved' and d::date=ld.day limit 1) l on true
 where p.id=p_profile and public.allowed(p_profile) and p_to-p_from between 0 and 370
 )
 select day,case
 when day<joining_date or (exit_date is not null and day>exit_date) then 'not_employed'
 when os is not null then os
 when check_in is not null and check_out is null then case when now()-check_in>interval '20 hours' then 'missing_checkout' else 'in_progress' end
 when tag is not null then case when half_day then 'half_leave' else 'leave' end
 when holiday is not null and check_in is null then 'holiday'
 when offday and check_in is null then 'weekoff'
 when check_out is not null then case when wm>=full_minutes and (check_in at time zone 'Asia/Kolkata')::time<=late_cutoff then 'present' when wm>=half_minutes then 'half_day' else 'absent' end
 when day>public.today() then 'upcoming' when day=public.today() then 'not_marked' else 'absent' end,
 tag,holiday,check_in,check_out,wm,bm,
 coalesce((check_in at time zone 'Asia/Kolkata')::time>late_cutoff,false),coalesce(bm>allowed_break,false),
 check_in is not null and check_out is null and now()-check_in>interval '20 hours',reason,source,half_minutes
 from base order by day
$$;

-- RLS: employees read their own records; writes affecting attendance/balances use validated RPCs.
do $$ declare t text; begin
 foreach t in array array['settings','profiles','schedule_history','holidays','leave_types','leave_balances','leaves','leave_days','weekoffs','attendance','breaks','overrides','regularizations','audit_logs'] loop
 execute format('alter table public.%I enable row level security',t);
 end loop;
end $$;
create policy settings_read on public.settings for select to authenticated using(public.me() is not null);
create policy settings_write on public.settings for update to authenticated using(public.is_manager()) with check(public.is_manager());
create policy profiles_read on public.profiles for select to authenticated using(user_id=auth.uid() or public.is_manager());
create policy profiles_insert on public.profiles for insert to authenticated with check(public.is_manager() and user_id is null);
create policy profiles_update on public.profiles for update to authenticated using(public.is_manager()) with check(public.is_manager());
do $$ declare t text; begin
 foreach t in array array['holidays','leave_types'] loop
 execute format('create policy read on public.%I for select to authenticated using(public.me() is not null)',t);
 execute format('create policy manage on public.%I for all to authenticated using(public.is_manager()) with check(public.is_manager())',t);
 end loop;
 foreach t in array array['schedule_history','leave_balances','leaves','weekoffs','attendance','overrides','regularizations'] loop
 execute format('create policy read on public.%I for select to authenticated using(public.allowed(profile_id))',t);
 end loop;
end $$;
create policy balances_manage on public.leave_balances for all to authenticated using(public.is_manager()) with check(public.is_manager());
create policy overrides_manage on public.overrides for all to authenticated using(public.is_manager()) with check(public.is_manager());
create policy breaks_read on public.breaks for select to authenticated using(exists(select 1 from public.attendance a where a.id=attendance_id and public.allowed(a.profile_id)));
create policy leave_days_read on public.leave_days for select to authenticated using(exists(select 1 from public.leaves l where l.id=leave_id and public.allowed(l.profile_id)));
create policy audit_read on public.audit_logs for select to authenticated using(public.is_manager());

-- Explicit permissions. Trigger and internal functions are NOT callable from the API.
revoke all on all tables in schema public from anon;
revoke all on all tables in schema public from authenticated;
grant select on public.settings,public.profiles,public.schedule_history,public.holidays,public.leave_types,public.leave_balances,public.leaves,public.leave_days,public.weekoffs,public.attendance,public.breaks,public.overrides,public.regularizations,public.audit_logs to authenticated;
grant update on public.settings to authenticated;
grant insert,update on public.profiles to authenticated;
grant insert,update,delete on public.holidays,public.leave_types,public.leave_balances,public.overrides to authenticated;
revoke execute on all functions in schema public from public,anon,authenticated;
grant execute on function public.today(),public.me(),public.is_manager(),public.allowed(uuid),public.fixed_days(uuid,date),public.punch(text),
 public.leave_balance(uuid,integer),public.apply_leave(uuid,uuid,date,date,boolean,text),public.review_leave(uuid,boolean,text),public.cancel_leave(uuid),
 public.set_weekoff(uuid,date,boolean),public.request_correction(date,timestamptz,timestamptz,integer,text,uuid),
 public.review_correction(uuid,boolean,text),public.cancel_correction(uuid),public.calendar(uuid,date,date) to authenticated;
commit;
