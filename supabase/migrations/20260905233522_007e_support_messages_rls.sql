DROP POLICY IF EXISTS "support_messages_select_public" ON public.support_messages;
DROP POLICY IF EXISTS "support_messages_update_public" ON public.support_messages;
DROP POLICY IF EXISTS "support_messages_select_own_or_staff" ON public.support_messages;
DROP POLICY IF EXISTS "support_messages_update_own_or_staff" ON public.support_messages;

CREATE POLICY "support_messages_select_own_or_staff"
  ON public.support_messages
  FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()::text
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()::text
        AND role IN ('admin', 'seller')
    )
  );

CREATE POLICY "support_messages_update_own_or_staff"
  ON public.support_messages
  FOR UPDATE
  TO authenticated
  USING (
    user_id = auth.uid()::text
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()::text
        AND role IN ('admin', 'seller')
    )
  )
  WITH CHECK (true);

SELECT 'support_messages RLS fixed' AS status;
