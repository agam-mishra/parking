-- Quick search so workers can type just the last digits of a plate.
-- Returns up to 8 matches: exact match first, then plates ending with the digits, then the rest;
-- vehicles currently inside are listed before others.
create or replace function search_vehicles(p_q text, p_inside_only boolean default false) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare tid uuid := require_member(); q text := norm_reg(p_q);
begin
  if length(q) < 2 then return '[]'::jsonb; end if;
  return coalesce((
    select jsonb_agg(r order by r.rank, r.inside desc, r.reg_no)
    from (
      select v.reg_no,
             s.id is not null as inside,
             s.entry_at,
             vt.icon,
             c.name as customer_name,
             (active_pass(v.id)).id is not null as has_pass,
             case when v.reg_no = q then 0 when v.reg_no like '%' || q then 1 else 2 end as rank
      from vehicles v
      join vehicle_types vt on vt.id = v.vehicle_type_id
      left join parking_sessions s on s.vehicle_id = v.id and s.status = 'inside'
      left join customers c on c.id = v.customer_id
      where v.tenant_id = tid
        and v.reg_no like '%' || q || '%'
        and (not p_inside_only or s.id is not null)
      order by rank, inside desc, v.reg_no
      limit 8
    ) r), '[]'::jsonb);
end $$;

revoke execute on function search_vehicles(text, boolean) from public, anon;
grant execute on function search_vehicles(text, boolean) to authenticated;
