import type { Transaction } from '@electric-sql/pglite'
import { asOwner, asUser } from './db'

// A small stand-in for the parts of supabase-js the app uses, backed by the in-browser
// database. Queries run as the signed-in user, so RLS and the business functions behave
// exactly as they do on Supabase.

type Row = Record<string, unknown>
interface Result<T = unknown> { data: T | null; error: { message: string } | null }
interface Session { access_token: string; user: { id: string } }

const SESSION_KEY = 'demo-session'
const ident = (s: string) => {
  if (!/^[a-z_][a-z0-9_]*$/.test(s)) throw new Error(`bad identifier ${s}`)
  return `"${s}"`
}
const fail = (e: unknown): Result<never> => ({ data: null, error: { message: (e as Error)?.message ?? String(e) } })

function loadSession(): Session | null {
  try { return JSON.parse(localStorage.getItem(SESSION_KEY) ?? 'null') } catch { return null }
}
let session: Session | null = loadSession()
const listeners = new Set<(event: string, s: Session | null) => void>()
function setSession(s: Session | null) {
  session = s
  try { s ? localStorage.setItem(SESSION_KEY, JSON.stringify(s)) : localStorage.removeItem(SESSION_KEY) } catch { /* private */ }
  listeners.forEach((l) => l(s ? 'SIGNED_IN' : 'SIGNED_OUT', s))
}
const uid = () => session?.user.id ?? null

// Rows come back as JSON so numbers, dates and enums look like PostgREST output.
async function jsonRows(tx: Transaction, sql: string, params: unknown[]): Promise<Row[]> {
  const r = await tx.query<{ j: Row[] }>(`select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) as j from (${sql}) x`, params)
  return r.rows[0].j
}

class Query implements PromiseLike<Result> {
  private op: 'select' | 'insert' | 'update' | 'upsert' | 'delete' = 'select'
  private cols = '*'
  private returning = false
  private filters: { col: string; op: string; val: unknown }[] = []
  private orders: { col: string; asc: boolean }[] = []
  private payload: Row[] = []
  private conflict: string[] = []
  private mode: 'many' | 'single' | 'maybe' = 'many'
  private table: string

  constructor(table: string) { this.table = table }

  select(cols = '*') {
    if (this.op === 'select') this.cols = cols
    else { this.returning = true; this.cols = cols }
    return this
  }
  insert(rows: Row | Row[]) { this.op = 'insert'; this.payload = Array.isArray(rows) ? rows : [rows]; return this }
  upsert(rows: Row | Row[], opts?: { onConflict?: string }) {
    this.op = 'upsert'
    this.payload = Array.isArray(rows) ? rows : [rows]
    this.conflict = (opts?.onConflict ?? 'id').split(',').map((s) => s.trim())
    return this
  }
  update(patch: Row) { this.op = 'update'; this.payload = [patch]; return this }
  delete() { this.op = 'delete'; return this }
  eq(col: string, val: unknown) { this.filters.push({ col, op: '=', val }); return this }
  gte(col: string, val: unknown) { this.filters.push({ col, op: '>=', val }); return this }
  lt(col: string, val: unknown) { this.filters.push({ col, op: '<', val }); return this }
  order(col: string, opts?: { ascending?: boolean }) { this.orders.push({ col, asc: opts?.ascending ?? true }); return this }
  single() { this.mode = 'single'; return this }
  maybeSingle() { this.mode = 'maybe'; return this }

  private where(params: unknown[]) {
    if (!this.filters.length) return ''
    return ' where ' + this.filters.map((f) => {
      params.push(f.val)
      return `${ident(f.col)} ${f.op} $${params.length}`
    }).join(' and ')
  }

  private colList() {
    return this.cols === '*' ? '*' : this.cols.split(',').map((c) => ident(c.trim())).join(', ')
  }

