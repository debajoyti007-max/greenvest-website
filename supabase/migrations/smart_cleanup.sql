-- ==========================================================================
-- GreenVest: Smart Database Cleanup & Maintenance Stored Procedures
-- ==========================================================================

-- 1. Purge dead cancelled orders older than N days (default: 14 days)
create or replace function public.smart_purge_cancelled_orders(days_old int default 14)
returns int
language plpgsql
security definer
as $$
declare
  deleted_count int;
begin
  -- Delete matching order items first to avoid foreign key errors
  delete from public.order_items
  where order_id in (
    select id from public.orders
    where status = 'cancelled'
      and created_at < (now() - (days_old || ' days')::interval)
  );

  -- Delete the orders
  with deleted as (
    delete from public.orders
    where status = 'cancelled'
      and created_at < (now() - (days_old || ' days')::interval)
    returning id
  )
  select count(*) into deleted_count from deleted;

  return deleted_count;
end;
$$;

-- 2. Auto-cancel abandoned pending orders older than N hours (default: 48 hours)
create or replace function public.smart_cancel_abandoned_pending(hours_old int default 48)
returns int
language plpgsql
security definer
as $$
declare
  updated_count int;
begin
  with updated as (
    update public.orders
    set status = 'cancelled', updated_at = now()
    where status = 'pending'
      and (utr is null or trim(utr) = '')
      and created_at < (now() - (hours_old || ' hours')::interval)
    returning id
  )
  select count(*) into updated_count from updated;

  return updated_count;
end;
$$;

-- 3. Purge broadcast notifications older than N days (default: 30 days)
create or replace function public.smart_purge_old_notifications(days_old int default 30)
returns int
language plpgsql
security definer
as $$
declare
  deleted_count int;
begin
  with deleted as (
    delete from public.notifications
    where created_at < (now() - (days_old || ' days')::interval)
    returning id
  )
  select count(*) into deleted_count from deleted;

  return deleted_count;
end;
$$;
