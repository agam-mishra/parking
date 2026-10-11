-- Parking system: core schema.
-- Money-affecting writes (sessions, passes, payments, ledger) happen only through
-- the security-definer functions in the next migration; clients get read access via RLS.

create extension if not exists pgcrypto;

-- ───────────────────────── enums ─────────────────────────
create type app_role      as enum ('super', 'admin', 'worker');
create type plan_type     as enum ('day', 'night', 'full_day', 'weekly', 'monthly');
create type session_plan  as enum ('day', 'night', 'full_day', 'pass');
create type payment_type  as enum ('entry', 'exit', 'weekly_khata', 'monthly_khata');
create type pay_method    as enum ('cash', 'upi');
create type id_proof_type as enum ('none', 'aadhaar', 'driving_licence', 'voter_id', 'other');
create type payment_kind  as enum ('session_entry', 'session_exit', 'pass', 'khata');
create type ledger_kind   as enum ('charge', 'payment', 'adjustment');
create type session_status as enum ('inside', 'exited', 'cancelled');
create type rate_source   as enum ('standard', 'special_customer', 'special_vehicle', 'pass');

-- ───────────────────────── tables ─────────────────────────
create table tenants (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  address     text,
  phone       text,
  upi_id      text,
  timezone    text not null default 'Asia/Kolkata',
  -- Day slot = day_start → night_start, Night slot = night_start → next day_start.
  day_start   time not null default '09:00',
  night_start time not null default '20:00',
  grace_minutes int not null default 30 check (grace_minutes between 0 and 240),
  -- How walk-in (unregistered) vehicles pay, per plan.
  walkin_pay_day      payment_type not null default 'exit'  check (walkin_pay_day in ('entry','exit')),
  walkin_pay_night    payment_type not null default 'entry' check (walkin_pay_night in ('entry','exit')),
  walkin_pay_full_day payment_type not null default 'entry' check (walkin_pay_full_day in ('entry','exit')),
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

create table profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  tenant_id  uuid references tenants(id),
  role       app_role not null,
  name       text not null,
  phone      text not null unique,
  active     boolean not null default true,
  created_at timestamptz not null default now(),
  check ((role = 'super') = (tenant_id is null))
);

create table vehicle_types (
  id        uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  name_en   text not null,
  name_hi   text not null,
  icon      text not null default '🚗',
  sort      int not null default 0,
  active    boolean not null default true
);

create table rates (
  tenant_id       uuid not null references tenants(id) on delete cascade,
  vehicle_type_id uuid not null references vehicle_types(id) on delete cascade,
  plan            plan_type not null,
  amount          numeric(10,2) not null check (amount >= 0),
  updated_at      timestamptz not null default now(),
  updated_by      uuid references profiles(id),
  primary key (vehicle_type_id, plan)
);

create table customers (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references tenants(id) on delete cascade,
  name         text not null,
  phone        text not null,
  id_type      id_proof_type not null default 'none',
  -- For Aadhaar only the last 4 digits may be stored (Aadhaar Act / DPDP).
  id_number    text,
  consent_at   timestamptz,
  payment_type payment_type not null default 'entry',
  credit_limit numeric(10,2) check (credit_limit is null or credit_limit >= 0),
  notes        text,
  active       boolean not null default true,
  created_by   uuid references profiles(id),
  created_at   timestamptz not null default now(),
  check (id_type <> 'aadhaar' or id_number ~ '^[0-9]{4}$'),
  check (id_type <> 'none' or id_number is null)
);
create index on customers (tenant_id, phone);

create table vehicles (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references tenants(id) on delete cascade,
  customer_id     uuid references customers(id),
  reg_no          text not null check (reg_no ~ '^[A-Z0-9]{3,12}$'),
  vehicle_type_id uuid not null references vehicle_types(id),
  created_at      timestamptz not null default now(),
  unique (tenant_id, reg_no)
);
create index on vehicles (customer_id);

create table special_rates (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references tenants(id) on delete cascade,
  customer_id uuid references customers(id) on delete cascade,
  vehicle_id  uuid references vehicles(id) on delete cascade,
  plan        plan_type not null,
  amount      numeric(10,2) not null check (amount >= 0),
  set_by      uuid references profiles(id),
  created_at  timestamptz not null default now(),
  check ((customer_id is null) <> (vehicle_id is null))
);
create unique index on special_rates (customer_id, plan) where customer_id is not null;
create unique index on special_rates (vehicle_id, plan)  where vehicle_id  is not null;

