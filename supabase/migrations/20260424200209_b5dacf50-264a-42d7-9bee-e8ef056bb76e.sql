ALTER TABLE public.media_items
  ADD COLUMN preview_storage_path text,
  ADD COLUMN upload_status text NOT NULL DEFAULT 'complete';

CREATE INDEX idx_media_items_pending
  ON public.media_items (wedding_id, upload_status)
  WHERE upload_status = 'pending';

DROP POLICY IF EXISTS "Users can update their media" ON public.media_items;
CREATE POLICY "Users can update their media"
ON public.media_items
FOR UPDATE
USING (EXISTS (
  SELECT 1 FROM weddings
  WHERE weddings.id = media_items.wedding_id
    AND weddings.user_id = auth.uid()
));