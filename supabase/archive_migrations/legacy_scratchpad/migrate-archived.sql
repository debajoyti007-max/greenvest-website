-- Run once in Supabase SQL Editor (existing projects)
alter table public.products
  add column if not exists archived boolean not null default false;

alter table public.products
  add column if not exists stock_qty numeric;

alter table public.products
  add column if not exists season text not null default 'all';

alter table public.orders
  add column if not exists delivery_slot text;
