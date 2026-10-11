-- Parking system: business logic.
-- Every function that moves money computes the amount itself; the client never sends a price.
-- Errors are raised as short UPPER_CASE codes that the app translates.

alter table tenants add constraint day_night_differ check (day_start <> night_start);

-- Admins may edit their site's details but not switch it on/off.
create or replace function guard_tenant_update() returns trigger
language plpgsql as $$
begin
  if not is_super() and new.active is distinct from old.active then
    raise exception 'ONLY_SUPER_CAN_CHANGE';
  end if;
  return new;
end $$;
create trigger tenants_guard before update on tenants
  for each row execute function guard_tenant_update();

-- Log when a vehicle is linked to a customer (khata abuse would show up here).
create or replace function log_vehicle_link() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.customer_id is distinct from old.customer_id then
    insert into audit_log (tenant_id, user_id, action, entity_id, details)
    values (new.tenant_id, auth.uid(), 'vehicle_linked', new.id,
            jsonb_build_object('from', old.customer_id, 'to', new.customer_id));
  end if;
  return new;
end $$;
create trigger vehicles_link_log after update on vehicles
  for each row execute function log_vehicle_link();

-- ───────────────────────── internal helpers ─────────────────────────

-- First instant strictly after ts where the local clock reads t.
create or replace function next_at(ts timestamptz, t time, tz text) returns timestamptz
language sql immutable as $$
  select case when (ts at time zone tz)::time < t
    then (((ts at time zone tz)::date) + t) at time zone tz
    else (((ts at time zone tz)::date + 1) + t) at time zone tz end
$$;

create or replace function local_today(p_tenant uuid) returns date
language sql stable security definer set search_path = public as $$
  select (now() at time zone timezone)::date from tenants where id = p_tenant
$$;

create or replace function require_member() returns uuid
language plpgsql stable security definer set search_path = public as $$
declare t uuid := my_tenant();
begin
  if t is null then raise exception 'NOT_ALLOWED'; end if;
  return t;
end $$;

create or replace function require_admin() returns uuid
language plpgsql stable security definer set search_path = public as $$
declare t uuid := my_tenant();
begin
  if t is null or my_role() <> 'admin' then raise exception 'NOT_ALLOWED'; end if;
  return t;
end $$;

-- Price for a vehicle: special (vehicle) → special (customer) → standard.
create or replace function resolve_rate(p_vehicle uuid, p_plan plan_type,
  out amount numeric, out source rate_source)
language plpgsql stable security definer set search_path = public as $$
declare v vehicles;
begin
  select * into v from vehicles where id = p_vehicle;
  select s.amount, 'special_vehicle' into amount, source
    from special_rates s where s.vehicle_id = v.id and s.plan = p_plan;
  if amount is null and v.customer_id is not null then
    select s.amount, 'special_customer' into amount, source
      from special_rates s where s.customer_id = v.customer_id and s.plan = p_plan;
  end if;
  if amount is null then
    select r.amount, 'standard' into amount, source
      from rates r where r.vehicle_type_id = v.vehicle_type_id and r.plan = p_plan;
  end if;
  if amount is null then raise exception 'PRICE_NOT_SET'; end if;
end $$;

create or replace function vehicle_payment_type(p_vehicle uuid, p_plan session_plan) returns payment_type
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select c.payment_type from vehicles v join customers c on c.id = v.customer_id
      where v.id = p_vehicle and c.active),
    (select case p_plan when 'day' then t.walkin_pay_day
                        when 'night' then t.walkin_pay_night
                        else t.walkin_pay_full_day end
       from vehicles v join tenants t on t.id = v.tenant_id where v.id = p_vehicle))
$$;

create or replace function active_pass(p_vehicle uuid) returns passes
language sql stable security definer set search_path = public as $$
  select p.* from passes p
  where p.vehicle_id = p_vehicle and p.cancelled_at is null
    and local_today(p.tenant_id) between p.start_date and p.end_date
  order by p.end_date desc limit 1
$$;

