import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import type { Session } from '@supabase/supabase-js'
import { Activity, LayoutDashboard, CalendarDays, Coffee, FileCheck2, Users, Settings2, BarChart3, ShieldCheck, LogOut, Menu, X, CheckCircle2, RefreshCw, Palmtree, ArrowRight, Mail } from 'lucide-react'
import { allRows, configured, db, displayDate, initials, result, supabaseKey, supabaseUrl, today, type Row } from './lib'
import { Context } from './context'
import { ErrorBox, Loading } from './ui'
import { Dashboard, Attendance, Leaves, Weekoffs, Corrections } from './employee'
import { Employees, Approvals, Holidays, Settings, Audit, Balances } from './manager'
import { Analytics } from './reports'

const nav=[['dashboard','Overview',LayoutDashboard],['attendance','Attendance',CalendarDays],['leaves','Leave requests',Palmtree],['weekoffs','Week offs',Coffee],['corrections','Regularization',FileCheck2],['holidays','Holiday calendar',CalendarDays],['reports','Analytics & reports',BarChart3]] as const
const adminNav=[['approvals','Approval inbox',FileCheck2],['employees','People',Users],['balances','Leave balances',Palmtree],['settings','Organization settings',Settings2],['audit','Audit trail',ShieldCheck]] as const
const titles:Record<string,string>={dashboard:'A little clarity. A better workday.',attendance:'Your days, at a glance.',leaves:'Make time for life.',weekoffs:'Plan your downtime.',corrections:'Keep every hour accurate.',holidays:'Good days ahead.',reports:'Turn time into insight.',approvals:'A clear queue. A happy team.',employees:'The people behind the work.',balances:'Leave, in balance.',settings:'Make it work your way.',audit:'Every change, accounted for.'}
function friendlyAuth(m:string){
 if(/email not confirmed/i.test(m))return 'Email not confirmed yet — click the link in your inbox, then sign in.'
 if(/invalid login credentials/i.test(m))return 'Wrong email or password. New here? Create your account below.'
 if(/user already registered/i.test(m))return 'This email already has an account. Just sign in.'
 if(/signups? not allowed|sign ups? (are )?disabled|new user signups/i.test(m))return 'Ask your manager to add your email first, then create your account.'
 if(/password/i.test(m)&&/short|length|weak/i.test(m))return 'Password must be at least 6 characters.'
 return m
}
function LoginPanel({googleOn}:{googleOn:boolean}){
 const [mode,setMode]=useState<'in'|'up'>('in')
 const [name,setName]=useState(''),[email,setEmail]=useState(''),[password,setPassword]=useState('')
 const [busy,setBusy]=useState(false),[info,setInfo]=useState(''),[err,setErr]=useState('')
 async function submit(e:React.FormEvent){e.preventDefault();setBusy(true);setErr('');setInfo('')
  try{
   const em=email.trim().toLowerCase()
   if(mode==='up'){
    if(!name.trim())throw new Error('Please enter your full name.')
    const {data,error}=await db.auth.signUp({email:em,password,options:{data:{full_name:name.trim()},emailRedirectTo:location.origin}})
    if(error)throw error
    if(!data.session)setInfo('Account created. If email confirmation is on, check your inbox for the link, then sign in.')
   }else{
    const {error}=await db.auth.signInWithPassword({email:em,password})
    if(error)throw error
   }
  }catch(e:any){setErr(friendlyAuth(e.message))}finally{setBusy(false)}
 }
 async function google(){setBusy(true);setErr('');try{const {error}=await db.auth.signInWithOAuth({provider:'google',options:{redirectTo:location.origin,queryParams:{prompt:'select_account'}}});if(error)throw error}catch(e:any){setErr(friendlyAuth(e.message))}finally{setBusy(false)}}
 return <><div className="segmented auth-toggle"><button type="button" className={mode==='in'?'selected':''} onClick={()=>{setMode('in');setErr('');setInfo('')}}>Sign in</button><button type="button" className={mode==='up'?'selected':''} onClick={()=>{setMode('up');setErr('');setInfo('')}}>Create account</button></div>
 <form onSubmit={submit} className="auth-form">{mode==='up'&&<label>Full name<input required value={name} onChange={e=>setName(e.target.value)} placeholder="e.g. Keshav Sharma" autoComplete="name"/> </label>}<label>Company email<input required type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@company.com" autoComplete="email"/></label><label>Password<input required type="password" minLength={6} value={password} onChange={e=>setPassword(e.target.value)} placeholder={mode==='up'?'Choose a password (min 6 characters)':'Your password'} autoComplete={mode==='up'?'new-password':'current-password'}/></label>{err&&<ErrorBox error={err}/>}{info&&<div className="info-strip"><CheckCircle2 size={18}/><p>{info}</p></div>}<button disabled={busy} type="submit">{busy?(mode==='up'?'Creating account…':'Signing in…'):(mode==='up'?'Create account':'Sign in')}<ArrowRight size={18}/></button></form>
 {googleOn&&<><div className="or-divider"><span>or</span></div><button className="google" disabled={busy} onClick={google}><Mail size={21}/>Continue with Google<ArrowRight size={18}/></button></>}</>
}
export default function App(){
 const [session,setSession]=useState<Session|null>(null),[boot,setBoot]=useState(true),[profile,setProfile]=useState<Row|null>(null),[settings,setSettings]=useState<Row|null>(null),[people,setPeople]=useState<Row[]>([]),[error,setError]=useState('')
 const [page,setPage]=useState('dashboard'),[mobile,setMobile]=useState(false),[version,setVersion]=useState(0),[busy,setBusy]=useState(false),[toast,setToast]=useState<{text:string;error?:boolean}|null>(null),[googleOn,setGoogleOn]=useState(false)
 useEffect(()=>{
  if(!configured){setBoot(false);return}
  const {data:{subscription}}=db.auth.onAuthStateChange((_event,s)=>{setSession(s);setBoot(false)})
  db.auth.getSession().then(({data,error})=>{if(error)setError(error.message);setSession(data.session);setBoot(false)}).catch(e=>{setError(e.message);setBoot(false)})
  const p=new URLSearchParams(location.search),h=new URLSearchParams(location.hash.slice(1));const e=p.get('error_description')||h.get('error_description');if(e)setError(e)
  fetch(`${supabaseUrl}/auth/v1/settings`,{headers:{apikey:supabaseKey}}).then(r=>r.json()).then(j=>setGoogleOn(Boolean(j?.external?.google))).catch(()=>{})
  return()=>subscription.unsubscribe()
 },[])
 useEffect(()=>{let alive=true;if(!session){setProfile(null);setSettings(null);setPeople([]);return}
  result<Row>(db.from('profiles').select('*').eq('user_id',session.user.id).single()).then(async p=>{
    if(!alive)return;setProfile(p);if(!p.active)return
    const [s,ps]=await Promise.all([result<Row>(db.from('settings').select('*').single()),p.role==='manager'?allRows('profiles'):Promise.resolve([p])]);if(alive){setSettings(s);setPeople(ps.sort((a,b)=>a.name.localeCompare(b.name)));setError('')}
  }).catch(e=>{if(alive)setError(e.message)});return()=>{alive=false}
 },[session?.user.id,version])
 useEffect(()=>{if(toast){const t=setTimeout(()=>setToast(null),6000);return()=>clearTimeout(t)}},[toast])
 async function act(job:()=>Promise<any>,message='Saved successfully'){if(busy)return false;setBusy(true);try{await job();setToast({text:message});setVersion(v=>v+1);return true}catch(e:any){setToast({text:e.message,error:true});return false}finally{setBusy(false)}}
 const refresh=()=>setVersion(v=>v+1)
 const navigate=(id:string)=>{setPage(id);setMobile(false)}
 const signOut=()=>act(async()=>{const {error}=await db.auth.signOut();if(error)throw error;setPage('dashboard');setProfile(null);setSettings(null)},'Signed out')
 if(boot)return <div className="full-center"><Loading/></div>
 if(!session)return <div className="login"><div className="login-story"><div className="brand"><div className="brand-mark"><Activity size={24}/></div>hv<span>attendance</span></div><div className="story-body"><span className="eyebrow light">MORE THAN A CLOCK-IN</span><h1>Good work starts<br/>with a great day.</h1><p>One calm space for your time, your team,<br/>and everything in between.</p><div className="story-card"><span className="live-dot"/> Everything in rhythm<div className="mini-bars">{[45,72,58,90,68,100,82,94,65,86,76,98].map((h,i)=><i key={i} style={{height:h}}/>)}</div><div className="story-card-foot"><span>Your team’s time, made clear.</span><ArrowRight size={18}/></div></div></div><small>Thoughtfully built for a better workday.</small></div><div className="login-form"><div className="login-box"><span className="eyebrow">YOUR WORKDAY, SIMPLIFIED</span><h2>Welcome to HV.</h2><p>Sign in with your company email<br/>to make the most of today.</p>{error&&<ErrorBox error={error}/>} {!configured?<div className="setup-box"><h3>Connect your workspace</h3><p>Add your Supabase URL and public key to <code>.env</code>, then restart the dev server.</p><ol><li>Run <code>supabase/schema.sql</code></li><li>Set your bootstrap manager email</li><li>Follow the steps in <code>README.md</code></li></ol></div>:<LoginPanel googleOn={googleOn}/>}<div className="login-note"><ShieldCheck size={17}/> Company accounts · Secure sign-in</div></div><small className="login-footer">HV Attendance • Built around your people</small></div></div>
 if(error&&!settings)return <div className="full-center"><div className="panel padded"><h2>Workspace setup needs attention</h2><ErrorBox error={error} retry={refresh}/><p>Check schema setup and your profile in Supabase. See README.md.</p><button onClick={signOut}>Sign out</button></div></div>
 if(profile&&!profile.active)return <div className="full-center"><div className="panel padded"><h2>Account deactivated</h2><p>Please contact your manager to restore access.</p><button onClick={signOut}>Sign out</button></div></div>
 if(!profile||!settings)return <div className="full-center"><Loading/></div>
 const manager=profile.role==='manager'
 const content:Record<string,React.ReactNode>={dashboard:<Dashboard/>,attendance:<Attendance/>,leaves:<Leaves/>,weekoffs:<Weekoffs/>,corrections:<Corrections/>,holidays:<Holidays/>,reports:<Analytics/>,approvals:<Approvals/>,employees:<Employees/>,balances:<Balances/>,settings:<Settings/>,audit:<Audit/>}
 return <Context.Provider value={{profile,settings,people,version,busy,refresh,act,navigate}}><div className="app-shell">
  {mobile&&<div className="scrim" onClick={()=>setMobile(false)}/>}
  <aside className={mobile?'sidebar open':'sidebar'}><div className="brand"><div className="brand-mark"><Activity size={22}/></div>hv<span>attendance</span></div><div className="workspace"><span className="workspace-icon">{initials(settings.company_name)}</span><div><strong>{settings.company_name}</strong><small>People workspace</small></div></div><span className="nav-caption">WORKSPACE</span><nav>{nav.map(([id,label,Icon])=><button className={page===id?'nav-item active':'nav-item'} key={id} onClick={()=>navigate(id)}><Icon size={19}/>{label}{page===id&&<i/>}</button>)}</nav>{manager&&<><span className="nav-caption">MANAGEMENT</span><nav>{adminNav.map(([id,label,Icon])=><button className={page===id?'nav-item active':'nav-item'} key={id} onClick={()=>navigate(id)}><Icon size={19}/>{label}</button>)}</nav></>}<div className="sidebar-bottom"><div className="avatar">{initials(profile.name)}</div><div><strong>{profile.name}</strong><small>{manager?'Manager':'Employee'}</small></div><button className="icon-btn" onClick={signOut} aria-label="Sign out"><LogOut size={18}/></button></div></aside>
  <div className="main-shell"><header className="topbar"><div className="row"><button className="icon-btn mobile-toggle" onClick={()=>setMobile(!mobile)} aria-label="Open navigation"><Menu/></button><span className="breadcrumb">Workspace <span>/</span> <strong>{[...nav,...adminNav].find(n=>n[0]===page)?.[1]}</strong></span></div><div className="row"><span className="top-date">{displayDate(today())} <span className="muted">· IST</span></span><button className="icon-btn" aria-label="Refresh data" onClick={refresh}><RefreshCw size={17}/></button><div className="avatar small">{initials(profile.name)}</div></div></header><main><div className="page-heading"><div><span className="eyebrow">{page==='dashboard'?`HELLO, ${profile.name.split(' ')[0].toUpperCase()}`:'HV WORKSPACE'}</span><h1>{titles[page]}</h1><p>{page==='dashboard'?'Here’s what your workday looks like. Let’s make it count.':'A little less admin. A little more focus.'}</p></div><span className="workspace-badge"><span className="live-dot"/>{manager?'Manager workspace':'Employee workspace'}</span></div>{error&&<ErrorBox error={error} retry={refresh}/>}<div key={page}>{!manager&&adminNav.some(x=>x[0]===page)?<Dashboard/>:content[page]}</div><footer className="page-footer">HV Attendance <span>All times in India Standard Time (UTC+05:30)</span></footer></main></div>
  {toast&&createPortal(<div className={`toast ${toast.error?'toast-error':''}`} role={toast.error?'alert':'status'}>{toast.error?<X size={19}/>:<CheckCircle2 size={19}/>}<span>{toast.text}</span><button className="icon-btn" onClick={()=>setToast(null)} aria-label="Dismiss notification"><X size={15}/></button></div>,document.querySelector('dialog[open]')??document.body)}
 </div></Context.Provider>
}