  // Build a values list; each value is cast to the target column's type via json.
  private valuesSql(params: unknown[]) {
    const keys = [...new Set(this.payload.flatMap((r) => Object.keys(r)))]
    params.push(JSON.stringify(this.payload))
    const src = `jsonb_populate_recordset(null::${ident(this.table)}, $${params.length}::jsonb)`
    return { keys, sql: `select ${keys.map(ident).join(', ')} from ${src}` }
  }

  private async run(tx: Transaction): Promise<Row[]> {
    const params: unknown[] = []
    const t = ident(this.table)
    if (this.op === 'select') {
      let sql = `select ${this.colList()} from ${t}${this.where(params)}`
      if (this.orders.length) sql += ' order by ' + this.orders.map((o) => `${ident(o.col)} ${o.asc ? 'asc' : 'desc'}`).join(', ')
      return jsonRows(tx, sql, params)
    }
    const ret = this.returning ? ` returning ${this.colList()}` : ''
    if (this.op === 'delete') {
      await tx.query(`delete from ${t}${this.where(params)}`, params)
      return []
    }
    if (this.op === 'update') {
      const patch = this.payload[0]
      const keys = Object.keys(patch)
      params.push(JSON.stringify(patch))
      const src = `jsonb_populate_record(null::${t}, $${params.length}::jsonb)`
      const set = keys.map((k) => `${ident(k)} = (${src}).${ident(k)}`).join(', ')
      const sql = `update ${t} set ${set}${this.where(params)}${ret}`
      return this.returning ? jsonRows(tx, `with r as (${sql}) select * from r`, params) : (await tx.query(sql, params), [])
    }
    const { keys, sql: values } = this.valuesSql(params)
    let sql = `insert into ${t} (${keys.map(ident).join(', ')}) ${values}`
    if (this.op === 'upsert') {
      const upd = keys.filter((k) => !this.conflict.includes(k))
      sql += ` on conflict (${this.conflict.map(ident).join(', ')}) do update set ${upd.map((k) => `${ident(k)} = excluded.${ident(k)}`).join(', ')}`
    }
    sql += ret
    return this.returning ? jsonRows(tx, `with r as (${sql}) select * from r`, params) : (await tx.query(sql, params), [])
  }

  async exec(): Promise<Result> {
    try {
      const rows = await asUser(uid(), (tx) => this.run(tx))
      if (this.mode === 'many') return { data: rows, error: null }
      if (rows.length > 1 || (this.mode === 'single' && rows.length === 0)) return fail(new Error('JSON object requested, multiple (or no) rows returned'))
      return { data: rows[0] ?? null, error: null }
    } catch (e) {
      return fail(e)
    }
  }

  then<A = Result, B = never>(ok?: ((v: Result) => A | PromiseLike<A>) | null, err?: ((e: unknown) => B | PromiseLike<B>) | null) {
    return this.exec().then(ok, err)
  }
}

async function rpc(fn: string, args: Record<string, unknown> = {}): Promise<Result> {
  try {
    const keys = Object.keys(args)
    const params = keys.map((k) => args[k])
    const call = `${ident(fn)}(${keys.map((k, i) => `${ident(k)} => $${i + 1}`).join(', ')})`
    const data = await asUser(uid(), async (tx) => {
      // ::text works for every return type, including void (which to_jsonb rejects).
      const r = await tx.query<{ r: string | null }>(`select (${call})::text as r`, params)
      const text = r.rows[0].r
      if (text === null || text === '') return null
      try { return JSON.parse(text) } catch { return text }
    })
    return { data, error: null }
  } catch (e) {
    return fail(e)
  }
}

