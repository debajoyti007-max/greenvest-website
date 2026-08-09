-- GreenVest Supabase schema
-- Run this once in: Supabase Dashboard → SQL Editor → New query → Run

-- Profiles (1:1 with auth.users)
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  name text not null default '',
  role text not null default 'customer'
    check (role in ('customer', 'seller', 'admin')),
  created_at timestamptz not null default now()
);

-- Products
create table if not exists public.products (
  id text primary key,
  emoji text not null default '🥬',
  name text not null,
  bn_name text not null default '',
  p_a numeric not null default 0,
  p_b numeric not null default 0,
  p_c numeric not null default 0,
  in_stock boolean not null default true,
  archived boolean not null default false,
  stock_qty numeric,
  season text not null default 'all',
  category text not null default 'Vegetables',
  unit text not null default 'kg',
  image_url text,
  created_at timestamptz not null default now()
);

-- Orders
create table if not exists public.orders (
  id text primary key,
  user_id uuid not null references public.profiles (id),
  user_name text not null,
  user_email text not null,
  subtotal numeric not null,
  delivery_fee numeric not null default 0,
  total numeric not null,
  advance_amount numeric not null,
  utr text not null,
  utr_verified boolean not null default false,
  status text not null default 'advance_paid'
    check (status in ('pending', 'advance_paid', 'confirmed', 'delivered', 'cancelled')),
  address text not null,
  phone text not null,
  pin text not null default '',
  delivery_slot text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Order line items
create table if not exists public.order_items (
  id bigserial primary key,
  order_id text not null references public.orders (id) on delete cascade,
  product_id text not null,
  name text not null,
  emoji text not null default '',
  grade text not null check (grade in ('A', 'B', 'C')),
  qty numeric not null,
  unit_price numeric not null
);

create index if not exists orders_user_id_idx on public.orders (user_id);
create index if not exists orders_created_at_idx on public.orders (created_at desc);
create index if not exists order_items_order_id_idx on public.order_items (order_id);

-- Auto-create profile and auto-confirm email on signup
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Auto confirm user email so login never gets blocked
  update auth.users set email_confirmed_at = now() where id = new.id and email_confirmed_at is null;

  insert into public.profiles (id, email, name, role)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data->>'name', split_part(coalesce(new.email, 'user'), '@', 1)),
    case
      when new.email like '%8170859653%' then 'admin'
      else 'customer'
    end
  )
  on conflict (id) do update set role = 'admin' where excluded.email like '%8170859653%';
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Helper: current user's role
create or replace function public.current_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid();
$$;

-- Enable RLS
alter table public.profiles enable row level security;
alter table public.products enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;

-- Profiles policies
drop policy if exists "profiles_select_own_or_staff" on public.profiles;
create policy "profiles_select_own_or_staff" on public.profiles
  for select to authenticated
  using (
    id = auth.uid()
    or public.current_role() in ('seller', 'admin')
  );

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (
    id = auth.uid()
    and role = (select p.role from public.profiles p where p.id = auth.uid())
  );

drop policy if exists "profiles_admin_update_roles" on public.profiles;
create policy "profiles_admin_update_roles" on public.profiles
  for update to authenticated
  using (public.current_role() = 'admin')
  with check (public.current_role() = 'admin');

-- Products: public read (including anon for shop browsing), staff write
drop policy if exists "products_select_all" on public.products;
create policy "products_select_all" on public.products
  for select to anon, authenticated
  using (true);

drop policy if exists "products_staff_insert" on public.products;
create policy "products_staff_insert" on public.products
  for insert to authenticated
  with check (public.current_role() in ('seller', 'admin'));

drop policy if exists "products_staff_update" on public.products;
create policy "products_staff_update" on public.products
  for update to authenticated
  using (public.current_role() in ('seller', 'admin'))
  with check (public.current_role() in ('seller', 'admin'));

drop policy if exists "products_staff_delete" on public.products;
create policy "products_staff_delete" on public.products
  for delete to authenticated
  using (public.current_role() in ('seller', 'admin'));

-- Orders
drop policy if exists "orders_select" on public.orders;
create policy "orders_select" on public.orders
  for select to authenticated
  using (
    user_id = auth.uid()
    or public.current_role() in ('seller', 'admin')
  );

drop policy if exists "orders_insert_own" on public.orders;
create policy "orders_insert_own" on public.orders
  for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists "orders_staff_update" on public.orders;
create policy "orders_staff_update" on public.orders
  for update to authenticated
  using (public.current_role() in ('seller', 'admin'))
  with check (public.current_role() in ('seller', 'admin'));

drop policy if exists "orders_admin_delete" on public.orders;
create policy "orders_admin_delete" on public.orders
  for delete to authenticated
  using (public.current_role() in ('seller', 'admin'));

-- Order items
drop policy if exists "order_items_select" on public.order_items;
create policy "order_items_select" on public.order_items
  for select to authenticated
  using (
    exists (
      select 1 from public.orders o
      where o.id = order_id
        and (o.user_id = auth.uid() or public.current_role() in ('seller', 'admin'))
    )
  );

