import {
  getR2BucketUsage,
  getR2StorageSafetyCapBytes,
  getR2MaxFilesCap,
  assertR2StorageCapacity,
  R2StorageLimitExceededError,
  isR2StorageLimitError,
  extractReferencedMediaKeys,
  invalidateR2UsageCache,
} from "../lib/r2-limits.ts";
import { getR2PresignedUploadUrl } from "../lib/r2.ts";

async function runTests() {
  console.log("=== Testing Cloudflare R2 Hard Blocker Protections ===\n");

  // Test 1: Safety cap configuration
  const safetyCapBytes = getR2StorageSafetyCapBytes();
  const maxFiles = getR2MaxFilesCap();
  console.log(`1. Safety Cap Verification:`);
  console.log(`   - Default safety cap: ${(safetyCapBytes / (1024 * 1024 * 1024)).toFixed(1)} GB`);
  console.log(`   - Max files limit:    ${maxFiles} files`);
  if (safetyCapBytes > 10 * 1024 * 1024 * 1024) {
    throw new Error("Safety cap must not exceed Cloudflare's 10 GB free tier!");
  }
  console.log("   ✓ Safety cap is safely below Cloudflare's 10 GB limit.\n");

  // Test 2: Usage calculation and caching
  console.log(`2. Bucket Usage & Cache Test:`);
  invalidateR2UsageCache();
  const t0 = Date.now();
  const usage1 = await getR2BucketUsage();
  const duration1 = Date.now() - t0;
  console.log(`   - First fetch (network call): ${duration1}ms | Used: ${(usage1.totalBytes / 1024).toFixed(2)} KB in ${usage1.objectCount} object(s)`);

  const t1 = Date.now();
  const usage2 = await getR2BucketUsage();
  const duration2 = Date.now() - t1;
  console.log(`   - Second fetch (cached call):  ${duration2}ms (${usage2.objectCount} objects, 0 Class A ops burned)`);
  if (duration2 > 10) {
    console.warn("   ⚠️ Warning: cached fetch took longer than expected.");
  } else {
    console.log("   ✓ In-memory cache protects against burning Class A requests.\n");
  }

  // Test 3: Normal capacity assertion
  console.log(`3. Normal Upload Capacity Assertion:`);
  const smallUploadBytes = 2 * 1024 * 1024; // 2 MB
  const result = await assertR2StorageCapacity(smallUploadBytes);
  console.log(`   - Requesting ${smallUploadBytes / (1024 * 1024)} MB upload: ALLOWED (projected ${(result.projectedBytes / 1024).toFixed(1)} KB)`);
  console.log("   ✓ Normal uploads are allowed.\n");

  // Test 4: Hard blocker trigger when exceeding safety cap
  console.log(`4. Hard Blocker Trigger Test (Storage Exceeded):`);
  const hugeUploadBytes = 6 * 1024 * 1024 * 1024; // 6 GB (exceeds 5 GB cap)
  let blocked = false;
  try {
    await assertR2StorageCapacity(hugeUploadBytes);
  } catch (err) {
    if (err instanceof R2StorageLimitExceededError) {
      blocked = true;
      console.log(`   ✓ BLOCKED with error: "${err.message}"`);
    } else {
      throw err;
    }
  }
  if (!blocked) {
    throw new Error("❌ FAILURE: Oversized upload was NOT blocked!");
  }
  console.log("   ✓ Hard blocker successfully prevented oversized upload from reaching R2!\n");

  // Test 5: Presigned upload URL capacity assertion
  console.log(`5. Presigned Video Upload Guard:`);
  let presignBlocked = false;
  try {
    await getR2PresignedUploadUrl("portfolio/media/test.mp4", "video/mp4", hugeUploadBytes);
  } catch (err) {
    if (isR2StorageLimitError(err)) {
      presignBlocked = true;
      console.log(`   ✓ Presign request BLOCKED: "${err.message}"`);
    } else {
      console.error("   Unexpected error caught in test 5:", err);
    }
  }
  if (!presignBlocked) {
    throw new Error("❌ FAILURE: Presigned URL generator did not enforce capacity!");
  }
  console.log("   ✓ Presigned URL generator enforces capacity before creating upload tokens.\n");

  // Test 6: Referenced media keys extraction
  console.log(`6. Referenced Media Extraction & Protection:`);
  const mockContent = {
    projects: [
      {
        name: "Test",
        status: "Live",
        summary: "test",
        detail: "test",
        stack: ["React"],
        links: [],
        images: [
          { src: "/api/media/abc-123.png", alt: "test" },
          { src: "https://media.aidenguan.com/portfolio/media/def-456.png", alt: "test" },
        ],
      },
    ],
    timeline: [],
  };
  const refs = extractReferencedMediaKeys(mockContent);
  if (!refs.has("abc-123.png") || !refs.has("portfolio/content.json") || !refs.has("def-456.png")) {
    throw new Error("❌ FAILURE: Referenced media was not correctly extracted!");
  }
  console.log(`   - Extracted ${refs.size} active protected references.`);
  console.log("   ✓ Active media and database files are protected from orphan cleanup.\n");

  console.log("🎉 ALL HARD BLOCKER TESTS PASSED SUCCESSFULLY!");
}

runTests().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
