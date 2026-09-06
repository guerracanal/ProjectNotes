#!/usr/bin/env node
/**
 * Generate the PWA icon set without any image dependency.
 *
 * Writes valid PNGs by hand: the raster is drawn into an RGBA buffer, then
 * packed into IHDR/IDAT/IEND chunks with zlib. This keeps the repo free of a
 * native image toolchain (sharp/canvas) that would otherwise be needed only to
 * produce five static files.
 *
 *   node scripts/generate-icons.mjs
 */

import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'icons');

// --- PNG encoding ---------------------------------------------------------

function crc32(buffer) {
  let table = crc32.table;
  if (!table) {
    table = crc32.table = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c;
    }
  }
  let crc = -1;
  for (let i = 0; i < buffer.length; i++) crc = table[(crc ^ buffer[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ -1) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typeAndData = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typeAndData), 0);
  return Buffer.concat([length, typeAndData, crc]);
}

function encodePng(width, height, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type: RGBA
  ihdr[10] = 0; // deflate
  ihdr[11] = 0; // adaptive filtering
  ihdr[12] = 0; // no interlace

  // Each scanline is prefixed with filter type 0 (None).
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// --- Drawing --------------------------------------------------------------

const BRAND_TOP = [99, 102, 241];
const BRAND_BOTTOM = [67, 56, 202];

function lerp(a, b, t) {
  return a.map((channel, i) => Math.round(channel + (b[i] - channel) * t));
}

/** Signed distance to a rounded rectangle — used for antialiased edges. */
function roundedRectSdf(px, py, cx, cy, halfW, halfH, radius) {
  const dx = Math.abs(px - cx) - (halfW - radius);
  const dy = Math.abs(py - cy) - (halfH - radius);
  const outside = Math.hypot(Math.max(dx, 0), Math.max(dy, 0));
  return outside + Math.min(Math.max(dx, dy), 0) - radius;
}

/**
 * Draw the mark: three stacked "layers" (the same glyph as the in-app logo)
 * on a rounded brand-gradient tile.
 *
 * `padding` is a 0..1 fraction reserved around the art. Maskable icons need a
 * generous safe zone because launchers crop them to arbitrary shapes.
 */
function drawIcon(size, { padding = 0.1, background = true } = {}) {
  const rgba = Buffer.alloc(size * size * 4);
  const pad = size * padding;
  const tile = size - pad * 2;
  const radius = background ? tile * 0.22 : 0;
  const cx = size / 2;
  const cy = size / 2;

  const put = (x, y, [r, g, b], alpha) => {
    if (alpha <= 0) return;
    const i = (y * size + x) * 4;
    const a = Math.min(1, alpha);
    // Source-over compositing against whatever is already in the buffer.
    const dstA = rgba[i + 3] / 255;
    const outA = a + dstA * (1 - a);
    if (outA === 0) return;
    rgba[i] = Math.round((r * a + rgba[i] * dstA * (1 - a)) / outA);
    rgba[i + 1] = Math.round((g * a + rgba[i + 1] * dstA * (1 - a)) / outA);
    rgba[i + 2] = Math.round((b * a + rgba[i + 2] * dstA * (1 - a)) / outA);
    rgba[i + 3] = Math.round(outA * 255);
  };

  // Background tile with a vertical brand gradient.
  if (background) {
    for (let y = 0; y < size; y++) {
      const shade = lerp(BRAND_TOP, BRAND_BOTTOM, y / size);
      for (let x = 0; x < size; x++) {
        const d = roundedRectSdf(x + 0.5, y + 0.5, cx, cy, tile / 2, tile / 2, radius);
        put(x, y, shade, Math.min(1, Math.max(0, 0.5 - d)));
      }
    }
  }

  // The three layers: flattened diamonds stacked with a small vertical offset.
  const unit = tile / 100;
  const halfW = 31 * unit;
  const halfH = 13 * unit;
  const gap = 16.5 * unit;
  const thickness = 5 * unit;

  const insideDiamond = (x, y, offsetY) => {
    const nx = Math.abs(x - cx) / halfW;
    const ny = Math.abs(y - (cy + offsetY)) / halfH;
    return nx + ny;
  };

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const px = x + 0.5;
      const py = y + 0.5;

      // Painted back to front so the solid top layer occludes the outlines
      // beneath it and the mark reads as a stack rather than a tangle.
      for (const offsetY of [gap, 0]) {
        // Only the lower half of each diamond is stroked, giving the open
        // chevrons that make a stack legible at 32px.
        if (py < cy + offsetY - thickness / 2) continue;
        const v = insideDiamond(px, py, offsetY);
        const edge = Math.abs(v - 1) * halfH;
        const alpha = Math.min(1, Math.max(0, (thickness / 2 - edge) * 0.9));
        put(x, y, [255, 255, 255], alpha * 0.95);
      }

      const top = insideDiamond(px, py, -gap);
      put(x, y, [255, 255, 255], Math.min(1, Math.max(0, (1 - top) * halfH * 0.6)));
    }
  }

  return rgba;
}

// --- Output ---------------------------------------------------------------

const TARGETS = [
  { file: 'icon-192.png', size: 192, options: { padding: 0.04 } },
  { file: 'icon-512.png', size: 512, options: { padding: 0.04 } },
  { file: 'icon-maskable-192.png', size: 192, options: { padding: 0.0 } },
  { file: 'icon-maskable-512.png', size: 512, options: { padding: 0.0 } },
  { file: 'apple-touch-icon.png', size: 180, options: { padding: 0.0 } },
  { file: 'favicon-32.png', size: 32, options: { padding: 0.04 } },
];

mkdirSync(OUT_DIR, { recursive: true });

for (const target of TARGETS) {
  const rgba = drawIcon(target.size, target.options);
  writeFileSync(join(OUT_DIR, target.file), encodePng(target.size, target.size, rgba));
  console.log(`✓ ${target.file} (${target.size}×${target.size})`);
}

/**
 * favicon.ico — an ICO container holding a single 32x32 PNG. Every browser in
 * use supports PNG-in-ICO, so no BMP encoder is needed.
 */
function encodeIco(pngBuffer, size) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(1, 4); // one image

  const entry = Buffer.alloc(16);
  entry[0] = size >= 256 ? 0 : size; // width (0 means 256)
  entry[1] = size >= 256 ? 0 : size; // height
  entry[2] = 0; // palette colours
  entry[3] = 0; // reserved
  entry.writeUInt16LE(1, 4); // colour planes
  entry.writeUInt16LE(32, 6); // bits per pixel
  entry.writeUInt32BE(0, 8);
  entry.writeUInt32LE(pngBuffer.length, 8);
  entry.writeUInt32LE(header.length + entry.length, 12);

  return Buffer.concat([header, entry, pngBuffer]);
}

const faviconPng = encodePng(32, 32, drawIcon(32, { padding: 0.02 }));
const appDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'app');
writeFileSync(join(appDir, 'favicon.ico'), encodeIco(faviconPng, 32));
console.log('✓ src/app/favicon.ico (32×32)');

console.log(`\nIcons written to ${OUT_DIR}`);