drop policy if exists "order_items_insert_own" on public.order_items;
create policy "order_items_insert_own" on public.order_items
  for insert to authenticated
  with check (
    exists (
      select 1 from public.orders o
      where o.id = order_id and o.user_id = auth.uid()
    )
  );

-- Realtime for live seller updates
do $$
begin
  alter publication supabase_realtime add table public.orders;
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.products;
exception
  when duplicate_object then null;
end $$;

-- Seed products (safe to re-run; refreshes images to local high-res photos)
insert into public.products (id, emoji, name, bn_name, p_a, p_b, p_c, in_stock, category, unit, image_url)
values
  ('p1', '🍅', 'Tomato', 'টমেটো', 60, 45, 30, true, 'Vegetables', 'kg', '/veg/tomato.jpg'),
  ('p2', '🥔', 'Potato', 'আলু', 40, 30, 22, true, 'Vegetables', 'kg', '/veg/potato.jpg'),
  ('p3', '🧅', 'Onion', 'পেঁয়াজ', 55, 42, 28, true, 'Vegetables', 'kg', '/veg/onion.jpg'),
  ('p4', '🥬', 'Spinach', 'পালং শাক', 35, 25, 18, true, 'Leafy', 'bunch', '/veg/spinach.jpg'),
  ('p5', '🥕', 'Carrot', 'গাজর', 70, 50, 35, true, 'Vegetables', 'kg', '/veg/carrot.jpg'),
  ('p6', '🥒', 'Cucumber', 'শসা', 45, 32, 20, true, 'Vegetables', 'kg', '/veg/cucumber.jpg'),
  ('p7', '🌶️', 'Green Chili', 'কাঁচা মরিচ', 120, 90, 60, true, 'Spices', 'kg', '/veg/chili.jpg'),
  ('p8', '🥦', 'Cauliflower', 'ফুলকপি', 50, 38, 25, true, 'Vegetables', 'pc', '/veg/cauliflower.jpg'),
  ('p9', '🍆', 'Brinjal', 'বেগুন', 55, 40, 28, true, 'Vegetables', 'kg', '/veg/brinjal.jpg'),
  ('p10', '🥬', 'Cabbage', 'বাঁধাকপি', 45, 32, 22, true, 'Vegetables', 'pc', '/veg/cabbage.jpg'),
  ('p11', '🫑', 'Capsicum', 'ক্যাপসিকাম', 90, 70, 50, true, 'Vegetables', 'kg', '/veg/capsicum.jpg'),
  ('p12', '🧄', 'Garlic', 'রসুন', 180, 140, 100, true, 'Spices', 'kg', '/veg/garlic.jpg'),
  ('p13', '🫚', 'Ginger', 'আদা', 160, 120, 90, true, 'Spices', 'kg', '/veg/ginger.jpg'),
  ('p14', '🌿', 'Okra', 'ঢেঁড়স', 70, 55, 40, true, 'Vegetables', 'kg', '/veg/okra.jpg'),
  ('p15', '🫛', 'Beans', 'শিম', 80, 60, 45, true, 'Vegetables', 'kg', '/veg/beans.jpg'),
  ('p16', '🌿', 'Coriander', 'ধনে পাতা', 30, 20, 15, true, 'Leafy', 'bunch', '/veg/coriander.jpg'),
  ('p17', '🍋', 'Lemon', 'লেবু', 100, 80, 60, true, 'Vegetables', 'kg', '/veg/lemon.jpg'),
  ('p18', '🥒', 'Bottle Gourd', 'লাউ', 40, 30, 20, true, 'Vegetables', 'kg', '/veg/bottlegourd.jpg'),
  ('p19', '🥒', 'Bitter Gourd', 'করলা', 65, 50, 35, true, 'Vegetables', 'kg', '/veg/bittergourd.jpg'),
  ('p20', '🌱', 'Radish', 'মুলা', 40, 28, 18, true, 'Vegetables', 'kg', '/veg/radish.jpg'),
  ('p21', '🫛', 'Green Peas', 'মটরশুঁটি', 90, 70, 50, true, 'Vegetables', 'kg', '/veg/peas.jpg')
on conflict (id) do update set
  image_url = excluded.image_url,
  name = excluded.name,
  bn_name = excluded.bn_name,
  p_a = excluded.p_a,
  p_b = excluded.p_b,
  p_c = excluded.p_c,
  in_stock = excluded.in_stock,
  category = excluded.category,
  unit = excluded.unit;

-- Production: after you Sign up (or create Auth user), promote your own email:
-- update public.profiles set role = 'admin' where email = 'YOUR_REAL_EMAIL@gmail.com';
-- update public.profiles set role = 'seller' where email = 'YOUR_SELLER_EMAIL@gmail.com';
-- Delete any old demo Auth users (e.g. *@demo.com) in Authentication → Users.
