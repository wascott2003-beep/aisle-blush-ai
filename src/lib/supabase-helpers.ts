import { supabase } from '@/integrations/supabase/client';
import { Wedding, MediaItem, Vendor, ProjectType } from '@/lib/types';

const WEDDING_FOLDER_NAMES = ['Getting Ready', 'Ceremony', 'Portraits', 'Reception', 'Details', 'Miscellaneous'];
const WEDDING_FOLDER_ICONS = ['Sparkles', 'Heart', 'Camera', 'PartyPopper', 'Gem', 'FolderOpen'];
const EVENT_FOLDER_NAMES = ['Miscellaneous'];
const EVENT_FOLDER_ICONS = ['FolderOpen'];
const UNSORTED_FOLDER = 'Unsorted';
const UNSORTED_ICON = 'Inbox';

export function presetFoldersFor(type: ProjectType): { names: string[]; icons: string[] } {
  return type === 'event'
    ? { names: EVENT_FOLDER_NAMES, icons: EVENT_FOLDER_ICONS }
    : { names: WEDDING_FOLDER_NAMES, icons: WEDDING_FOLDER_ICONS };
}

export function getPublicUrl(path: string): string {
  const { data } = supabase.storage.from('wedding-media').getPublicUrl(path);
  return data.publicUrl;
}

