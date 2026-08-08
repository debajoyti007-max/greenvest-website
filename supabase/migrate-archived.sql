-- Run once in Supabase SQL Editor (existing projects)
alter table public.products
  add column if not exists archived boolean not null default false;
