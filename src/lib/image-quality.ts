import type { DecodedImage } from '@/lib/poster-frame';

/** A specific reason a photo looks unqualified, used as the cull reject_reason. */
export type QualityFlag = 'blurry' | 'too_dark' | 'overexposed';

export interface QualityResult {
  /** The most salient quality problem, or null if the photo looks fine. */
  flag: QualityFlag | null;
  /** Laplacian variance — higher means sharper. Reused for burst keep-sharpest. */
  sharpness: number;
}

/**
 * Analyzes an already-decoded image for blur, darkness, and overexposure.
 * Returns the most salient quality flag (or null) plus the sharpness score.
 *
 * Takes a pre-decoded image (see decodeImageFile) rather than a File so the
 * caller can decode once and reuse the same bitmap for both quality analysis
 * and preview generation — decoding a full-resolution photo is the expensive
 * part, and doing it twice per photo is what bogged down large batches.
 */
export function analyzeImageQuality(decoded: DecodedImage): QualityResult {
  const { source, width: srcW, height: srcH } = decoded;
  if (!srcW || !srcH) return { flag: null, sharpness: 0 };

  const canvas = document.createElement('canvas');
  // Downsample for performance
  const maxDim = 200;
  const scale = Math.min(maxDim / srcW, maxDim / srcH, 1);
  canvas.width = Math.floor(srcW * scale);
  canvas.height = Math.floor(srcH * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) return { flag: null, sharpness: 0 };

  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;

  // Check darkness + overexposure: average brightness and blown-highlight share
  let totalBrightness = 0;
  let blownCount = 0;
  const pixelCount = canvas.width * canvas.height;
  for (let i = 0; i < data.length; i += 4) {
    const lum = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
    totalBrightness += lum;
    if (lum > 250) blownCount += 1;
  }
  const avgBrightness = totalBrightness / pixelCount;
  const blownFraction = blownCount / pixelCount;

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

  // Thresholds (tuned conservatively for typical wedding photos — over-culling
  // is worse than under-culling since everything lands in Review anyway).
  const isDark = avgBrightness < 40;
  const isOverexposed = avgBrightness > 220 || blownFraction > 0.25;
  const isBlurry = laplacianVariance < 50;

  // Check exposure problems before blur: a very dark frame also has low
  // Laplacian variance and would otherwise be mislabeled "blurry".
  let flag: QualityFlag | null = null;
  if (isDark) flag = 'too_dark';
  else if (isOverexposed) flag = 'overexposed';
  else if (isBlurry) flag = 'blurry';

  return { flag, sharpness: laplacianVariance };
}
