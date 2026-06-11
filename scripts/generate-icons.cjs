#!/usr/bin/env node
/*
 * Generates the PWA / iOS home-screen icons for Aisle AI from the real brand
 * logo (src/assets/aisle-logo.png — the rose-gold floral "A" monogram), with
 * zero external dependencies (Node's built-in zlib only).
 *
 * Pipeline: decode the logo PNG -> auto-crop transparent/white margins ->
 * bilinearly scale the monogram onto an opaque soft-blush background (iOS
 * requires opaque, full-bleed square icons) -> re-encode as PNG.
 *
 * Run: node scripts/generate-icons.cjs
 */
const zlib = require('zlib');
const fs = require('fs');
const path = require('path');

// Soft blush background (app --accent ~ hsl(350 30% 92%)) so the rose-gold
// monogram stays visible on white home screens while feeling on-brand.
const BG = [244, 232, 233];

// ---- PNG CRC + chunk helpers ------------------------------------------------
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}
function encodePNG(width, height, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6; // RGBA
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

// ---- PNG decode (8-bit, color type 2/6, non-interlaced) ---------------------
function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  return pb <= pc ? b : c;
}
function decodePNG(buf) {
  let pos = 8; // skip signature
  let width = 0, height = 0, colorType = 0, bitDepth = 0, interlace = 0;
  const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString('ascii', pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
      interlace = data[12];
    } else if (type === 'IDAT') {
      idat.push(data);
    } else if (type === 'IEND') {
      break;
    }
    pos += 12 + len;
  }
  if (bitDepth !== 8 || interlace !== 0 || (colorType !== 6 && colorType !== 2)) {
    throw new Error(`Unsupported PNG (bitDepth=${bitDepth}, colorType=${colorType}, interlace=${interlace})`);
  }
  const channels = colorType === 6 ? 4 : 3;
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const out = Buffer.alloc(width * height * 4);
  const prev = Buffer.alloc(stride);
  const cur = Buffer.alloc(stride);
  let rp = 0;
  for (let y = 0; y < height; y++) {
    const filter = raw[rp++];
    for (let x = 0; x < stride; x++) {
      const rawV = raw[rp++];
      const a = x >= channels ? cur[x - channels] : 0;
      const b = prev[x];
      const c = x >= channels ? prev[x - channels] : 0;
      let v;
      switch (filter) {
        case 0: v = rawV; break;
        case 1: v = rawV + a; break;
        case 2: v = rawV + b; break;
        case 3: v = rawV + ((a + b) >> 1); break;
        case 4: v = rawV + paeth(a, b, c); break;
        default: throw new Error(`Bad filter ${filter}`);
      }
      cur[x] = v & 0xff;
    }
    for (let x = 0; x < width; x++) {
      const si = x * channels;
      const di = (y * width + x) * 4;
      out[di] = cur[si];
      out[di + 1] = cur[si + 1];
      out[di + 2] = cur[si + 2];
      out[di + 3] = channels === 4 ? cur[si + 3] : 255;
    }
    cur.copy(prev);
  }
  return { width, height, data: out };
}

// ---- Auto-crop to the monogram's content bounding box -----------------------
// "Content" = visible (alpha) and not near-white, so it works whether the logo
// background is transparent or white.
function contentBounds({ width, height, data }) {
  let minX = width, minY = height, maxX = -1, maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const alpha = data[i + 3];
      const nearWhite = data[i] > 244 && data[i + 1] > 244 && data[i + 2] > 244;
      if (alpha > 32 && !nearWhite) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return { x: 0, y: 0, w: width, h: height }; // fallback: whole image
  return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

// Bilinear sample (with alpha) from src at floating (sx, sy).
function sample(src, sx, sy) {
  const { width, height, data } = src;
  sx = Math.max(0, Math.min(width - 1, sx));
  sy = Math.max(0, Math.min(height - 1, sy));
  const x0 = Math.floor(sx), y0 = Math.floor(sy);
  const x1 = Math.min(width - 1, x0 + 1), y1 = Math.min(height - 1, y0 + 1);
  const fx = sx - x0, fy = sy - y0;
  const out = [0, 0, 0, 0];
  for (let c = 0; c < 4; c++) {
    const p00 = data[(y0 * width + x0) * 4 + c];
    const p10 = data[(y0 * width + x1) * 4 + c];
    const p01 = data[(y1 * width + x0) * 4 + c];
    const p11 = data[(y1 * width + x1) * 4 + c];
    const top = p00 + (p10 - p00) * fx;
    const bot = p01 + (p11 - p01) * fx;
    out[c] = top + (bot - top) * fy;
  }
  return out;
}

// Render the cropped monogram centered on a `bgFill` square of `size`, with the
// monogram occupying `contentFrac` of the canvas (rest is padding).
function renderIcon(src, crop, size, contentFrac) {
  const dst = Buffer.alloc(size * size * 4);
  // Fill background (opaque).
  for (let i = 0; i < size * size; i++) {
    dst[i * 4] = BG[0];
    dst[i * 4 + 1] = BG[1];
    dst[i * 4 + 2] = BG[2];
    dst[i * 4 + 3] = 255;
  }
  // Fit the crop into a centered box of side = size * contentFrac, preserving
  // aspect ratio.
  const box = size * contentFrac;
  const scale = Math.min(box / crop.w, box / crop.h);
  const drawW = crop.w * scale;
  const drawH = crop.h * scale;
  const offX = (size - drawW) / 2;
  const offY = (size - drawH) / 2;

  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      if (px < offX || px >= offX + drawW || py < offY || py >= offY + drawH) continue;
      const sx = crop.x + (px - offX) / scale;
      const sy = crop.y + (py - offY) / scale;
      const [r, g, b, a] = sample(src, sx, sy);
      const alpha = a / 255;
      const di = (py * size + px) * 4;
      // Composite monogram over the background (premultiplied by alpha).
      dst[di] = Math.round(r * alpha + BG[0] * (1 - alpha));
      dst[di + 1] = Math.round(g * alpha + BG[1] * (1 - alpha));
      dst[di + 2] = Math.round(b * alpha + BG[2] * (1 - alpha));
      dst[di + 3] = 255;
    }
  }
  return encodePNG(size, size, dst);
}

// ---- Run --------------------------------------------------------------------
const logoPath = path.resolve(__dirname, '..', 'src', 'assets', 'aisle-logo.png');
const outDir = path.resolve(__dirname, '..', 'public');
const src = decodePNG(fs.readFileSync(logoPath));
const crop = contentBounds(src);
console.log(`logo ${src.width}x${src.height}, content crop ${crop.w}x${crop.h} @ (${crop.x},${crop.y})`);

const targets = [
  { file: 'icon-192.png', size: 192, frac: 0.72 },
  { file: 'icon-512.png', size: 512, frac: 0.72 },
  { file: 'apple-touch-icon.png', size: 180, frac: 0.72 },
  // Maskable: more padding so platform mask cropping keeps the monogram intact.
  { file: 'icon-maskable-512.png', size: 512, frac: 0.58 },
];
for (const { file, size, frac } of targets) {
  const png = renderIcon(src, crop, size, frac);
  fs.writeFileSync(path.join(outDir, file), png);
  console.log(`wrote ${file} (${size}x${size}, ${png.length} bytes)`);
}
console.log('done');
