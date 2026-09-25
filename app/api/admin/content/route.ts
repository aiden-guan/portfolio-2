import {
  isAdminAuthenticated,
} from "@/lib/admin-auth";
import {
  getPortfolioContent,
  isContentStoreConfigured,
  PortfolioContentError,
  savePortfolioContent,
} from "@/lib/portfolio-content";

export const runtime = "nodejs";

const noStore = { "Cache-Control": "no-store" };

async function requireAdmin() {
  return isAdminAuthenticated();
}

export async function GET() {
  if (!(await requireAdmin())) {
    return Response.json({ error: "Sign in to edit the portfolio." }, { status: 401 });
  }

  return Response.json(
    {
      content: await getPortfolioContent(),
      storageConfigured: isContentStoreConfigured(),
    },
    { headers: noStore },
  );
}

export async function PUT(request: Request) {
  if (!(await requireAdmin())) {
    return Response.json({ error: "Sign in to edit the portfolio." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "The content payload could not be read." }, { status: 400 });
  }

  try {
    const content = await savePortfolioContent(body);
    return Response.json({ content }, { headers: noStore });
  } catch (error) {
    const message =
      error instanceof PortfolioContentError
        ? error.message
        : "The portfolio could not be saved.";
    const status = error instanceof PortfolioContentError ? 400 : 500;
    return Response.json({ error: message }, { status, headers: noStore });
  }
}
