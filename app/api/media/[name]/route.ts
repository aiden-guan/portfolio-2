import { get } from "@vercel/blob";
import { isR2Configured, getR2PublicDomain, getR2Object } from "@/lib/r2";
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

  if (isR2Configured()) {
    const publicDomain = getR2PublicDomain();
    if (publicDomain) {
      return Response.redirect(`${publicDomain}/${pathname}`, 307);
    }

    try {
      const response = await getR2Object(pathname);
      if (!response.Body) return new Response("Not found", { status: 404 });

      const headers = new Headers({
        "Accept-Ranges": "bytes",
        "Cache-Control": "public, max-age=31536000, immutable",
        "Content-Type": response.ContentType || "application/octet-stream",
      });
      if (response.ContentLength) headers.set("Content-Length", String(response.ContentLength));
      if (response.ETag) headers.set("ETag", response.ETag);

      return new Response(response.Body.transformToWebStream(), {
        status: 200,
        headers,
      });
    } catch {
      return new Response("Not found", { status: 404 });
    }
  }

  try {
    const result = await get(pathname, { access: "private", headers: rangeHeaders });
    if (!result || result.statusCode !== 200) {
      return new Response("Not found", { status: 404 });
    }

    return new Response(result.stream, {
      status: result.headers.has("Content-Range") ? 206 : 200,
      headers: mediaHeaders(result.headers),
    });
  } catch (error) {
    console.error(`Failed to retrieve media "${name}":`, error);
    return new Response("Not found", { status: 404 });
  }
}
