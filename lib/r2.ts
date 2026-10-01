import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

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
  const client = getR2Client();
  const bucket = getR2BucketName();

  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: typeof body === "string" ? Buffer.from(body) : body,
    ContentType: contentType,
    CacheControl: cacheControl,
  });

  await client.send(command);

  const publicDomain = getR2PublicDomain();
  if (publicDomain) {
    return { url: `${publicDomain}/${key}` };
  }

  // If no public domain is set, fallback to internal media route
  const filename = key.split("/").pop() ?? key;
  return { url: `/api/media/${encodeURIComponent(filename)}` };
}

export async function getR2Object(key: string) {
  const client = getR2Client();
  const bucket = getR2BucketName();

  const command = new GetObjectCommand({
    Bucket: bucket,
    Key: key,
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

  return client.send(command);
}

export async function getR2PresignedUploadUrl(
  key: string,
  contentType: string,
  expiresIn: number = 3600
) {
  const client = getR2Client();
  const bucket = getR2BucketName();

  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    ContentType: contentType,
    CacheControl: "public, max-age=31536000, immutable",
  });

  return getSignedUrl(client, command, { expiresIn });
}
