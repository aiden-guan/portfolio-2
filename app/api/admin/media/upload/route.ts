import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { isContentStoreConfigured } from "@/lib/portfolio-content";
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

  try {
    return Response.json({ access: await blobStoreAccess() }, { headers: noStore });
  } catch {
    return Response.json(
      { error: "The video storage could not be reached." },
      { status: 502, headers: noStore },
    );
  }
}

// Issues short-lived tokens so the editor can upload videos straight to Blob,
// skipping the serverless request body limit.
export async function POST(request: Request) {
  if (!isContentStoreConfigured()) {
    return Response.json(
      { error: "Video storage is not configured yet." },
      { status: 503, headers: noStore },
    );
  }

  let body: HandleUploadBody;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "The upload could not be read." }, { status: 400, headers: noStore });
  }

  try {
    const result = await handleUpload({
      body,
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
