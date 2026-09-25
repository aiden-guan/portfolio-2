import { get } from "@vercel/blob";
import { isContentStoreConfigured } from "@/lib/portfolio-content";
import { mediaPathname } from "@/lib/portfolio-media";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ name: string }> },
) {
  if (!isContentStoreConfigured()) {
    return new Response("Not found", { status: 404 });
  }

  const { name } = await params;
  const pathname = mediaPathname(name);
  if (!pathname) return new Response("Not found", { status: 404 });

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
