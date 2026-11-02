// Dialogue portraits from real photographs: cropped to the face, shrunk to a
// few dozen pixels, snapped to a handful of tones with the island's ordered
// dither, and shown big with crisp edges.

const BAYER = [0, 32, 8, 40, 2, 34, 10, 42, 48, 16, 56, 24, 50, 18, 58, 26, 12, 44, 4, 36, 14, 46, 6, 38, 60, 28, 52, 20, 62, 30, 54, 22, 3, 35, 11, 43, 1, 33, 9, 41, 51, 19, 59, 27, 49, 17, 57, 25, 15, 47, 7, 39, 13, 45, 5, 37, 63, 31, 55, 23, 61, 29, 53, 21];

export async function pixelPortrait(src: string, crop: [number, number, number, number], size = 36, levels = 7) {
  const image = new Image();
  image.decoding = "async";
  image.src = src;
  await image.decode();
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.imageSmoothingQuality = "high";
  const [x, y, w, h] = crop;
  ctx.drawImage(image, x * image.naturalWidth, y * image.naturalHeight, w * image.naturalWidth, h * image.naturalHeight, 0, 0, size, size);
  const data = ctx.getImageData(0, 0, size, size);
  const d = data.data;
  for (let i = 0; i < d.length; i += 4) {
    const px = (i / 4) % size, py = Math.floor(i / 4 / size);
    const t = BAYER[(py % 8) * 8 + (px % 8)] / 64 - 0.5;
    for (let c = 0; c < 3; c += 1) {
      // a little contrast first, so the shrunk face still reads
      const v = Math.min(255, Math.max(0, (d[i + c] - 128) * 1.12 + 128));
      d[i + c] = Math.round(Math.min(levels - 1, Math.max(0, (v / 255) * (levels - 1) + t)) * (255 / (levels - 1)));
    }
    d[i + 3] = d[i + 3] < 128 ? 0 : 255;
  }
  ctx.putImageData(data, 0, 0);
  return canvas.toDataURL("image/png");
}
