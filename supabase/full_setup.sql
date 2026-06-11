-- Full database setup for Aisle AI (fresh Supabase project).
--
-- This is a consolidated, idempotent-friendly version of every migration in
-- supabase/migrations, in dependency order. Paste the whole file into the
-- Supabase SQL Editor and Run it once to set up the entire schema, including
-- the client gallery feature.
--
-- Safe on a fresh project: the storage bucket uses ON CONFLICT DO NOTHING and
-- the storage policies are dropped-if-exist first. If a TABLE already exists,
-- this will error -- in that case run only the migration(s) you are missing.

CREATE TABLE public.weddings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  date DATE NOT NULL,
  project_type TEXT NOT NULL DEFAULT 'wedding',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE TABLE public.media_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  wedding_id UUID NOT NULL REFERENCES public.weddings(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('photo', 'video')),
  folder TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  preview_storage_path TEXT,
  upload_status TEXT NOT NULL DEFAULT 'complete',
  flag_reason TEXT CHECK (flag_reason IN ('short_clip', 'low_quality_photo')),
  duration REAL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_media_items_pending
  ON public.media_items (wedding_id, upload_status)
  WHERE upload_status = 'pending';

CREATE TABLE public.vendors (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  wedding_id UUID NOT NULL REFERENCES public.weddings(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  business_name TEXT NOT NULL,
  instagram TEXT NOT NULL,
  website TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE TABLE public.wedding_folders (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  wedding_id UUID NOT NULL,
  name TEXT NOT NULL,
  icon TEXT NOT NULL DEFAULT 'FolderOpen',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (wedding_id, name)
);

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

CREATE INDEX idx_reels_wedding_id ON public.reels(wedding_id);

CREATE OR REPLACE FUNCTION public.update_reels_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE TRIGGER reels_updated_at
BEFORE UPDATE ON public.reels
FOR EACH ROW EXECUTE FUNCTION public.update_reels_updated_at();

CREATE TABLE public.galleries (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  wedding_id UUID NOT NULL REFERENCES public.weddings(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  share_token TEXT NOT NULL UNIQUE DEFAULT replace(gen_random_uuid()::text, '-', ''),
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (wedding_id)
);

CREATE TABLE public.gallery_excluded_items (
  gallery_id UUID NOT NULL REFERENCES public.galleries(id) ON DELETE CASCADE,
  media_id UUID NOT NULL REFERENCES public.media_items(id) ON DELETE CASCADE,
  PRIMARY KEY (gallery_id, media_id)
);

CREATE INDEX idx_galleries_wedding_id ON public.galleries(wedding_id);

ALTER TABLE public.weddings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.media_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wedding_folders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.galleries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gallery_excluded_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own weddings" ON public.weddings FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create weddings" ON public.weddings FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own weddings" ON public.weddings FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own weddings" ON public.weddings FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "Users can view their media" ON public.media_items FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.weddings WHERE id = media_items.wedding_id AND user_id = auth.uid())
);
CREATE POLICY "Users can insert media" ON public.media_items FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM public.weddings WHERE id = media_items.wedding_id AND user_id = auth.uid())
);
CREATE POLICY "Users can update their media" ON public.media_items FOR UPDATE USING (
  EXISTS (SELECT 1 FROM public.weddings WHERE id = media_items.wedding_id AND user_id = auth.uid())
);
CREATE POLICY "Users can delete their media" ON public.media_items FOR DELETE USING (
  EXISTS (SELECT 1 FROM public.weddings WHERE id = media_items.wedding_id AND user_id = auth.uid())
);

CREATE POLICY "Users can view their vendors" ON public.vendors FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.weddings WHERE id = vendors.wedding_id AND user_id = auth.uid())
);
CREATE POLICY "Users can insert vendors" ON public.vendors FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM public.weddings WHERE id = vendors.wedding_id AND user_id = auth.uid())
);
CREATE POLICY "Users can update their vendors" ON public.vendors FOR UPDATE USING (
  EXISTS (SELECT 1 FROM public.weddings WHERE id = vendors.wedding_id AND user_id = auth.uid())
);
CREATE POLICY "Users can delete their vendors" ON public.vendors FOR DELETE USING (
  EXISTS (SELECT 1 FROM public.weddings WHERE id = vendors.wedding_id AND user_id = auth.uid())
);

