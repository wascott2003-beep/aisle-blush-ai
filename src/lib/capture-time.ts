// Extracts the real capture time (when a photo/video was shot) so media can be
// placed onto the wedding's day-of timeline.
//
// Photos: reliable — read EXIF DateTimeOriginal via the `exifr` library.
// Videos: best-effort — browsers expose no creation-time API, so we scan the
//   MP4/MOV header for the `mvhd` box. Many cameras write a bad/zero value, so
//   this often fails and we fall back to the file's modified time.
// Anything else falls back to file.lastModified.

export type CaptureSource = 'exif' | 'video_meta' | 'file_mtime';

export interface CaptureTime {
  date: Date;
  source: CaptureSource;
}

// QuickTime/MP4 timestamps count seconds from 1904-01-01 UTC; Unix counts from
// 1970-01-01. This is the offset between the two epochs, in seconds.
const MAC_EPOCH_OFFSET_SECONDS = 2082844800;

/** Best available capture time for a file, with the source it came from. */
export async function extractCaptureTime(file: File): Promise<CaptureTime | null> {
  if (file.type.startsWith('image/')) {
    const exif = await extractPhotoCaptureTime(file).catch(() => null);
    if (exif) return { date: exif, source: 'exif' };
  } else if (file.type.startsWith('video/')) {
    const vid = await extractVideoCaptureTime(file).catch(() => null);
    if (vid) return { date: vid, source: 'video_meta' };
  }
  const fallback = fallbackCaptureTime(file);
  return fallback ? { date: fallback, source: 'file_mtime' } : null;
}

/** EXIF capture time for a photo, or null if absent (screenshots, stripped images). */
export async function extractPhotoCaptureTime(file: File): Promise<Date | null> {
  // Lazy-import so exifr isn't in the initial bundle. exifr reads only the
  // header bytes, so this does not require a full image decode.
  const { default: exifr } = await import('exifr');
  const meta = await exifr.parse(file, { pick: ['DateTimeOriginal', 'CreateDate'] });
  const dt: unknown = meta?.DateTimeOriginal ?? meta?.CreateDate;
  if (dt instanceof Date && !Number.isNaN(dt.getTime())) return dt;
  return null;
}

/** Best-effort capture time from an MP4/MOV `mvhd` box, or null if unreadable. */
export async function extractVideoCaptureTime(file: File): Promise<Date | null> {
  // The `moov`/`mvhd` atom is usually near the start; reading the first couple
  // MB catches most files without loading the whole video. If moov is at the
  // end (some cameras), we miss it and the caller falls back to file mtime.
  const HEADER_BYTES = 2 * 1024 * 1024;
  const slice = file.slice(0, Math.min(file.size, HEADER_BYTES));
  const view = new DataView(await slice.arrayBuffer());

  const MVHD = 0x6d766864; // 'mvhd'
  for (let i = 0; i + 16 < view.byteLength; i++) {
    if (view.getUint32(i) !== MVHD) continue;
    // Box payload begins right after the 4-char tag: version(1) + flags(3).
    const version = view.getUint8(i + 4);
    let creation: number;
    if (version === 1) {
      // 64-bit creation_time. DataView has no getUint64, so combine two reads.
      const hi = view.getUint32(i + 8);
      const lo = view.getUint32(i + 12);
      creation = hi * 2 ** 32 + lo;
    } else {
      creation = view.getUint32(i + 8);
    }
    if (!creation) return null;
    const date = new Date((creation - MAC_EPOCH_OFFSET_SECONDS) * 1000);
    const year = date.getUTCFullYear();
    if (year < 1990 || year > 2100) return null; // reject obviously-bogus values
    return date;
  }
  return null;
}

/** OS file-modified time. Close to capture time on a fresh card dump; copy time otherwise. */
export function fallbackCaptureTime(file: File): Date | null {
  if (!file.lastModified) return null;
  const date = new Date(file.lastModified);
  return Number.isNaN(date.getTime()) ? null : date;
}
