/**
 * Client-side downscale for photos that exceed an upload cap, instead of
 * rejecting them. A modern phone or camera photo is routinely 6–12MB; asking
 * artists to convert files by hand loses listings. Longest side is capped and
 * quality steps down until the result fits; if the first pass doesn't fit,
 * a half-size pass is derived from the already-decoded canvas (no re-decode).
 */

const MAX_DIMENSION = 2560;
const QUALITY_STEPS = [0.85, 0.75, 0.65];

async function decodeToCanvas(file: File, maxDim: number): Promise<HTMLCanvasElement | null> {
  let width: number;
  let height: number;
  let source: CanvasImageSource;
  let cleanup = () => {};

  try {
    const bitmap = await createImageBitmap(file);
    width = bitmap.width;
    height = bitmap.height;
    source = bitmap;
    // Decoded RGBA of a 12MP photo is ~48MB — release it eagerly, don't
    // wait for GC (several files can be in flight at once).
    cleanup = () => bitmap.close();
  } catch {
    // Older Safari: fall back to an <img> decode.
    const url = URL.createObjectURL(file);
    cleanup = () => URL.revokeObjectURL(url);
    try {
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const el = new Image();
        el.onload = () => resolve(el);
        el.onerror = () => reject(new Error('decode failed'));
        el.src = url;
      });
      width = img.naturalWidth;
      height = img.naturalHeight;
      source = img;
    } catch {
      cleanup();
      return null;
    }
  }

  try {
    const scale = Math.min(1, maxDim / Math.max(width, height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
    return canvas;
  } finally {
    cleanup();
  }
}

function halve(canvas: HTMLCanvasElement): HTMLCanvasElement | null {
  const half = document.createElement('canvas');
  half.width = Math.max(1, Math.round(canvas.width / 2));
  half.height = Math.max(1, Math.round(canvas.height / 2));
  const ctx = half.getContext('2d');
  if (!ctx) return null;
  ctx.drawImage(canvas, 0, 0, half.width, half.height);
  return half;
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

async function encodeUnder(canvas: HTMLCanvasElement, types: string[], maxBytes: number) {
  for (const type of types) {
    for (const quality of QUALITY_STEPS) {
      const blob = await toBlob(canvas, type, quality);
      if (!blob) break;
      if (blob.type !== type) {
        // Encoder fell back (e.g. no webp support → png), which also ignores
        // the quality argument — further quality steps would produce
        // byte-identical blobs. Take it if it fits, else try the next type.
        if (blob.size <= maxBytes) return { blob, contentType: blob.type };
        break;
      }
      if (blob.size <= maxBytes) return { blob, contentType: type };
    }
  }
  return null;
}

/**
 * Returns a blob under maxBytes (with its actual content type), or null when
 * the file can't be decoded or won't fit even at the lowest settings.
 */
export async function downscaleImage(
  file: File,
  maxBytes: number
): Promise<{ blob: Blob; contentType: string } | null> {
  const canvas = await decodeToCanvas(file, MAX_DIMENSION);
  if (!canvas) return null;

  // PNGs go to webp first to keep transparency; everything else to jpeg.
  const types = file.type === 'image/png' ? ['image/webp', 'image/jpeg'] : ['image/jpeg'];

  const first = await encodeUnder(canvas, types, maxBytes);
  if (first) return first;

  const smaller = halve(canvas);
  return smaller ? encodeUnder(smaller, types, maxBytes) : null;
}
