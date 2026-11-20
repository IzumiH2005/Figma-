// Image utilities (browser, canvas): import an image file / URL → resized, encoded as WebP, embedded in the project.

export function loadImage(src) {
  return new Promise((res, rej) => {
    const i = new Image();
    if (!/^data:|^blob:/.test(src)) i.crossOrigin = 'anonymous';
    i.onload = () => res(i);
    i.onerror = () => rej(new Error('image illisible'));
    i.src = src;
  });
}

export function toCanvas(img, max = 2048) {
  const w0 = img.naturalWidth || img.width, h0 = img.naturalHeight || img.height;
  const s = Math.min(1, max / Math.max(w0, h0));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w0 * s)); c.height = Math.max(1, Math.round(h0 * s));
  const g = c.getContext('2d');
  g.imageSmoothingQuality = 'high';
  g.drawImage(img, 0, 0, c.width, c.height);
  return c;
}

export const dataBytes = (url) => Math.round((url.length - url.indexOf(',') - 1) * 0.75);

// WebP when the browser can encode it (Chromium can), PNG otherwise; alpha is kept either way
export function encode(canvas, { quality = 0.86, format = 'webp' } = {}) {
  let url = canvas.toDataURL(format === 'png' ? 'image/png' : 'image/' + format, quality);
  if (format !== 'png' && !url.startsWith('data:image/' + format)) url = canvas.toDataURL('image/png');
  return url;
}

// src (data:, blob:, http…) → { dataUrl, w, h, bytes, format, original }
// SVG stays SVG (vector, already small); everything else is resized to `max` px and re-encoded (WebP by default)
export async function importImage(src, { max = 2048, quality = 0.86, format = 'webp' } = {}) {
  if (/^data:image\/svg\+xml/.test(src)) return { dataUrl: src, w: null, h: null, bytes: dataBytes(src), format: 'svg', original: null };
  const img = await loadImage(src);
  const c = toCanvas(img, max);
  const url = encode(c, { quality, format });
  return { dataUrl: url, w: c.width, h: c.height, bytes: dataBytes(url), format: url.slice(11, url.indexOf(';')), original: { w: img.naturalWidth, h: img.naturalHeight } };
}

// a stable, readable asset name from a file name: "Photo Équipe 02.JPG" → "photo-equipe-02"
export function assetName(file, taken = {}) {
  const base = String(file || 'image').replace(/\.[a-z0-9]+$/i, '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w]+/g, '-').replace(/^-|-$/g, '').toLowerCase() || 'image';
  let name = /^\d/.test(base) ? 'img-' + base : base, k = 2;
  while (taken[name]) name = `${base}-${k++}`;
  return name;
}

export const fmtBytes = (b) => (b >= 1048576 ? (b / 1048576).toFixed(1) + ' Mo' : Math.max(1, Math.round(b / 1024)) + ' ko');
