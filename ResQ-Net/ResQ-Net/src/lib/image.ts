'use client';

// Images are compressed in memory and sent as raw base64 (no data: prefix).
// CNIC images are never stored anywhere: not in state that persists, not in localStorage.

const MAX_BYTES = 4 * 1024 * 1024;

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('That file could not be opened as an image. Try a JPEG or PNG photo.')); };
    img.src = url;
  });
}

function encode(img: HTMLImageElement, max: number, quality: number): string {
  const scale = Math.min(1, max / Math.max(img.width, img.height));
  const w = Math.max(1, Math.round(img.width * scale));
  const h = Math.max(1, Math.round(img.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('This browser cannot process images.');
  ctx.drawImage(img, 0, 0, w, h);
  return canvas.toDataURL('image/jpeg', quality).split(',')[1] ?? '';
}

/** Resize to <= 1280 px JPEG and guarantee the 4 MB backend limit. */
export async function compressImage(file: File): Promise<{ base64: string; mime_type: 'image/jpeg' }> {
  if (!file.type.startsWith('image/')) throw new Error('Please choose a photo (JPEG or PNG).');
  const img = await loadImage(file);
  for (const [max, q] of [[1280, 0.85], [1024, 0.75], [800, 0.65]] as const) {
    const base64 = encode(img, max, q);
    if (base64 && base64.length * 0.75 <= MAX_BYTES) return { base64, mime_type: 'image/jpeg' };
  }
  throw new Error('That photo is too large. Please try a smaller one.');
}
