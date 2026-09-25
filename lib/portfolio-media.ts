import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { BlobAccessError, put } from "@vercel/blob";
import { isContentStoreConfigured } from "@/lib/portfolio-content";

export class PortfolioMediaError extends Error {}

export const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

const IMAGE_TYPES = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
  ["image/gif", "gif"],
  ["image/avif", "avif"],
]);

const MEDIA_NAME = /^[A-Za-z0-9._-]+$/;

function hasSignature(bytes: Uint8Array, type: string) {
  if (bytes.length < 12) return false;

  if (type === "image/jpeg") {
    return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }

  if (type === "image/png") {
    return bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
  }

  if (type === "image/gif") {
    return bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46;
  }

  if (type === "image/webp") {
    return (
      bytes[0] === 0x52 &&
      bytes[1] === 0x49 &&
      bytes[2] === 0x46 &&
      bytes[3] === 0x46 &&
      bytes[8] === 0x57 &&
      bytes[9] === 0x45 &&
      bytes[10] === 0x42 &&
      bytes[11] === 0x50
    );
  }

  if (type === "image/avif") {
    const box = String.fromCharCode(bytes[4] ?? 0, bytes[5] ?? 0, bytes[6] ?? 0, bytes[7] ?? 0);
    const brand = String.fromCharCode(bytes[8] ?? 0, bytes[9] ?? 0, bytes[10] ?? 0, bytes[11] ?? 0);
    return box === "ftyp" && (brand === "avif" || brand === "avis");
  }

  return false;
}

function prefersPrivateStore(error: unknown) {
  if (error instanceof BlobAccessError) return true;
  return (
    error instanceof Error &&
    /public/i.test(error.message) &&
    /access|private|not allowed/i.test(error.message)
  );
}

export function mediaPathname(name: string) {
  let decoded = name;
  try {
    decoded = decodeURIComponent(name);
  } catch {
    return null;
  }

  if (!MEDIA_NAME.test(decoded)) return null;
  return `portfolio/media/${decoded}`;
}

export async function storePortfolioImage(bytes: Uint8Array, type: string) {
  const extension = IMAGE_TYPES.get(type);
  if (!extension || bytes.byteLength === 0 || !hasSignature(bytes, type)) {
    throw new PortfolioMediaError("Use a JPEG, PNG, WebP, GIF, or AVIF.");
  }

  if (bytes.byteLength > MAX_IMAGE_BYTES) {
    throw new PortfolioMediaError("Use an image under 4 MB.");
  }

  const filename = `${randomUUID()}.${extension}`;

  if (!isContentStoreConfigured()) {
    if (process.env.NODE_ENV === "production") {
      throw new PortfolioMediaError("Image storage is not configured yet.");
    }

    const directory = path.join(process.cwd(), "public", "portfolio-media");
    await mkdir(directory, { recursive: true });
    await writeFile(path.join(directory, filename), bytes);
    return { src: `/portfolio-media/${filename}` };
  }

  const pathname = `portfolio/media/${filename}`;
  const body = Buffer.from(bytes);
  const options = {
    addRandomSuffix: false,
    allowOverwrite: false,
    cacheControlMaxAge: 60 * 60 * 24 * 30,
    contentType: type,
  } as const;

  try {
    const blob = await put(pathname, body, { ...options, access: "public" });
    return { src: blob.url };
  } catch (error) {
    if (!prefersPrivateStore(error)) throw error;

    const blob = await put(pathname, body, { ...options, access: "private" });
    const name = blob.pathname.split("/").pop() ?? "";
    if (!mediaPathname(name)) {
      throw new PortfolioMediaError("The image could not be stored.");
    }

    return { src: `/api/media/${encodeURIComponent(name)}` };
  }
}
