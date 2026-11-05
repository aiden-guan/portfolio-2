import { SoundToggle } from "@/components/sound-toggle";
import { ProjectsFolder } from "@/components/mat/folder";
import { Mat } from "@/components/mat/mat";
import { MatNavigation } from "@/components/mat/navigation";
import { Table, TidyButton } from "@/components/mat/table";
import { ToolSwitch } from "@/components/mat/tools";
import { PrintViewer } from "@/components/print-viewer";
import { SceneCaption, SceneryBackdrop } from "@/components/scenery";
import { WorldSwitch } from "@/components/identity/world-switch";
import { ThemeToggle } from "@/components/theme-toggle";
import { getGitHubProjects } from "@/lib/github-projects";
import { wordmarkWidth } from "@/lib/mat";
import { getPortfolioContent } from "@/lib/portfolio-content";
import type { Metadata } from "next";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Student",
  description:
    "Aiden Guan's work laid out on a cutting mat as printed things: receipts, tickets, postcards and time cards to pick up, turn over, cut and burn.",
  alternates: { canonical: "/student" },
};

export default async function Home() {
  const [content, github] = await Promise.all([getPortfolioContent(), getGitHubProjects()]);
  const { navigation, profile } = content;

  return (
    <>
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <SceneryBackdrop />
      <header className="masthead">
        <div className="masthead-lead">
          <a className="masthead-name" href="#index">
            {profile.mark ? <span className="masthead-mark">{profile.mark}</span> : null}
            <span>{profile.name}</span>
          </a>
          <WorldSwitch current="student" bare align="right" className="masthead-world" />
        </div>
        <MatNavigation navigation={navigation} />
        <div className="masthead-tools">
          <TidyButton />
          <ToolSwitch />
          <SceneCaption />
          <SoundToggle />
          <ThemeToggle />
        </div>
        <span className="ruler-guide ruler-guide-x" aria-hidden="true" />
      </header>
      <main id="main-content" tabIndex={-1}>
        <Table>
          <Mat content={content} />
        </Table>
      </main>
      <ProjectsFolder
        projects={github.projects}
        live={github.live}
        checkedAt={github.checkedAt}
        nameWidth={wordmarkWidth(profile.name)}
      />
      <PrintViewer />
    </>
  );
}
