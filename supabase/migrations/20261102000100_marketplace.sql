-- Phase 3E / Marketplace (supplements first, shipped by partners).
--   · partners and products (many photos each) are the admin's, service-role only;
--   · a person's cart and orders are theirs to read; every write goes through the
--     server, and an order is made by ONE function that prices it from the database
--     (never from the browser), checks stock, spends reward credit up to the admin's
--     per-use cap, and either succeeds whole or leaves nothing behind;
--   · an order is money, so it outlives the account — detached from the person and
--     scrubbed of their address and phone (like payments).

alter table public.platform_settings
  add column shop_shipping_thb integer not null default 50 check (shop_shipping_thb between 0 and 5000),
  -- an order at or above this subtotal ships free; 0 = never free
  add column shop_free_shipping_from_thb integer not null default 500 check (shop_free_shipping_from_thb between 0 and 100000);

-- ── catalog (admin) ─────────────────────────────────────────────────────────
create table public.shop_partners (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 1 and 80),
  contact text check (contact is null or length(contact) <= 200),
  note text check (note is null or length(note) <= 500),
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create unique index shop_partners_name_idx on public.shop_partners (lower(btrim(name)));

create table public.shop_products (
  id uuid primary key default gen_random_uuid(),
  sku text not null unique check (sku ~ '^[A-Za-z0-9._-]{1,40}$'),
  partner_id uuid not null references public.shop_partners (id) on delete restrict,
  name_th text not null check (length(btrim(name_th)) between 1 and 120),
  name_en text check (name_en is null or length(btrim(name_en)) between 1 and 120),
  brand text check (brand is null or length(brand) <= 80),
  summary_th text check (summary_th is null or length(summary_th) <= 300),
  summary_en text check (summary_en is null or length(summary_en) <= 300),
  description_th text check (description_th is null or length(description_th) <= 4000),
  description_en text check (description_en is null or length(description_en) <= 4000),
  ingredients text check (ingredients is null or length(ingredients) <= 2000),
  usage_note text check (usage_note is null or length(usage_note) <= 1000),
  caution text check (caution is null or length(caution) <= 1000),
  -- the Thai FDA registration number printed on the label
  fda_no text check (fda_no is null or length(fda_no) <= 40),
  serving text check (serving is null or length(serving) <= 80),
  price_thb integer not null check (price_thb between 1 and 1000000),
  compare_at_thb integer check (compare_at_thb is null or compare_at_thb > price_thb),
  -- null = not counted
  stock integer check (stock is null or stock >= 0),
  focus_tags text[] not null default '{}' check (cardinality(focus_tags) <= 6),
  active boolean not null default false,
  sort integer not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index shop_products_active_idx on public.shop_products (active, sort, created_at desc);
create trigger shop_products_set_updated_at
  before update on public.shop_products
  for each row execute function public.set_updated_at();

create table public.shop_product_images (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.shop_products (id) on delete cascade,
  path text not null unique,
  mime text not null check (mime in ('image/jpeg', 'image/png', 'image/webp')),
  bytes integer not null check (bytes between 1 and 6000000),
  position integer not null default 0,
  created_at timestamptz not null default now()
);
create index shop_product_images_product_idx on public.shop_product_images (product_id, position, created_at);

alter table public.shop_partners enable row level security;
alter table public.shop_products enable row level security;
alter table public.shop_product_images enable row level security;
revoke all on public.shop_partners, public.shop_products, public.shop_product_images from anon, authenticated;

-- ── a person's cart ─────────────────────────────────────────────────────────
create table public.shop_cart_items (
  user_id uuid not null references auth.users (id) on delete cascade,
  product_id uuid not null references public.shop_products (id) on delete cascade,
  qty integer not null check (qty between 1 and 10),
  added_at timestamptz not null default now(),
  primary key (user_id, product_id)
);
alter table public.shop_cart_items enable row level security;
revoke all on public.shop_cart_items from anon, authenticated;
grant select, delete on public.shop_cart_items to authenticated;
create policy shop_cart_select_own on public.shop_cart_items
  for select to authenticated using (user_id = (select auth.uid()));
create policy shop_cart_delete_own on public.shop_cart_items
  for delete to authenticated using (user_id = (select auth.uid()));

-- ── orders ──────────────────────────────────────────────────────────────────
create table public.shop_orders (
  id uuid primary key default gen_random_uuid(),
  order_no bigint generated always as identity unique,
  -- null once the buyer deleted their account (the money record stays, their details are scrubbed)
  user_id uuid references auth.users (id) on delete set null,
  status text not null default 'pending_payment' check (status in (
    'pending_payment', 'payment_reported', 'paid', 'processing', 'shipped', 'delivered', 'cancelled'
  )),
  subtotal_thb integer not null check (subtotal_thb >= 0),
  shipping_thb integer not null check (shipping_thb >= 0),
  credit_thb integer not null default 0 check (credit_thb >= 0),
  total_thb integer not null check (total_thb >= 0),
  ship_name text not null check (length(btrim(ship_name)) between 1 and 80),
  ship_phone text not null check (length(btrim(ship_phone)) between 6 and 20),
  ship_address text not null check (length(btrim(ship_address)) between 1 and 300),
  ship_province text not null check (length(btrim(ship_province)) between 1 and 60),
  ship_postal text not null check (ship_postal ~ '^[0-9]{5}$' or ship_postal = '-'),
  note text check (note is null or length(note) <= 300),
  promptpay_id text,
  payer_ref text check (payer_ref is null or length(btrim(payer_ref)) between 1 and 60),
  reported_at timestamptz,
  paid_at timestamptz,
  partner_sent_at timestamptz,
  carrier text check (carrier is null or length(carrier) <= 40),
  tracking_no text check (tracking_no is null or length(tracking_no) <= 60),
  shipped_at timestamptz,
  delivered_at timestamptz,
  cancelled_at timestamptz,
  cancel_reason text check (cancel_reason is null or length(cancel_reason) <= 200),
  credit_refunded boolean not null default false,
  admin_note text check (admin_note is null or length(admin_note) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint shop_orders_total check (total_thb = subtotal_thb + shipping_thb - credit_thb)
);
create index shop_orders_user_idx on public.shop_orders (user_id, created_at desc);
create index shop_orders_status_idx on public.shop_orders (status, created_at);
create trigger shop_orders_set_updated_at
  before update on public.shop_orders
  for each row execute function public.set_updated_at();

create table public.shop_order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.shop_orders (id) on delete cascade,
  product_id uuid references public.shop_products (id) on delete set null,
  partner_id uuid,
  sku text not null,
  name text not null,
  unit_price_thb integer not null check (unit_price_thb >= 1),
  qty integer not null check (qty between 1 and 10)
);
create index shop_order_items_order_idx on public.shop_order_items (order_id);

alter table public.shop_orders enable row level security;
alter table public.shop_order_items enable row level security;
revoke all on public.shop_orders, public.shop_order_items from anon, authenticated;
grant select on public.shop_orders, public.shop_order_items to authenticated;
create policy shop_orders_select_own on public.shop_orders
  for select to authenticated using (user_id = (select auth.uid()));
create policy shop_order_items_select_own on public.shop_order_items
  for select to authenticated
  using (exists (select 1 from public.shop_orders o where o.id = shop_order_items.order_id and o.user_id = (select auth.uid())));

-- When the buyer's account goes, the order stays as a money record but loses who and where.
create or replace function public.shop_orders_scrub()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.ship_name := '(erased)';
  new.ship_phone := '000000';
  new.ship_address := '(erased)';
  new.ship_province := '(erased)';
  new.ship_postal := '-';
  new.note := null;
  new.payer_ref := null;
  return new;
end;
$$;
create trigger shop_orders_scrub_on_detach
  before update of user_id on public.shop_orders
  for each row
  when (old.user_id is not null and new.user_id is null)
  execute function public.shop_orders_scrub();

-- ── make an order ───────────────────────────────────────────────────────────
-- p_lines: [{"product_id": uuid, "qty": 1..10}] · p_ship: {name, phone, address, province, postal, note}
-- reason: empty | unavailable | stock | credit
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

-- ── cancel an order: stock back, credit back (once) ─────────────────────────
-- a person: only their own, only before it is paid · an admin: anything not yet shipped
-- 'ok' | 'not_found' | 'forbidden' | 'state'
create or replace function public.cancel_shop_order(p_order uuid, p_user uuid, p_admin boolean, p_reason text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.shop_orders%rowtype;
begin
  select * into v from public.shop_orders where id = p_order for update;
  if not found then
    return 'not_found';
  end if;
  if not p_admin and v.user_id is distinct from p_user then
    return 'forbidden';
  end if;
  if v.status in ('cancelled', 'shipped', 'delivered') then
    return 'state';
  end if;
  if not p_admin and v.status not in ('pending_payment', 'payment_reported') then
    return 'state';
  end if;
  update public.shop_products p
     set stock = p.stock + i.qty
    from public.shop_order_items i
   where i.order_id = p_order and i.product_id = p.id and p.stock is not null;
  if v.credit_thb > 0 and not v.credit_refunded and v.user_id is not null then
    insert into public.reward_ledger (user_id, kind, amount_thb, ref)
      values (v.user_id, 'redeem_refund', v.credit_thb, 'shop:' || p_order::text);
  end if;
  update public.shop_orders
     set status = 'cancelled', cancelled_at = now(), cancel_reason = left(p_reason, 200),
         credit_refunded = credit_thb > 0
   where id = p_order;
  return 'ok';
end;
$$;
revoke all on function public.cancel_shop_order(uuid, uuid, boolean, text) from public, anon, authenticated;
grant execute on function public.cancel_shop_order(uuid, uuid, boolean, text) to service_role;

-- Orders nobody paid for are released (their stock and credit come back).
create or replace function public.expire_shop_orders(p_hours integer)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_n integer := 0;
begin
  for v_id in
    select id from public.shop_orders
     where status = 'pending_payment' and created_at < now() - make_interval(hours => p_hours)
     limit 200
  loop
    if public.cancel_shop_order(v_id, null, true, 'expired') = 'ok' then
      v_n := v_n + 1;
    end if;
  end loop;
  return v_n;
end;
$$;
revoke all on function public.expire_shop_orders(integer) from public, anon, authenticated;
grant execute on function public.expire_shop_orders(integer) to service_role;
