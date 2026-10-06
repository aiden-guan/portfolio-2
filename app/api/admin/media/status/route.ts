import { isAdminAuthenticated } from "@/lib/admin-auth";
import { getPortfolioContent } from "@/lib/portfolio-content";
import { deleteR2Objects, getR2BucketName, isR2Configured, isR2CorsConfigured } from "@/lib/r2";
import {
  extractReferencedMediaKeys,
  getR2BucketUsage,
  getR2MaxFilesCap,
  getR2StorageSafetyCapBytes,
  CLOUDFLARE_R2_FREE_TIER_STORAGE_BYTES,
  CLOUDFLARE_R2_FREE_TIER_CLASS_A_OPS,
  CLOUDFLARE_R2_FREE_TIER_CLASS_B_OPS,
  abortStaleMultipartUploads,
} from "@/lib/r2-limits";

export const runtime = "nodejs";

const noStore = { "Cache-Control": "no-store" };

export async function GET() {
  if (!(await isAdminAuthenticated())) {
    return Response.json({ error: "Unauthorized" }, { status: 401, headers: noStore });
  }

  if (!isR2Configured()) {
    return Response.json(
      {
        provider: "none",
        configured: false,
        hardBlockerActive: false,
      },
      { headers: noStore }
    );
  }

  try {
    const [usage, content, corsConfigured] = await Promise.all([
      getR2BucketUsage(true),
      getPortfolioContent(),
      isR2CorsConfigured(),
    ]);

    const referenced = extractReferencedMediaKeys(content);
    let orphanedBytes = 0;
    let orphanedCount = 0;
    const orphanedKeys: string[] = [];

    for (const obj of usage.objects) {
      const filename = obj.key.split("/").pop() ?? obj.key;
      const isRef =
        referenced.has(obj.key) ||
        referenced.has(filename) ||
        obj.key === "portfolio/content.json";

      if (!isRef) {
        orphanedCount++;
        orphanedBytes += obj.size;
        orphanedKeys.push(obj.key);
      }
    }

    const safetyCapBytes = getR2StorageSafetyCapBytes();
    const maxFilesCap = getR2MaxFilesCap();

    return Response.json(
      {
        provider: "r2",
        configured: true,
        corsConfigured,
        bucketName: getR2BucketName(),
        hardBlockerActive: true,
        totalBytes: usage.totalBytes,
        objectCount: usage.objectCount,
        safetyCapBytes,
        freeTierBytes: CLOUDFLARE_R2_FREE_TIER_STORAGE_BYTES,
        maxFilesCap,
        percentOfSafetyCap: (usage.totalBytes / safetyCapBytes) * 100,
        percentOfFreeTier: (usage.totalBytes / CLOUDFLARE_R2_FREE_TIER_STORAGE_BYTES) * 100,
        orphanedCount,
        orphanedBytes,
        freeTierLimits: {
          storageGb: 10,
          classAOpsMonthly: CLOUDFLARE_R2_FREE_TIER_CLASS_A_OPS,
          classBOpsMonthly: CLOUDFLARE_R2_FREE_TIER_CLASS_B_OPS,
          egress: "Free / Unlimited",
        },
      },
      { headers: noStore }
    );
  } catch (error) {
    console.error("Failed to check R2 status:", error);
    return Response.json(
      { error: "Could not retrieve R2 storage status." },
      { status: 500, headers: noStore }
    );
  }
}

export async function POST(request: Request) {
  if (!(await isAdminAuthenticated())) {
    return Response.json({ error: "Unauthorized" }, { status: 401, headers: noStore });
  }

  if (!isR2Configured()) {
    return Response.json({ error: "R2 is not configured" }, { status: 400, headers: noStore });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid payload" }, { status: 400, headers: noStore });
  }

  const action = (body as { action?: string })?.action;

  if (action === "clean-orphaned") {
    try {
      const [usage, content] = await Promise.all([
        getR2BucketUsage(true),
        getPortfolioContent(),
      ]);

      const referenced = extractReferencedMediaKeys(content);
      const toDelete: string[] = [];
      let freedBytes = 0;

      for (const obj of usage.objects) {
        const filename = obj.key.split("/").pop() ?? obj.key;
        const isRef =
          referenced.has(obj.key) ||
          referenced.has(filename) ||
          obj.key === "portfolio/content.json";

        if (!isRef) {
          toDelete.push(obj.key);
          freedBytes += obj.size;
        }
      }

      if (toDelete.length > 0) {
        await deleteR2Objects(toDelete);
      }

      // Also clean up any stalled/abandoned multipart uploads older than 1 day
      const multipartResult = await abortStaleMultipartUploads(1);

      // Re-fetch updated usage
      const updatedUsage = await getR2BucketUsage(true);

      return Response.json(
        {
          success: true,
          deletedCount: toDelete.length,
          freedBytes,
          abortedMultipartCount: multipartResult.abortedCount,
          updatedUsage: {
            totalBytes: updatedUsage.totalBytes,
            objectCount: updatedUsage.objectCount,
          },
        },
        { headers: noStore }
      );
    } catch (error) {
      console.error("Failed to clean orphaned media:", error);
      return Response.json(
        { error: "Failed to clean orphaned media." },
        { status: 500, headers: noStore }
      );
    }
  }

  return Response.json({ error: "Unknown action" }, { status: 400, headers: noStore });
}
