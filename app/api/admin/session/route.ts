import {
  clearAdminSession,
  createAdminSession,
  isAdminAuthenticated,
  isAdminConfigured,
  isValidAdminPassword,
} from "@/lib/admin-auth";

export const runtime = "nodejs";

const noStore = { "Cache-Control": "no-store" };

export async function GET() {
  return Response.json(
    {
      authenticated: await isAdminAuthenticated(),
      configured: isAdminConfigured(),
    },
    { headers: noStore },
  );
}

export async function POST(request: Request) {
  if (!isAdminConfigured()) {
    return Response.json(
      { error: "Admin access is not configured yet." },
      { status: 503, headers: noStore },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Enter your admin password." }, { status: 400 });
  }

  const password =
    typeof body === "object" && body !== null && "password" in body
      ? body.password
      : undefined;

  if (!isValidAdminPassword(password)) {
    return Response.json({ error: "Password not recognized." }, { status: 401 });
  }

  await createAdminSession();
  return Response.json({ ok: true }, { headers: noStore });
}

export async function DELETE() {
  await clearAdminSession();
  return Response.json({ ok: true }, { headers: noStore });
}
