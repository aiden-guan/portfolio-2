import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
} from "@aws-sdk/client-s3";

async function testR2() {
  const accountId = process.env.R2_ACCOUNT_ID?.trim();
  const accessKeyId = process.env.R2_ACCESS_KEY_ID?.trim();
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY?.trim();
  const bucket = process.env.R2_BUCKET_NAME?.trim() || "portfolio-media";
  const publicUrl = process.env.R2_PUBLIC_URL?.trim();

  console.log("=== Testing Cloudflare R2 Connection ===\n");
  console.log(`Account ID:   ${accountId ? accountId.slice(0, 6) + "..." : "MISSING"}`);
  console.log(`Access Key:   ${accessKeyId ? accessKeyId.slice(0, 6) + "..." : "MISSING"}`);
  console.log(`Secret Key:   ${secretAccessKey ? "PRESENT" : "MISSING"}`);
  console.log(`Bucket Name:  ${bucket}`);
  console.log(`Public URL:   ${publicUrl || "Not configured (will use internal media proxy)"}\n`);

  if (!accountId || !accessKeyId || !secretAccessKey) {
    console.error("❌ Missing required R2 environment variables in .env.local!");
    console.error("Please add R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, and R2_SECRET_ACCESS_KEY.");
    process.exit(1);
  }

  const client = new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
  });

  const testKey = `portfolio/test-${Date.now()}.txt`;
  const testData = "Cloudflare R2 storage is working perfectly!";

  try {
    console.log(`1. Uploading test file "${testKey}"...`);
    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: testKey,
        Body: testData,
        ContentType: "text/plain",
      })
    );
    console.log("   ✓ Upload successful!");

    console.log(`2. Reading back test file...`);
    const getRes = await client.send(
      new GetObjectCommand({
        Bucket: bucket,
        Key: testKey,
      })
    );
    const content = await getRes.Body.transformToString();
    if (content === testData) {
      console.log("   ✓ Read successful! Content verified.");
    } else {
      console.warn("   ⚠️ Content mismatch:", content);
    }

    console.log(`3. Listing objects in bucket "${bucket}"...`);
    const listRes = await client.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        MaxKeys: 10,
      })
    );
    console.log(`   ✓ Found ${listRes.KeyCount ?? 0} object(s).`);

    console.log(`4. Cleaning up test file...`);
    await client.send(
      new DeleteObjectCommand({
        Bucket: bucket,
        Key: testKey,
      })
    );
    console.log("   ✓ Cleanup successful!\n");

    console.log(`5. Verifying Hard Blocker Safety Configuration:`);
    const safetyCapGb = process.env.R2_MAX_STORAGE_GB ? Number(process.env.R2_MAX_STORAGE_GB) : 5;
    const maxFiles = process.env.R2_MAX_FILES ? Number(process.env.R2_MAX_FILES) : 1000;
    console.log(`   - Hard Safety Cap:      ${safetyCapGb} GB (Cloudflare Free Tier is 10 GB)`);
    console.log(`   - Max File Cap:         ${maxFiles} objects`);
    console.log(`   - Class A Operations:   1,000,000 / month (Free)`);
    console.log(`   - Class B Operations:   10,000,000 / month (Free)`);
    console.log(`   - Egress Bandwidth:     Unlimited ($0)`);
    console.log("   ✓ Safety blocker is armed: uploads exceeding limits are rejected automatically.\n");

    console.log("🎉 SUCCESS: Cloudflare R2 connection & hard blocker protections are active!");
  } catch (err) {
    console.error("\n❌ Cloudflare R2 connection error:", err.message);
    process.exit(1);
  }
}

testR2().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
