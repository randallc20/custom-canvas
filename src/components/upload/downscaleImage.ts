/**
 * Client-side downscale for photos that exceed an upload cap, instead of
 * rejecting them. A modern phone or camera photo is routinely 6–12MB; asking
 * artists to convert files by hand loses listings. Longest side is capped and
 * quality steps down until the result fits.
 */

const MAX_DIMENSION = 2560;
const QUALITY_STEPS = [0.85, 0.75, 0.65];

async function decodeToCanvas(file: File, maxDim: number): Promise<HTMLCanvasElement | null> {
  let width: number;
  let height: number;
  let source: CanvasImageSource;

  try {
    const bitmap = await createImageBitmap(file);
    width = bitmap.width;
    height = bitmap.height;
    source = bitmap;
  } catch {
    // Older Safari: fall back to an <img> decode.
    try {
      const url = URL.createObjectURL(file);
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
      return null;
    }
  }

  const scale = Math.min(1, maxDim / Math.max(width, height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas;
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

/**
 * Returns a blob under maxBytes (with its actual content type), or null when
 * the file can't be decoded or won't fit even at the lowest settings.
 */
export async function downscaleImage(
  file: File,
  maxBytes: number
): Promise<{ blob: Blob; contentType: string } | null> {
  for (const maxDim of [MAX_DIMENSION, MAX_DIMENSION / 2]) {
    const canvas = await decodeToCanvas(file, maxDim);
    if (!canvas) return null;

    // PNGs go to webp first to keep transparency; everything else to jpeg.
    // Not every browser encodes webp — toBlob then hands back a png, which the
    // size check catches and the jpeg pass covers.
    const types = file.type === 'image/png' ? ['image/webp', 'image/jpeg'] : ['image/jpeg'];
    for (const type of types) {
      for (const quality of QUALITY_STEPS) {
        const blob = await toBlob(canvas, type, quality);
        if (blob && blob.size <= maxBytes) {
          return { blob, contentType: blob.type || type };
        }
      }
    }
  }
  return null;
}
