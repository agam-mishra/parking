// Demo data: one site, three staff logins and a realistic day in progress.
// Built through the real business functions so balances and shifts add up, then backdated.
export const DEMO_USERS = [
  { id: '00000000-0000-4000-a000-000000000001', phone: '9000000001', pin: '111111', role: 'super' },
  { id: '00000000-0000-4000-a000-000000000002', phone: '9000000002', pin: '222222', role: 'admin' },
  { id: '00000000-0000-4000-a000-000000000003', phone: '9000000003', pin: '333333', role: 'worker' },
] as const

export const DEMO_SEED = `
do $seed$
declare
  tz text := 'Asia/Kolkata';
  today date := (now() at time zone 'Asia/Kolkata')::date;
  tid uuid;
  auto_id uuid; car_id uuid; other_id uuid;
  sharma uuid; ravi uuid; priya uuid;
  sid uuid; pid uuid; d int; at timestamptz;
begin
  insert into auth.users (id, email, pin_hash) values
    ('${DEMO_USERS[0].id}', '9000000001@phone.local', auth.pin_hash('111111')),
    ('${DEMO_USERS[1].id}', '9000000002@phone.local', auth.pin_hash('222222')),
    ('${DEMO_USERS[2].id}', '9000000003@phone.local', auth.pin_hash('333333'));

  insert into profiles (id, tenant_id, role, name, phone)
  values ('${DEMO_USERS[0].id}', null, 'super', 'Super User', '9000000001');

  insert into tenants (name, address, phone, upi_id)
  values ('Demo Parking, Sector 5', 'Near Bus Stand', '9000000002', 'demoparking@upi')
  returning id into tid;
  insert into tenants (name, address, upi_id) values ('Railway Station Parking', 'Platform 1 Gate', 'stationpark@upi');

  insert into profiles (id, tenant_id, role, name, phone) values
    ('${DEMO_USERS[1].id}', tid, 'admin',  'Ramesh (Admin)',  '9000000002'),
    ('${DEMO_USERS[2].id}', tid, 'worker', 'Suresh (Worker)', '9000000003');

  select id into auto_id  from vehicle_types where tenant_id = tid and name_en = 'Auto';
  select id into car_id   from vehicle_types where tenant_id = tid and name_en = 'Car';
  select id into other_id from vehicle_types where tenant_id = tid and name_en = 'Other 4-wheeler';

  insert into rates (tenant_id, vehicle_type_id, plan, amount) values
    (tid, auto_id,  'day', 20), (tid, auto_id,  'night', 30), (tid, auto_id,  'full_day', 40),
    (tid, auto_id,  'weekly', 180), (tid, auto_id,  'monthly', 600),
    (tid, car_id,   'day', 40), (tid, car_id,   'night', 50), (tid, car_id,   'full_day', 80),
    (tid, car_id,   'weekly', 300), (tid, car_id,   'monthly', 1000),
    (tid, other_id, 'day', 50), (tid, other_id, 'night', 70), (tid, other_id, 'full_day', 100),
    (tid, other_id, 'weekly', 350), (tid, other_id, 'monthly', 1200);

  -- Customers (registered drivers)
  insert into customers (tenant_id, name, phone, id_type, id_number, consent_at, payment_type, credit_limit)
  values (tid, 'Sharma Transport', '9811111111', 'driving_licence', 'MH1220190012345', now(), 'monthly_khata', 5000)
  returning id into sharma;
  insert into customers (tenant_id, name, phone, id_type, id_number, consent_at)
  values (tid, 'Ravi Kumar', '9822222222', 'aadhaar', '4821', now()) returning id into ravi;
  insert into customers (tenant_id, name, phone, id_type, id_number, consent_at)
  values (tid, 'Priya Auto Service', '9833333333', 'voter_id', 'UPV1234567', now()) returning id into priya;

  insert into vehicles (tenant_id, reg_no, vehicle_type_id, customer_id) values
    (tid, 'MH12TR7777', other_id, sharma),
    (tid, 'MH12TR8888', other_id, sharma),
    (tid, 'DL8CAF4321', car_id, ravi),
    (tid, 'UP32AT1122', auto_id, priya);
  -- Sharma gets a lower night rate for all trucks
  insert into special_rates (tenant_id, customer_id, plan, amount) values (tid, sharma, 'night', 55);

  -- Everything below is done "as" the worker through the real functions.
  perform set_config('request.jwt.claims', '{"sub":"${DEMO_USERS[2].id}","role":"authenticated"}', false);

  -- Sharma: six past nights on khata, and one part payment
  for d in 1..6 loop
    sid := (vehicle_in(case when d % 2 = 0 then 'MH12TR7777' else 'MH12TR8888' end, null, 'night') ->> 'session_id')::uuid;
    perform vehicle_out(sid, 0);
    at := ((today - d) + time '21:30') at time zone tz;
    update parking_sessions set entry_at = at, exit_at = at + interval '10 hours' where id = sid;
    update ledger_entries set created_at = at + interval '10 hours' where session_id = sid;
  end loop;
  pid := (khata_payment(sharma, 150, 'upi', '558213') ->> 'payment_id')::uuid;
  update payments set created_at = ((today - 3) + time '11:00') at time zone tz where id = pid;
  update ledger_entries set created_at = ((today - 3) + time '11:00') at time zone tz where payment_id = pid;

  -- Ravi: monthly pass that ends in 2 days
  pid := (create_pass((select id from vehicles where reg_no = 'DL8CAF4321'), 'monthly', today, 'cash') ->> 'pass_id')::uuid;
  update passes set start_date = today - 27, end_date = today + 2 where id = pid;
  update payments set created_at = ((today - 27) + time '10:00') at time zone tz where pass_id = pid;

  -- Priya: weekly pass, currently parked
  perform create_pass((select id from vehicles where reg_no = 'UP32AT1122'), 'weekly', today, 'upi', '771045');
  sid := (vehicle_in('UP32AT1122', null, 'day') ->> 'session_id')::uuid;
  update parking_sessions set entry_at = now() - interval '2 hours' where id = sid;

  -- Walk-ins currently inside
  sid := (vehicle_in('UP32AB1234', car_id, 'night', 'cash') ->> 'session_id')::uuid;      -- came last night, now overstaying
  update parking_sessions set entry_at = ((today - 1) + time '21:00') at time zone tz where id = sid;
  sid := (vehicle_in('DL1RT5566', auto_id, 'day') ->> 'session_id')::uuid;                -- pays at exit
  update parking_sessions set entry_at = now() - interval '3 hours' where id = sid;
  sid := (vehicle_in('HR26DK8899', other_id, 'full_day', 'cash') ->> 'session_id')::uuid; -- 30 hours, one extra day due
  update parking_sessions set entry_at = now() - interval '30 hours' where id = sid;
  sid := (vehicle_in('MH12TR7777', null, 'night') ->> 'session_id')::uuid;                -- khata truck inside
  update parking_sessions set entry_at = now() - interval '5 hours' where id = sid;

  -- Finished earlier today
  sid := (vehicle_in('KA05MN2020', car_id, 'day') ->> 'session_id')::uuid;
  perform vehicle_out(sid, 40, 'cash');
  update parking_sessions set entry_at = now() - interval '6 hours', exit_at = now() - interval '1 hour' where id = sid;
  sid := (vehicle_in('UP14BX3030', auto_id, 'day') ->> 'session_id')::uuid;
  perform vehicle_out(sid, 20, 'upi', '901122');
  update parking_sessions set entry_at = now() - interval '4 hours', exit_at = now() - interval '2 hours' where id = sid;

  perform set_config('request.jwt.claims', '', false);
end
$seed$;
`
