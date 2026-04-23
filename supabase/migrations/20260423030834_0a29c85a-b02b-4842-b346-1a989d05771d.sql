
-- Create weddings table
CREATE TABLE public.weddings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  date DATE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create media_items table
CREATE TABLE public.media_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  wedding_id UUID REFERENCES public.weddings(id) ON DELETE CASCADE NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('photo', 'video')),
  folder TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  flag_reason TEXT CHECK (flag_reason IN ('short_clip', 'low_quality_photo')),
  duration REAL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create vendors table
CREATE TABLE public.vendors (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  wedding_id UUID REFERENCES public.weddings(id) ON DELETE CASCADE NOT NULL,
  type TEXT NOT NULL,
  business_name TEXT NOT NULL,
  instagram TEXT NOT NULL,
  website TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.weddings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.media_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendors ENABLE ROW LEVEL SECURITY;

-- Weddings policies
CREATE POLICY "Users can view their own weddings" ON public.weddings FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create weddings" ON public.weddings FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own weddings" ON public.weddings FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own weddings" ON public.weddings FOR DELETE USING (auth.uid() = user_id);

-- Media items policies (via wedding ownership)
CREATE POLICY "Users can view their media" ON public.media_items FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.weddings WHERE id = media_items.wedding_id AND user_id = auth.uid())
);
CREATE POLICY "Users can insert media" ON public.media_items FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM public.weddings WHERE id = media_items.wedding_id AND user_id = auth.uid())
);
CREATE POLICY "Users can delete their media" ON public.media_items FOR DELETE USING (
  EXISTS (SELECT 1 FROM public.weddings WHERE id = media_items.wedding_id AND user_id = auth.uid())
);

-- Vendors policies
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

-- Create storage bucket for wedding media
INSERT INTO storage.buckets (id, name, public) VALUES ('wedding-media', 'wedding-media', true);

-- Storage policies
CREATE POLICY "Users can upload media" ON storage.objects FOR INSERT WITH CHECK (
  bucket_id = 'wedding-media' AND auth.role() = 'authenticated'
);
CREATE POLICY "Anyone can view media" ON storage.objects FOR SELECT USING (
  bucket_id = 'wedding-media'
);
CREATE POLICY "Users can delete their media" ON storage.objects FOR DELETE USING (
  bucket_id = 'wedding-media' AND auth.role() = 'authenticated'
);
