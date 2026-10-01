import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { isContentStoreConfigured } from "@/lib/portfolio-content";
import { isR2Configured, getR2PresignedUploadUrl, getR2PublicDomain } from "@/lib/r2";
import {
  blobStoreAccess,
  isVideoPathname,
  MAX_VIDEO_BYTES,
  PortfolioMediaError,
  VIDEO_TYPES,
} from "@/lib/portfolio-media";

export const runtime = "nodejs";

const noStore = { "Cache-Control": "no-store" };

// Tells the editor which access the Blob store takes, so it uploads with the
// right one on the first try.
export async function GET() {
  if (!(await isAdminAuthenticated())) {
    return Response.json({ error: "Sign in to add videos." }, { status: 401, headers: noStore });
  }
  if (!isContentStoreConfigured()) {
    return Response.json(
      { error: "Video storage is not configured yet." },
      { status: 503, headers: noStore },
    );
  }

  if (isR2Configured()) {
    return Response.json({ access: "public", provider: "r2" }, { headers: noStore });
  }

  try {
    return Response.json({ access: await blobStoreAccess() }, { headers: noStore });
  } catch {
    return Response.json(
      { error: "The video storage could not be reached." },
      { status: 502, headers: noStore },
    );
  }
}

// Issues short-lived tokens so the editor can upload videos straight to Blob or R2,
// skipping the serverless request body limit.
export async function POST(request: Request) {
  if (!isContentStoreConfigured()) {
    return Response.json(
      { error: "Video storage is not configured yet." },
      { status: 503, headers: noStore },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "The upload could not be read." }, { status: 400, headers: noStore });
  }

  if (isR2Configured()) {
    if (!(await isAdminAuthenticated())) {
      return Response.json({ error: "Sign in to add videos." }, { status: 401, headers: noStore });
    }

    const payload = body as { pathname?: string; contentType?: string };
    const pathname = payload.pathname;
    const contentType = payload.contentType || "video/mp4";

    if (!pathname || !isVideoPathname(pathname)) {
      return Response.json({ error: "Use an MP4, WebM, or MOV." }, { status: 400, headers: noStore });
    }

    try {
      const presignedUrl = await getR2PresignedUploadUrl(pathname, contentType);
      const publicDomain = getR2PublicDomain();
      const url = publicDomain
        ? `${publicDomain}/${pathname}`
        : `/api/media/${encodeURIComponent(pathname.split("/").pop() ?? "")}`;

      return Response.json({ provider: "r2", presignedUrl, url }, { headers: noStore });
    } catch (error) {
      console.error("Failed to generate R2 presigned upload URL:", error);
      return Response.json({ error: "Could not prepare video upload." }, { status: 500, headers: noStore });
    }
  }

  try {
    const result = await handleUpload({
      body: body as HandleUploadBody,
      request,
      onBeforeGenerateToken: async (pathname) => {
        if (!(await isAdminAuthenticated())) {
          throw new PortfolioMediaError("Sign in to add videos.");
        }
        if (!isVideoPathname(pathname)) {
          throw new PortfolioMediaError("Use an MP4, WebM, or MOV.");
        }
        return {
          allowedContentTypes: [...VIDEO_TYPES.keys()],
          maximumSizeInBytes: MAX_VIDEO_BYTES,
          // Large files can take longer than the one-hour default to finish.
          validUntil: Date.now() + 6 * 60 * 60 * 1000,
          addRandomSuffix: false,
          allowOverwrite: false,
          cacheControlMaxAge: 60 * 60 * 24 * 30,
        };
      },
    });
    return Response.json(result, { headers: noStore });
  } catch (error) {
    const message =
      error instanceof PortfolioMediaError ? error.message : "The video could not be added.";
    return Response.json({ error: message }, { status: 400, headers: noStore });
  }
}
