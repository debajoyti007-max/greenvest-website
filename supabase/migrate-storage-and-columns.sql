-- Run once in Supabase → SQL Editor → Run
-- 1) Extra product/order columns
-- 2) Free Storage policies for product photo uploads

alter table public.products
  add column if not exists archived boolean not null default false;

alter table public.products
  add column if not exists stock_qty numeric;

alter table public.products
  add column if not exists season text not null default 'all';

alter table public.orders
  add column if not exists delivery_slot text;

-- Storage: public read + seller/admin write on bucket product-images
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'product-images',
  'product-images',
  true,
  2097152,
  array['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "product_images_public_read" on storage.objects;
create policy "product_images_public_read"
  on storage.objects for select
  to public
  using (bucket_id = 'product-images');

drop policy if exists "product_images_staff_insert" on storage.objects;
create policy "product_images_staff_insert"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'product-images'
    and public.current_role() in ('seller', 'admin')
  );

drop policy if exists "product_images_staff_update" on storage.objects;
create policy "product_images_staff_update"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'product-images'
    and public.current_role() in ('seller', 'admin')
  )
  with check (
    bucket_id = 'product-images'
    and public.current_role() in ('seller', 'admin')
  );

drop policy if exists "product_images_staff_delete" on storage.objects;
create policy "product_images_staff_delete"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'product-images'
    and public.current_role() in ('seller', 'admin')
  );
