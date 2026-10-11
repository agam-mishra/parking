-- Flat views for the "Inside now" and "Payments" screens, so clients don't need nested
-- relation queries. security_invoker keeps the underlying tables' RLS in force.

create view inside_vehicles with (security_invoker = true) as
  select s.id, s.tenant_id, s.plan, s.entry_at, s.payment_type, v.reg_no
  from parking_sessions s
  join vehicles v on v.id = s.vehicle_id
  where s.status = 'inside';

create view payment_list with (security_invoker = true) as
  select p.id, p.tenant_id, p.kind, p.amount, p.method, p.upi_ref, p.created_at,
         p.cancelled_at, p.cancel_reason,
         pr.name as collected_by_name,
         coalesce(sv.reg_no, pv.reg_no) as reg_no,
         c.name as customer_name
  from payments p
  left join profiles pr on pr.id = p.collected_by
  left join parking_sessions s on s.id = p.session_id
  left join vehicles sv on sv.id = s.vehicle_id
  left join passes ps on ps.id = p.pass_id
  left join vehicles pv on pv.id = ps.vehicle_id
  left join customers c on c.id = p.customer_id;
