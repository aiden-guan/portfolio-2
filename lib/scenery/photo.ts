// A photo prepared by scripts/build-scenery.py: a small colour image and a
// same-sized greyscale mask whose values name regions (water, sky, ...).

export type Photo = {
  width: number;
  height: number;
  rgb: Float32Array;
  mask: Uint8Array;
};

async function pixels(src: string) {
  const image = new Image();
  image.decoding = "async";
  image.src = src;
  await image.decode();
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(image, 0, 0);
  return ctx.getImageData(0, 0, canvas.width, canvas.height);
}

export async function loadPhoto(src: string, maskSrc: string): Promise<Photo> {
  const [color, regions] = await Promise.all([pixels(src), pixels(maskSrc)]);
  const n = color.width * color.height;
  const rgb = new Float32Array(n * 3);
  const mask = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    // Roughly linearised, so glow and dimming mix like light.
    rgb[i * 3] = (color.data[i * 4]! / 255) ** 1.6;
    rgb[i * 3 + 1] = (color.data[i * 4 + 1]! / 255) ** 1.6;
    rgb[i * 3 + 2] = (color.data[i * 4 + 2]! / 255) ** 1.6;
    mask[i] = regions.data[i * 4]!;
  }
  return { width: color.width, height: color.height, rgb, mask };
}

// Bilinear sample at photo-relative u, v (0..1); writes into out.
export function sample(photo: Photo, u: number, v: number, out: [number, number, number]) {
  const { width, height, rgb } = photo;
  const x = Math.min(width - 1.001, Math.max(0, u * width - 0.5));
  const y = Math.min(height - 1.001, Math.max(0, v * height - 0.5));
  const xi = x | 0;
  const yi = y | 0;
  const fx = x - xi;
  const fy = y - yi;
  const i00 = (yi * width + xi) * 3;
  const i10 = i00 + 3;
  const i01 = i00 + width * 3;
  const i11 = i01 + 3;
  for (let c = 0; c < 3; c++) {
    const a = rgb[i00 + c]! + (rgb[i10 + c]! - rgb[i00 + c]!) * fx;
    const b = rgb[i01 + c]! + (rgb[i11 + c]! - rgb[i01 + c]!) * fx;
    out[c] = a + (b - a) * fy;
  }
  return out;
}

export function region(photo: Photo, u: number, v: number) {
  const x = Math.min(photo.width - 1, Math.max(0, Math.floor(u * photo.width)));
  const y = Math.min(photo.height - 1, Math.max(0, Math.floor(v * photo.height)));
  return photo.mask[y * photo.width + x]!;
}