create table shifts (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references tenants(id),
  worker_id     uuid not null references profiles(id),
  started_at    timestamptz not null default now(),
  ended_at      timestamptz,
  cash_expected numeric(10,2),
  upi_expected  numeric(10,2),
  cash_declared numeric(10,2),
  note          text
);
create unique index one_open_shift on shifts (worker_id) where ended_at is null;

create table passes (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references tenants(id),
  vehicle_id  uuid not null references vehicles(id),
  plan        plan_type not null check (plan in ('weekly','monthly')),
  start_date  date not null,
  end_date    date not null check (end_date >= start_date),
  amount      numeric(10,2) not null,
  rate_source rate_source not null,
  cancelled_at timestamptz,
  created_by  uuid references profiles(id),
  created_at  timestamptz not null default now()
);
create index on passes (vehicle_id, end_date);

create table parking_sessions (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references tenants(id),
  vehicle_id      uuid not null references vehicles(id),
  plan            session_plan not null,
  pass_id         uuid references passes(id),
  payment_type    payment_type not null,   -- snapshot at entry
  rate_source     rate_source not null,
  entry_at        timestamptz not null default now(),
  exit_at         timestamptz,
  base_amount     numeric(10,2) not null,
  overstay_amount numeric(10,2) not null default 0,
  status          session_status not null default 'inside',
  entry_by        uuid references profiles(id),
  exit_by         uuid references profiles(id)
);
create unique index one_inside_per_vehicle on parking_sessions (vehicle_id) where status = 'inside';
create index on parking_sessions (tenant_id, entry_at desc);

create table payments (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references tenants(id),
  kind          payment_kind not null,
  amount        numeric(10,2) not null check (amount > 0),
  method        pay_method not null,
  upi_ref       text,
  session_id    uuid references parking_sessions(id),
  pass_id       uuid references passes(id),
  customer_id   uuid references customers(id),
  shift_id      uuid references shifts(id),
  collected_by  uuid not null references profiles(id),
  created_at    timestamptz not null default now(),
  cancelled_at  timestamptz,
  cancelled_by  uuid references profiles(id),
  cancel_reason text
);
create index on payments (tenant_id, created_at desc);
create index on payments (shift_id);

-- Khata: balance = sum(amount). Charges are positive, payments negative.
create table ledger_entries (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references tenants(id),
  customer_id uuid not null references customers(id),
  kind        ledger_kind not null,
  amount      numeric(10,2) not null check (amount <> 0),
  session_id  uuid references parking_sessions(id),
  pass_id     uuid references passes(id),
  payment_id  uuid references payments(id),
  note        text,
  created_by  uuid references profiles(id),
  created_at  timestamptz not null default now()
);
create index on ledger_entries (customer_id, created_at);

create table audit_log (
  id        bigint generated always as identity primary key,
  tenant_id uuid references tenants(id),
  user_id   uuid,
  action    text not null,
  entity_id uuid,
  details   jsonb,
  at        timestamptz not null default now()
);
create index on audit_log (tenant_id, at desc);

-- ───────────────────────── auth helpers ─────────────────────────
create or replace function my_role() returns app_role
language sql stable security definer set search_path = public as $$
  select role from profiles where id = auth.uid() and active
$$;

create or replace function my_tenant() returns uuid
language sql stable security definer set search_path = public as $$
  select p.tenant_id from profiles p
  left join tenants t on t.id = p.tenant_id
  where p.id = auth.uid() and p.active and coalesce(t.active, true)
$$;

create or replace function is_super() returns boolean
language sql stable as $$ select coalesce(my_role() = 'super', false) $$;

create or replace function is_admin_of(t uuid) returns boolean
language sql stable as $$ select is_super() or (my_role() = 'admin' and my_tenant() = t) $$;

create or replace function is_member_of(t uuid) returns boolean
language sql stable as $$ select is_super() or my_tenant() = t $$;

-- ───────────────────────── RLS ─────────────────────────
alter table tenants          enable row level security;
alter table profiles         enable row level security;
alter table vehicle_types    enable row level security;
alter table rates            enable row level security;
alter table customers        enable row level security;
alter table vehicles         enable row level security;
alter table special_rates    enable row level security;
alter table shifts           enable row level security;
alter table passes           enable row level security;
alter table parking_sessions enable row level security;
alter table payments         enable row level security;
alter table ledger_entries   enable row level security;
alter table audit_log        enable row level security;

