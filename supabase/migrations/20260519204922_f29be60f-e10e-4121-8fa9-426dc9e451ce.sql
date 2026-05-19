CREATE TABLE public.reels (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  wedding_id UUID NOT NULL,
  mood TEXT NOT NULL,
  length_seconds INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'planning',
  timeline JSONB,
  music_storage_path TEXT,
  shotstack_render_id TEXT,
  output_storage_path TEXT,
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.reels ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their reels" ON public.reels FOR SELECT
USING (EXISTS (SELECT 1 FROM weddings WHERE weddings.id = reels.wedding_id AND weddings.user_id = auth.uid()));

CREATE POLICY "Users can insert reels" ON public.reels FOR INSERT
WITH CHECK (EXISTS (SELECT 1 FROM weddings WHERE weddings.id = reels.wedding_id AND weddings.user_id = auth.uid()));

CREATE POLICY "Users can update their reels" ON public.reels FOR UPDATE
USING (EXISTS (SELECT 1 FROM weddings WHERE weddings.id = reels.wedding_id AND weddings.user_id = auth.uid()));

CREATE POLICY "Users can delete their reels" ON public.reels FOR DELETE
USING (EXISTS (SELECT 1 FROM weddings WHERE weddings.id = reels.wedding_id AND weddings.user_id = auth.uid()));

CREATE OR REPLACE FUNCTION public.update_reels_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE TRIGGER reels_updated_at
BEFORE UPDATE ON public.reels
FOR EACH ROW EXECUTE FUNCTION public.update_reels_updated_at();

CREATE INDEX idx_reels_wedding_id ON public.reels(wedding_id);