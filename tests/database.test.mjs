import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

test('Postgres schema, auth, RLS and attendance workflows', async t => {
 const db = new PGlite()
 try {
 await db.exec(`create role anon; create role authenticated; create schema auth;
 create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}',raw_app_meta_data jsonb default '{"provider":"google"}');
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 grant usage on schema public,auth to authenticated,anon; grant execute on function auth.uid() to authenticated,anon;`)
 await db.exec(await readFile(new URL('../supabase/schema.sql',import.meta.url),'utf8'))
 const manager='00000000-0000-0000-0000-000000000001', employee='00000000-0000-0000-0000-000000000002', other='00000000-0000-0000-0000-000000000003'
 const login=async id=>{await db.exec('reset role'); await db.query(`select set_config('request.jwt.claim.sub',$1,false)`,[id]); await db.exec('set role authenticated')}
 const root=async()=>{await db.exec('reset role');await db.exec(`select set_config('request.jwt.claim.sub','',false)`)}
 await t.test('bootstrap is explicit; wrong-domain signup denied',async()=>{
   await assert.rejects(db.query(`insert into auth.users(id,email) values($1,'random@gmail.com')`,[other]),/bootstrap manager/)
   await db.exec(`update public.settings set bootstrap_email='boss@example.com',allowed_domains=array['example.com']`)
   await db.query(`insert into auth.users(id,email) values($1,'boss@example.com'),($2,'staff@example.com'),($3,'other@example.com')`,[manager,employee,other])
   await assert.rejects(db.exec(`insert into auth.users(id,email) values(gen_random_uuid(),'outsider@gmail.com')`),/domain/)
 })
 await t.test('built-in email auth accepted; other providers and domains rejected',async()=>{
   await db.query(`insert into auth.users(id,email,raw_app_meta_data) values($1,'newhire@example.com','{"provider":"email"}')`,['00000000-0000-0000-0000-000000000004'])
   assert.equal((await db.query(`select role from public.profiles where email='newhire@example.com'`)).rows[0].role,'employee')
   await assert.rejects(db.query(`insert into auth.users(id,email,raw_app_meta_data) values($1,'stray@gmail.com','{"provider":"email"}')`,['00000000-0000-0000-0000-000000000005']),/domain/)
   await assert.rejects(db.query(`insert into auth.users(id,email,raw_app_meta_data) values($1,'sms@example.com','{"provider":"phone"}')`,['00000000-0000-0000-0000-000000000006']),/company email/)
 })
 const profiles=(await db.query('select id,user_id,role from public.profiles')).rows
 const ep=profiles.find(p=>p.user_id===employee).id, mp=profiles.find(p=>p.user_id===manager).id
 await db.exec(`update public.profiles set joining_date=public.today()-400`)
 await t.test('employee cannot read peers, promote self or write punches directly',async()=>{
   await login(employee)
   assert.equal((await db.query('select * from public.profiles')).rows.length,1)
   assert.equal((await db.query(`update public.profiles set role='manager' returning id`)).rows.length,0)
   await assert.rejects(db.query(`insert into public.attendance(profile_id,day,check_in,full_minutes,half_minutes,allowed_break,late_cutoff) values($1,public.today(),now(),480,240,60,'12:00')`,[ep]),/permission denied/)
   assert.equal((await db.query(`select * from public.calendar($1,public.today()-5,public.today())`,[mp])).rows.length,0)
   await assert.rejects(db.exec(`select public.on_signup()`),/permission denied/)
 })
 await t.test('punch transitions, multiple breaks and checkout on break',async()=>{
   await db.exec(`select public.punch('check_in')`)
   await assert.rejects(db.exec(`select public.punch('check_in')`),/open shift/)
   await db.exec(`select public.punch('break_start')`)
   await assert.rejects(db.exec(`select public.punch('break_start')`),/already started/)
   await db.exec(`select public.punch('break_end'); select public.punch('break_start'); select public.punch('check_out')`)
   const a=(await db.query('select * from public.attendance')).rows[0]
   assert.ok(a.check_out)
   assert.equal((await db.query('select * from public.breaks where ended_at is null')).rows.length,0)
   await assert.rejects(db.exec(`select public.punch('check_in')`),/already completed/)
 })
 await t.test('weekly quota is enforced; manager may override it',async()=>{
   await db.query(`select public.set_weekoff($1,(date_trunc('week',public.today())+interval '7 days')::date,false)`,[ep])
   await assert.rejects(db.query(`select public.set_weekoff($1,(date_trunc('week',public.today())+interval '8 days')::date,false)`,[ep]),/quota/)
   await login(manager)
   await db.query(`select public.set_weekoff($1,(date_trunc('week',public.today())+interval '8 days')::date,false)`,[ep])
 })
 const type=(await db.query(`select id from public.leave_types where tag='CL'`)).rows[0].id
 let leave
 await t.test('pending leave reserves quota; manager approval and cancellation',async()=>{
   await login(employee)
   leave=(await db.query(`select public.apply_leave($1,$2,public.today()+20,public.today()+20,false,'Family event') id`,[ep,type])).rows[0].id
   const bal=(await db.query(`select * from public.leave_balance($1,extract(year from public.today()+20)::integer) where type_id=$2`,[ep,type])).rows[0]
   assert.equal(Number(bal.pending),1)
   await assert.rejects(db.query(`select public.review_leave($1,true,'ok')`,[leave]),/Manager required/)
   await assert.rejects(db.query(`select public.apply_leave($1,$2,public.today()+20,public.today()+20,false,'Duplicate')`,[ep,type]),/Overlapping/)
   await login(manager); await db.query(`select public.review_leave($1,true,'Approved')`,[leave])
   assert.equal((await db.query(`select status from public.calendar($1,public.today()+20,public.today()+20)`,[ep])).rows[0].status,'leave')
   await login(employee);await db.query(`select public.cancel_leave($1)`,[leave])
 })
 await t.test('regularization computes net work, late half-day and snapshots rules',async()=>{
   await db.exec(`select public.request_correction(public.today()-2,((public.today()-2)::text||' 09:30+05:30')::timestamptz,((public.today()-2)::text||' 18:30+05:30')::timestamptz,60,'Forgot checkout')`)
   const rid=(await db.query('select id from public.regularizations')).rows[0].id
   await login(manager); await db.query(`select public.review_correction($1,true,'Verified')`,[rid])
   let c=(await db.query(`select * from public.calendar($1,public.today()-2,public.today()-2)`,[ep])).rows[0]
   assert.equal(c.work_minutes,480);assert.equal(c.break_minutes,60);assert.equal(c.status,'present')
   await db.exec(`update public.settings set full_minutes=600`)
   c=(await db.query(`select * from public.calendar($1,public.today()-2,public.today()-2)`,[ep])).rows[0]
   assert.equal(c.status,'present')
   await db.exec(`update public.settings set full_minutes=480`)
   await login(employee)
   await db.exec(`select public.request_correction(public.today()-1,((public.today()-1)::text||' 12:01+05:30')::timestamptz,((public.today()-1)::text||' 21:01+05:30')::timestamptz,60,'Missed punch')`)
   const id=(await db.query(`select id from public.regularizations where status='pending'`)).rows[0].id
   await login(manager);await db.query(`select public.review_correction($1,true,'Verified')`,[id])
   assert.equal((await db.query(`select status from public.calendar($1,public.today()-1,public.today()-1)`,[ep])).rows[0].status,'half_day')
 })
 await t.test('last manager, audit immutability and account deactivation',async()=>{
   await assert.rejects(db.query(`update public.profiles set active=false where id=$1`,[mp]),/last active manager/)
   assert.ok((await db.query('select * from public.audit_logs')).rows.length>10)
   await assert.rejects(db.exec('delete from public.audit_logs'),/permission denied/)
   await db.query(`update public.profiles set active=false where id=$1`,[ep])
   await login(employee)
   await assert.rejects(db.exec(`select public.punch('check_in')`),/Active account/)
   assert.equal((await db.query('select * from public.attendance')).rows.length,0)
   await root()
 })
 } finally { await db.close() }
})
