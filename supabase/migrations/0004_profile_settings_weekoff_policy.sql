-- 0004: employee profiles, personal settings and week-off planning policy.
-- Run this ONCE on an existing database created from schema.sql.
-- It is safe to re-run: columns are added with IF NOT EXISTS and functions
-- are replaced in place.

begin;

alter table public.settings
  add column if not exists weekoff_planning text not null default 'employee'
  check (weekoff_planning in ('employee','manager'));

alter table public.profiles
  add column if not exists avatar_url text not null default '',
  add column if not exists phone text not null default '',
  add column if not exists birthday date,
  add column if not exists location text not null default '',
  add column if not exists pronouns text not null default '',
  add column if not exists bio text not null default '';

create or replace function public.update_my_profile(
 p_name text default null, p_phone text default '', p_birthday date default null,
 p_designation text default '', p_location text default '', p_pronouns text default '',
 p_bio text default '', p_avatar_url text default '')
returns void language plpgsql security definer set search_path = '' as $$
declare pid uuid:=public.me();
begin
 if pid is null then raise exception 'Active authorized account required'; end if;
 if p_name is not null and length(trim(p_name))<2 then raise exception 'Enter your full name'; end if;
 if p_birthday is not null and p_birthday>public.today() then raise exception 'Birthday cannot be in the future'; end if;
 if length(coalesce(p_bio,''))>1000 then raise exception 'Keep your introduction under 1000 characters'; end if;
 update public.profiles set
  name=coalesce(nullif(trim(p_name),''),name),
  phone=trim(coalesce(p_phone,'')),
  birthday=p_birthday,
  designation=trim(coalesce(p_designation,'')),
  location=trim(coalesce(p_location,'')),
  pronouns=trim(coalesce(p_pronouns,'')),
  bio=trim(coalesce(p_bio,'')),
  avatar_url=trim(coalesce(p_avatar_url,''))
 where id=pid;
end $$;

create or replace function public.set_weekoff(
 p_profile uuid, p_day date, p_remove boolean default false)
returns void language plpgsql security definer set search_path = '' as $$
declare p public.profiles; s public.settings; ws date:=date_trunc('week',p_day)::date; n integer;
begin
 if not public.allowed(p_profile) or p_day is null then raise exception 'Not authorized or invalid date'; end if;
 select * into s from public.settings where id;
 if not public.is_manager() and s.weekoff_planning='manager' then raise exception 'Your administrator manages week-off planning'; end if;
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

grant execute on function public.update_my_profile(text,text,date,text,text,text,text,text) to authenticated;

do $$
begin
 if exists(select 1 from information_schema.schemata where schema_name='storage') then
  insert into storage.buckets(id,name,public) values('avatars','avatars',true)
   on conflict(id) do update set public=true;
  execute 'drop policy if exists avatars_read on storage.objects';
  execute 'create policy avatars_read on storage.objects for select using(bucket_id=''avatars'')';
  execute 'drop policy if exists avatars_insert on storage.objects';
  execute 'create policy avatars_insert on storage.objects for insert to authenticated with check(bucket_id=''avatars'' and (storage.foldername(name))[1]=auth.uid()::text)';
  execute 'drop policy if exists avatars_update on storage.objects';
  execute 'create policy avatars_update on storage.objects for update to authenticated using(bucket_id=''avatars'' and (storage.foldername(name))[1]=auth.uid()::text) with check(bucket_id=''avatars'' and (storage.foldername(name))[1]=auth.uid()::text)';
  execute 'drop policy if exists avatars_delete on storage.objects';
  execute 'create policy avatars_delete on storage.objects for delete to authenticated using(bucket_id=''avatars'' and (storage.foldername(name))[1]=auth.uid()::text)';
 end if;
end $$;

commit;
