-- Auto-Organize foundations (PR #1): capture time, granular cull reasons, and
-- the wedding day-of timeline. Adds columns to media_items and a new
-- timeline_segments table. Later PRs populate/consume these.

-- When the media was actually shot (for timeline placement) + where we got it.
ALTER TABLE public.media_items ADD COLUMN captured_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE public.media_items ADD COLUMN captured_at_source TEXT
  CHECK (captured_at_source IS NULL OR captured_at_source IN ('exif', 'video_meta', 'file_mtime'));

-- Why an item was culled into the Review folder. Distinct from flag_reason
-- (the upload-time pre-flag), which stays for back-compat.
ALTER TABLE public.media_items ADD COLUMN reject_reason TEXT
  CHECK (reject_reason IS NULL OR reject_reason IN
    ('blurry', 'too_dark', 'overexposed', 'duplicate_burst', 'eyes_closed', 'short_clip'));

-- Perceptual hash + sharpness for client-side duplicate/burst detection (photos).
ALTER TABLE public.media_items ADD COLUMN phash TEXT;
ALTER TABLE public.media_items ADD COLUMN sharpness REAL;

-- Wedding day-of timeline, parsed from the planner's schedule.
CREATE TABLE public.timeline_segments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  wedding_id UUID NOT NULL REFERENCES public.weddings(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  start_time TIMESTAMP WITH TIME ZONE,
  end_time TIMESTAMP WITH TIME ZONE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
CREATE INDEX idx_timeline_segments_wedding ON public.timeline_segments (wedding_id, sort_order);

-- Which timeline segment a media item belongs to (orthogonal to its folder).
ALTER TABLE public.media_items
  ADD COLUMN segment_id UUID REFERENCES public.timeline_segments(id) ON DELETE SET NULL;
CREATE INDEX idx_media_items_segment ON public.media_items (segment_id);

-- RLS on timeline_segments, mirroring the per-owner media/vendor policies.
ALTER TABLE public.timeline_segments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view their segments" ON public.timeline_segments FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.weddings WHERE id = timeline_segments.wedding_id AND user_id = auth.uid())
);
CREATE POLICY "Users can insert their segments" ON public.timeline_segments FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM public.weddings WHERE id = timeline_segments.wedding_id AND user_id = auth.uid())
);
CREATE POLICY "Users can update their segments" ON public.timeline_segments FOR UPDATE USING (
  EXISTS (SELECT 1 FROM public.weddings WHERE id = timeline_segments.wedding_id AND user_id = auth.uid())
);
CREATE POLICY "Users can delete their segments" ON public.timeline_segments FOR DELETE USING (
  EXISTS (SELECT 1 FROM public.weddings WHERE id = timeline_segments.wedding_id AND user_id = auth.uid())
);
