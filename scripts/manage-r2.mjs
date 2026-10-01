import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  S3Client,
  ListObjectsV2Command,
  GetObjectCommand,
  PutObjectCommand,
  DeleteObjectsCommand,
  DeleteObjectCommand,
  ListMultipartUploadsCommand,
  AbortMultipartUploadCommand,
} from "@aws-sdk/client-s3";
import { list as listBlobs, get as getBlob } from "@vercel/blob";

const CLOUDFLARE_FREE_STORAGE_BYTES = 10 * 1024 * 1024 * 1024; // 10 GB
const DEFAULT_SAFETY_CAP_BYTES = 5 * 1024 * 1024 * 1024; // 5 GB

function getSafetyCapBytes() {
  if (process.env.R2_MAX_STORAGE_GB) {
    const gb = Number(process.env.R2_MAX_STORAGE_GB);
    if (Number.isFinite(gb) && gb > 0) {
      return Math.min(gb, 9.5) * 1024 * 1024 * 1024;
    }
  }
  return DEFAULT_SAFETY_CAP_BYTES;
}

function getR2Client() {
  const accountId = process.env.R2_ACCOUNT_ID?.trim();
  const accessKeyId = process.env.R2_ACCESS_KEY_ID?.trim();
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY?.trim();

  if (!accountId || !accessKeyId || !secretAccessKey) {
    console.error("❌ Missing required Cloudflare R2 credentials in environment!");
    console.error("Please ensure R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, and R2_SECRET_ACCESS_KEY are set.");
    process.exit(1);
  }

  return new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  });
}

function getBucketName() {
  return process.env.R2_BUCKET_NAME?.trim() || "portfolio-media";
}

