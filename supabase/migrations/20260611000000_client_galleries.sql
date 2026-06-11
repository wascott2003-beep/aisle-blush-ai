-- Client galleries: a photographer can share a single gallery per wedding via
-- an unguessable token. The client opens /gallery/:token (unauthenticated) and
-- can view + download the photos.
--
-- Selection model: a gallery includes ALL completed photos for its wedding by
-- default. The photographer "deselects" photos by recording them as exclusions,
-- so newly uploaded photos appear in the gallery automatically.

CREATE TABLE public.galleries (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  wedding_id UUID NOT NULL REFERENCES public.weddings(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  -- 32 hex chars (~122 bits) — unguessable share token used in the public URL.
  share_token TEXT NOT NULL UNIQUE DEFAULT replace(gen_random_uuid()::text, '-', ''),
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  -- One gallery per wedding keeps the mental model simple.
  UNIQUE (wedding_id)
);

CREATE TABLE public.gallery_excluded_items (
  gallery_id UUID NOT NULL REFERENCES public.galleries(id) ON DELETE CASCADE,
  media_id UUID NOT NULL REFERENCES public.media_items(id) ON DELETE CASCADE,
  PRIMARY KEY (gallery_id, media_id)
);

ALTER TABLE public.galleries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gallery_excluded_items ENABLE ROW LEVEL SECURITY;

-- Photographers (owners) manage their own galleries via wedding ownership.
-- Note: there is intentionally NO anon SELECT policy — the public read path
-- goes exclusively through get_gallery_by_token() below, so galleries cannot
-- be enumerated even though the bucket is public.
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

-- Public read: returns a gallery (and its included photos) for a share token,
-- bypassing RLS but ONLY for the row matching the token. Runs as the function
-- owner (SECURITY DEFINER); search_path is pinned to prevent hijacking.
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

-- Lock down execution: only callable, never readable as a table.
REVOKE ALL ON FUNCTION public.get_gallery_by_token(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_gallery_by_token(TEXT) TO anon, authenticated;