CREATE POLICY "Users can view their wedding folders" ON public.wedding_folders FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.weddings WHERE weddings.id = wedding_folders.wedding_id AND weddings.user_id = auth.uid())
);
CREATE POLICY "Users can create wedding folders" ON public.wedding_folders FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM public.weddings WHERE weddings.id = wedding_folders.wedding_id AND weddings.user_id = auth.uid())
);
CREATE POLICY "Users can delete their wedding folders" ON public.wedding_folders FOR DELETE USING (
  EXISTS (SELECT 1 FROM public.weddings WHERE weddings.id = wedding_folders.wedding_id AND weddings.user_id = auth.uid())
);

CREATE POLICY "Users can view their reels" ON public.reels FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.weddings WHERE weddings.id = reels.wedding_id AND weddings.user_id = auth.uid())
);
CREATE POLICY "Users can insert reels" ON public.reels FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM public.weddings WHERE weddings.id = reels.wedding_id AND weddings.user_id = auth.uid())
);
CREATE POLICY "Users can update their reels" ON public.reels FOR UPDATE USING (
  EXISTS (SELECT 1 FROM public.weddings WHERE weddings.id = reels.wedding_id AND weddings.user_id = auth.uid())
);
CREATE POLICY "Users can delete their reels" ON public.reels FOR DELETE USING (
  EXISTS (SELECT 1 FROM public.weddings WHERE weddings.id = reels.wedding_id AND weddings.user_id = auth.uid())
);

CREATE POLICY "Owners manage galleries" ON public.galleries FOR ALL
  USING (EXISTS (SELECT 1 FROM public.weddings w WHERE w.id = galleries.wedding_id AND w.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.weddings w WHERE w.id = galleries.wedding_id AND w.user_id = auth.uid()));

CREATE POLICY "Owners manage gallery exclusions" ON public.gallery_excluded_items FOR ALL
  USING (EXISTS (SELECT 1 FROM public.galleries g JOIN public.weddings w ON w.id = g.wedding_id WHERE g.id = gallery_excluded_items.gallery_id AND w.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.galleries g JOIN public.weddings w ON w.id = g.wedding_id WHERE g.id = gallery_excluded_items.gallery_id AND w.user_id = auth.uid()));

CREATE OR REPLACE FUNCTION public.get_gallery_by_token(p_token TEXT)
RETURNS JSONB
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT jsonb_build_object(
    'title', g.title,
    'wedding_name', w.name,
    'wedding_date', w.date,
    'photos', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', m.id,
          'storage_path', m.storage_path,
          'preview_storage_path', m.preview_storage_path
        ) ORDER BY m.created_at
      )
      FROM public.media_items m
      WHERE m.wedding_id = g.wedding_id
        AND m.type = 'photo'
        AND m.upload_status = 'complete'
        AND NOT EXISTS (
          SELECT 1 FROM public.gallery_excluded_items e
          WHERE e.gallery_id = g.id AND e.media_id = m.id
        )
    ), '[]'::jsonb)
  )
  FROM public.galleries g
  JOIN public.weddings w ON w.id = g.wedding_id
  WHERE g.share_token = p_token AND g.is_enabled = true;
$$;

REVOKE ALL ON FUNCTION public.get_gallery_by_token(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_gallery_by_token(TEXT) TO anon, authenticated;

INSERT INTO storage.buckets (id, name, public)
VALUES ('wedding-media', 'wedding-media', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Users can upload media" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can view media" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their media" ON storage.objects;

CREATE POLICY "Users can upload media" ON storage.objects FOR INSERT WITH CHECK (
  bucket_id = 'wedding-media' AND auth.role() = 'authenticated'
);
CREATE POLICY "Anyone can view media" ON storage.objects FOR SELECT USING (
  bucket_id = 'wedding-media'
);
CREATE POLICY "Users can delete their media" ON storage.objects FOR DELETE USING (
  bucket_id = 'wedding-media' AND auth.role() = 'authenticated'
);
