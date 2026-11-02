import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { EGOIST_KEYS } from "@/lib/egoists";
import { getR2BucketName, getR2Client, isR2Configured } from "@/lib/r2";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// How many egoists have come to the identity page: one small file in R2,
// counted up only if nobody has written it since it was read, so two people
// arriving at once are both counted. Writes are capped each month, a tenth of
// R2's free allowance, however hard this is hit; past the cap the count stops
// going up until the month turns. Anywhere but production counts into its own
// file, so trying it out never moves the real number.
const KEY = process.env.VERCEL_ENV === "production" ? EGOIST_KEYS.production : EGOIST_KEYS.elsewhere;
const WRITES_A_MONTH = 100_000;
const TRIES = 5;

const noStore = { "Cache-Control": "no-store" };

type Tally = { count: number; month: string; writes: number };

const thisMonth = () => new Date().toISOString().slice(0, 7);

async function read(): Promise<{ tally: Tally; etag?: string }> {
  try {
    const object = await getR2Client().send(new GetObjectCommand({ Bucket: getR2BucketName(), Key: KEY }));
    const stored = JSON.parse((await object.Body?.transformToString()) || "{}") as Partial<Tally>;
    return {
      tally: { count: Number(stored.count) || 0, month: stored.month || thisMonth(), writes: Number(stored.writes) || 0 },
      etag: object.ETag,
    };
  } catch (error) {
    if ((error as { name?: string }).name === "NoSuchKey") return { tally: { count: 0, month: thisMonth(), writes: 0 } };
    throw error;
  }
}

// someone else wrote it between our reading it and writing it back
const beaten = (error: unknown) => {
  const status = (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
  return status === 412 || status === 409;
};

export async function GET() {
  if (!isR2Configured()) return Response.json({ count: null }, { status: 503, headers: noStore });
  try {
    const { tally } = await read();
    return Response.json({ count: tally.count }, { headers: { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=300" } });
  } catch {
    return Response.json({ count: null }, { status: 502, headers: noStore });
  }
}

export async function POST() {
  if (!isR2Configured()) return Response.json({ count: null }, { status: 503, headers: noStore });
  try {
    for (let i = 0; i < TRIES; i += 1) {
      const { tally, etag } = await read();
      const month = thisMonth();
      const writes = tally.month === month ? tally.writes : 0;
      if (writes >= WRITES_A_MONTH) return Response.json({ count: tally.count }, { headers: noStore });
      const next: Tally = { count: tally.count + 1, month, writes: writes + 1 };
      try {
        await getR2Client().send(
          new PutObjectCommand({
            Bucket: getR2BucketName(),
            Key: KEY,
            Body: JSON.stringify(next),
            ContentType: "application/json",
            CacheControl: "no-store",
            ...(etag ? { IfMatch: etag } : { IfNoneMatch: "*" }),
          }),
        );
        return Response.json({ count: next.count }, { headers: noStore });
      } catch (error) {
        if (!beaten(error)) throw error;
      }
    }
    const { tally } = await read();
    return Response.json({ count: tally.count }, { headers: noStore });
  } catch {
    return Response.json({ count: null }, { status: 502, headers: noStore });
  }
}
