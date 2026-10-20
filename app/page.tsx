import { SoundToggle } from "@/components/sound-toggle";
import { Mat } from "@/components/mat/mat";
import { MatNavigation } from "@/components/mat/navigation";
import { Table, TidyButton } from "@/components/mat/table";
import { PrintViewer } from "@/components/print-viewer";
import { PageCurl, SceneCaption, SceneryBackdrop } from "@/components/scenery";
import { ThemeToggle } from "@/components/theme-toggle";
import { getPortfolioContent } from "@/lib/portfolio-content";

export const revalidate = 3600;

export default async function Home() {
  const content = await getPortfolioContent();
  const { navigation, profile } = content;

  return (
    <>
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <SceneryBackdrop />
      <PageCurl />
      <header className="masthead">
        <a className="masthead-name" href="#index">
          {profile.mark ? <span className="masthead-mark">{profile.mark}</span> : null}
          <span>{profile.name}</span>
        </a>
        <MatNavigation navigation={navigation} />
        <div className="masthead-tools">
          <TidyButton />
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
      <PrintViewer />
    </>
  );
}
