import { get } from "@vercel/blob";
import { isContentStoreConfigured } from "@/lib/portfolio-content";
import { mediaPathname } from "@/lib/portfolio-media";

export const runtime = "nodejs";

// Byte-range headers let browsers seek and stream video; Safari will not
// play a video without them.
function mediaHeaders(upstream: Pick<Headers, "get">) {
  const headers = new Headers({
    "Accept-Ranges": "bytes",
    "Cache-Control": "public, max-age=31536000, immutable",
    "Content-Type": upstream.get("Content-Type") || "application/octet-stream",
  });
  for (const name of ["Content-Length", "Content-Range", "ETag"]) {
    const value = upstream.get(name);
    if (value) headers.set(name, value);
  }
  return headers;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ name: string }> },
) {
  const { name } = await params;
  const pathname = mediaPathname(name);
  if (!pathname) return new Response("Not found", { status: 404 });

  const range = request.headers.get("Range");
  const rangeHeaders: Record<string, string> = range ? { Range: range } : {};

  if (!isContentStoreConfigured()) {
    // In local development without Blob credentials, proxy media from production
    try {
      const upstream = await fetch(
        `https://aidenguan.com/api/media/${encodeURIComponent(name)}`,
        { headers: rangeHeaders },
      );
      if (upstream.ok && upstream.body) {
        return new Response(upstream.body, {
          status: upstream.status,
          headers: mediaHeaders(upstream.headers),
        });
      }
    } catch {
      // Fall through to 404 if offline or upstream fails
    }
    return new Response("Not found", { status: 404 });
  }

  const result = await get(pathname, { access: "private", headers: rangeHeaders });
  if (!result || result.statusCode !== 200) {
    return new Response("Not found", { status: 404 });
  }

  return new Response(result.stream, {
    status: result.headers.has("Content-Range") ? 206 : 200,
    headers: mediaHeaders(result.headers),
  });
}