create or replace function customer_balance(p_customer uuid) returns numeric
language sql stable security definer set search_path = public as $$
  select coalesce(sum(amount), 0) from ledger_entries where customer_id = p_customer
$$;

-- Total owed for a session if the vehicle leaves at p_exit.
-- Day/Night: the chosen slot is covered by base_amount; every further slot the vehicle
-- is still inside for (beyond grace) is charged at that slot's rate.
-- Full day: charged per started 24h, after grace.
create or replace function session_total(p_session uuid, p_exit timestamptz) returns numeric
language plpgsql stable security definer set search_path = public as $$
declare
  s parking_sessions; t tenants;
  grace interval; cur timestamptz; total numeric; n int := 0;
  day_rate numeric; night_rate numeric;
begin
  select * into s from parking_sessions where id = p_session;
  select * into t from tenants where id = s.tenant_id;
  grace := make_interval(mins => t.grace_minutes);

  if s.plan = 'pass' then return 0; end if;

  if s.plan = 'full_day' then
    return s.base_amount * greatest(1,
      ceil(extract(epoch from (p_exit - s.entry_at - grace)) / 86400.0));
  end if;

  total := s.base_amount;
  cur := case s.plan when 'night' then next_at(s.entry_at, t.day_start, t.timezone)
                     else next_at(s.entry_at, t.night_start, t.timezone) end;
  while p_exit > cur + grace loop
    n := n + 1;
    if n > 1000 then raise exception 'SESSION_TOO_LONG'; end if;
    if (cur at time zone t.timezone)::time = t.day_start then
      if day_rate is null then day_rate := (resolve_rate(s.vehicle_id, 'day')).amount; end if;
      total := total + day_rate;
      cur := next_at(cur, t.night_start, t.timezone);
    else
      if night_rate is null then night_rate := (resolve_rate(s.vehicle_id, 'night')).amount; end if;
      total := total + night_rate;
      cur := next_at(cur, t.day_start, t.timezone);
    end if;
  end loop;
  return total;
end $$;

-- Open shift for the caller, creating one if needed.
create or replace function ensure_shift() returns uuid
language plpgsql security definer set search_path = public as $$
declare sid uuid;
begin
  select id into sid from shifts where worker_id = auth.uid() and ended_at is null;
  if sid is null then
    insert into shifts (tenant_id, worker_id) values (require_member(), auth.uid())
    returning id into sid;
  end if;
  return sid;
end $$;

create or replace function take_payment(p_kind payment_kind, p_amount numeric,
  p_method pay_method, p_upi_ref text,
  p_session uuid default null, p_pass uuid default null, p_customer uuid default null)
returns uuid
language plpgsql security definer set search_path = public as $$
declare pid uuid;
begin
  if p_method is null then raise exception 'PAYMENT_METHOD_REQUIRED'; end if;
  insert into payments (tenant_id, kind, amount, method, upi_ref, session_id, pass_id,
                        customer_id, shift_id, collected_by)
  values (require_member(), p_kind, p_amount, p_method, nullif(trim(p_upi_ref), ''),
          p_session, p_pass, p_customer, ensure_shift(), auth.uid())
  returning id into pid;
  return pid;
end $$;

create or replace function check_credit(p_customer uuid) returns void
language plpgsql stable security definer set search_path = public as $$
declare lim numeric;
begin
  select credit_limit into lim from customers where id = p_customer;
  if lim is not null and customer_balance(p_customer) >= lim then
    raise exception 'CREDIT_LIMIT';
  end if;
end $$;

create or replace function norm_reg(p text) returns text
language sql immutable as $$ select upper(regexp_replace(coalesce(p, ''), '[^A-Za-z0-9]', '', 'g')) $$;

-- ───────────────────────── API: lookups ─────────────────────────

