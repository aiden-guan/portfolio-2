import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { list, del } from "@vercel/blob";

// Extract all media references from content/portfolio.ts
function getReferencedMedia() {
  const referenced = new Set();
  try {
    const filePath = resolve(process.cwd(), "content/portfolio.ts");
    const content = readFileSync(filePath, "utf-8");
    const matches = content.matchAll(/\/api\/media\/([A-Za-z0-9._-]+)/g);
    for (const match of matches) {
      referenced.add(match[1]);
      referenced.add(`/api/media/${match[1]}`);
    }
  } catch (err) {
    console.error("Warning: could not read content/portfolio.ts:", err.message);
  }
  return referenced;
}

async function listBlobs() {
  let hasMore = true;
  let cursor;
  const allBlobs = [];

  while (hasMore) {
    const res = await list({ cursor, limit: 1000 });
    allBlobs.push(...res.blobs);
    hasMore = res.hasMore;
    cursor = res.cursor;
  }

  return allBlobs;
}

async function main() {
  const command = process.argv[2] || "list";
  const referenced = getReferencedMedia();

  console.log("=== Vercel Blob Storage Manager ===\n");

  const blobs = await listBlobs();
  let totalBytes = 0;
  for (const b of blobs) totalBytes += b.size;

  console.log(`Total Blobs: ${blobs.length}`);
  console.log(`Total Storage: ${(totalBytes / (1024 * 1024)).toFixed(2)} MB (${(totalBytes / (1024 * 1024 * 1024)).toFixed(3)} GB)`);
  console.log(`Hobby Quotas: 1.00 GB (Storage), 10.00 GB (Monthly Bandwidth), 2,000 (Monthly Operations)\n`);

  if (command === "list") {
    console.log("Files currently in Blob store:");
    for (const b of blobs) {
      const filename = b.pathname.split("/").pop() ?? "";
      const isRef = referenced.has(filename) || referenced.has(b.url) || b.pathname === "portfolio/content.json";
      const status = isRef ? "[ACTIVE]  " : "[ORPHANED]";
      const mb = (b.size / (1024 * 1024)).toFixed(2).padStart(7, " ");
      console.log(`${status} ${mb} MB  ${b.pathname} (${b.uploadedAt})`);
    }
    console.log("\nCommands available:");
    console.log("  npm run blobs -- list");
    console.log("  npm run blobs -- clean     # removes unreferenced blobs");
    console.log("  npm run blobs -- delete <pathnameOrUrl>");
  } else if (command === "clean") {
    const toDelete = blobs.filter((b) => {
      const filename = b.pathname.split("/").pop() ?? "";
      const isRef = referenced.has(filename) || referenced.has(b.url) || b.pathname === "portfolio/content.json";
      return !isRef;
    });

    if (toDelete.length === 0) {
      console.log("No unreferenced blobs found to clean.");
      return;
    }

    console.log(`Found ${toDelete.length} unreferenced blob(s) to remove:`);
    for (const b of toDelete) {
      console.log(`  Deleting: ${b.pathname} (${(b.size / (1024 * 1024)).toFixed(2)} MB)`);
      try {
        await del(b.url);
        console.log(`  ✓ Deleted ${b.pathname}`);
      } catch (err) {
        console.error(`  ✗ Failed to delete ${b.pathname}:`, err.message);
      }
    }
  } else if (command === "delete") {
    const target = process.argv[3];
    if (!target) {
      console.error("Please provide a URL or pathname to delete.");
      process.exit(1);
    }
    const match = blobs.find((b) => b.pathname === target || b.url === target || b.pathname.endsWith(target));
    if (!match) {
      console.error(`No blob found matching: ${target}`);
      process.exit(1);
    }
    console.log(`Deleting: ${match.pathname} (${(match.size / (1024 * 1024)).toFixed(2)} MB)`);
    await del(match.url);
    console.log("✓ Deleted successfully.");
  }
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
