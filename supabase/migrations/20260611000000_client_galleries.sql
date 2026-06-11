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

ALTER TABLE public.galleries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gallery_excluded_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners manage galleries"
  ON public.galleries FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.weddings w
    WHERE w.id = galleries.wedding_id AND w.user_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.weddings w
    WHERE w.id = galleries.wedding_id AND w.user_id = auth.uid()
  ));

CREATE POLICY "Owners manage gallery exclusions"
  ON public.gallery_excluded_items FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.galleries g
    JOIN public.weddings w ON w.id = g.wedding_id
    WHERE g.id = gallery_excluded_items.gallery_id AND w.user_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.galleries g
    JOIN public.weddings w ON w.id = g.wedding_id
    WHERE g.id = gallery_excluded_items.gallery_id AND w.user_id = auth.uid()
  ));

CREATE INDEX idx_galleries_wedding_id ON public.galleries(wedding_id);

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
