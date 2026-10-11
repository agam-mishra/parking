import { PGlite, type Transaction } from '@electric-sql/pglite'
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto'
import { DEMO_SEED } from './seed'

// Demo mode: a real Postgres (PGlite, WebAssembly) inside the browser, running the same
// migrations as Supabase. Each visitor gets their own copy, saved in IndexedDB.

const migrations = import.meta.glob('./migrations/*.sql', { query: '?raw', import: 'default', eager: true }) as Record<string, string>

// Bump to force every visitor's demo database to be rebuilt.
const DB_VERSION = `v1-${Object.keys(migrations).length}`
const DB_NAME = 'idb://parking-demo'

// Minimal stand-ins for what Supabase provides: API roles and auth.uid().
const SHIM = `
create role anon nologin;
create role authenticated nologin;
create schema auth;
create table auth.users (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  pin_hash text not null,
  banned boolean not null default false
);
create function auth.uid() returns uuid language sql stable as
  $$ select (nullif(current_setting('request.jwt.claims', true), '')::json->>'sub')::uuid $$;
grant usage on schema public, auth to anon, authenticated;
alter default privileges in schema public grant all on tables to anon, authenticated;
create function auth.pin_hash(pin text) returns text language sql immutable as
  $$ select encode(sha256(convert_to('parking-demo:' || pin, 'UTF8')), 'hex') $$;
`

const WIPE = `
drop schema if exists auth cascade;
drop schema if exists public cascade;
create schema public;
grant usage, create on schema public to public;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    drop owned by authenticated cascade; drop role authenticated;
  end if;
  if exists (select 1 from pg_roles where rolname = 'anon') then
    drop owned by anon cascade; drop role anon;
  end if;
end $$;
`

let dbPromise: Promise<PGlite> | null = null

async function open(): Promise<PGlite> {
  const db = await PGlite.create(DB_NAME, { extensions: { pgcrypto } })
  const meta = await db.query<{ ok: boolean }>(`select to_regclass('public.demo_meta') is not null as ok`)
  const version = meta.rows[0].ok ? (await db.query<{ version: string }>('select version from demo_meta')).rows[0]?.version : null
  if (version !== DB_VERSION) await rebuild(db)
  return db
}

async function rebuild(db: PGlite) {
  await db.exec(WIPE)
  await db.exec(SHIM)
  for (const file of Object.keys(migrations).sort()) await db.exec(migrations[file])
  await db.exec(DEMO_SEED)
  await db.exec(`create table demo_meta (version text); insert into demo_meta values ('${DB_VERSION}');`)
  await db.syncToFs()
}

export function getDb() {
  dbPromise ??= open()
  return dbPromise
}

export async function resetDemo() {
  await rebuild(await getDb())
}

// Run queries as a signed-in user, with RLS applied exactly as on Supabase.
export async function asUser<T>(uid: string | null, fn: (tx: Transaction) => Promise<T>): Promise<T> {
  const db = await getDb()
  const result = await db.transaction(async (tx) => {
    await tx.query(`select set_config('request.jwt.claims', $1, true)`, [uid ? JSON.stringify({ sub: uid, role: 'authenticated' }) : ''])
    await tx.exec(`set local role ${uid ? 'authenticated' : 'anon'}`)
    return fn(tx)
  })
  // Queries inside a transaction don't persist on their own; flush to IndexedDB.
  await db.syncToFs()
  return result
}

// Run as the database owner (used for login and staff-account management).
export async function asOwner<T>(fn: (tx: Transaction) => Promise<T>): Promise<T> {
  const db = await getDb()
  const result = await db.transaction(fn)
  await db.syncToFs()
  return result
}
