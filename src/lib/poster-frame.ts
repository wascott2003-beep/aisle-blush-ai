// Generates a JPEG poster frame from a video file for instant thumbnails.
const POSTER_TIMEOUT_MS = 12000;
const POSTER_MAX_DIM = 720;
const POSTER_QUALITY = 0.72;
const POSTER_SEEK_SECONDS = 1;

/**
 * Extract duration AND poster from a single <video> load so iOS only
 * materialises the file once. Returns both in one pass to avoid the
 * browser freeze that happened when two video elements were created per file.
 */
export async function extractVideoMeta(
  file: File,
): Promise<{ duration: number | null; poster: Blob | null }> {
  return new Promise((resolve) => {
    const video = document.createElement('video');
    const url = URL.createObjectURL(file);
    let settled = false;
    let duration: number | null = null;

    const finish = (poster: Blob | null) => {
      if (settled) return;
      settled = true;
      URL.revokeObjectURL(url);
      resolve({ duration, poster });
    };

    video.preload = 'metadata';
    video.muted = true;
    video.playsInline = true;
    // Don't set crossOrigin — file is a local blob URL.

    video.onloadedmetadata = () => {
      duration = Number.isFinite(video.duration) ? video.duration : null;
      const target = Math.min(POSTER_SEEK_SECONDS, Math.max(0, (video.duration || 0) - 0.1));
      try {
        video.currentTime = target;
      } catch {
        finish(null);
      }
    };

    video.onseeked = () => {
      try {
        const w = video.videoWidth;
        const h = video.videoHeight;
        if (!w || !h) return finish(null);

        const scale = Math.min(1, POSTER_MAX_DIM / Math.max(w, h));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(w * scale);
        canvas.height = Math.round(h * scale);
        const ctx = canvas.getContext('2d');
        if (!ctx) return finish(null);
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        canvas.toBlob((blob) => finish(blob), 'image/jpeg', POSTER_QUALITY);
      } catch {
        finish(null);
      }
    };

    video.onerror = () => finish(null);
    video.src = url;

    window.setTimeout(() => finish(null), POSTER_TIMEOUT_MS);
  });
}

/** @deprecated – use extractVideoMeta instead */
export async function generateVideoPoster(file: File): Promise<Blob | null> {
  const { poster } = await extractVideoMeta(file);
  return poster;
}

// A decoded image plus the metadata needed to draw it to a canvas, along with
// a disposer that frees the underlying bitmap/object-URL. Decoding a full-res
// photo is the expensive part of upload prep, so we decode each file ONCE and
// reuse the result for both quality analysis and preview generation.
export interface DecodedImage {
  source: CanvasImageSource;
  width: number;
  height: number;
  /** Release the decoded bitmap immediately rather than waiting for GC. */
  close(): void;
}

/**
 * Decode an image file a single time into a disposable handle.
 *
 * Prefers createImageBitmap: it decodes off the main thread (less UI jank on
 * big batches) and returns a bitmap we can free deterministically via close(),
 * so peak memory stays bounded even when many photos are prepared in parallel.
 * Falls back to an <img> element for formats createImageBitmap can't handle
 * (e.g. HEIC on Safari, which decodes via the platform image pipeline).
 */
export async function decodeImageFile(file: File | Blob): Promise<DecodedImage | null> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file);
      return {
        source: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        close: () => bitmap.close(),
      };
    } catch {
      // Fall through to the <img> path below.
    }
  }
  return decodeViaImageElement(file);
}

function decodeViaImageElement(file: File | Blob): Promise<DecodedImage | null> {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    let settled = false;

    const fail = () => {
      if (settled) return;
      settled = true;
      URL.revokeObjectURL(url);
      resolve(null);
    };

    img.onload = () => {
      if (settled) return;
      const width = img.naturalWidth;
      const height = img.naturalHeight;
      if (!width || !height) return fail();
      settled = true;
      // Defer revoking the object URL until the caller is done drawing.
      resolve({ source: img, width, height, close: () => URL.revokeObjectURL(url) });
    };

    img.onerror = fail;
    img.src = url;
    window.setTimeout(fail, POSTER_TIMEOUT_MS);
  });
}

// Downscale a photo to a smaller preview JPEG so the grid loads instantly.
const PHOTO_PREVIEW_MAX_DIM = 1024;
const PHOTO_PREVIEW_QUALITY = 0.78;

/**
 * Build a small preview JPEG from an already-decoded image. Returns null when
 * the photo is already small enough to act as its own preview (so the original
 * is used directly), or if the canvas can't be created.
 */
export async function generatePhotoPreview(
  decoded: DecodedImage,
  originalSize: number,
): Promise<Blob | null> {
  const { source, width: w, height: h } = decoded;
  if (!w || !h) return null;
  const scale = Math.min(1, PHOTO_PREVIEW_MAX_DIM / Math.max(w, h));
  // If photo is already small, skip — let the original act as preview.
  if (scale >= 1 && originalSize < 500 * 1024) return null;
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(w * scale);
  canvas.height = Math.round(h * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), 'image/jpeg', PHOTO_PREVIEW_QUALITY);
  });
}
