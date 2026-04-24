import { supabase } from '@/integrations/supabase/client';
import { Wedding, MediaItem, Vendor } from '@/lib/types';

const FOLDER_NAMES = ['Getting Ready', 'Ceremony', 'Portraits', 'Reception', 'Details', 'Miscellaneous'];
const FOLDER_ICONS = ['Sparkles', 'Heart', 'Camera', 'PartyPopper', 'Gem', 'FolderOpen'];

export function getPublicUrl(path: string): string {
  const { data } = supabase.storage.from('wedding-media').getPublicUrl(path);
  return data.publicUrl;
}

export async function uploadMediaFile(
  weddingId: string,
  file: File,
  folder: string,
  onProgress?: (pct: number) => void,
): Promise<{ storagePath: string; publicUrl: string }> {
  const ext = file.name.split('.').pop() || 'bin';
  const storagePath = `${weddingId}/${folder}/${crypto.randomUUID()}.${ext}`;

  const { error } = await supabase.storage
    .from('wedding-media')
    .upload(storagePath, file, { upsert: false });
  if (error) throw error;

  return { storagePath, publicUrl: getPublicUrl(storagePath) };
}

export async function createWeddingInDb(userId: string, name: string, date: string): Promise<string> {
  const { data, error } = await supabase
    .from('weddings')
    .insert({ user_id: userId, name, date })
    .select('id')
    .single();
  if (error) throw error;
  return data.id;
}

export async function deleteWeddingById(id: string) {
  const { error } = await supabase.from('weddings').delete().eq('id', id);
  if (error) throw error;
}

export async function insertMediaItem(item: {
  wedding_id: string;
  type: string;
  folder: string;
  storage_path: string;
  flag_reason?: string | null;
  duration?: number | null;
}) {
  const { error } = await supabase.from('media_items').insert(item);
  if (error) throw error;
}

export async function deleteMediaItem(id: string) {
  const { error } = await supabase.from('media_items').delete().eq('id', id);
  if (error) throw error;
}

export async function fetchWeddings(userId: string): Promise<Wedding[]> {
  const { data: weddings, error } = await supabase
    .from('weddings')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  if (!weddings) return [];

  const result: Wedding[] = [];
  for (const w of weddings) {
    const { data: media } = await supabase
      .from('media_items')
      .select('*')
      .eq('wedding_id', w.id);

    const { data: vendors } = await supabase
      .from('vendors')
      .select('*')
      .eq('wedding_id', w.id);

    const items: MediaItem[] = (media || []).map((m) => ({
      id: m.id,
      type: m.type as 'photo' | 'video',
      url: getPublicUrl(m.storage_path),
      thumbnail: getPublicUrl(m.storage_path),
      folder: m.folder,
      duration: m.duration ?? undefined,
      flagReason: m.flag_reason as MediaItem['flagReason'],
    }));

    const folders = FOLDER_NAMES.map((fn, i) => ({
      name: fn,
      icon: FOLDER_ICONS[i],
      items: items.filter((it) => it.folder === fn),
    }));

    const flaggedItems = items.filter((it) => it.flagReason);
    const shortClips = items.filter((it) => it.flagReason === 'short_clip');

    const vendorList: Vendor[] = (vendors || []).map((v) => ({
      id: v.id,
      type: v.type as Vendor['type'],
      businessName: v.business_name,
      instagram: v.instagram,
      website: v.website ?? undefined,
    }));

    // Use first photo as thumbnail
    const firstPhoto = items.find((it) => it.type === 'photo');

    result.push({
      id: w.id,
      name: w.name,
      date: w.date,
      thumbnail: firstPhoto?.thumbnail || '/placeholder.svg',
      mediaCount: items.length,
      folders,
      shortClips,
      flaggedItems,
      vendors: vendorList,
    });
  }

  return result;
}

export async function saveVendor(weddingId: string, vendor: Vendor) {
  const { error } = await supabase.from('vendors').upsert({
    id: vendor.id,
    wedding_id: weddingId,
    type: vendor.type,
    business_name: vendor.businessName,
    instagram: vendor.instagram,
    website: vendor.website || null,
  });
  if (error) throw error;
}

export async function deleteVendor(vendorId: string) {
  const { error } = await supabase.from('vendors').delete().eq('id', vendorId);
  if (error) throw error;
}
