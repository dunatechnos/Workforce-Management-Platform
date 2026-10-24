// One-shot schema apply + settings seed. Reads DATABASE_URL from env (never commit it).
// Usage: $env:DATABASE_URL="postgresql://postgres:PASSWORD@db.<ref>.supabase.co:5432/postgres"; npm run db:apply
import { readFile } from 'node:fs/promises'
import { Client } from 'pg'

const { DATABASE_URL, BOOTSTRAP_EMAIL, ALLOWED_DOMAINS, COMPANY_NAME } = process.env
if (!DATABASE_URL) throw new Error('Set DATABASE_URL env var first')
const client = new Client({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } })
await client.connect()
try {
  await client.query(await readFile(new URL('./schema.sql', import.meta.url), 'utf8'))
  console.log('SCHEMA APPLIED')
  if (BOOTSTRAP_EMAIL) {
    const domains = (ALLOWED_DOMAINS ?? '').split(',').map(d => d.trim().toLowerCase().replace(/^@/, '')).filter(Boolean)
    await client.query(
      `update public.settings set bootstrap_email=$1, allowed_domains=$2, company_name=$3`,
      [BOOTSTRAP_EMAIL.toLowerCase(), domains, COMPANY_NAME || ''],
    )
    console.log('SETTINGS SEEDED')
  }
  const settings = (await client.query('select company_name, bootstrap_email, allowed_domains from public.settings')).rows[0]
  console.log('SETTINGS:', JSON.stringify(settings))
  const tables = (await client.query(`select count(*)::int n from information_schema.tables where table_schema='public'`)).rows[0]
  console.log('PUBLIC TABLES:', tables.n)
} finally {
  await client.end()
}
