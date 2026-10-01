import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { MAX_VIDEO_BYTES } from "@/lib/media-limits";
import {
  assertR2StorageCapacity,
  invalidateR2UsageCache,
  updateCachedUsage,
} from "@/lib/r2-limits";

let s3ClientInstance: S3Client | null = null;

export function isR2Configured(): boolean {
  return Boolean(
    process.env.R2_ACCOUNT_ID &&
    process.env.R2_ACCESS_KEY_ID &&
    process.env.R2_SECRET_ACCESS_KEY &&
    process.env.R2_BUCKET_NAME
  );
}

export function getR2BucketName(): string {
  return process.env.R2_BUCKET_NAME || "portfolio";
}

export function getR2PublicDomain(): string | null {
  const url = process.env.R2_PUBLIC_URL?.trim();
  if (!url) return null;
  return url.replace(/\/+$/, "");
}

export function getR2Client(): S3Client {
  if (s3ClientInstance) return s3ClientInstance;

  const accountId = process.env.R2_ACCOUNT_ID?.trim();
  const accessKeyId = process.env.R2_ACCESS_KEY_ID?.trim();
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY?.trim();

  if (!accountId || !accessKeyId || !secretAccessKey) {
    throw new Error("Cloudflare R2 credentials are missing.");
  }

  s3ClientInstance = new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
  });

  return s3ClientInstance;
}

export async function putR2Object(
  key: string,
  body: Uint8Array | Buffer | string,
  contentType: string = "application/octet-stream",
  cacheControl: string = "public, max-age=31536000, immutable"
) {
  const payloadBuffer =
    typeof body === "string" ? Buffer.from(body) : Buffer.from(body);
  const byteLength = payloadBuffer.byteLength;

  // Hard blocker: assert capacity before making PUT call to Cloudflare R2
  await assertR2StorageCapacity(byteLength);

  const client = getR2Client();
  const bucket = getR2BucketName();

  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: payloadBuffer,
    ContentType: contentType,
    CacheControl: cacheControl,
  });

  await client.send(command);

  // Update in-memory usage cache
  updateCachedUsage(byteLength, 1);

  const publicDomain = getR2PublicDomain();
  if (publicDomain) {
    return { url: `${publicDomain}/${key}` };
  }

  // If no public domain is set, fallback to internal media route
  const filename = key.split("/").pop() ?? key;
  return { url: `/api/media/${encodeURIComponent(filename)}` };
}

export async function getR2Object(key: string, range?: string) {
  const client = getR2Client();
  const bucket = getR2BucketName();

  const command = new GetObjectCommand({
    Bucket: bucket,
    Key: key,
    Range: range,
  });

  return client.send(command);
}

export async function deleteR2Object(key: string) {
  const client = getR2Client();
  const bucket = getR2BucketName();

  const command = new DeleteObjectCommand({
    Bucket: bucket,
    Key: key,
  });

  const result = await client.send(command);
  invalidateR2UsageCache();
  return result;
}

export async function deleteR2Objects(keys: string[]) {
  if (keys.length === 0) return;
  const client = getR2Client();
  const bucket = getR2BucketName();

  // S3 DeleteObjects can batch-delete up to 1,000 objects in a single Class A operation
  for (let i = 0; i < keys.length; i += 1000) {
    const chunk = keys.slice(i, i + 1000);
    const command = new DeleteObjectsCommand({
      Bucket: bucket,
      Delete: {
        Objects: chunk.map((Key) => ({ Key })),
        Quiet: true,
      },
    });
    await client.send(command);
  }

  invalidateR2UsageCache();
}

export async function getR2PresignedUploadUrl(
  key: string,
  contentType: string,
  size?: number,
  expiresIn: number = 3600
) {
  // Hard blocker: assert capacity before issuing presigned URL
  const declaredSize = typeof size === "number" && size > 0 ? size : MAX_VIDEO_BYTES;
  await assertR2StorageCapacity(declaredSize);

  const client = getR2Client();
  const bucket = getR2BucketName();

  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    ContentType: contentType,
    ...(typeof size === "number" ? { ContentLength: size } : {}),
    CacheControl: "public, max-age=31536000, immutable",
  });

  const url = await getSignedUrl(client, command, { expiresIn });

  // Optimistically register estimated bytes in usage cache to prevent concurrent overfill
  updateCachedUsage(declaredSize, 1);

  return url;
}
