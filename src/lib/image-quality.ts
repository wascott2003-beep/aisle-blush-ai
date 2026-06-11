import type { DecodedImage } from '@/lib/poster-frame';

/**
 * Analyzes an already-decoded image for blur and darkness using canvas.
 * Returns a flag reason if the image is low quality, or null if it's fine.
 *
 * Takes a pre-decoded image (see decodeImageFile) rather than a File so the
 * caller can decode once and reuse the same bitmap for both quality analysis
 * and preview generation — decoding a full-resolution photo is the expensive
 * part, and doing it twice per photo is what bogged down large batches.
 */
export function analyzeImageQuality(decoded: DecodedImage): 'low_quality_photo' | null {
  const { source, width: srcW, height: srcH } = decoded;
  if (!srcW || !srcH) return null;

  const canvas = document.createElement('canvas');
  // Downsample for performance
  const maxDim = 200;
  const scale = Math.min(maxDim / srcW, maxDim / srcH, 1);
  canvas.width = Math.floor(srcW * scale);
  canvas.height = Math.floor(srcH * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;

  // Check darkness: average brightness
  let totalBrightness = 0;
  const pixelCount = canvas.width * canvas.height;
  for (let i = 0; i < data.length; i += 4) {
    totalBrightness += (data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114);
  }
  const avgBrightness = totalBrightness / pixelCount;

  // Check blur: Laplacian variance on grayscale
  const gray = new Float32Array(pixelCount);
  for (let i = 0; i < pixelCount; i++) {
    const pi = i * 4;
    gray[i] = data[pi] * 0.299 + data[pi + 1] * 0.587 + data[pi + 2] * 0.114;
  }
  const w = canvas.width;
  const h = canvas.height;
  let laplacianSum = 0;
  let laplacianCount = 0;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const idx = y * w + x;
      const lap = gray[idx - w] + gray[idx + w] + gray[idx - 1] + gray[idx + 1] - 4 * gray[idx];
      laplacianSum += lap * lap;
      laplacianCount++;
    }
  }
  const laplacianVariance = laplacianSum / laplacianCount;

  // Thresholds (tuned for typical wedding photos)
  const isDark = avgBrightness < 40;
  const isBlurry = laplacianVariance < 50;

  return (isDark || isBlurry) ? 'low_quality_photo' : null;
}
