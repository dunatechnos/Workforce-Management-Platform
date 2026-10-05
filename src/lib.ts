import { createClient } from '@supabase/supabase-js'
import { useCallback, useEffect, useState } from 'react'

export type Row = Record<string, any>
export const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
export const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY
export const configured = Boolean(supabaseUrl?.startsWith('https://') && supabaseKey && !supabaseUrl.includes('YOUR_PROJECT') && !supabaseKey.includes('YOUR_SUPABASE'))
export const db = createClient(configured ? supabaseUrl : 'https://unconfigured.supabase.co', configured ? supabaseKey : 'unconfigured', { auth: { flowType: 'pkce', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } })
export async function result<T = Row[]>(query: PromiseLike<{data: T | null; error: any}>): Promise<T> {
 const {data,error}=await query; if(error) throw new Error(error.message); return data as T
}
export const rpc = <T = any>(name:string,args:Row={}) => result<T>(db.rpc(name,args))
export async function calendars(people:Row[],from:string,to:string){
 const rows:Row[]=[]
 for(let i=0;i<people.length;i+=5){const batch=await Promise.all(people.slice(i,i+5).map(async p=>(await rpc<Row[]>('calendar',{p_profile:p.id,p_from:from,p_to:to})).map(r=>({...r,profile_id:p.id,name:p.name,email:p.email,employee_code:p.employee_code,department:p.department}))));rows.push(...batch.flat())}
 return rows
}
export async function allRows(table:string, setup?:(q:any)=>any):Promise<Row[]> {
 const out:Row[]=[]
 for(let from=0;;from+=500){ let q:any=db.from(table).select('*').order('id'); if(setup) q=setup(q); const batch=await result<Row[]>(q.range(from,from+499)); out.push(...batch); if(batch.length<500)return out }
}
export function useData<T>(load:()=>Promise<T>,deps:unknown[]) {
 const [data,setData]=useState<T|null>(null),[error,setError]=useState(''),[loading,setLoading]=useState(true),[version,setVersion]=useState(0)
 useEffect(()=>{let alive=true;setLoading(true);setError('');setData(null);load().then(v=>{if(alive)setData(v)}).catch(e=>{if(alive)setError(e.message)}).finally(()=>{if(alive)setLoading(false)});return()=>{alive=false}},[...deps,version])
 return {data,error,loading,reload:useCallback(()=>setVersion(v=>v+1),[])}
}
export function today(){return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())}
export function addDays(s:string,n:number){const d=new Date(s+'T00:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10)}
export function monthRange(month:string){const [y,m]=month.split('-').map(Number);return [month+'-01',new Date(Date.UTC(y,m,0)).toISOString().slice(0,10)]}
export function displayDate(d:string){return new Intl.DateTimeFormat('en-IN',{day:'numeric',month:'short',year:'numeric',timeZone:'Asia/Kolkata'}).format(new Date(d.length===10?d+'T00:00:00+05:30':d))}
export function time(d?:string|null){return d?new Intl.DateTimeFormat('en-IN',{hour:'2-digit',minute:'2-digit',timeZone:'Asia/Kolkata'}).format(new Date(d)):'—'}
export function duration(m:number=0){m=Math.max(0,Math.floor(m));return `${Math.floor(m/60)}h ${String(m%60).padStart(2,'0')}m`}
export function initials(name:string){return name.split(' ').map(x=>x[0]).slice(0,2).join('').toUpperCase()}
export const labels:Record<string,string>={present:'Present',half_day:'Half day',absent:'Absent',leave:'On leave',half_leave:'Half-day leave',weekoff:'Week off',holiday:'Holiday',in_progress:'Working',missing_checkout:'Missing checkout',not_marked:'Not checked in',upcoming:'Upcoming',not_employed:'Not employed',pending:'Pending',approved:'Approved',rejected:'Rejected',cancelled:'Cancelled'}
export function summary(rows:Row[]) {
 let present=0,absent=0,leave=0,late=0,minutes=0,unresolved=0
 for(const r of rows.filter(r=>r.day<=today())){
  if(r.status==='present')present++
  if(r.status==='half_day'){present+=.5;absent+=.5}
  if(r.status==='absent')absent++
  if(r.status==='leave')leave++
  if(r.status==='half_leave'){leave+=.5;if(r.check_out && r.work_minutes>=(r.half_required??240))present+=.5;else absent+=.5}
  if(r.status==='missing_checkout')unresolved++
  if(r.late)late++
  if(r.check_out)minutes+=r.work_minutes
 }
 return {present,absent,leave,late,minutes,unresolved,rate:present+absent+leave?Math.round(present/(present+absent+leave)*100):0}
}
export function csv(name:string,rows:Row[]){
 if(!rows.length)throw new Error('No records to export')
 const keys=Object.keys(rows[0]);const cell=(x:any)=>{let s=String(x??'');if(/^[\s]*[=+\-@]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"'}
 const content='\uFEFF'+[keys.map(cell).join(','),...rows.map(r=>keys.map(k=>cell(r[k])).join(','))].join('\r\n')
 const href=URL.createObjectURL(new Blob([content],{type:'text/csv;charset=utf-8;'}));const a=document.createElement('a');a.href=href;a.download=name+'.csv';a.click();setTimeout(()=>URL.revokeObjectURL(href),1000)
}