create policy tenants_read   on tenants for select using (is_member_of(id));
create policy tenants_super  on tenants for all using (is_super()) with check (is_super());
create policy tenants_admin  on tenants for update using (is_admin_of(id)) with check (is_admin_of(id));

create policy profiles_read on profiles for select
  using (id = auth.uid() or is_admin_of(tenant_id) or is_super());
-- profiles are written only by the manage-users edge function (service role).

create policy vt_read  on vehicle_types for select using (is_member_of(tenant_id));
create policy vt_write on vehicle_types for all using (is_admin_of(tenant_id)) with check (is_admin_of(tenant_id));

create policy rates_read  on rates for select using (is_member_of(tenant_id));
create policy rates_write on rates for all using (is_admin_of(tenant_id)) with check (is_admin_of(tenant_id));

create policy sr_read  on special_rates for select using (is_member_of(tenant_id));
create policy sr_write on special_rates for all using (is_admin_of(tenant_id)) with check (is_admin_of(tenant_id));

-- Workers may register and edit customers/vehicles; a trigger stops them changing billing fields.
create policy cust_read   on customers for select using (is_member_of(tenant_id));
create policy cust_insert on customers for insert with check (is_member_of(tenant_id));
create policy cust_update on customers for update using (is_member_of(tenant_id)) with check (is_member_of(tenant_id));

create policy veh_read   on vehicles for select using (is_member_of(tenant_id));
create policy veh_insert on vehicles for insert with check (is_member_of(tenant_id));
create policy veh_update on vehicles for update using (is_member_of(tenant_id)) with check (is_member_of(tenant_id));

create policy shifts_read on shifts for select using (worker_id = auth.uid() or is_admin_of(tenant_id));

create policy passes_read   on passes           for select using (is_member_of(tenant_id));
create policy sessions_read on parking_sessions for select using (is_member_of(tenant_id));
create policy payments_read on payments         for select using (is_member_of(tenant_id));
create policy ledger_read   on ledger_entries   for select using (is_member_of(tenant_id));
create policy audit_read    on audit_log        for select using (is_admin_of(tenant_id));

-- ───────────────────────── triggers ─────────────────────────
create or replace function guard_customer_billing() returns trigger
language plpgsql as $$
begin
  if my_role() = 'worker' then
    if tg_op = 'INSERT' then
      new.payment_type := 'entry';
      new.credit_limit := null;
    elsif new.payment_type is distinct from old.payment_type
       or new.credit_limit is distinct from old.credit_limit then
      raise exception 'ONLY_ADMIN_CAN_CHANGE_BILLING';
    end if;
  end if;
  if tg_op = 'INSERT' then
    new.created_by := auth.uid();
  end if;
  return new;
end $$;
create trigger customers_guard before insert or update on customers
  for each row execute function guard_customer_billing();

create or replace function normalize_reg_no() returns trigger
language plpgsql as $$
begin
  new.reg_no := upper(regexp_replace(new.reg_no, '[^A-Za-z0-9]', '', 'g'));
  return new;
end $$;
create trigger vehicles_normalize before insert or update on vehicles
  for each row execute function normalize_reg_no();

create or replace function seed_vehicle_types() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into vehicle_types (tenant_id, name_en, name_hi, icon, sort) values
    (new.id, 'Auto',            'ऑटो',          '🛺', 1),
    (new.id, 'Car',             'कार',           '🚗', 2),
    (new.id, 'Other 4-wheeler', 'अन्य चार पहिया', '🚐', 3);
  return new;
end $$;
create trigger tenants_seed_types after insert on tenants
  for each row execute function seed_vehicle_types();

-- ───────────────────────── views ─────────────────────────
create view customer_balances with (security_invoker = true) as
  select c.id as customer_id, c.tenant_id, c.name, c.phone, c.payment_type, c.credit_limit,
         coalesce(sum(l.amount), 0)::numeric(10,2) as balance,
         max(l.created_at) filter (where l.kind = 'payment') as last_payment_at
  from customers c
  left join ledger_entries l on l.customer_id = c.id
  group by c.id;
