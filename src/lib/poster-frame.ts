// Generates a JPEG poster frame from a video file for instant thumbnails.
const POSTER_TIMEOUT_MS = 8000;
const POSTER_MAX_DIM = 720;
const POSTER_QUALITY = 0.72;
const POSTER_SEEK_SECONDS = 1;

export async function generateVideoPoster(file: File): Promise<Blob | null> {
  return new Promise((resolve) => {
    const video = document.createElement('video');
    const url = URL.createObjectURL(file);
    let settled = false;

    const finish = (value: Blob | null) => {
      if (settled) return;
      settled = true;
      URL.revokeObjectURL(url);
      resolve(value);
    };

    video.preload = 'metadata';
    video.muted = true;
    video.playsInline = true;
    video.crossOrigin = 'anonymous';

    video.onloadedmetadata = () => {
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

// Downscale a photo to a smaller preview JPEG so the grid loads instantly.
const PHOTO_PREVIEW_MAX_DIM = 1024;
const PHOTO_PREVIEW_QUALITY = 0.78;

export async function generatePhotoPreview(file: File): Promise<Blob | null> {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    let settled = false;

    const finish = (value: Blob | null) => {
      if (settled) return;
      settled = true;
      URL.revokeObjectURL(url);
      resolve(value);
    };

    img.onload = () => {
      try {
        const w = img.naturalWidth;
        const h = img.naturalHeight;
        if (!w || !h) return finish(null);
        const scale = Math.min(1, PHOTO_PREVIEW_MAX_DIM / Math.max(w, h));
        // If photo is already small, skip — let the original act as preview.
        if (scale >= 1 && file.size < 500 * 1024) return finish(null);
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(w * scale);
        canvas.height = Math.round(h * scale);
        const ctx = canvas.getContext('2d');
        if (!ctx) return finish(null);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        canvas.toBlob((blob) => finish(blob), 'image/jpeg', PHOTO_PREVIEW_QUALITY);
      } catch {
        finish(null);
      }
    };

    img.onerror = () => finish(null);
    img.src = url;
    window.setTimeout(() => finish(null), POSTER_TIMEOUT_MS);
  });
}
