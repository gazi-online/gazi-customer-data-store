-- ==============================================================================
-- AEPS / UPI RECEIPT ANALYZER TRANSACTION HISTORY & WHATSAPP SMS LOGS
-- File: supabase/migrations/20261127213000_receipt_transactions.sql
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.receipt_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NULL,
  source TEXT NOT NULL DEFAULT 'portal' CHECK (source IN ('portal', 'telegram')),
  filename TEXT NULL,
  provider TEXT NULL,
  tx_status TEXT NOT NULL DEFAULT 'unknown',
  customer_name TEXT NULL,
  amount NUMERIC(12,2) NULL,
  rrn_number TEXT NULL,
  upi_id TEXT NULL,
  extracted_phone TEXT NULL,
  raw_text TEXT NULL,
  whatsapp_sent BOOLEAN NOT NULL DEFAULT false,
  whatsapp_phone TEXT NULL,
  whatsapp_message TEXT NULL,
  whatsapp_message_id TEXT NULL,
  whatsapp_sent_at TIMESTAMPTZ NULL,
  whatsapp_error TEXT NULL,
  created_by UUID NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_receipt_transactions_business_created
  ON public.receipt_transactions(business_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_receipt_transactions_rrn
  ON public.receipt_transactions(rrn_number)
  WHERE rrn_number IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_receipt_transactions_phone
  ON public.receipt_transactions(whatsapp_phone)
  WHERE whatsapp_phone IS NOT NULL;

ALTER TABLE public.receipt_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "receipt_transactions_tenant_select" ON public.receipt_transactions;
CREATE POLICY "receipt_transactions_tenant_select"
  ON public.receipt_transactions
  FOR SELECT
  TO authenticated
  USING (
    business_id IS NULL
    OR EXISTS (
      SELECT 1
      FROM public.business_memberships bm
      WHERE bm.business_id = receipt_transactions.business_id
        AND bm.user_id = auth.uid()
        AND bm.status = 'active'
    )
  );

DROP POLICY IF EXISTS "receipt_transactions_tenant_insert" ON public.receipt_transactions;
CREATE POLICY "receipt_transactions_tenant_insert"
  ON public.receipt_transactions
  FOR INSERT
  TO authenticated
  WITH CHECK (
    business_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.business_memberships bm
      WHERE bm.business_id = receipt_transactions.business_id
        AND bm.user_id = auth.uid()
        AND bm.status = 'active'
    )
  );

DROP POLICY IF EXISTS "receipt_transactions_tenant_update" ON public.receipt_transactions;
CREATE POLICY "receipt_transactions_tenant_update"
  ON public.receipt_transactions
  FOR UPDATE
  TO authenticated
  USING (
    business_id IS NULL
    OR EXISTS (
      SELECT 1
      FROM public.business_memberships bm
      WHERE bm.business_id = receipt_transactions.business_id
        AND bm.user_id = auth.uid()
        AND bm.status = 'active'
    )
  )
  WITH CHECK (
    business_id IS NULL
    OR EXISTS (
      SELECT 1
      FROM public.business_memberships bm
      WHERE bm.business_id = receipt_transactions.business_id
        AND bm.user_id = auth.uid()
        AND bm.status = 'active'
    )
  );

REVOKE ALL ON public.receipt_transactions FROM anon;
REVOKE DELETE ON public.receipt_transactions FROM authenticated;
GRANT SELECT, INSERT, UPDATE ON public.receipt_transactions TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
