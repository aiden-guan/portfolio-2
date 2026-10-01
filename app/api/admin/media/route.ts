import { isAdminAuthenticated } from "@/lib/admin-auth";
import { isContentStoreConfigured } from "@/lib/portfolio-content";
import {
  MAX_IMAGE_BYTES,
  MAX_VIDEO_BYTES,
  portfolioMediaType,
  PortfolioMediaError,
  storePortfolioImage,
  VIDEO_TOO_LARGE_MESSAGE,
  VIDEO_TYPES,
} from "@/lib/portfolio-media";
import { isR2StorageLimitError } from "@/lib/r2-limits";

export const runtime = "nodejs";

const noStore = { "Cache-Control": "no-store" };

export async function POST(request: Request) {
  if (!(await isAdminAuthenticated())) {
    return Response.json({ error: "Sign in to add images." }, { status: 401, headers: noStore });
  }

  if (process.env.NODE_ENV === "production" && !isContentStoreConfigured()) {
    return Response.json(
      { error: "Image storage is not configured yet." },
      { status: 503, headers: noStore },
    );
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return Response.json({ error: "The image could not be read." }, { status: 400, headers: noStore });
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return Response.json({ error: "Choose an image to add." }, { status: 400, headers: noStore });
  }

  // Videos over the function body limit go straight to Blob (see ./upload);
  // this route only takes them in local development.
  const type = portfolioMediaType(file.type, file.name);
  const video = VIDEO_TYPES.has(type);
  if (file.size > (video ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES)) {
    const error = video ? VIDEO_TOO_LARGE_MESSAGE : "Use an image under 4 MB.";
    return Response.json({ error }, { status: 400, headers: noStore });
  }

  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const image = await storePortfolioImage(bytes, type);
    return Response.json(image, { headers: noStore });
  } catch (error) {
    const isLimit = isR2StorageLimitError(error);
    const isMedia = error instanceof PortfolioMediaError;
    const message =
      isLimit || isMedia ? (error as Error).message : "The image could not be added.";
    const status = isLimit ? 403 : isMedia ? 400 : 500;
    return Response.json({ error: message }, { status, headers: noStore });
  }
}
