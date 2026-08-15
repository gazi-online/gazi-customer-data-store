CREATE TABLE IF NOT EXISTS public.ai_import_history (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  original_images jsonb,
  ai_raw_response text,
  final_json jsonb,
  ai_provider text,
  prompt_version text,
  status text,
  processing_time_ms bigint,
  input_tokens integer,
  output_tokens integer,
  estimated_cost numeric,
  model_name text,
  error_message text,
  created_at timestamptz DEFAULT timezone('utc', now()) NOT NULL
);

-- Enable Row Level Security
ALTER TABLE public.ai_import_history ENABLE ROW LEVEL SECURITY;

-- Policies
DROP POLICY IF EXISTS "Users can insert own history"
ON public.ai_import_history;

DROP POLICY IF EXISTS "Users can view own history"
ON public.ai_import_history;

-- Users can insert their own history
CREATE POLICY "Users can insert own history"
  ON public.ai_import_history
  FOR INSERT
  WITH CHECK (auth.uid() = created_by);

-- Users can view their own history
CREATE POLICY "Users can view own history"
  ON public.ai_import_history
  FOR SELECT
  USING (auth.uid() = created_by);

