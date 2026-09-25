import { get } from "@vercel/blob";
import { isContentStoreConfigured } from "@/lib/portfolio-content";
import { mediaPathname } from "@/lib/portfolio-media";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ name: string }> },
) {
  const { name } = await params;
  const pathname = mediaPathname(name);
  if (!pathname) return new Response("Not found", { status: 404 });

  if (!isContentStoreConfigured()) {
    // In local development without Blob credentials, proxy media from production
    try {
      const upstream = await fetch(
        `https://aidenguan.com/api/media/${encodeURIComponent(name)}`,
      );
      if (upstream.ok && upstream.body) {
        return new Response(upstream.body, {
          headers: {
            "Cache-Control": "public, max-age=31536000, immutable",
            "Content-Type":
              upstream.headers.get("Content-Type") || "application/octet-stream",
          },
        });
      }
    } catch {
      // Fall through to 404 if offline or upstream fails
    }
    return new Response("Not found", { status: 404 });
  }

  const result = await get(pathname, { access: "private" });
  if (!result || result.statusCode !== 200) {
    return new Response("Not found", { status: 404 });
  }

  return new Response(result.stream, {
    headers: {
      "Cache-Control": "public, max-age=31536000, immutable",
      "Content-Type": result.blob.contentType || "application/octet-stream",
    },
  });
}
