import type { Metadata, Viewport } from "next";
import { Builder } from "@/components/builder/builder";
import { builderFonts } from "@/components/builder/fonts";
import { PROJECTS } from "@/content/worlds";
import { GITHUB_USER, getGitHubProjects } from "@/lib/github-projects";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Builder",
  alternates: { canonical: "/builder" },
};

export const viewport: Viewport = {
  themeColor: "#f7f7f5",
  colorScheme: "light",
};

// "https://github.com/aiden-guan/ledger" → "ledger"; someone else's repo → null
function ownRepo(source: string | undefined) {
  const match = source ? /^https:\/\/github\.com\/([^/]+)\/([^/?#]+)/i.exec(source) : null;
  return match && match[1].toLowerCase() === GITHUB_USER.toLowerCase() ? match[2].toLowerCase() : null;
}

export default async function BuilderPage() {
  // When each repo was last pushed to. Only from a live answer: the folder's
  // snapshot would be days out of date, so without one nothing is shown.
  const github = await getGitHubProjects();
  const pushed = new Map(github.live ? github.projects.map((project) => [project.repo.toLowerCase(), project.pushedAt]) : []);
  const builds = PROJECTS.map((project) => {
    const repo = ownRepo(project.source);
    return { ...project, pushedAt: (repo && pushed.get(repo)) || null };
  });

  return <Builder builds={builds} fonts={builderFonts} />;
}