// Same rules as supabase/functions/manage-users: super manages anyone, admins only their workers.
async function manageUsers(body: Row): Promise<Result> {
  try {
    const me = uid()
    const data = await asOwner(async (tx) => {
      const caller = (await tx.query<Row>(`select * from profiles where id = $1 and active`, [me])).rows[0]
      if (!caller || caller.role === 'worker') throw new Error('NOT_ALLOWED')
      if (body.action === 'create') {
        const { tenant_id, role, name, phone, pin } = body as Record<string, string>
        if (!/^\d{10}$/.test(phone ?? '') || !/^\d{6}$/.test(pin ?? '') || !name?.trim() || !['admin', 'worker'].includes(role)) throw new Error('BAD_INPUT')
        if (caller.role === 'admin' && (role !== 'worker' || tenant_id !== caller.tenant_id)) throw new Error('NOT_ALLOWED')
        if ((await tx.query(`select 1 from profiles where phone = $1`, [phone])).rows.length) throw new Error('PHONE_TAKEN')
        const u = await tx.query<{ id: string }>(
          `insert into auth.users (email, pin_hash) values ($1, auth.pin_hash($2)) returning id`, [`${phone}@phone.local`, pin])
        await tx.query(`insert into profiles (id, tenant_id, role, name, phone) values ($1, $2, $3, $4, $5)`,
          [u.rows[0].id, tenant_id, role, name.trim(), phone])
        return { id: u.rows[0].id }
      }
      if (body.action === 'update') {
        const target = (await tx.query<Row>(`select * from profiles where id = $1`, [body.user_id])).rows[0]
        if (!target || target.role === 'super') throw new Error('NOT_ALLOWED')
        if (caller.role === 'admin' && (target.role !== 'worker' || target.tenant_id !== caller.tenant_id)) throw new Error('NOT_ALLOWED')
        if (body.pin !== undefined) {
          if (!/^\d{6}$/.test(String(body.pin))) throw new Error('BAD_INPUT')
          await tx.query(`update auth.users set pin_hash = auth.pin_hash($2) where id = $1`, [body.user_id, body.pin])
        }
        if (body.active !== undefined) {
          await tx.query(`update auth.users set banned = $2 where id = $1`, [body.user_id, !body.active])
          await tx.query(`update profiles set active = $2 where id = $1`, [body.user_id, !!body.active])
        }
        if (typeof body.name === 'string' && body.name.trim()) {
          await tx.query(`update profiles set name = $2 where id = $1`, [body.user_id, body.name.trim()])
        }
        return { ok: true }
      }
      throw new Error('BAD_INPUT')
    })
    return { data, error: null }
  } catch (e) {
    // Shape the error like supabase-js FunctionsHttpError so manageUsers() can read the code.
    const code = (e as Error).message
    return { data: null, error: Object.assign(new Error(code), { context: new Response(JSON.stringify({ error: code })) }) }
  }
}

export const demoClient = {
  from: (table: string) => new Query(table),
  rpc,
  functions: {
    invoke: (name: string, opts: { body: Row }) =>
      name === 'manage-users' ? manageUsers(opts.body) : Promise.resolve(fail(new Error('Function not found'))),
  },
  auth: {
    getSession: async () => ({ data: { session }, error: null }),
    onAuthStateChange: (cb: (event: string, s: Session | null) => void) => {
      listeners.add(cb)
      return { data: { subscription: { unsubscribe: () => listeners.delete(cb) } } }
    },
    signInWithPassword: async ({ email, password }: { email: string; password: string }) => {
      try {
        const r = await asOwner((tx) => tx.query<{ id: string }>(
          `select u.id from auth.users u join profiles p on p.id = u.id
            where u.email = $1 and u.pin_hash = auth.pin_hash($2) and not u.banned and p.active`, [email, password]))
        if (!r.rows.length) return { data: { session: null }, error: { message: 'Invalid login credentials' } }
        const s = { access_token: 'demo', user: { id: r.rows[0].id } }
        setSession(s)
        return { data: { session: s }, error: null }
      } catch (e) {
        return { data: { session: null }, error: fail(e).error }
      }
    },
    signOut: async () => { setSession(null); return { error: null } },
  },
}
