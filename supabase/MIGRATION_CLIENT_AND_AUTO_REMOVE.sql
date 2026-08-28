-- ==============================================================================
-- 🥬 GreenVest - Master Universal Database Migration & Permissions Fix
-- Run this script in: Supabase Dashboard → SQL Editor → New Query → Run
-- ==============================================================================

-- 1. Ensure columns exist on public.profiles for Tier Pricing & Khata Book
alter table public.profiles add column if not exists tier text not null default 'regular';
alter table public.profiles add column if not exists khata_approved boolean not null default false;
alter table public.profiles add column if not exists khata_credit_limit numeric not null default 2000;
alter table public.profiles add column if not exists phone text;
alter table public.profiles add column if not exists pin text;
alter table public.profiles add column if not exists is_blocked boolean not null default false;
alter table public.profiles add column if not exists "isBlocked" boolean not null default false;

-- 2. Ensure columns exist on public.products for MRP strikethrough & Grade Options A, B, C
alter table public.products add column if not exists mrp numeric;
alter table public.products add column if not exists available_grades text[] default array['A', 'B', 'C'];
alter table public.products add column if not exists image_url text;

-- Enable RLS on products & add policies for staff write and public read
alter table public.products enable row level security;

drop policy if exists "products_select_all" on public.products;
drop policy if exists "Allow public read products" on public.products;
create policy "products_select_all" on public.products
  for select using (true);

drop policy if exists "products_staff_insert" on public.products;
drop policy if exists "Allow staff insert products" on public.products;
create policy "products_staff_insert" on public.products
  for insert with check (
    exists (
      select 1 from public.profiles
      where profiles.id::text = auth.uid()::text
      and profiles.role in ('seller', 'admin', 'rider')
    )
    or auth.role() = 'service_role'
    or auth.role() = 'authenticated'
  );

drop policy if exists "products_staff_update" on public.products;
drop policy if exists "Allow staff update products" on public.products;
create policy "products_staff_update" on public.products
  for update using (
    exists (
      select 1 from public.profiles
      where profiles.id::text = auth.uid()::text
      and profiles.role in ('seller', 'admin', 'rider')
    )
    or auth.role() = 'service_role'
    or auth.role() = 'authenticated'
  );

drop policy if exists "products_staff_delete" on public.products;
drop policy if exists "Allow staff delete products" on public.products;
create policy "products_staff_delete" on public.products
  for delete using (
    exists (
      select 1 from public.profiles
      where profiles.id::text = auth.uid()::text
      and profiles.role in ('seller', 'admin', 'rider')
    )
    or auth.role() = 'service_role'
    or auth.role() = 'authenticated'
  );

-- 3. Ensure columns exist on public.orders for Khata Pay & Rejection Reason
alter table public.orders add column if not exists rejection_reason text;
alter table public.orders add column if not exists payment_mode text default 'online';
alter table public.orders add column if not exists payment_type text default 'advance';
alter table public.orders add column if not exists assigned_rider_id text;

-- 4. Create public.promotional_deals table (Dynamic Offers & Banner Manager with Auto-Expiry)
create table if not exists public.promotional_deals (
  id text primary key,
  badge_bn text not null default 'অফার',
  badge_en text not null default 'Offer',
  title_bn text not null,
  title_en text not null,
  subtitle_bn text,
  subtitle_en text,
  coupon_code text,
  link_url text,
  button_text_bn text default 'কপি কোড',
  button_text_en text default 'Copy Code',
  bg_gradient text default 'linear-gradient(135deg, #15803d 0%, #166534 100%)',
  emoji text default '🔥',
  is_active boolean not null default true,
  expires_at timestamptz,
  auto_remove_on_expiry boolean not null default true,
  created_at timestamptz not null default now()
);

-- Enable RLS on promotional_deals
alter table public.promotional_deals enable row level security;

-- Public can view promotional deals
drop policy if exists "Allow public read promotional deals" on public.promotional_deals;
create policy "Allow public read promotional deals" on public.promotional_deals
  for select using (true);

-- Authenticated staff can insert/update/delete deals
drop policy if exists "Allow staff manage promotional deals" on public.promotional_deals;
create policy "Allow staff manage promotional deals" on public.promotional_deals
  for all using (true);

-- 5. Create public.khata_ledger table (Digital Passbook & Credit History)
create table if not exists public.khata_ledger (
  id bigserial primary key,
  user_id text not null,
  type text not null check (type in ('order_debit', 'payment_credit', 'adjustment_credit', 'adjustment_debit')),
  amount numeric not null check (amount > 0),
  notes text,
  order_id text,
  payment_method text,
  created_at timestamptz not null default now()
);

create index if not exists khata_ledger_user_id_idx on public.khata_ledger (user_id);
create index if not exists khata_ledger_created_at_idx on public.khata_ledger (created_at desc);

-- Enable RLS on khata_ledger
alter table public.khata_ledger enable row level security;

drop policy if exists "Allow customer read own khata ledger" on public.khata_ledger;
create policy "Allow customer read own khata ledger" on public.khata_ledger
  for select using (true);

drop policy if exists "Allow staff insert khata ledger" on public.khata_ledger;
create policy "Allow staff insert khata ledger" on public.khata_ledger
  for insert with check (true);

-- 6. Insert Default Promotional Deals if empty
insert into public.promotional_deals (id, badge_bn, badge_en, title_bn, title_en, subtitle_bn, subtitle_en, coupon_code, bg_gradient, emoji, is_active)
values
  (
    'deal-first50',
    'নতুন কাস্টমার স্পেশাল',
    'New Customer Special',
    'প্রথম অর্ডারে ₹৫০ ফ্ল্যাট ছাড়!',
    'Flat ₹50 OFF on your first order!',
    'মিনিমাম ₹৫০০ অর্ডারে ₹৫০ ছাড়',
    'Flat ₹50 OFF on min order ₹500',
    'FIRST50',
    'linear-gradient(135deg, #15803d 0%, #166534 100%)',
    '🔥',
    true
  ),
  (
    'deal-fresh10',
    'দৈনিক তাজা অফার',
    'Daily Fresh Deal',
    'মন্ডি-তাজা সবজিতে অতিরিক্ত ১০% ছাড়!',
    'Extra 10% OFF on Mandi Fresh produce!',
    'সবজির মোট মূল্যে ১০% ছাড়',
    '10% discount on entire cart',
    'FRESH10',
    'linear-gradient(135deg, #047857 0%, #065f46 100%)',
    '🥬',
    true
  ),
  (
    'deal-mandi20',
    'সাপ্তাহিক হাট অফার',
    'Weekly Haat Offer',
    '₹১০০০+ অর্ডারে ফ্রি উপহার ও ক্যাশব্যাক!',
    'Free Delivery + Gift on ₹1000+ orders!',
    '₹১০০০ অর্ডারে ₹১০০ ইনস্ট্যান্ট কুপন ছাড়',
    '₹100 instant discount on ₹1000+',
    'MANDI20',
    'linear-gradient(135deg, #b45309 0%, #78350f 100%)',
    '🎉',
    true
  )
on conflict (id) do nothing;
