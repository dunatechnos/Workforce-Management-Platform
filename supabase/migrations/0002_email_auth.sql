-- 0002: allow Supabase built-in email auth alongside Google (trigger already exists).
create or replace function public.on_signup() returns trigger language plpgsql security definer set search_path = '' as $$
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
