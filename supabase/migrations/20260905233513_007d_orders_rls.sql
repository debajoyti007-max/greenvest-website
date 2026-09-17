DROP POLICY IF EXISTS "orders_select_public" ON public.orders;
DROP POLICY IF EXISTS "orders_select_own_or_staff" ON public.orders;

CREATE POLICY "orders_select_own_or_staff"
  ON public.orders
  FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()::text
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()::text
        AND role IN ('admin', 'seller', 'rider')
    )
  );

SELECT 'orders RLS fixed' AS status;
