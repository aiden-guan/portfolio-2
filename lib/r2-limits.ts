import {
  ListObjectsV2Command,
  ListMultipartUploadsCommand,
  AbortMultipartUploadCommand,
} from "@aws-sdk/client-s3";
import type { PortfolioContent } from "@/content/portfolio";

// Cloudflare R2 Free Tier Monthly Allowances:
// - Storage: 10 GB / month
// - Class A Operations (writes/lists): 1,000,000 requests / month
// - Class B Operations (reads): 10,000,000 requests / month
// - Egress / Data Transfer: Unlimited ($0)
export const CLOUDFLARE_R2_FREE_TIER_STORAGE_BYTES = 10 * 1024 * 1024 * 1024; // 10 GB
export const CLOUDFLARE_R2_FREE_TIER_CLASS_A_OPS = 1_000_000;
export const CLOUDFLARE_R2_FREE_TIER_CLASS_B_OPS = 10_000_000;

// Safety Hard Blocker Settings:
// By default, set a safety hard cap at 5 GB (halfway to 10 GB).
// This guarantees uploads are blocked well before hitting Cloudflare's 10 GB limit,
// preventing accidental charges even with buffers, metadata, or multipart fragments.
// Configurable via R2_MAX_STORAGE_GB (capped at 9.5 GB max) or R2_STORAGE_HARD_LIMIT_BYTES.
export function getR2StorageSafetyCapBytes(): number {
  if (process.env.R2_STORAGE_HARD_LIMIT_BYTES) {
    const parsed = Number(process.env.R2_STORAGE_HARD_LIMIT_BYTES);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  if (process.env.R2_MAX_STORAGE_GB) {
    const parsedGb = Number(process.env.R2_MAX_STORAGE_GB);
    if (Number.isFinite(parsedGb) && parsedGb > 0) {
      const clampedGb = Math.min(parsedGb, 9.5);
      return Math.round(clampedGb * 1024 * 1024 * 1024);
    }
  }
  return 5 * 1024 * 1024 * 1024; // Default: 5 GB safety cap
}

export function getR2MaxFilesCap(): number {
  if (process.env.R2_MAX_FILES) {
    const parsed = Number(process.env.R2_MAX_FILES);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return 1000; // Max 1,000 files by default
}

export class R2StorageLimitExceededError extends Error {
  readonly currentBytes: number;
  readonly additionalBytes: number;
  readonly safetyCapBytes: number;
  readonly freeTierBytes: number;

  constructor(currentBytes: number, additionalBytes: number, safetyCapBytes: number) {
    const usedMb = (currentBytes / (1024 * 1024)).toFixed(1);
    const neededMb = (additionalBytes / (1024 * 1024)).toFixed(1);
    const capGb = (safetyCapBytes / (1024 * 1024 * 1024)).toFixed(1);
    super(
      `Upload blocked: Cloudflare R2 storage safety limit reached. Using ${usedMb} MB of ${capGb} GB safety cap (+${neededMb} MB requested). Clean up unused media to prevent getting charged.`
    );
    this.name = "R2StorageLimitExceededError";
    this.currentBytes = currentBytes;
    this.additionalBytes = additionalBytes;
    this.safetyCapBytes = safetyCapBytes;
    this.freeTierBytes = CLOUDFLARE_R2_FREE_TIER_STORAGE_BYTES;
  }
}

export function isR2StorageLimitError(error: unknown): error is R2StorageLimitExceededError {
  return (
    error instanceof Error &&
    (error.name === "R2StorageLimitExceededError" || error instanceof R2StorageLimitExceededError)
  );
}

export type R2ObjectItem = {
  key: string;
  size: number;
  lastModified?: Date;
};

export type R2BucketUsage = {
  totalBytes: number;
  objectCount: number;
  fetchedAt: number;
  objects: R2ObjectItem[];
  safetyCapBytes: number;
  freeTierBytes: number;
  percentOfSafetyCap: number;
  percentOfFreeTier: number;
};

type UsageCache = {
  totalBytes: number;
  objectCount: number;
  fetchedAt: number;
  objects: R2ObjectItem[];
};

let cachedUsage: UsageCache | null = null;
const CACHE_TTL_MS = 60 * 1000; // 60-second cache to prevent burning Class A requests on ListObjects

export function invalidateR2UsageCache() {
  cachedUsage = null;
}

export function updateCachedUsage(deltaBytes: number, deltaCount: number) {
  if (cachedUsage) {
    cachedUsage.totalBytes = Math.max(0, cachedUsage.totalBytes + deltaBytes);
    cachedUsage.objectCount = Math.max(0, cachedUsage.objectCount + deltaCount);
  }
}

/**
 * Fetch current R2 bucket usage with in-memory caching.
 * Paginate through all objects to get accurate byte count.
 */
export async function getR2BucketUsage(forceRefresh = false): Promise<R2BucketUsage> {
  const safetyCapBytes = getR2StorageSafetyCapBytes();
  const freeTierBytes = CLOUDFLARE_R2_FREE_TIER_STORAGE_BYTES;

  if (!forceRefresh && cachedUsage && Date.now() - cachedUsage.fetchedAt < CACHE_TTL_MS) {
    const totalBytes = cachedUsage.totalBytes;
    return {
      totalBytes,
      objectCount: cachedUsage.objectCount,
      fetchedAt: cachedUsage.fetchedAt,
      objects: cachedUsage.objects,
      safetyCapBytes,
      freeTierBytes,
      percentOfSafetyCap: (totalBytes / safetyCapBytes) * 100,
      percentOfFreeTier: (totalBytes / freeTierBytes) * 100,
    };
  }

  // Dynamic import of getR2Client to prevent circular dependencies
  const { getR2Client, getR2BucketName, isR2Configured } = await import("@/lib/r2");
  if (!isR2Configured()) {
    return {
      totalBytes: 0,
      objectCount: 0,
      fetchedAt: Date.now(),
      objects: [],
      safetyCapBytes,
      freeTierBytes,
      percentOfSafetyCap: 0,
      percentOfFreeTier: 0,
    };
  }

  const client = getR2Client();
  const bucket = getR2BucketName();

  const objects: R2ObjectItem[] = [];
  let continuationToken: string | undefined = undefined;
  let totalBytes = 0;

  do {
    const command: ListObjectsV2Command = new ListObjectsV2Command({
      Bucket: bucket,
      ContinuationToken: continuationToken,
    });

    const response = await client.send(command);
    if (response.Contents) {
      for (const item of response.Contents) {
        if (!item.Key) continue;
        const size = item.Size ?? 0;
        totalBytes += size;
        objects.push({
          key: item.Key,
          size,
          lastModified: item.LastModified,
        });
      }
    }

    continuationToken = response.IsTruncated ? response.NextContinuationToken : undefined;
  } while (continuationToken);

  cachedUsage = {
    totalBytes,
    objectCount: objects.length,
    fetchedAt: Date.now(),
    objects,
  };

  return {
    totalBytes,
    objectCount: objects.length,
    fetchedAt: cachedUsage.fetchedAt,
    objects,
    safetyCapBytes,
    freeTierBytes,
    percentOfSafetyCap: (totalBytes / safetyCapBytes) * 100,
    percentOfFreeTier: (totalBytes / freeTierBytes) * 100,
  };
}

/**
 * Hard blocker check. Asserts that the bucket has sufficient capacity
 * to store `additionalBytes` without crossing the safety threshold.
 * Throws R2StorageLimitExceededError if limit would be breached.
 */
export async function assertR2StorageCapacity(additionalBytes: number = 0) {
  const { isR2Configured } = await import("@/lib/r2");
  if (!isR2Configured()) return;

  const usage = await getR2BucketUsage();
  const safetyCapBytes = getR2StorageSafetyCapBytes();
  const maxFiles = getR2MaxFilesCap();

  if (usage.totalBytes + additionalBytes > safetyCapBytes) {
    throw new R2StorageLimitExceededError(usage.totalBytes, additionalBytes, safetyCapBytes);
  }

  if (usage.objectCount + 1 > maxFiles) {
    throw new Error(
      `Upload blocked: R2 maximum file count (${maxFiles}) reached. Clean up unused media to prevent exceeding limits.`
    );
  }

  return {
    currentBytes: usage.totalBytes,
    additionalBytes,
    projectedBytes: usage.totalBytes + additionalBytes,
    safetyCapBytes,
  };
}

/**
 * Extracts all media keys and filenames actively referenced in the portfolio content,
 * ensuring they are protected from accidental orphan cleanup.
 */
export function extractReferencedMediaKeys(content?: PortfolioContent | null): Set<string> {
  const referenced = new Set<string>();

  // Always protect the portfolio content JSON database file
  referenced.add("portfolio/content.json");
  referenced.add("content.json");

  function addFromSrc(src: string | undefined) {
    if (!src) return;
    const filename = src.split("/").pop();
    if (filename) {
      referenced.add(filename);
      referenced.add(`portfolio/media/${filename}`);
    }
  }

  if (content) {
    for (const project of content.projects || []) {
      for (const img of project.images || []) {
        addFromSrc(img.src);
      }
    }
    for (const entry of content.timeline || []) {
      for (const img of entry.images || []) {
        addFromSrc(img.src);
      }
    }
  }

  return referenced;
}

/**
 * Scans for any stalled/abandoned multipart uploads older than `maxAgeDays`
 * and aborts them, cleaning up hidden storage chunks from R2.
 */
export async function abortStaleMultipartUploads(maxAgeDays: number = 7) {
  const { getR2Client, getR2BucketName, isR2Configured } = await import("@/lib/r2");
  if (!isR2Configured()) return { abortedCount: 0, aborted: [] };

  const client = getR2Client();
  const bucket = getR2BucketName();

  const res = await client.send(new ListMultipartUploadsCommand({ Bucket: bucket }));
  const uploads = res.Uploads || [];
  const cutoff = Date.now() - maxAgeDays * 24 * 60 * 60 * 1000;

  const aborted: Array<{ key: string; uploadId: string; initiated?: Date }> = [];

  for (const upload of uploads) {
    if (!upload.Key || !upload.UploadId) continue;
    const initiatedTime = upload.Initiated ? new Date(upload.Initiated).getTime() : 0;
    if (initiatedTime < cutoff) {
      try {
        await client.send(
          new AbortMultipartUploadCommand({
            Bucket: bucket,
            Key: upload.Key,
            UploadId: upload.UploadId,
          })
        );
        aborted.push({
          key: upload.Key,
          uploadId: upload.UploadId,
          initiated: upload.Initiated,
        });
      } catch (err) {
        console.error(`Failed to abort multipart upload for ${upload.Key}:`, err);
      }
    }
  }

  return { abortedCount: aborted.length, aborted };
}
