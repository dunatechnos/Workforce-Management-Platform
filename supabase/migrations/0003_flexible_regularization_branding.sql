-- 0003: configurable branding/time zone + flexible (partial) regularizations.
-- Run this ONCE on an existing database created from schema.sql.
-- It is safe to re-run: columns are added with IF NOT EXISTS and functions
-- are replaced in place.

begin;

alter table public.settings
  add column if not exists product_name text not null default 'Workforce',
  add column if not exists tagline text not null default 'Attendance, leave, and team schedules in one place.',
  add column if not exists login_headline text not null default 'Attendance and leave, without the admin overhead.',
  add column if not exists login_message text not null default 'Sign in to manage attendance and leave.',
  add column if not exists login_footer text not null default 'Secure workspace access',
  add column if not exists support_email text not null default '',
  add column if not exists logo_url text not null default '',
  add column if not exists timezone text not null default 'Asia/Kolkata',
  add column if not exists setup_complete boolean not null default false;
alter table public.settings alter column company_name set default '';

alter table public.attendance
  add column if not exists timezone text not null default 'Asia/Kolkata';

alter table public.regularizations
  add column if not exists kind text not null default 'full_day',
  add column if not exists break_start timestamptz,
  add column if not exists break_end timestamptz,
  add column if not exists replace_breaks boolean not null default false;
alter table public.regularizations alter column requested_in drop not null;
alter table public.regularizations alter column requested_out drop not null;

do $$ begin
  if not exists(select 1 from pg_constraint where conname='regularizations_kind_fields') then
    alter table public.regularizations add constraint regularizations_kind_fields check(
      (kind='full_day' and requested_in is not null and requested_out is not null and requested_out>requested_in and break_start is null and break_end is null)
      or (kind='check_in' and requested_in is not null and requested_out is null and break_start is null and break_end is null)
      or (kind='check_out' and requested_in is null and requested_out is not null and break_start is null and break_end is null)
      or (kind='break' and requested_in is null and requested_out is null and break_start is not null and break_end is not null and break_end>break_start)
    );
  end if;
end $$;

drop index if exists public.one_pending_correction;
create unique index one_pending_correction on public.regularizations(profile_id,day,kind)
  where status='pending' and kind<>'break';

-- Remove the old hard-coded identity. An organization that already set a
-- real name keeps it; anything using the old product name must run setup.
update public.settings set company_name=''
  where lower(trim(company_name)) in ('hv attendance','human vision','human vision attendance');
update public.settings set product_name='Workforce'
  where product_name is null or product_name='' or product_name='HV Attendance';
update public.settings set setup_complete=true where company_name<>'' and not setup_complete;
update public.settings set setup_complete=false where company_name='';

create or replace function public.today() returns date language sql stable set search_path = '' as $$
 select (now() at time zone coalesce((select timezone from public.settings where id),'Asia/Kolkata'))::date
$$;
alter table public.profiles alter column joining_date set default public.today();

drop function if exists public.branding();
create function public.branding()
returns table(company_name text,product_name text,tagline text,login_headline text,login_message text,login_footer text,support_email text,logo_url text,timezone text)
language sql stable security definer set search_path = '' as $$
 select company_name,product_name,tagline,login_headline,login_message,login_footer,support_email,logo_url,timezone
 from public.settings where id
$$;

create or replace function public.punch(p_action text) returns void language plpgsql security definer set search_path = '' as $$
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
   insert into public.attendance(profile_id,day,check_in,full_minutes,half_minutes,allowed_break,late_cutoff,timezone)
    values(pid,public.today(),t,s.full_minutes,s.half_minutes,s.break_minutes,s.late_cutoff,s.timezone);
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

