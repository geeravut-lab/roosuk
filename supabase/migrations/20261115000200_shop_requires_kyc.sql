-- Products that may only be sold to a person whose identity was verified (e-KYC):
--   · shop_products.requires_kyc (the admin ticks it on the product form);
--   · create_shop_order is re-created with ONE new check — the enforcement lives in the
--     function that makes the order, so no client or server code path can skip it.
--     Everything else in the function is exactly as in 20261102000100_marketplace.sql.

alter table public.shop_products add column requires_kyc boolean not null default false;

-- ── make an order ───────────────────────────────────────────────────────────
-- p_lines: [{"product_id": uuid, "qty": 1..10}] · p_ship: {name, phone, address, province, postal, note}
-- reason: empty | unavailable | stock | credit | kyc
create or replace function public.create_shop_order(
  p_user uuid,
  p_lines jsonb,
  p_ship jsonb,
  p_use_credit boolean,
  p_credit_max integer,
  p_shipping integer,
  p_free_from integer,
  p_promptpay text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid := gen_random_uuid();
  v_line jsonb;
  v_p public.shop_products%rowtype;
  v_qty integer;
  v_subtotal integer := 0;
  v_shipping integer;
  v_credit integer := 0;
  v_balance integer;
  v_total integer;
  v_no bigint;
  v_status text;
begin
  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) not between 1 and 20 then
    return jsonb_build_object('ok', false, 'reason', 'empty');
  end if;
  perform pg_advisory_xact_lock(hashtext('shop:' || p_user::text));

  -- price and check every line from the database, locking the product rows
  for v_line in select * from jsonb_array_elements(p_lines) loop
    v_qty := (v_line ->> 'qty')::integer;
    select * into v_p from public.shop_products where id = (v_line ->> 'product_id')::uuid for update;
    if not found or not v_p.active
       or not exists (select 1 from public.shop_partners where id = v_p.partner_id and active)
       or v_qty not between 1 and 10 then
      return jsonb_build_object('ok', false, 'reason', 'unavailable', 'product', v_line ->> 'product_id');
    end if;
    if v_p.stock is not null and v_p.stock < v_qty then
      return jsonb_build_object('ok', false, 'reason', 'stock', 'product', v_p.id);
    end if;
    -- a product flagged "requires_kyc" is sold only to a person whose identity was verified (e-KYC)
    if v_p.requires_kyc and not public.is_kyc_verified(p_user) then
      return jsonb_build_object('ok', false, 'reason', 'kyc', 'product', v_p.id);
    end if;
    v_subtotal := v_subtotal + v_p.price_thb * v_qty;
  end loop;

  v_shipping := case when p_free_from > 0 and v_subtotal >= p_free_from then 0 else greatest(p_shipping, 0) end;

  if p_use_credit then
    select coalesce(sum(amount_thb), 0) into v_balance from public.reward_ledger where user_id = p_user;
    v_credit := greatest(least(v_balance, greatest(p_credit_max, 0), v_subtotal + v_shipping), 0);
    if v_credit > 0 and not public.redeem_credit(p_user, v_credit, 'redeem_other', 'shop:' || v_id::text) then
      return jsonb_build_object('ok', false, 'reason', 'credit');
    end if;
  end if;

  v_total := v_subtotal + v_shipping - v_credit;
  v_status := case when v_total = 0 then 'paid' else 'pending_payment' end;

  insert into public.shop_orders (
    id, user_id, status, subtotal_thb, shipping_thb, credit_thb, total_thb,
    ship_name, ship_phone, ship_address, ship_province, ship_postal, note, promptpay_id, paid_at
  ) values (
    v_id, p_user, v_status, v_subtotal, v_shipping, v_credit, v_total,
    p_ship ->> 'name', p_ship ->> 'phone', p_ship ->> 'address', p_ship ->> 'province',
    p_ship ->> 'postal', nullif(p_ship ->> 'note', ''), p_promptpay,
    case when v_status = 'paid' then now() end
  ) returning order_no into v_no;

  for v_line in select * from jsonb_array_elements(p_lines) loop
    v_qty := (v_line ->> 'qty')::integer;
    select * into v_p from public.shop_products where id = (v_line ->> 'product_id')::uuid;
    insert into public.shop_order_items (order_id, product_id, partner_id, sku, name, unit_price_thb, qty)
      values (v_id, v_p.id, v_p.partner_id, v_p.sku, v_p.name_th, v_p.price_thb, v_qty);
    if v_p.stock is not null then
      update public.shop_products set stock = stock - v_qty where id = v_p.id;
    end if;
  end loop;

  delete from public.shop_cart_items
   where user_id = p_user
     and product_id in (select (e ->> 'product_id')::uuid from jsonb_array_elements(p_lines) e);

  return jsonb_build_object('ok', true, 'id', v_id, 'order_no', v_no, 'total', v_total, 'status', v_status, 'credit', v_credit);
end;
$$;
revoke all on function public.create_shop_order(uuid, jsonb, jsonb, boolean, integer, integer, integer, text) from public, anon, authenticated;
grant execute on function public.create_shop_order(uuid, jsonb, jsonb, boolean, integer, integer, integer, text) to service_role;
