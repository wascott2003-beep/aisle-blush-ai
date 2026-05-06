
CREATE TABLE public.wedding_folders (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  wedding_id UUID NOT NULL,
  name TEXT NOT NULL,
  icon TEXT NOT NULL DEFAULT 'FolderOpen',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (wedding_id, name)
);

ALTER TABLE public.wedding_folders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their wedding folders"
  ON public.wedding_folders FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM weddings WHERE weddings.id = wedding_folders.wedding_id AND weddings.user_id = auth.uid()
  ));

CREATE POLICY "Users can create wedding folders"
  ON public.wedding_folders FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM weddings WHERE weddings.id = wedding_folders.wedding_id AND weddings.user_id = auth.uid()
  ));

CREATE POLICY "Users can delete their wedding folders"
  ON public.wedding_folders FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM weddings WHERE weddings.id = wedding_folders.wedding_id AND weddings.user_id = auth.uid()
  ));
