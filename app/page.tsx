import { CardFile, FileNavigation, SoundToggle } from "@/components/card-file";
import { buildCards } from "@/components/cards";
import { PrintViewer } from "@/components/print-viewer";
import { PageCurl, SceneCaption, SceneryBackdrop } from "@/components/scenery";
import { ThemeToggle } from "@/components/theme-toggle";
import { getPortfolioContent } from "@/lib/portfolio-content";

export const revalidate = 3600;

export default async function Home() {
  const content = await getPortfolioContent();
  const { navigation, profile } = content;
  const { meta, cards } = buildCards(content);

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
        <FileNavigation navigation={navigation} />
        <div className="masthead-tools">
          <SceneCaption />
          <SoundToggle />
          <ThemeToggle />
        </div>
      </header>
      <main id="main-content" tabIndex={-1}>
        <CardFile cards={meta}>{cards}</CardFile>
      </main>
      <PrintViewer />
    </>
  );
}