export async function uploadMediaFile(
  weddingId: string,
  file: File | Blob,
  folder: string,
  ext: string,
  subdir: 'original' | 'preview' = 'original',
): Promise<{ storagePath: string; publicUrl: string }> {
  const storagePath = `${weddingId}/${folder}/${subdir}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage
    .from('wedding-media')
    .upload(storagePath, file, { upsert: false, contentType: (file as File).type || undefined });
  if (error) throw error;
  return { storagePath, publicUrl: getPublicUrl(storagePath) };
}

export async function createWeddingInDb(userId: string, name: string, date: string, type: ProjectType = 'wedding'): Promise<string> {
  const { data, error } = await supabase
    .from('weddings')
    .insert({ user_id: userId, name, date, project_type: type })
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
  id?: string;
  wedding_id: string;
  type: string;
  folder: string;
  storage_path: string;
  preview_storage_path?: string | null;
  upload_status?: 'pending' | 'complete';
  flag_reason?: string | null;
  duration?: number | null;
  captured_at?: string | null;
  captured_at_source?: string | null;
  reject_reason?: string | null;
  sharpness?: number | null;
  phash?: string | null;
}): Promise<string> {
  const { data, error } = await supabase
    .from('media_items')
    .insert(item)
    .select('id')
    .single();
  if (error) throw error;
  return data.id;
}

export async function insertMediaItems(items: Array<{
  id: string;
  wedding_id: string;
  type: string;
  folder: string;
  storage_path: string;
  preview_storage_path?: string | null;
  upload_status?: 'pending' | 'complete';
  flag_reason?: string | null;
  duration?: number | null;
  captured_at?: string | null;
  captured_at_source?: string | null;
  reject_reason?: string | null;
  sharpness?: number | null;
  phash?: string | null;
}>) {
  if (items.length === 0) return;
  const { error } = await supabase.from('media_items').insert(items);
  if (error) throw error;
}

export async function updateMediaItemStatus(
  id: string,
  patch: { storage_path?: string; upload_status?: 'pending' | 'complete' | 'failed' },
) {
  const { error } = await supabase.from('media_items').update(patch).eq('id', id);
  if (error) throw error;
}

export async function deleteMediaItem(id: string) {
  const { error } = await supabase.from('media_items').delete().eq('id', id);
  if (error) throw error;
}

export async function fetchPendingMediaForWedding(weddingId: string) {
  const { data, error } = await supabase
    .from('media_items')
    .select('id, storage_path, preview_storage_path')
    .eq('wedding_id', weddingId)
    .eq('upload_status', 'pending');
  if (error) throw error;
  return data || [];
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
    const [{ data: media }, { data: vendors }, { data: customFolders }] = await Promise.all([
      supabase.from('media_items').select('*').eq('wedding_id', w.id),
      supabase.from('vendors').select('*').eq('wedding_id', w.id),
      supabase.from('wedding_folders').select('*').eq('wedding_id', w.id).order('created_at', { ascending: true }),
    ]);

    const items: MediaItem[] = (media || []).map((m) => {
      const previewPath = (m as { preview_storage_path?: string | null }).preview_storage_path;
      const status = (m as { upload_status?: string }).upload_status as MediaItem['uploadStatus'] | undefined;
      const thumbPath = previewPath || m.storage_path;
      const mm = m as {
        captured_at?: string | null;
        reject_reason?: string | null;
        segment_id?: string | null;
      };
      return {
        id: m.id,
        type: m.type as 'photo' | 'video',
        url: getPublicUrl(m.storage_path),
        thumbnail: getPublicUrl(thumbPath),
        folder: m.folder,
        duration: m.duration ?? undefined,
        flagReason: m.flag_reason as MediaItem['flagReason'],
        uploadStatus: status || 'complete',
        capturedAt: mm.captured_at ?? undefined,
        rejectReason: (mm.reject_reason ?? undefined) as MediaItem['rejectReason'],
        segmentId: mm.segment_id ?? undefined,
      };
    });

    const projectType: ProjectType = ((w as { project_type?: string }).project_type === 'event' ? 'event' : 'wedding');
    const preset = presetFoldersFor(projectType);

    // Preset folders
    const folders = preset.names.map((fn, i) => ({
      name: fn,
      icon: preset.icons[i],
      items: items.filter((it) => it.folder === fn),
    }));

    // Append custom folders
    for (const cf of customFolders || []) {
      folders.push({
        name: cf.name,
        icon: cf.icon || 'FolderOpen',
        items: items.filter((it) => it.folder === cf.name),
      });
    }

    // Show "Unsorted" first, but only when it actually has items.
    const unsortedItems = items.filter((it) => it.folder === UNSORTED_FOLDER);
    if (unsortedItems.length > 0) {
      folders.unshift({ name: UNSORTED_FOLDER, icon: UNSORTED_ICON, items: unsortedItems });
    }

    const flaggedItems = items.filter((it) => it.flagReason);
    const shortClips = items.filter((it) => it.flagReason === 'short_clip');

    const vendorList: Vendor[] = (vendors || []).map((v) => ({
      id: v.id,
      type: v.type as Vendor['type'],
      businessName: v.business_name,
      instagram: v.instagram,
      website: v.website ?? undefined,
    }));

    const firstPhoto = items.find((it) => it.type === 'photo');

    result.push({
      id: w.id,
      name: w.name,
      date: w.date,
      type: projectType,
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

export async function fetchUnsortedItems(weddingId: string) {
  const { data, error } = await supabase
    .from('media_items')
    .select('id, type, storage_path, preview_storage_path, upload_status')
    .eq('wedding_id', weddingId)
    .eq('folder', 'Unsorted');
  if (error) throw error;
  return (data || []).map((m) => {
    const previewPath = (m as { preview_storage_path?: string | null }).preview_storage_path;
    const status = (m as { upload_status?: string }).upload_status;
    const type = m.type as 'photo' | 'video';
    // Sortable if we have a real image to show the AI:
    // - photos: only when fully uploaded (storage_path is the real photo)
    // - videos: only when a preview thumbnail was generated
    const sortable = type === 'photo' ? status === 'complete' && !!m.storage_path : !!previewPath;
    const thumbPath = previewPath || m.storage_path;
    return {
      id: m.id,
      type,
      thumbnailUrl: getPublicUrl(thumbPath),
      sortable,
    };
  });
}

export async function bulkUpdateMediaItemFolder(ids: string[], folder: string) {
  if (ids.length === 0) return;
  const { error } = await supabase.from('media_items').update({ folder }).in('id', ids);
  if (error) throw error;
}

export async function updateMediaItemFolder(id: string, folder: string) {
  const { error } = await supabase.from('media_items').update({ folder }).eq('id', id);
  if (error) throw error;
}

export async function createCustomFolder(weddingId: string, name: string): Promise<string> {
  const { data, error } = await supabase
    .from('wedding_folders')
    .insert({ wedding_id: weddingId, name, icon: 'FolderOpen' })
    .select('id')
    .single();
  if (error) throw error;
  return data.id;
}

export async function deleteCustomFolder(weddingId: string, folderName: string) {
  const { error } = await supabase
    .from('wedding_folders')
    .delete()
    .eq('wedding_id', weddingId)
    .eq('name', folderName);
  if (error) throw error;
}
