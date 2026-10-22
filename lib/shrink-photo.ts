// A photo straight off a phone is often bigger than the upload route can take
// (Vercel turns away a function request over 4.5 MB before it's even run) and
// several times bigger than it's ever shown. This redraws one in the browser,
// at most `edge` pixels on its long side, as a JPEG under `bytes`. Only the
// pixels are drawn, so where it was taken and the rest of its metadata stay
// behind. It's null when the browser can't open the file (a HEIC in Chrome).

// iOS won't draw a canvas bigger than this
const MAX_PIXELS = 16_000_000;
const QUALITIES = [0.88, 0.8, 0.72];

export async function shrinkPhoto(file: File, { edge, bytes }: { edge: number; bytes: number }) {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    try {
      await img.decode();
    } catch {
      return null;
    }
    // natural size is after the photo's own rotation, which drawing keeps
    const { naturalWidth: w, naturalHeight: h } = img;
    if (!w || !h) return null;

    let scale = Math.min(1, edge / Math.max(w, h), Math.sqrt(MAX_PIXELS / (w * h)));
    for (let tries = 0; tries < 6; tries++, scale *= 0.8) {
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(w * scale));
      canvas.height = Math.max(1, Math.round(h * scale));
      const ctx = canvas.getContext("2d");
      if (!ctx) return null;
      // a JPEG has no see-through, so anything clear goes onto white paper
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      for (const quality of QUALITIES) {
        const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
        if (!blob) return null;
        if (blob.size <= bytes) {
          const name = `${file.name.replace(/\.[^./]*$/, "") || "photo"}.jpg`;
          return new File([blob], name, { type: "image/jpeg", lastModified: file.lastModified });
        }
      }
    }
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}
