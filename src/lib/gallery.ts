// Client-gallery data layer.
//
// The `galleries`, `gallery_excluded_items` tables and the
// `get_gallery_by_token` RPC are added by the 20260611000000 migration and are
// NOT in the auto-generated Supabase `Database` types. We isolate the loose
// typing to this module and expose a small, well-typed API to the rest of the
// app.

import { supabase } from '@/integrations/supabase/client';
import { getPublicUrl } from '@/lib/supabase-helpers';

// Escape hatch: the generated types don't know about the gallery tables/RPC.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;

export interface Gallery {
  id: string;
  title: string;
  shareToken: string;
  isEnabled: boolean;
}

export interface GalleryPhoto {
  id: string;
  /** Full-resolution public URL (the downloadable original). */
  url: string;
  /** Smaller public URL for grid thumbnails (falls back to the original). */
  thumbnail: string;
}

export interface PublicGallery {
  title: string;
  weddingName: string;
  weddingDate: string;
  photos: GalleryPhoto[];
}

function mapGalleryRow(row: {
  id: string;
  title: string;
  share_token: string;
  is_enabled: boolean;
}): Gallery {
  return {
    id: row.id,
    title: row.title,
    shareToken: row.share_token,
    isEnabled: row.is_enabled,
  };
}

// ---- Photographer side (authenticated) -------------------------------------

/**
 * Return the wedding's gallery, creating it on first use. There is exactly one
 * gallery per wedding (enforced by a unique constraint).
 */
export async function getOrCreateGallery(weddingId: string, title: string): Promise<Gallery> {
  const { data: existing, error: selErr } = await sb
    .from('galleries')
    .select('id, title, share_token, is_enabled')
    .eq('wedding_id', weddingId)
    .maybeSingle();
  if (selErr) throw selErr;
  if (existing) return mapGalleryRow(existing);

  const { data: created, error: insErr } = await sb
    .from('galleries')
    .insert({ wedding_id: weddingId, title })
    .select('id, title, share_token, is_enabled')
    .single();
  if (insErr) throw insErr;
  return mapGalleryRow(created);
}

/** Media ids the photographer has excluded from a gallery. */
export async function fetchGalleryExclusions(galleryId: string): Promise<Set<string>> {
  const { data, error } = await sb
    .from('gallery_excluded_items')
    .select('media_id')
    .eq('gallery_id', galleryId);
  if (error) throw error;
  return new Set((data || []).map((r: { media_id: string }) => r.media_id));
}

/**
 * Replace the gallery's exclusion set. Simple and predictable: clear the
 * existing rows, then insert the current selection of excluded ids.
 */
export async function setGalleryExclusions(galleryId: string, excludedIds: string[]): Promise<void> {
  const { error: delErr } = await sb
    .from('gallery_excluded_items')
    .delete()
    .eq('gallery_id', galleryId);
  if (delErr) throw delErr;
  if (excludedIds.length === 0) return;
  const rows = excludedIds.map((media_id) => ({ gallery_id: galleryId, media_id }));
  const { error: insErr } = await sb.from('gallery_excluded_items').insert(rows);
  if (insErr) throw insErr;
}

export async function setGalleryEnabled(galleryId: string, isEnabled: boolean): Promise<void> {
  const { error } = await sb.from('galleries').update({ is_enabled: isEnabled }).eq('id', galleryId);
  if (error) throw error;
}

/** Build the shareable client URL for a gallery token. */
export function galleryShareUrl(shareToken: string): string {
  return `${window.location.origin}/gallery/${shareToken}`;
}

// ---- Client side (public, unauthenticated) ---------------------------------

/**
 * Fetch a shared gallery by its token via the security-definer RPC. Returns
 * null when the token is unknown or the gallery has been disabled.
 */
export async function fetchGalleryByToken(token: string): Promise<PublicGallery | null> {
  const { data, error } = await sb.rpc('get_gallery_by_token', { p_token: token });
  if (error) throw error;
  if (!data) return null;

  const photos: GalleryPhoto[] = (data.photos || []).map(
    (p: { id: string; storage_path: string; preview_storage_path: string | null }) => ({
      id: p.id,
      url: getPublicUrl(p.storage_path),
      thumbnail: getPublicUrl(p.preview_storage_path || p.storage_path),
    }),
  );

  return {
    title: data.title,
    weddingName: data.wedding_name,
    weddingDate: data.wedding_date,
    photos,
  };
}