-- Everything the worker needs to know about a vehicle number.
create or replace function lookup_vehicle(p_reg text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  tid uuid := require_member();
  v vehicles; c customers; p passes; s parking_sessions; prices jsonb := '{}';
  pl plan_type; r record;
begin
  select * into v from vehicles where tenant_id = tid and reg_no = norm_reg(p_reg);
  if v.id is null then
    return jsonb_build_object('found', false, 'reg_no', norm_reg(p_reg));
  end if;
  select * into c from customers where id = v.customer_id;
  p := active_pass(v.id);
  select * into s from parking_sessions where vehicle_id = v.id and status = 'inside';
  foreach pl in array enum_range(null::plan_type) loop
    begin
      select * into r from resolve_rate(v.id, pl);
      prices := prices || jsonb_build_object(pl::text, jsonb_build_object('amount', r.amount, 'source', r.source));
    exception when others then null;
    end;
  end loop;
  return jsonb_build_object(
    'found', true,
    'vehicle', to_jsonb(v),
    'customer', case when c.id is null then null else
      to_jsonb(c) || jsonb_build_object('balance', customer_balance(c.id)) end,
    'pass', case when p.id is null then null else to_jsonb(p) end,
    'next_pass_start', (select max(end_date) + 1 from passes
                        where vehicle_id = v.id and cancelled_at is null
                          and end_date >= local_today(tid)),
    'session', case when s.id is null then null else to_jsonb(s) end,
    'prices', prices,
    'pay_day', vehicle_payment_type(v.id, 'day'),
    'pay_night', vehicle_payment_type(v.id, 'night'),
    'pay_full_day', vehicle_payment_type(v.id, 'full_day'));
end $$;

-- ───────────────────────── API: vehicle in / out ─────────────────────────

create or replace function vehicle_in(p_reg text, p_vehicle_type uuid, p_plan session_plan,
  p_method pay_method default null, p_upi_ref text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  tid uuid := require_member();
  v vehicles; p passes; ptype payment_type; rate record; sid uuid; paid numeric := 0;
  cust uuid;
begin
  if p_plan = 'pass' then raise exception 'BAD_PLAN'; end if;
  if norm_reg(p_reg) !~ '^[A-Z0-9]{3,12}$' then raise exception 'BAD_REG_NO'; end if;
  select * into v from vehicles where tenant_id = tid and reg_no = norm_reg(p_reg);
  if v.id is null then
    if not exists (select 1 from vehicle_types where id = p_vehicle_type and tenant_id = tid and active) then
      raise exception 'VEHICLE_TYPE_REQUIRED';
    end if;
    insert into vehicles (tenant_id, reg_no, vehicle_type_id)
    values (tid, p_reg, p_vehicle_type) returning * into v;
  end if;
  if exists (select 1 from parking_sessions where vehicle_id = v.id and status = 'inside') then
    raise exception 'ALREADY_INSIDE';
  end if;

  p := active_pass(v.id);
  ptype := vehicle_payment_type(v.id, p_plan);
  cust := v.customer_id;

  if p.id is not null then
    insert into parking_sessions (tenant_id, vehicle_id, plan, pass_id, payment_type, rate_source,
                                  base_amount, entry_by)
    values (tid, v.id, 'pass', p.id, ptype, 'pass', 0, auth.uid()) returning id into sid;
  else
    if ptype in ('weekly_khata', 'monthly_khata') then perform check_credit(cust); end if;
    select * into rate from resolve_rate(v.id, p_plan::text::plan_type);
    insert into parking_sessions (tenant_id, vehicle_id, plan, payment_type, rate_source,
                                  base_amount, entry_by)
    values (tid, v.id, p_plan, ptype, rate.source, rate.amount, auth.uid()) returning id into sid;
    if ptype = 'entry' and rate.amount > 0 then
      perform take_payment('session_entry', rate.amount, p_method, p_upi_ref, p_session => sid);
      paid := rate.amount;
    end if;
  end if;

  return jsonb_build_object('session_id', sid, 'reg_no', v.reg_no, 'paid', paid,
                            'payment_type', ptype, 'on_pass', p.id is not null);
end $$;

create or replace function exit_preview(p_session uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  tid uuid := require_member();
  s parking_sessions; total numeric; paid numeric;
begin
  select * into s from parking_sessions where id = p_session and tenant_id = tid;
  if s.id is null or s.status <> 'inside' then raise exception 'NOT_INSIDE'; end if;
  total := session_total(s.id, now());
  select coalesce(sum(amount), 0) into paid from payments
    where session_id = s.id and cancelled_at is null;
  return jsonb_build_object(
    'session_id', s.id, 'plan', s.plan, 'entry_at', s.entry_at, 'now', now(),
    'payment_type', s.payment_type, 'base', s.base_amount, 'total', total,
    'overstay', total - s.base_amount, 'paid', paid,
    'due_now', case when s.payment_type in ('entry', 'exit') then greatest(total - paid, 0) else 0 end,
    'to_khata', case when s.payment_type in ('weekly_khata', 'monthly_khata') then total else 0 end);
end $$;

-- p_expected_due is what the worker was shown; if the price moved on (e.g. crossed into a new
-- slot while they were talking) we refuse so they can re-check with the driver.
create or replace function vehicle_out(p_session uuid, p_expected_due numeric,
  p_method pay_method default null, p_upi_ref text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  pv jsonb; s parking_sessions; cust uuid; due numeric; total numeric;
begin
  -- Lock first so two workers can't check the same vehicle out twice.
  select * into s from parking_sessions where id = p_session and tenant_id = require_member() for update;
  pv := exit_preview(p_session);
  due := (pv->>'due_now')::numeric;
  total := (pv->>'total')::numeric;
  if due <> coalesce(p_expected_due, -1) then raise exception 'AMOUNT_CHANGED'; end if;
  if due > 0 then
    perform take_payment('session_exit', due, p_method, p_upi_ref, p_session => s.id);
  end if;
  if (pv->>'to_khata')::numeric > 0 then
    select customer_id into cust from vehicles where id = s.vehicle_id;
    insert into ledger_entries (tenant_id, customer_id, kind, amount, session_id, created_by)
    values (s.tenant_id, cust, 'charge', total, s.id, auth.uid());
  end if;
  update parking_sessions
     set status = 'exited', exit_at = (pv->>'now')::timestamptz,
         overstay_amount = total - base_amount, exit_by = auth.uid()
   where id = s.id;
  return pv || jsonb_build_object('collected', due);
end $$;

-- Workers may undo their own mistaken entry within 10 minutes if nothing was paid.
create or replace function cancel_session(p_session uuid, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare tid uuid := require_member(); s parking_sessions;
begin
  select * into s from parking_sessions where id = p_session and tenant_id = tid;
  if s.id is null or s.status <> 'inside' then raise exception 'NOT_INSIDE'; end if;
  if my_role() <> 'admin' then
    if s.entry_by <> auth.uid() or s.entry_at < now() - interval '10 minutes'
       or exists (select 1 from payments where session_id = s.id and cancelled_at is null) then
      raise exception 'ASK_ADMIN';
    end if;
  end if;
  update parking_sessions set status = 'cancelled', exit_at = now(), exit_by = auth.uid()
   where id = s.id;
  insert into audit_log (tenant_id, user_id, action, entity_id, details)
  values (tid, auth.uid(), 'session_cancelled', s.id, jsonb_build_object('reason', p_reason));
end $$;

-- ───────────────────────── API: passes ─────────────────────────

create or replace function create_pass(p_vehicle uuid, p_plan plan_type, p_start date,
  p_method pay_method default null, p_upi_ref text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  tid uuid := require_member();
  v vehicles; c customers; rate record; e date; pid uuid;
begin
  if p_plan not in ('weekly', 'monthly') then raise exception 'BAD_PLAN'; end if;
  select * into v from vehicles where id = p_vehicle and tenant_id = tid;
  select * into c from customers where id = v.customer_id and active;
  if c.id is null then raise exception 'CUSTOMER_REQUIRED'; end if;
  if p_start < local_today(tid) - 7 then raise exception 'START_TOO_OLD'; end if;
  e := case p_plan when 'weekly' then p_start + 6
                   else (p_start + interval '1 month' - interval '1 day')::date end;
  if exists (select 1 from passes where vehicle_id = v.id and cancelled_at is null
              and daterange(start_date, end_date, '[]') && daterange(p_start, e, '[]')) then
    raise exception 'PASS_OVERLAP';
  end if;
  select * into rate from resolve_rate(v.id, p_plan);
  if c.payment_type in ('weekly_khata', 'monthly_khata') then perform check_credit(c.id); end if;

  insert into passes (tenant_id, vehicle_id, plan, start_date, end_date, amount, rate_source, created_by)
  values (tid, v.id, p_plan, p_start, e, rate.amount, rate.source, auth.uid()) returning id into pid;

  if c.payment_type in ('weekly_khata', 'monthly_khata') then
    insert into ledger_entries (tenant_id, customer_id, kind, amount, pass_id, created_by)
    values (tid, c.id, 'charge', rate.amount, pid, auth.uid());
  elsif rate.amount > 0 then
    perform take_payment('pass', rate.amount, p_method, p_upi_ref, p_pass => pid, p_customer => c.id);
  end if;

  return jsonb_build_object('pass_id', pid, 'start_date', p_start, 'end_date', e,
                            'amount', rate.amount, 'payment_type', c.payment_type);
end $$;

create or replace function cancel_pass(p_pass uuid, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare tid uuid := require_admin();
begin
  update passes set cancelled_at = now() where id = p_pass and tenant_id = tid and cancelled_at is null;
  if not found then raise exception 'NOT_FOUND'; end if;
  insert into audit_log (tenant_id, user_id, action, entity_id, details)
  values (tid, auth.uid(), 'pass_cancelled', p_pass, jsonb_build_object('reason', p_reason));
end $$;

-- ───────────────────────── API: khata ─────────────────────────

create or replace function khata_payment(p_customer uuid, p_amount numeric,
  p_method pay_method, p_upi_ref text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare tid uuid := require_member(); pid uuid;
begin
  if not exists (select 1 from customers where id = p_customer and tenant_id = tid) then
    raise exception 'NOT_FOUND';
  end if;
  if coalesce(p_amount, 0) <= 0 then raise exception 'BAD_AMOUNT'; end if;
  pid := take_payment('khata', p_amount, p_method, p_upi_ref, p_customer => p_customer);
  insert into ledger_entries (tenant_id, customer_id, kind, amount, payment_id, created_by)
  values (tid, p_customer, 'payment', -p_amount, pid, auth.uid());
  return jsonb_build_object('payment_id', pid, 'balance', customer_balance(p_customer));
end $$;

create or replace function khata_adjust(p_customer uuid, p_amount numeric, p_note text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare tid uuid := require_admin();
begin
  if not exists (select 1 from customers where id = p_customer and tenant_id = tid) then
    raise exception 'NOT_FOUND';
  end if;
  if coalesce(p_amount, 0) = 0 or coalesce(trim(p_note), '') = '' then raise exception 'BAD_AMOUNT'; end if;
  insert into ledger_entries (tenant_id, customer_id, kind, amount, note, created_by)
  values (tid, p_customer, 'adjustment', p_amount, p_note, auth.uid());
  return jsonb_build_object('balance', customer_balance(p_customer));
end $$;

-- ───────────────────────── API: admin corrections ─────────────────────────

create or replace function cancel_payment(p_payment uuid, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare tid uuid := require_admin(); pm payments;
begin
  if coalesce(trim(p_reason), '') = '' then raise exception 'REASON_REQUIRED'; end if;
  select * into pm from payments where id = p_payment and tenant_id = tid and cancelled_at is null;
  if pm.id is null then raise exception 'NOT_FOUND'; end if;
  update payments set cancelled_at = now(), cancelled_by = auth.uid(), cancel_reason = p_reason
   where id = pm.id;
  if pm.kind = 'khata' then
    insert into ledger_entries (tenant_id, customer_id, kind, amount, payment_id, note, created_by)
    values (tid, pm.customer_id, 'adjustment', pm.amount, pm.id, 'Payment cancelled: ' || p_reason, auth.uid());
  end if;
  insert into audit_log (tenant_id, user_id, action, entity_id, details)
  values (tid, auth.uid(), 'payment_cancelled', pm.id,
          jsonb_build_object('reason', p_reason, 'amount', pm.amount));
end $$;

-- ───────────────────────── API: shifts ─────────────────────────

create or replace function shift_totals(p_shift uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'cash', coalesce(sum(amount) filter (where method = 'cash'), 0),
    'upi',  coalesce(sum(amount) filter (where method = 'upi'), 0),
    'count', count(*))
  from payments where shift_id = p_shift and cancelled_at is null
$$;

create or replace function my_shift() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare s shifts;
begin
  select * into s from shifts where worker_id = auth.uid() and ended_at is null;
  if s.id is null then return null; end if;
  return to_jsonb(s) || shift_totals(s.id);
end $$;

create or replace function close_shift(p_cash_declared numeric, p_note text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare s shifts; tot jsonb;
begin
  select * into s from shifts where worker_id = auth.uid() and ended_at is null for update;
  if s.id is null then raise exception 'NO_OPEN_SHIFT'; end if;
  if p_cash_declared is null or p_cash_declared < 0 then raise exception 'BAD_AMOUNT'; end if;
  tot := shift_totals(s.id);
  update shifts set ended_at = now(), cash_expected = (tot->>'cash')::numeric,
         upi_expected = (tot->>'upi')::numeric, cash_declared = p_cash_declared, note = p_note
   where id = s.id;
  return tot || jsonb_build_object('cash_declared', p_cash_declared,
                                   'difference', p_cash_declared - (tot->>'cash')::numeric);
end $$;

-- ───────────────────────── API: admin dashboard ─────────────────────────

create or replace function dashboard(p_tenant uuid default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  tid uuid := coalesce(p_tenant, my_tenant());
  tz text; day_from timestamptz; today date;
begin
  if tid is null or not is_admin_of(tid) then raise exception 'NOT_ALLOWED'; end if;
  select timezone into tz from tenants where id = tid;
  today := local_today(tid);
  day_from := today::timestamp at time zone tz;
  return jsonb_build_object(
    'today_cash', (select coalesce(sum(amount), 0) from payments
                    where tenant_id = tid and cancelled_at is null and method = 'cash' and created_at >= day_from),
    'today_upi',  (select coalesce(sum(amount), 0) from payments
                    where tenant_id = tid and cancelled_at is null and method = 'upi' and created_at >= day_from),
    'today_entries', (select count(*) from parking_sessions
                       where tenant_id = tid and status <> 'cancelled' and entry_at >= day_from),
    'inside_now', (select count(*) from parking_sessions where tenant_id = tid and status = 'inside'),
    'khata_outstanding', (select coalesce(sum(amount), 0) from ledger_entries where tenant_id = tid),
    'passes_expiring', (select count(*) from passes where tenant_id = tid and cancelled_at is null
                         and end_date between today and today + 3),
    'open_shifts', (select count(*) from shifts where tenant_id = tid and ended_at is null));
end $$;

-- ───────────────────────── grants ─────────────────────────
-- Internal helpers are not callable from the API; public ones only by signed-in users.
revoke execute on all functions in schema public from public, anon, authenticated;

grant execute on function
  my_role(), my_tenant(), is_super(), is_admin_of(uuid), is_member_of(uuid),
  lookup_vehicle(text),
  vehicle_in(text, uuid, session_plan, pay_method, text),
  exit_preview(uuid),
  vehicle_out(uuid, numeric, pay_method, text),
  cancel_session(uuid, text),
  create_pass(uuid, plan_type, date, pay_method, text),
  cancel_pass(uuid, text),
  khata_payment(uuid, numeric, pay_method, text),
  khata_adjust(uuid, numeric, text),
  cancel_payment(uuid, text),
  my_shift(), close_shift(numeric, text),
  dashboard(uuid),
  -- used inside RLS policies / triggers / views, so the caller needs execute:
  guard_customer_billing(), normalize_reg_no(), guard_tenant_update(), customer_balance(uuid)
to authenticated;

alter default privileges in schema public revoke execute on functions from public, anon, authenticated;
