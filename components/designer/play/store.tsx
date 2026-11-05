/* eslint-disable @next/next/no-img-element */
import type { Ref } from "react";
import { Logo } from "./logo";
import styles from "./play.module.css";

// The store the island was a trailer on: a game client in the old dark blue,
// at a fixed 1600 × 900 so it can be pinned onto the monitor. The page sits
// under the island (StorePage); everything that has to cover the trailer,
// the dialogs and the library, sits over it (StoreOver).

export const STORE = { w: 1600, h: 900, slot: { x: 210, y: 252, w: 760, h: 428 } };

export type Stage = "page" | "confirm" | "paying" | "paid" | "library" | "installing" | "ready" | "launching" | "dark";

export type Shots = { capsule: string; wide: string; thumbs: string[] };

const TAGS = ["Life Sim", "Cozy", "Pixel Graphics", "Entrepreneurship", "Hackathons", "Story Rich", "Singleplayer"];

export function StorePage({ shots, layer }: { shots: Shots | null; layer: Ref<HTMLDivElement> }) {
  return (
    <div ref={layer} className={`${styles.layer} ${styles.under}`} aria-hidden="true">
      <div className={styles.client}>
        <Chrome />
        <div className={styles.page}>
          {shots ? <div className={styles.backdrop} style={{ backgroundImage: `url(${shots.wide})` }} /> : null}
          <div className={styles.column}>
            <div className={styles.storenav}>
              <span>Your Store</span>
              <span>New &amp; Noteworthy</span>
              <span>Categories</span>
              <span>Points Shop</span>
              <span>News</span>
              <span>Labs</span>
              <span className={styles.search}>
                search
                <svg viewBox="0 0 16 16"><circle cx="7" cy="7" r="4.5" /><path d="M10.5 10.5 14 14" /></svg>
              </span>
            </div>
            <p className={styles.crumbs}>
              All Games <i>›</i> Simulation Games <i>›</i> Aiden: Life of a Handsome Entrepreneur
            </p>
            <div className={styles.titleRow}>
              <h1>Aiden: Life of a Handsome Entrepreneur</h1>
              <span className={styles.hub}>Community Hub</span>
            </div>
            <div className={styles.top}>
              <div className={styles.media}>
                <div className={styles.slot} />
                <div className={styles.strip}>
                  <span className={styles.thumb} data-current="">
                    {shots ? <img src={shots.capsule} alt="" /> : null}
                    <svg className={styles.thumbPlay} viewBox="0 0 24 24"><path d="M8 5.5v13l10.5-6.5z" /></svg>
                  </span>
                  {(shots?.thumbs ?? [null, null, null, null]).map((src, i) => (
                    <span key={i} className={styles.thumb}>
                      {src ? <img src={src} alt="" /> : null}
                    </span>
                  ))}
                </div>
                <div className={styles.scrub}>
                  <i />
                </div>
              </div>
              <div className={styles.side}>
                <div className={styles.capsule}>
                  {shots ? <img src={shots.capsule} alt="" /> : null}
                  <Logo size="sm" />
                </div>
                <p className={styles.desc}>
                  Start with $500 and a sneaker group chat. Grow it, sell it, get into Berkeley, and win your way across the Bay Area&rsquo;s hackathons. A cozy life
                  sim about building things people want, one sleepless weekend at a time.
                </p>
                <dl className={styles.meta}>
                  <dt>Recent reviews:</dt>
                  <dd>
                    <b>Overwhelmingly Handsome</b> (318)
                  </dd>
                  <dt>All reviews:</dt>
                  <dd>
                    <b>Very Positive</b> (2,026)
                  </dd>
                  <dt>Release date:</dt>
                  <dd className={styles.plain}>1 Nov, 2026</dd>
                  <dt>Developer:</dt>
                  <dd>Aiden Guan</dd>
                  <dt>Publisher:</dt>
                  <dd>Aiden Guan (bootstrapped)</dd>
                </dl>
                <p className={styles.tagsLabel}>Popular user-defined tags for this product:</p>
                <div className={styles.tags}>
                  {TAGS.map((tag) => (
                    <span key={tag}>{tag}</span>
                  ))}
                  <span>+</span>
                </div>
              </div>
            </div>
            <div className={styles.purchase}>
              <div>
                <h2>Buy Aiden: Life of a Handsome Entrepreneur</h2>
                <p className={styles.promo}>SPECIAL PROMOTION! Offer ends 8 November</p>
              </div>
              <div className={styles.price}>
                <span className={styles.discount}>-90%</span>
                <span className={styles.prices}>
                  <s>$45.00</s>
                  <b>$4.50</b>
                </span>
                <span className={styles.buy} data-target="buy">
                  Buy
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Chrome() {
  return (
    <>
      <div className={styles.titlebar}>
        <span className={styles.brand}>
          <Mark />
          esteem
        </span>
        <span className={styles.menu}>
          <span>View</span>
          <span>Friends</span>
          <span>Games</span>
          <span>Help</span>
        </span>
        <span className={styles.grow} />
        <span className={styles.account}>
          <i className={styles.avatar} />
          player_one
          <b>$47.20</b>
        </span>
        <span className={styles.windowButtons}>
          <i />
          <i />
          <i />
        </span>
      </div>
      <div className={styles.navbar}>
        <span className={styles.arrows}>
          <svg viewBox="0 0 16 16"><path d="M10 3 5 8l5 5" /></svg>
          <svg viewBox="0 0 16 16"><path d="m6 3 5 5-5 5" /></svg>
        </span>
        <span data-on="">Store</span>
        <span>Library</span>
        <span>Community</span>
        <span>Player_one</span>
      </div>
      <div className={styles.url}>
        <svg viewBox="0 0 16 16"><rect x="4" y="7" width="8" height="6" rx="1" /><path d="M5.5 7V5.5a2.5 2.5 0 0 1 5 0V7" /></svg>
        https://store.esteem.gg/app/2026/Aiden_Life_of_a_Handsome_Entrepreneur/
      </div>
    </>
  );
}

// esteem's mark: a sparkle in a ring, the shine on someone very sure of himself
function Mark() {
  return (
    <svg className={styles.mark} viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="10.5" />
      <path d="M12 5.5c.7 3.6 2.9 5.8 6.5 6.5-3.6.7-5.8 2.9-6.5 6.5-.7-3.6-2.9-5.8-6.5-6.5 3.6-.7 5.8-2.9 6.5-6.5Z" />
    </svg>
  );
}

const LIBRARY = [
  { name: "BarkOff", logo: "/logos/barkoff.webp" },
  { name: "Rally", logo: "/logos/rally.webp" },
  { name: "StartupSim", logo: "/logos/startupsim.webp" },
];

export function StoreOver({
  stage,
  shots,
  layer,
  cursor,
}: {
  stage: Stage;
  shots: Shots | null;
  layer: Ref<HTMLDivElement>;
  cursor: Ref<HTMLDivElement>;
}) {
  const dialog = stage === "confirm" || stage === "paying" || stage === "paid";
  const library = stage === "library" || stage === "installing" || stage === "ready" || stage === "launching";
  return (
    <div ref={layer} className={`${styles.layer} ${styles.over}`} data-stage={stage} aria-hidden="true">
      <div className={styles.modal} data-shown={dialog || undefined}>
        <div className={styles.dialog}>
          <header>
            <Mark />
            Your purchase
          </header>
          <div className={styles.lineItem}>
            {shots ? <img src={shots.capsule} alt="" /> : <span />}
            <div>
              <b>Aiden: Life of a Handsome Entrepreneur</b>
              <span>Digital edition · plays in the browser</span>
            </div>
            <em>$4.50</em>
          </div>
          <div className={styles.payRow}>
            <span>Pay with</span>
            <b>esteem Wallet</b>
            <span className={styles.balance}>balance $47.20</span>
          </div>
          <div className={styles.agree}>
            <i />
            I agree to the terms of the esteem Subscriber Agreement
          </div>
          <div className={styles.purchaseRow}>
            <span className={styles.total}>
              Total <b>$4.50</b>
            </span>
            <span className={styles.purchaseButton} data-target="purchase" data-state={stage}>
              <span className={styles.label}>Purchase</span>
              <span className={styles.spinner} />
              <span className={styles.done}>
                <svg viewBox="0 0 16 16"><path d="m3.5 8.5 3 3 6-7" /></svg>
                Thank you!
              </span>
            </span>
          </div>
        </div>
      </div>

      <div className={styles.library} data-shown={library || stage === "dark" || undefined}>
        <aside className={styles.shelf}>
          <div className={styles.shelfHome}>Home</div>
          <div className={styles.shelfSearch}>
            <svg viewBox="0 0 16 16"><circle cx="7" cy="7" r="4.5" /><path d="M10.5 10.5 14 14" /></svg>
          </div>
          <div className={styles.shelfGroup}>All games (4)</div>
          <div className={styles.shelfGame} data-current="">
            <i className={styles.gameIcon}>A</i>
            Aiden: Life of a Handsome Entrepreneur
          </div>
          {LIBRARY.map((game) => (
            <div key={game.name} className={styles.shelfGame}>
              <img src={game.logo} alt="" />
              {game.name}
            </div>
          ))}
        </aside>
        <section className={styles.detail}>
          <div className={styles.hero}>
            {shots ? <img src={shots.wide} alt="" /> : null}
            <Logo size="md" />
          </div>
          <div className={styles.actionBar}>
            <span className={styles.action} data-target="action" data-state={stage}>
              <span className={styles.actionInstall}>
                <svg viewBox="0 0 16 16"><path d="M8 2.5v8M4.5 7 8 10.5 11.5 7M3 13.5h10" /></svg>
                Install
              </span>
              <span className={styles.actionInstalling}>Installing</span>
              <span className={styles.actionPlay}>
                <svg viewBox="0 0 16 16"><path d="M5 3v10l8-5z" /></svg>
                Play
              </span>
              <span className={styles.actionRunning}>Running</span>
            </span>
            <span className={styles.stat}>
              <small>Size on disk</small>2.6 GB
            </span>
            <span className={styles.stat}>
              <small>Last played</small>
              {stage === "launching" || stage === "dark" ? "Today" : "Never"}
            </span>
            <span className={styles.stat}>
              <small>Play time</small>0 minutes
            </span>
            <span className={styles.download}>
              <span className={styles.downloadText}>
                <span>Downloading</span>
                <b>980 MB/s</b>
              </span>
              <span className={styles.bar}>
                <i />
              </span>
            </span>
          </div>
          <div className={styles.activity}>
            <h3>Activity</h3>
            <p>
              <i className={styles.avatar} />
              <span>
                <b>player_one</b> bought <b>Aiden: Life of a Handsome Entrepreneur</b>
                <small>Just now</small>
              </span>
            </p>
            <p className={styles.news}>
              <span className={styles.newsTag}>Patch notes</span>
              <span>
                <b>v1.0: Life, so far.</b> Adds a dog, three first places, and a single very good haircut.
              </span>
            </p>
          </div>
        </section>
        <div className={styles.dark} data-shown={stage === "dark" || undefined} />
      </div>

      <div className={styles.glare} />
      <div ref={cursor} className={styles.cursor}>
        <svg className={styles.arrow} viewBox="0 0 20 28">
          <path d="M2 2v20.5l5.2-5 3.6 8.3 3.4-1.5-3.6-8.1H17L2 2Z" />
        </svg>
        <svg className={styles.hand} viewBox="0 0 24 28">
          <path d="M8.5 2.5c1.1 0 2 .9 2 2v7.2l.9-.2c.8-1.6 2.7-1.6 3.4 0 .9-1.4 2.7-1.2 3.3.3 1.1-.7 2.9-.1 2.9 1.8V19c0 3.7-2.9 6.5-6.6 6.5h-1.6c-2.2 0-4.2-1.1-5.4-2.9L2.8 16c-.8-1.2.3-2.8 1.7-2.4l2 .7V4.5c0-1.1.9-2 2-2Z" />
        </svg>
      </div>
    </div>
  );
}