// Extract all media references from both content/portfolio.ts AND R2 portfolio/content.json
async function getReferencedMedia(client, bucket) {
  const referenced = new Set();
  referenced.add("portfolio/content.json");
  referenced.add("content.json");

  function addMediaReference(raw) {
    if (!raw || typeof raw !== "string") return;
    const filename = raw.split("/").pop();
    if (filename) {
      referenced.add(filename);
      referenced.add(`portfolio/media/${filename}`);
    }
  }

  // 1. Scan content/portfolio.ts
  try {
    const filePath = resolve(process.cwd(), "content/portfolio.ts");
    const content = readFileSync(filePath, "utf-8");
    const matches = content.matchAll(/(?:\/api\/media\/|portfolio\/media\/|https?:\/\/[^"'\s]+\/)([A-Za-z0-9._-]+\.(?:png|jpe?g|webp|gif|avif|mp4|webm|mov))/gi);
    for (const match of matches) {
      addMediaReference(match[1]);
    }
  } catch (err) {
    console.warn("⚠️ Warning: could not read content/portfolio.ts:", err.message);
  }

  // 2. Scan portfolio/content.json directly from R2
  try {
    const res = await client.send(
      new GetObjectCommand({
        Bucket: bucket,
        Key: "portfolio/content.json",
      })
    );
    const jsonText = await res.Body.transformToString();
    const data = JSON.parse(jsonText);

    for (const p of data.projects || []) {
      for (const img of p.images || []) addMediaReference(img.src);
    }
    for (const t of data.timeline || []) {
      for (const img of t.images || []) addMediaReference(img.src);
    }
  } catch {
    // If content.json does not exist yet in R2, ignore
  }

  return referenced;
}

async function listR2Objects(client, bucket) {
  const allObjects = [];
  let continuationToken = undefined;

  do {
    const command = new ListObjectsV2Command({
      Bucket: bucket,
      ContinuationToken: continuationToken,
    });
    const res = await client.send(command);
    if (res.Contents) {
      for (const item of res.Contents) {
        if (item.Key) {
          allObjects.push({
            key: item.Key,
            size: item.Size ?? 0,
            lastModified: item.LastModified,
          });
        }
      }
    }
    continuationToken = res.IsTruncated ? res.NextContinuationToken : undefined;
  } while (continuationToken);

  return allObjects;
}

async function checkMultipartUploads(client, bucket) {
  try {
    const res = await client.send(new ListMultipartUploadsCommand({ Bucket: bucket }));
    return res.Uploads || [];
  } catch {
    return [];
  }
}

async function abortMultipartUploads(client, bucket, uploads) {
  let count = 0;
  for (const u of uploads) {
    if (!u.Key || !u.UploadId) continue;
    try {
      await client.send(
        new AbortMultipartUploadCommand({
          Bucket: bucket,
          Key: u.Key,
          UploadId: u.UploadId,
        })
      );
      count++;
    } catch (e) {
      console.error(`  ✗ Failed to abort multipart upload for ${u.Key}:`, e.message);
    }
  }
  return count;
}

async function main() {
  const command = process.argv[2] || "status";
  const client = getR2Client();
  const bucket = getBucketName();
  const safetyCapBytes = getSafetyCapBytes();
  const accountId = process.env.R2_ACCOUNT_ID?.trim();

  console.log("=== Cloudflare R2 Storage Manager & Safety Blocker ===\n");
  console.log(`Account ID:  ${accountId}`);
  console.log(`Bucket:      ${bucket}`);
  console.log(`Safety Cap:  ${(safetyCapBytes / (1024 * 1024 * 1024)).toFixed(1)} GB (Configured hard blocker)`);
  console.log(`Free Tier:   10.0 GB Storage | 1,000,000 Class A Ops | 10,000,000 Class B Ops | $0 Egress\n`);

  const [objects, referenced, multiparts] = await Promise.all([
    listR2Objects(client, bucket),
    getReferencedMedia(client, bucket),
    checkMultipartUploads(client, bucket),
  ]);

  let totalBytes = 0;
  let activeBytes = 0;
  let orphanedBytes = 0;
  const activeObjects = [];
  const orphanedObjects = [];

  for (const obj of objects) {
    totalBytes += obj.size;
    const filename = obj.key.split("/").pop() ?? obj.key;
    const isRef =
      referenced.has(obj.key) ||
      referenced.has(filename) ||
      obj.key === "portfolio/content.json";

    if (isRef) {
      activeBytes += obj.size;
      activeObjects.push(obj);
    } else {
      orphanedBytes += obj.size;
      orphanedObjects.push(obj);
    }
  }

  const percentOfCap = ((totalBytes / safetyCapBytes) * 100).toFixed(2);
  const percentOfFree = ((totalBytes / CLOUDFLARE_FREE_STORAGE_BYTES) * 100).toFixed(2);

  console.log(`Total Objects:    ${objects.length}`);
  console.log(`Total Storage:    ${(totalBytes / (1024 * 1024)).toFixed(2)} MB (${(totalBytes / (1024 * 1024 * 1024)).toFixed(4)} GB)`);
  console.log(`Safety Cap Used:  ${percentOfCap}% of ${(safetyCapBytes / (1024 * 1024 * 1024)).toFixed(1)} GB hard limit`);
  console.log(`Free Tier Used:   ${percentOfFree}% of 10.0 GB allowance`);
  console.log(`Active Media:     ${activeObjects.length} files (${(activeBytes / (1024 * 1024)).toFixed(2)} MB)`);
  console.log(`Orphaned Media:   ${orphanedObjects.length} files (${(orphanedBytes / (1024 * 1024)).toFixed(2)} MB)`);
  console.log(`Multipart Uploads:${multiparts.length > 0 ? ` ⚠️ ${multiparts.length} stalled in progress` : " 0 in progress"}\n`);

  if (command === "status" || command === "list") {
    console.log("Bucket Files:");
    for (const obj of objects) {
      const filename = obj.key.split("/").pop() ?? obj.key;
      const isRef =
        referenced.has(obj.key) ||
        referenced.has(filename) ||
        obj.key === "portfolio/content.json";
      const status = isRef ? "[ACTIVE]  " : "[ORPHANED]";
      const mb = (obj.size / (1024 * 1024)).toFixed(2).padStart(7, " ");
      const date = obj.lastModified ? new Date(obj.lastModified).toISOString().slice(0, 19).replace("T", " ") : "unknown";
      console.log(`  ${status} ${mb} MB  ${obj.key} (${date})`);
    }

    if (multiparts.length > 0) {
      console.log("\nStalled Multipart Uploads:");
      for (const u of multiparts) {
        console.log(`  [STALLED]  Key: ${u.Key} (Initiated: ${u.Initiated})`);
      }
      console.log("  Run `npm run r2 -- clean` to immediately abort and clean these uploads.");
    }

    console.log("\nCommands available:");
    console.log("  npm run r2 -- status                   # Display storage breakdown and file status");
    console.log("  npm run r2 -- clean                    # Bulk-delete orphaned media & abort stalled uploads");
    console.log("  npm run r2 -- delete <key>             # Delete a specific object by key");
    console.log("  npm run r2 -- sync-from-blobs          # Migrate any active files from Vercel Blob into R2");
    console.log("  npm run r2 -- setup-cloudflare <TOKEN> # Configure Cloudflare Lifecycle & Alerts via API");
  } else if (command === "clean") {
    let actionsTaken = 0;

    // 1. Abort incomplete multipart uploads
    if (multiparts.length > 0) {
      console.log(`Found ${multiparts.length} stalled multipart upload(s). Aborting...`);
      const abortedCount = await abortMultipartUploads(client, bucket, multiparts);
      console.log(`✓ Aborted ${abortedCount} stalled multipart upload(s).`);
      actionsTaken++;
    }

    // 2. Delete orphaned objects
    if (orphanedObjects.length > 0) {
      console.log(`Found ${orphanedObjects.length} unreferenced object(s) totaling ${(orphanedBytes / (1024 * 1024)).toFixed(2)} MB:`);
      for (const obj of orphanedObjects) {
        console.log(`  - ${obj.key} (${(obj.size / (1024 * 1024)).toFixed(2)} MB)`);
      }

      console.log("\nDeleting orphaned objects in bulk (conserving Class A operations)...");
      const keysToDelete = orphanedObjects.map((o) => o.key);

      for (let i = 0; i < keysToDelete.length; i += 1000) {
        const chunk = keysToDelete.slice(i, i + 1000);
        await client.send(
          new DeleteObjectsCommand({
            Bucket: bucket,
            Delete: {
              Objects: chunk.map((Key) => ({ Key })),
              Quiet: true,
            },
          })
        );
      }

      console.log(`✓ Successfully deleted ${orphanedObjects.length} orphaned object(s).`);
      console.log(`✓ Freed ${(orphanedBytes / (1024 * 1024)).toFixed(2)} MB of R2 storage!`);
      actionsTaken++;
    }

    if (actionsTaken === 0) {
      console.log("✨ No orphaned objects or stalled multipart uploads found. Your R2 storage is clean!");
    }
  } else if (command === "delete") {
    const target = process.argv[3];
    if (!target) {
      console.error("Please provide a key or filename to delete.");
      process.exit(1);
    }

    const match = objects.find(
      (o) => o.key === target || o.key.endsWith(target) || o.key.split("/").pop() === target
    );

    if (!match) {
      console.error(`No object found matching: ${target}`);
      process.exit(1);
    }

    console.log(`Deleting: ${match.key} (${(match.size / (1024 * 1024)).toFixed(2)} MB)...`);
    await client.send(
      new DeleteObjectCommand({
        Bucket: bucket,
        Key: match.key,
      })
    );
    console.log("✓ Deleted successfully.");
  } else if (command === "sync-from-blobs") {
    console.log("Checking Vercel Blob for active media to sync into R2...");
    let blobList = [];
    try {
      let hasMore = true;
      let cursor;
      while (hasMore) {
        const res = await listBlobs({ cursor, limit: 1000 });
        blobList.push(...res.blobs);
        hasMore = res.hasMore;
        cursor = res.cursor;
      }
    } catch (err) {
      console.error("Could not read Vercel Blobs:", err.message);
      process.exit(1);
    }

    const existingR2Keys = new Set(objects.map((o) => o.key));
    const activeBlobs = blobList.filter((b) => {
      const filename = b.pathname.split("/").pop() ?? "";
      return (referenced.has(filename) || referenced.has(b.pathname)) && !existingR2Keys.has(b.pathname);
    });

    if (activeBlobs.length === 0) {
      console.log("All active media is already present in Cloudflare R2! No sync needed.");
      return;
    }

    console.log(`Found ${activeBlobs.length} active media file(s) in Vercel Blob not yet in R2:`);
    for (const b of activeBlobs) {
      console.log(`  Syncing ${b.pathname} (${(b.size / (1024 * 1024)).toFixed(2)} MB)...`);
      let buffer;
      let contentType = "application/octet-stream";

      try {
        const blobRes = await getBlob(b.pathname, { access: "private" });
        if (blobRes && blobRes.statusCode === 200 && blobRes.stream) {
          const arrayBuf = await new Response(blobRes.stream).arrayBuffer();
          buffer = Buffer.from(arrayBuf);
          contentType = blobRes.headers.get("content-type") || contentType;
        }
      } catch {
        // Fallback to public fetch
      }

      if (!buffer) {
        try {
          const fetchRes = await fetch(b.url);
          if (fetchRes.ok) {
            buffer = Buffer.from(await fetchRes.arrayBuffer());
            contentType = fetchRes.headers.get("content-type") || contentType;
          }
        } catch {
          // Ignore
        }
      }

      if (!buffer) {
        console.error(`  ✗ Failed to retrieve ${b.pathname} from Vercel Blob.`);
        continue;
      }

      await client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: b.pathname,
          Body: buffer,
          ContentType: contentType,
          CacheControl: "public, max-age=31536000, immutable",
        })
      );
      console.log(`  ✓ Uploaded to R2: ${b.pathname}`);
    }

    console.log("\n🎉 Sync complete! All active portfolio media is now securely in Cloudflare R2.");
  } else if (command === "setup-cloudflare") {
    const token = process.argv[3] || process.env.CLOUDFLARE_API_TOKEN;
    if (!token) {
      console.log("To configure Cloudflare automatically via API, provide a Cloudflare API Token:");
      console.log("  npm run r2 -- setup-cloudflare <YOUR_CLOUDFLARE_API_TOKEN>\n");
      console.log("Or create the rules in 3 clicks using these direct dashboard links:");
      console.log(`1. Lifecycle Rules (Abort Multipart Uploads after 7 days):`);
      console.log(`   https://dash.cloudflare.com/${accountId}/r2/default/buckets/${bucket}/settings\n`);
      console.log(`2. Usage Notifications Alert:`);
      console.log(`   https://dash.cloudflare.com/${accountId}/notifications\n`);
      return;
    }

    console.log(`Configuring Cloudflare R2 Bucket Lifecycle rule for "${bucket}"...`);
    const lifecycleRes = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/r2/buckets/${bucket}/lifecycle`,
      {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          rules: [
            {
              id: "AbortIncompleteMultipartUploadsAfter7Days",
              enabled: true,
              abortMultipartUploadsTransition: {
                condition: { maxAge: 604800 }, // 7 days in seconds
              },
            },
          ],
        }),
      }
    );

    const lifecycleData = await lifecycleRes.json();
    if (lifecycleData.success) {
      console.log("✓ Cloudflare Lifecycle Rule configured: abort incomplete multipart uploads after 7 days!");
    } else {
      console.error("✗ Failed to set Cloudflare Lifecycle rule:", lifecycleData.errors);
    }
  } else {
    console.error(`Unknown command "${command}". Available: status, clean, delete, sync-from-blobs, setup-cloudflare`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