create or replace function public.request_regularization(
 p_kind text, p_day date, p_in timestamptz default null, p_out timestamptz default null,
 p_break integer default 0, p_break_start timestamptz default null, p_break_end timestamptz default null,
 p_replace_breaks boolean default false, p_reason text default null, p_profile uuid default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare pid uuid:=coalesce(p_profile,public.me()); lim integer; tz text; jd date; ed date; aid uuid; rid uuid;
begin
 if pid is null or not public.allowed(pid) then raise exception 'Active authorized account required'; end if;
 perform 1 from public.profiles where id=pid for update;
 select regularization_days,coalesce(timezone,'Asia/Kolkata') into lim,tz from public.settings where id;
 select joining_date,exit_date into jd,ed from public.profiles where id=pid;
 if p_kind not in ('full_day','check_in','check_out','break') then raise exception 'Invalid regularization type'; end if;
 if p_day is null or p_reason is null or length(trim(p_reason))<3 then raise exception 'Request type, date and reason are required'; end if;
 if p_day>public.today() then raise exception 'Future dates cannot be corrected'; end if;
 if not public.is_manager() and p_day<public.today()-lim then raise exception 'This date is outside the correction window'; end if;
 if p_day<jd or (ed is not null and p_day>ed) then raise exception 'Date is outside employment dates'; end if;
 if exists(select 1 from public.regularizations where profile_id=pid and day=p_day and status='pending'
   and (kind='full_day' or (p_kind='full_day') or (p_kind<>'break' and kind=p_kind)))
   then raise exception 'A matching request is already pending for this date'; end if;
 if p_kind='full_day' then
   if p_in is null or p_out is null or p_out<=p_in then raise exception 'Enter valid check-in and check-out times'; end if;
   if p_out>clock_timestamp() then raise exception 'Check-out cannot be in the future'; end if;
   if p_out-p_in>interval '20 hours' then raise exception 'A shift cannot exceed 20 hours'; end if;
   if p_break is null or p_break<0 or p_break>=extract(epoch from (p_out-p_in))/60 then raise exception 'Break duration must be less than the shift length'; end if;
   if (p_in at time zone tz)::date<>p_day then raise exception 'Check-in must fall on the selected date'; end if;
   if (p_out at time zone tz)::date not in (p_day,p_day+1) then raise exception 'Check-out must be on the selected date or the next day'; end if;
 elsif p_kind='check_in' then
   if p_in is null or p_in>clock_timestamp() then raise exception 'Enter a valid check-in time'; end if;
   if (p_in at time zone tz)::date<>p_day then raise exception 'Check-in must fall on the selected date'; end if;
 elsif p_kind='check_out' then
   if p_out is null or p_out>clock_timestamp() then raise exception 'Enter a valid check-out time'; end if;
   select id into aid from public.attendance where profile_id=pid and day=p_day;
   if aid is null then raise exception 'No check-in exists for this date. Submit a check-in correction first.'; end if;
   if p_out<=(select check_in from public.attendance where id=aid) then raise exception 'Check-out must be after check-in'; end if;
   if p_out-(select check_in from public.attendance where id=aid)>interval '20 hours' then raise exception 'A shift cannot exceed 20 hours'; end if;
   if (p_out at time zone tz)::date not in (p_day,p_day+1) then raise exception 'Check-out must be on the selected date or the next day'; end if;
 else
   if p_break_start is null or p_break_end is null or p_break_end<=p_break_start then raise exception 'Enter a valid break start and end'; end if;
   if p_break_end>clock_timestamp() then raise exception 'Break end cannot be in the future'; end if;
   if (p_break_start at time zone tz)::date<>p_day or (p_break_end at time zone tz)::date<>p_day then raise exception 'Break times must fall on the selected date'; end if;
   if p_break_end-p_break_start>interval '8 hours' then raise exception 'A break cannot exceed 8 hours'; end if;
   select id into aid from public.attendance where profile_id=pid and day=p_day;
   if aid is null then raise exception 'No attendance exists for this date. Submit a full-day or check-in correction first.'; end if;
   if exists(select 1 from public.attendance a where a.id=aid and (p_break_start<a.check_in or (a.check_out is not null and p_break_end>a.check_out))) then raise exception 'Break must be inside the recorded shift'; end if;
   if not coalesce(p_replace_breaks,false) and exists(select 1 from public.breaks b where b.attendance_id=aid
     and tstzrange(b.started_at,coalesce(b.ended_at,'infinity'::timestamptz)) && tstzrange(p_break_start,p_break_end))
     then raise exception 'This break overlaps an existing break'; end if;
 end if;
 insert into public.regularizations(profile_id,day,kind,requested_in,requested_out,break_start,break_end,break_minutes,replace_breaks,reason)
 values(pid,p_day,p_kind,p_in,p_out,p_break_start,p_break_end,
   case when p_kind='break' then ceil(extract(epoch from (p_break_end-p_break_start))/60)::integer
        when p_kind='full_day' then coalesce(p_break,0) else 0 end,
   case when p_kind='break' then coalesce(p_replace_breaks,false) else false end,p_reason)
 returning id into rid;
 return rid;
end $$;

create or replace function public.request_correction(p_day date,p_in timestamptz,p_out timestamptz,p_break integer,p_reason text,p_profile uuid default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
 perform public.request_regularization('full_day',p_day,p_in,p_out,coalesce(p_break,0),null,null,false,p_reason,p_profile);
end $$;

create or replace function public.review_correction(p_id uuid,p_approve boolean,p_note text) returns void language plpgsql security definer set search_path = '' as $$
declare r public.regularizations; s public.settings; aid uuid; pid uuid;
begin
 if not public.is_manager() then raise exception 'Manager required'; end if;
 select profile_id into pid from public.regularizations where id=p_id;
 perform 1 from public.profiles where id=pid for update;
 select * into r from public.regularizations where id=p_id and status='pending' for update;
 if not found then raise exception 'Pending correction not found'; end if;
 if p_approve then
   if r.kind in ('full_day','check_in','check_out') and (
     exists(select 1 from public.leaves l join public.leave_days d on d.leave_id=l.id where l.profile_id=pid and l.status='approved' and not l.half_day and d.day=r.day)
     or exists(select 1 from public.weekoffs where profile_id=pid and day=r.day)) then raise exception 'Cancel conflicting leave or week-off first'; end if;
   select * into s from public.settings where id;
   select id into aid from public.attendance where profile_id=pid and day=r.day;
   if r.kind='full_day' then
     insert into public.attendance(profile_id,day,check_in,check_out,full_minutes,half_minutes,allowed_break,late_cutoff,timezone,source)
     values(pid,r.day,r.requested_in,r.requested_out,s.full_minutes,s.half_minutes,s.break_minutes,s.late_cutoff,s.timezone,'correction')
     on conflict(profile_id,day) do update set check_in=excluded.check_in,check_out=excluded.check_out,source='correction' returning id into aid;
     delete from public.breaks where attendance_id=aid;
     if r.break_minutes>0 then
       insert into public.breaks(attendance_id,started_at,ended_at) values(aid,r.requested_in+(r.requested_out-r.requested_in)/2-make_interval(mins=>r.break_minutes)/2,
         r.requested_in+(r.requested_out-r.requested_in)/2+make_interval(mins=>r.break_minutes)/2);
     end if;
   elsif r.kind='check_in' then
     if aid is null then
       insert into public.attendance(profile_id,day,check_in,full_minutes,half_minutes,allowed_break,late_cutoff,timezone,source)
       values(pid,r.day,r.requested_in,s.full_minutes,s.half_minutes,s.break_minutes,s.late_cutoff,s.timezone,'correction');
     else
       if exists(select 1 from public.attendance where id=aid and check_out is not null and check_out<=r.requested_in) then raise exception 'Check-in must be before the existing check-out'; end if;
       if exists(select 1 from public.breaks b where b.attendance_id=aid and b.started_at<r.requested_in) then raise exception 'An existing break starts before the requested check-in'; end if;
       update public.attendance set check_in=r.requested_in,source='correction' where id=aid;
     end if;
   elsif r.kind='check_out' then
     if aid is null then raise exception 'No attendance exists for this date. Approve a check-in correction first.'; end if;
     if exists(select 1 from public.attendance where id=aid and r.requested_out<=check_in) then raise exception 'Check-out must be after check-in'; end if;
      if exists(select 1 from public.breaks b where b.attendance_id=aid and coalesce(b.ended_at,b.started_at)>r.requested_out) then raise exception 'An existing break ends after the requested check-out'; end if;
     update public.attendance set check_out=r.requested_out,source='correction' where id=aid;
     update public.breaks set ended_at=r.requested_out where attendance_id=aid and ended_at is null and started_at<=r.requested_out;
   else
     if aid is null then raise exception 'No attendance exists for this date. Approve a check-in correction first.'; end if;
     if exists(select 1 from public.attendance a where a.id=aid and (r.break_start<a.check_in or (a.check_out is not null and r.break_end>a.check_out))) then raise exception 'Break must be inside the recorded shift'; end if;
     if not r.replace_breaks and exists(select 1 from public.breaks b where b.attendance_id=aid
       and tstzrange(b.started_at,coalesce(b.ended_at,'infinity'::timestamptz)) && tstzrange(r.break_start,r.break_end))
       then raise exception 'This break overlaps an existing break'; end if;
     if r.replace_breaks then delete from public.breaks where attendance_id=aid; end if;
     insert into public.breaks(attendance_id,started_at,ended_at) values(aid,r.break_start,r.break_end);
   end if;
 end if;
 update public.regularizations set status=case when p_approve then 'approved' else 'rejected' end,reviewed_by=public.me(),reviewed_at=now(),review_note=p_note where id=p_id;
end $$;

create or replace function public.calendar(p_profile uuid,p_from date,p_to date)
returns table(day date,status text,leave_tag text,holiday text,check_in timestamptz,check_out timestamptz,
 work_minutes integer,break_minutes integer,late boolean,excess_break boolean,missing_checkout boolean,override_reason text,source text,half_required integer)
language sql stable set search_path = '' as $$
 with base as (
 select d::date as day,p.joining_date,p.exit_date,a.check_in,a.check_out,a.source,
 a.full_minutes,a.half_minutes,a.late_cutoff,a.allowed_break,
 coalesce(a.timezone,(select timezone from public.settings where id)) attendance_tz,
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
 when check_out is not null then case when wm>=full_minutes and (check_in at time zone attendance_tz)::time<=late_cutoff then 'present' when wm>=half_minutes then 'half_day' else 'absent' end
 when day>public.today() then 'upcoming' when day=public.today() then 'not_marked' else 'absent' end,
 tag,holiday,check_in,check_out,wm,bm,
 coalesce((check_in at time zone attendance_tz)::time>late_cutoff,false),coalesce(bm>allowed_break,false),
 check_in is not null and check_out is null and now()-check_in>interval '20 hours',reason,source,half_minutes
 from base order by day
$$;

grant execute on function public.request_regularization(text,date,timestamptz,timestamptz,integer,timestamptz,timestamptz,boolean,text,uuid) to authenticated;
grant execute on function public.branding() to anon,authenticated;

commit;
