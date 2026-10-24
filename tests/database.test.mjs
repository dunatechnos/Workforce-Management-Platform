import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

test("Postgres schema, auth, RLS and attendance workflows", async (t) => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create schema auth;
 create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}',raw_app_meta_data jsonb default '{"provider":"google"}');
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 grant usage on schema public,auth to authenticated,anon; grant execute on function auth.uid() to authenticated,anon;`);
    await db.exec(
      await readFile(
        new URL("../supabase/schema.sql", import.meta.url),
        "utf8",
      ),
    );
    await t.test(
      "public branding has safe defaults and hides policy details",
      async () => {
        await db.exec("set role anon");
        const b = (await db.query("select * from public.branding()")).rows[0];
        assert.equal(b.company_name, "");
        assert.equal(b.product_name, "Workforce");
        assert.equal(b.timezone, "Asia/Kolkata");
        assert.equal("allowed_domains" in b, false);
        assert.equal("bootstrap_email" in b, false);
        await db.exec("reset role");
      },
    );
    const manager = "00000000-0000-0000-0000-000000000001",
      employee = "00000000-0000-0000-0000-000000000002",
      other = "00000000-0000-0000-0000-000000000003";
    const login = async (id) => {
      await db.exec("reset role");
      await db.query(`select set_config('request.jwt.claim.sub',$1,false)`, [
        id,
      ]);
      await db.exec("set role authenticated");
    };
    const root = async () => {
      await db.exec("reset role");
      await db.exec(`select set_config('request.jwt.claim.sub','',false)`);
    };
    await t.test(
      "bootstrap is explicit; wrong-domain signup denied",
      async () => {
        await assert.rejects(
          db.query(
            `insert into auth.users(id,email) values($1,'random@gmail.com')`,
            [other],
          ),
          /bootstrap manager/,
        );
        await db.exec(
          `update public.settings set bootstrap_email='boss@example.com',allowed_domains=array['example.com']`,
        );
        await db.query(
          `insert into auth.users(id,email) values($1,'boss@example.com'),($2,'staff@example.com'),($3,'other@example.com')`,
          [manager, employee, other],
        );
        await assert.rejects(
          db.exec(
            `insert into auth.users(id,email) values(gen_random_uuid(),'outsider@gmail.com')`,
          ),
          /domain/,
        );
      },
    );
    await t.test(
      "built-in email auth accepted; other providers and domains rejected",
      async () => {
        await db.query(
          `insert into auth.users(id,email,raw_app_meta_data) values($1,'newhire@example.com','{"provider":"email"}')`,
          ["00000000-0000-0000-0000-000000000004"],
        );
        assert.equal(
          (
            await db.query(
              `select role from public.profiles where email='newhire@example.com'`,
            )
          ).rows[0].role,
          "employee",
        );
        await assert.rejects(
          db.query(
            `insert into auth.users(id,email,raw_app_meta_data) values($1,'stray@gmail.com','{"provider":"email"}')`,
            ["00000000-0000-0000-0000-000000000005"],
          ),
          /domain/,
        );
        await assert.rejects(
          db.query(
            `insert into auth.users(id,email,raw_app_meta_data) values($1,'sms@example.com','{"provider":"phone"}')`,
            ["00000000-0000-0000-0000-000000000006"],
          ),
          /company email/,
        );
      },
    );
    const profiles = (
      await db.query("select id,user_id,role from public.profiles")
    ).rows;
    const ep = profiles.find((p) => p.user_id === employee).id,
      mp = profiles.find((p) => p.user_id === manager).id;
    await db.exec(`update public.profiles set joining_date=public.today()-400`);
    await t.test(
      "employee cannot read peers, promote self or write punches directly",
      async () => {
        await login(employee);
        assert.equal(
          (await db.query("select * from public.profiles")).rows.length,
          1,
        );
        assert.equal(
          (
            await db.query(
              `update public.profiles set role='manager' returning id`,
            )
          ).rows.length,
          0,
        );
        await assert.rejects(
          db.query(
            `insert into public.attendance(profile_id,day,check_in,full_minutes,half_minutes,allowed_break,late_cutoff) values($1,public.today(),now(),480,240,60,'12:00')`,
            [ep],
          ),
          /permission denied/,
        );
        assert.equal(
          (
            await db.query(
              `select * from public.calendar($1,public.today()-5,public.today())`,
              [mp],
            )
          ).rows.length,
          0,
        );
        await assert.rejects(
          db.exec(`select public.on_signup()`),
          /permission denied/,
        );
      },
    );
    await t.test(
      "employees can update only their own profile fields", async () => {
        await login(employee);
        await db.query(
          `select public.update_my_profile($1,$2,$3,$4,$5,$6,$7,$8)`,
          [
            "Employee One",
            "+91 90000 11111",
            "1994-02-03",
            "Senior Associate",
            "Pune",
            "they/them",
            "Attendance enthusiast",
            "",
          ],
        );
        const row = (
          await db.query(
            `select name,phone,to_char(birthday,'YYYY-MM-DD') birthday,designation,location,pronouns,bio,role,active
             from public.profiles where id=$1`,
            [ep],
          )
        ).rows[0];
        assert.deepEqual(row, {
          name: "Employee One",
          phone: "+91 90000 11111",
          birthday: "1994-02-03",
          designation: "Senior Associate",
          location: "Pune",
          pronouns: "they/them",
          bio: "Attendance enthusiast",
          role: "employee",
          active: true,
        });
        await assert.rejects(
          db.query(`select public.update_my_profile('A')`),
          /full name/,
        );
        await assert.rejects(
          db.query(
            `select public.update_my_profile('Employee One','',(public.today()+1))`,
          ),
          /future/,
        );
        assert.equal(
          (
            await db.query(
              `update public.profiles set role='manager' returning id`,
            )
          ).rows.length,
          0,
        );
        await db.query(
          `select public.update_my_profile('Employee One',null,null,'Senior Associate','Pune','','','')`,
        );
        assert.equal(
          (
            await db.query(
              `select birthday from public.profiles where id=$1`,
              [ep],
            )
          ).rows[0].birthday,
          null,
        );
      },
    );
    await t.test(
      "punch transitions, multiple breaks and checkout on break",
      async () => {
        await db.exec(`select public.punch('check_in')`);
        await assert.rejects(
          db.exec(`select public.punch('check_in')`),
          /open shift/,
        );
        await db.exec(`select public.punch('break_start')`);
        await assert.rejects(
          db.exec(`select public.punch('break_start')`),
          /already started/,
        );
        await db.exec(
          `select public.punch('break_end'); select public.punch('break_start'); select public.punch('check_out')`,
        );
        const a = (await db.query("select * from public.attendance")).rows[0];
        assert.ok(a.check_out);
        assert.equal(
          (await db.query("select * from public.breaks where ended_at is null"))
            .rows.length,
          0,
        );
        await assert.rejects(
          db.exec(`select public.punch('check_in')`),
          /already completed/,
        );
      },
    );
    await t.test(
      "weekly workweek limit is enforced; manager may override it",
      async () => {
        await root();
        await db.exec(`update public.settings set workweek_days=6`);
        await login(employee);
        await db.query(
          `select public.set_weekoff($1,(date_trunc('week',public.today())+interval '7 days')::date,false)`,
          [ep],
        );
        await assert.rejects(
          db.query(
            `select public.set_weekoff($1,(date_trunc('week',public.today())+interval '8 days')::date,false)`,
            [ep],
          ),
          /limit/,
        );
        await login(manager);
        await db.query(
          `select public.set_weekoff($1,(date_trunc('week',public.today())+interval '8 days')::date,false)`,
          [ep],
        );
      },
    );
    await t.test(
      "fixed off days consume the weekly allowance", async () => {
        await root();
        await db.exec(`update public.settings set workweek_days=5`);
        await db.query(
          `update public.profiles set fixed_off=array[0,6]::integer[] where id=$1`,
          [ep],
        );
        await login(employee);
        await assert.rejects(
          db.query(
            `select public.set_weekoff($1,(date_trunc('week',public.today())+interval '14 days')::date,false)`,
            [ep],
          ),
          /limit/,
        );
        await root();
        await db.query(
          `update public.profiles set fixed_off='{}'::integer[] where id=$1`,
          [ep],
        );
      },
    );
    await t.test(
      "week-off requests need manager approval and admin-only mode is enforced",
      async () => {
        await root();
        await db.exec(
          `update public.settings set workweek_days=5,weekoff_planning='request'`,
        );
        const day = `(date_trunc('week',public.today())+interval '21 days')::date`;
        await login(employee);
        await db.query(
          `select public.set_weekoff($1,${day},false,'Family commitment')`,
          [ep],
        );
        const request = (
          await db.query(
            `select id,status,reason from public.weekoffs where profile_id=$1 and day=${day}`,
            [ep],
          )
        ).rows[0];
        assert.equal(request.status, "pending");
        assert.equal(request.reason, "Family commitment");
        assert.equal(
          (
            await db.query(
              `select status from public.calendar($1,${day},${day})`,
              [ep],
            )
          ).rows[0].status,
          "upcoming",
        );
        await assert.rejects(
          db.query(`select public.review_weekoff($1,true,'ok')`, [
            request.id,
          ]),
          /Manager required/,
        );
        await login(manager);
        await db.query(`select public.review_weekoff($1,true,'Approved')`, [
          request.id,
        ]);
        assert.equal(
          (
            await db.query(
              `select status from public.weekoffs where id=$1`,
              [request.id],
            )
          ).rows[0].status,
          "approved",
        );
        assert.equal(
          (
            await db.query(
              `select status from public.calendar($1,${day},${day})`,
              [ep],
            )
          ).rows[0].status,
          "weekoff",
        );
        await root();
        await db.exec(`update public.settings set weekoff_planning='manager'`);
        await login(employee);
        await assert.rejects(
          db.query(
            `select public.set_weekoff($1,(date_trunc('week',public.today())+interval '22 days')::date,false)`,
            [ep],
          ),
          /administrator/,
        );
        await root();
        await db.exec(
          `update public.settings set weekoff_planning='employee',workweek_days=5`,
        );
      },
    );
    await t.test(
      "5.5-day workweek alternates one and two week-offs",
      async () => {
        await root();
        await db.exec(`update public.settings set workweek_days=5.5`);
        const limits = (
          await db.query(
            `select public.workweek_off_limit((date_trunc('week',public.today())+interval '7 days')::date) a,
                    public.workweek_off_limit((date_trunc('week',public.today())+interval '14 days')::date) b`,
          )
        ).rows[0];
        assert.deepEqual(
          [Number(limits.a), Number(limits.b)].sort((a, b) => a - b),
          [1, 2],
        );
        await db.exec(`update public.settings set workweek_days=5`);
      },
    );
    const type = (
      await db.query(`select id from public.leave_types where tag='CL'`)
    ).rows[0].id;
    let leave;
    await t.test(
      "pending leave reserves quota; manager approval and cancellation",
      async () => {
        await login(employee);
        leave = (
          await db.query(
            `select public.apply_leave($1,$2,public.today()+20,public.today()+20,false,'Family event') id`,
            [ep, type],
          )
        ).rows[0].id;
        const bal = (
          await db.query(
            `select * from public.leave_balance($1,extract(year from public.today()+20)::integer) where type_id=$2`,
            [ep, type],
          )
        ).rows[0];
        assert.equal(Number(bal.pending), 1);
        await assert.rejects(
          db.query(`select public.review_leave($1,true,'ok')`, [leave]),
          /Manager required/,
        );
        await assert.rejects(
          db.query(
            `select public.apply_leave($1,$2,public.today()+20,public.today()+20,false,'Duplicate')`,
            [ep, type],
          ),
          /Overlapping/,
        );
        await login(manager);
        await db.query(`select public.review_leave($1,true,'Approved')`, [
          leave,
        ]);
        assert.equal(
          (
            await db.query(
              `select status from public.calendar($1,public.today()+20,public.today()+20)`,
              [ep],
            )
          ).rows[0].status,
          "leave",
        );
        await login(employee);
        await db.query(`select public.cancel_leave($1)`, [leave]);
      },
    );
    await t.test(
      "regularization computes net work, late half-day and snapshots rules",
      async () => {
        await db.exec(
          `select public.request_correction(public.today()-2,((public.today()-2)::text||' 09:30+05:30')::timestamptz,((public.today()-2)::text||' 18:30+05:30')::timestamptz,60,'Forgot checkout')`,
        );
        const rid = (await db.query("select id from public.regularizations"))
          .rows[0].id;
        await login(manager);
        await db.query(`select public.review_correction($1,true,'Verified')`, [
          rid,
        ]);
        let c = (
          await db.query(
            `select * from public.calendar($1,public.today()-2,public.today()-2)`,
            [ep],
          )
        ).rows[0];
        assert.equal(c.work_minutes, 480);
        assert.equal(c.break_minutes, 60);
        assert.equal(c.status, "present");
        await db.exec(`update public.settings set full_minutes=600`);
        c = (
          await db.query(
            `select * from public.calendar($1,public.today()-2,public.today()-2)`,
            [ep],
          )
        ).rows[0];
        assert.equal(c.status, "present");
        await db.exec(`update public.settings set full_minutes=480`);
        await login(employee);
        await db.exec(
          `select public.request_correction(public.today()-1,((public.today()-1)::text||' 12:01+05:30')::timestamptz,((public.today()-1)::text||' 21:01+05:30')::timestamptz,60,'Missed punch')`,
        );
        const id = (
          await db.query(
            `select id from public.regularizations where status='pending'`,
          )
        ).rows[0].id;
        await login(manager);
        await db.query(`select public.review_correction($1,true,'Verified')`, [
          id,
        ]);
        assert.equal(
          (
            await db.query(
              `select status from public.calendar($1,public.today()-1,public.today()-1)`,
              [ep],
            )
          ).rows[0].status,
          "half_day",
        );
      },
    );
    await t.test(
      "partial regularization supports check-in, check-out and break corrections",
      async () => {
        const day = (await db.query("select (public.today()-3)::text d"))
          .rows[0].d;
        const inAt = `${day} 09:30+05:30`,
          outAt = `${day} 18:30+05:30`,
          breakStart = `${day} 13:00+05:30`,
          breakEnd = `${day} 14:00+05:30`;
        await login(employee);
        const checkIn = (
          await db.query(
            `select public.request_regularization(p_kind=>'check_in',p_day=>$1::date,p_in=>$2::timestamptz,p_reason=>'Missed check-in') id`,
            [day, inAt],
          )
        ).rows[0].id;
        await assert.rejects(
          db.query(
            `select public.request_regularization(p_kind=>'check_in',p_day=>$1::date,p_in=>$2::timestamptz,p_reason=>'Duplicate')`,
            [day, inAt],
          ),
          /already pending/,
        );
        await login(manager);
        await db.query(`select public.review_correction($1,true,'Verified')`, [
          checkIn,
        ]);
        let a = (
          await db.query(
            "select * from public.attendance where profile_id=$1 and day=$2",
            [ep, day],
          )
        ).rows[0];
        assert.ok(a.check_in);
        assert.equal(a.check_out, null);
        assert.equal(a.timezone, "Asia/Kolkata");
        await login(employee);
        const checkOut = (
          await db.query(
            `select public.request_regularization(p_kind=>'check_out',p_day=>$1::date,p_out=>$2::timestamptz,p_reason=>'Missed check-out') id`,
            [day, outAt],
          )
        ).rows[0].id;
        const breakFix = (
          await db.query(
            `select public.request_regularization(p_kind=>'break',p_day=>$1::date,p_break_start=>$2::timestamptz,p_break_end=>$3::timestamptz,p_replace_breaks=>true,p_reason=>'Break was not recorded') id`,
            [day, breakStart, breakEnd],
          )
        ).rows[0].id;
        assert.notEqual(checkOut, breakFix);
        await login(manager);
        await db.query(`select public.review_correction($1,true,'Verified')`, [
          checkOut,
        ]);
        await db.query(`select public.review_correction($1,true,'Verified')`, [
          breakFix,
        ]);
        const c = (
          await db.query(
            `select * from public.calendar($1,$2::date,$2::date)`,
            [ep, day],
          )
        ).rows[0];
        assert.equal(c.work_minutes, 480);
        assert.equal(c.break_minutes, 60);
        assert.equal(c.status, "present");
      },
    );
    await t.test(
      "last manager, audit immutability and account deactivation",
      async () => {
        await assert.rejects(
          db.query(`update public.profiles set active=false where id=$1`, [mp]),
          /last active manager/,
        );
        assert.ok(
          (await db.query("select * from public.audit_logs")).rows.length > 10,
        );
        await assert.rejects(
          db.exec("delete from public.audit_logs"),
          /permission denied/,
        );
        await db.query(`update public.profiles set active=false where id=$1`, [
          ep,
        ]);
        await login(employee);
        await assert.rejects(
          db.exec(`select public.punch('check_in')`),
          /Active account/,
        );
        assert.equal(
          (await db.query("select * from public.attendance")).rows.length,
          0,
        );
        await root();
      },
    );
  } finally {
    await db.close();
  }
});
