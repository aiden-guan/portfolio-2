"use client";

/* eslint-disable @next/next/no-img-element */
import { useCallback, useEffect, useRef, useState } from "react";
import { face } from "./faces";
import { Brief, Hint, jolt, Pops, punch, rankOf, Results, screensPaused, useArrows, useFrame, usePops, usePress, useSince, Window, type Props, type Rank } from "./screen-kit";
import { BerkeleyScreen, type BerkeleySpec } from "./screens-berkeley";
import styles from "./screens.module.css";

// Everything that takes over the screen for a moment: the laptop and the
// phone (a chat app and its servers, DMs, the group chat), and the
// mini-games, each made from the thing it's about. Each one calls onDone
// when it's finished, with whatever it has to report.

export type Msg = { who: string; text: string; me?: boolean; system?: boolean; alert?: boolean; wait?: number };

export type ScreenSpec =
  | { kind: "create"; name: string }
  | {
      kind: "chat";
      app: "server" | "phone";
      title: string;
      sub?: string;
      face?: string;
      channels?: string[];
      channel?: string;
      members?: string;
      messages: Msg[];
      stamp?: string;
      /** A group thread: everyone's name shows over what they say. */
      group?: boolean;
    }
  | { kind: "copy" }
  | { kind: "drop"; rounds: Array<{ name: string; time: string }> }
  | { kind: "reel"; caption: string; image?: string }
  /** The reel's first line: pick one, a test audience watches the first second, Raymond says what he thinks. Resolves with the tries it took. */
  | { kind: "hook"; hooks: Array<{ text: string; reply: string }>; right: number }
  | { kind: "growth"; from: number; to: number }
  | { kind: "intro"; who: string; name: string; line: string; colour: string }
  | { kind: "impact"; text: string; sub?: string }
  | BerkeleySpec;

export function Screen(props: Props<ScreenSpec> & { photo?: string }) {
  const { spec } = props;
  switch (spec.kind) {
    case "create":
      return <Create {...props} spec={spec} />;
    case "chat":
      return <Chat {...props} spec={spec} />;
    case "copy":
      return <Copy {...props} spec={spec} />;
    case "drop":
      return <Drop {...props} spec={spec} />;
    case "reel":
      return <Reel {...props} spec={spec} />;
    case "hook":
      return <Hook {...props} spec={spec} />;
    case "growth":
      return <Growth {...props} spec={spec} />;
    case "intro":
      return <Intro {...props} spec={spec} />;
    case "impact":
      return <Impact {...props} spec={spec} />;
    default:
      return <BerkeleyScreen {...props} spec={spec} />;
  }
}

// —— the prologue's laptop: name the server, create it

function Create({ spec, soundRef, onDone, touch }: Props<Extract<ScreenSpec, { kind: "create" }>>) {
  const [typed, setTyped] = useState(0);
  const [made, setMade] = useState(false);
  useEffect(() => {
    let n = 0;
    const id = window.setInterval(() => {
      n += 1;
      setTyped(n);
      soundRef.current?.keys();
      if (n >= spec.name.length) window.clearInterval(id);
    }, 120);
    return () => window.clearInterval(id);
  }, [spec.name, soundRef]);
  const ready = typed >= spec.name.length;
  const create = () => {
    if (!ready || made) return;
    soundRef.current?.confirm();
    setMade(true);
    window.setTimeout(() => onDone(), 2600);
  };
  usePress(create);
  return (
    <div className={styles.scrim} onClick={create}>
      <Window title="Chatter">
        {made ? (
          <div className={styles.server} data-new="">
            <aside>
              <b>
                <i className={styles.icon} aria-hidden="true">
                  {spec.name.slice(0, 2)}
                </i>
                {spec.name}
              </b>
              <span># release-alerts</span>
              <span># where-to-cop</span>
              <span># general</span>
            </aside>
            <section>
              <p className={styles.welcome}>
                <i className={styles.bot}>A</i>
                <span>
                  <b>{spec.name} bot</b> Welcome to {spec.name}. Drops land here first.
                </span>
              </p>
              <p className={styles.members}>Members: 1 · You</p>
            </section>
          </div>
        ) : (
          <div className={styles.form}>
            <h3>Create a server</h3>
            <p>Where your community talks. Name it something people will remember.</p>
            <div className={styles.named}>
              <span className={styles.icon} data-empty={typed === 0 || undefined} aria-hidden="true">
                {typed ? spec.name.slice(0, Math.min(2, typed)) : "+"}
              </span>
              <label>
                Server name
                <span className={styles.field}>
                  {spec.name.slice(0, typed)}
                  <i className={styles.caret} />
                </span>
              </label>
            </div>
            <div className={styles.chips}>
              <span># release-alerts</span>
              <span># where-to-cop</span>
              <span># general</span>
            </div>
            <button type="button" className={styles.action} data-ready={ready || undefined} onClick={create}>
              {touch ? null : <kbd>E</kbd>} Create
            </button>
          </div>
        )}
      </Window>
    </div>
  );
}

// —— a chat: a server's channel on the laptop, or a thread on the phone.
// Messages arrive one at a time, someone typing between them.

function Chat({ spec, soundRef, onDone, touch }: Props<Extract<ScreenSpec, { kind: "chat" }>>) {
  const [count, setCount] = useState(0);
  const [typing, setTyping] = useState(false);
  const [stamped, setStamped] = useState(false);
  const list = useRef<HTMLDivElement>(null);
  const total = spec.messages.length;
  const done = count >= total && (!spec.stamp || stamped);

  useEffect(() => {
    if (count >= total) {
      if (spec.stamp && !stamped) {
        const id = window.setTimeout(() => {
          setStamped(true);
          soundRef.current?.launch();
          soundRef.current?.thud();
        }, 650);
        return () => window.clearTimeout(id);
      }
      return;
    }
    const next = spec.messages[count];
    const gap = next.wait ?? (next.me ? 650 : 520 + Math.min(900, next.text.length * 22));
    const typingAt = window.setTimeout(() => setTyping(!next.system && !next.me), 160);
    const id = window.setTimeout(() => {
      setTyping(false);
      setCount((n) => n + 1);
      if (next.system) soundRef.current?.select();
      else soundRef.current?.blip(next.me ? 2 : -4);
    }, count === 0 ? 450 : gap);
    return () => {
      window.clearTimeout(id);
      window.clearTimeout(typingAt);
    };
  }, [count, total, spec.messages, spec.stamp, stamped, soundRef]);

  useEffect(() => {
    list.current?.scrollTo({ top: list.current.scrollHeight, behavior: "smooth" });
  }, [count, typing]);

  const press = useCallback(() => {
    if (done) onDone();
    else {
      setCount(total);
      if (spec.stamp) {
        setStamped(true);
        soundRef.current?.launch();
      }
    }
  }, [done, onDone, total, spec.stamp, soundRef]);
  usePress(press);

  const shown = spec.messages.slice(0, count);
  const other = spec.messages.find((m) => !m.me && !m.system)?.who ?? spec.title;
  // someone is only ever typing the next message, never after the last
  const writing = typing && count < total && !spec.messages[count]?.system && !spec.messages[count]?.me;
  const avatar = spec.face ? face(spec.face) : undefined;

  if (spec.app === "phone") {
    return (
      <div className={styles.scrim} onClick={press}>
        <div className={styles.phone} data-shake={stamped || undefined}>
          <div className={styles.phoneTop}>
            <span className={styles.notch} />
            <svg className={styles.status} viewBox="0 0 22 7" aria-hidden="true" shapeRendering="crispEdges">
              <path d="M0 5h1v2H0zM2 3h1v4H2zM4 1h1v6H4zM9 1h10v6H9zM19 3h1v2h-1z" />
              <path className={styles.charge} d="M10 2h6v4h-6z" />
            </svg>
          </div>
          <header className={styles.thread}>
            {avatar ? <img src={avatar} alt="" /> : <i />}
            <div>
              <b>{spec.title}</b>
              {spec.sub ? <small>{spec.sub}</small> : null}
            </div>
          </header>
          <div className={styles.bubbles} ref={list}>
            {shown.map((m, i) =>
              m.system ? (
                <p key={i} className={styles.system} data-alert={m.alert || undefined}>
                  {m.text}
                </p>
              ) : (
                <p key={i} className={styles.bubble} data-me={m.me || undefined}>
                  {!m.me && (spec.group || m.who !== other) ? <b>{m.who}</b> : null}
                  {m.text}
                </p>
              ),
            )}
            {writing ? (
              <p className={styles.bubble} data-typing="">
                <i />
                <i />
                <i />
              </p>
            ) : null}
          </div>
          {spec.stamp ? (
            <div className={styles.stamp} data-shown={stamped || undefined}>
              {spec.stamp}
            </div>
          ) : null}
          <div className={styles.compose} aria-hidden="true">
            <span>Message {spec.title}</span>
            <i />
          </div>
          <footer className={styles.phoneFoot}>{done ? <Hint touch={touch} /> : <span className={styles.dots}>···</span>}</footer>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.scrim} onClick={press}>
      <div data-shake={stamped || undefined} className={styles.shaker}>
        <Window title="Chatter" wide>
          <div className={styles.server} data-tall="">
            <aside>
              <b>{spec.title}</b>
              {spec.members ? <small className={styles.count}>{spec.members}</small> : null}
              {(spec.channels ?? []).map((c) => (
                <span key={c} data-on={c === spec.channel || undefined}>
                  # {c}
                </span>
              ))}
            </aside>
            <section className={styles.channel}>
              <header># {spec.channel}</header>
              <div className={styles.messages} ref={list}>
                {shown.length === 0 && !typing ? <p className={styles.empty}>No messages yet.</p> : null}
                {shown.map((m, i) =>
                  m.system ? (
                    <p key={i} className={styles.system} data-alert={m.alert || undefined}>
                      {m.text}
                    </p>
                  ) : (
                    <p key={i} className={styles.message} data-me={m.me || undefined}>
                      <i className={styles.avatar} style={{ background: hue(m.who) }}>
                        {m.who.slice(0, 1).toUpperCase()}
                      </i>
                      <span>
                        <b>{m.who}</b>
                        {m.text}
                      </span>
                    </p>
                  ),
                )}
                {writing ? (
                  <p className={styles.typingLine}>
                    <b>{spec.messages[count]?.who}</b> is typing…
                  </p>
                ) : null}
              </div>
              <footer>{done ? <Hint touch={touch} /> : null}</footer>
            </section>
          </div>
          {spec.stamp ? (
            <div className={styles.stamp} data-shown={stamped || undefined}>
              {spec.stamp}
            </div>
          ) : null}
        </Window>
      </div>
    </div>
  );
}

function hue(name: string) {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return `hsl(${h} 55% 52%)`;
}

// —— copy, paste: the big server's alerts, carried over while they're
// still news. They come faster and faster, and the better it goes, the
// sooner somebody notices.

const ALERTS = [
  "Court Low “Panda” · restock Thu 7:00 AM",
  "Retro IV “Cement” · online only, Sat 10 AM",
  "Skyline 1 “Sunrise” · raffle closes tonight",
  "Runner 2K “Grey Day” · early link in 5 min",
  "Foam Slide “Onyx” · surprise drop, now",
  "Court Hi “Varsity” · Fri 7:00 AM",
  "Trail 3 “Moss” · 30% code, 1 hour",
  "Retro I “Royal” · Sat 7:00 AM",
  "Court Low “Coast” · app only, 9 AM",
  "Runner 1 “Fog” · back in stock, 8 to 11",
  "Skyline 2 “Dusk” · raffle opens at noon",
  "Retro III “Fire” · restock rumour, Sun",
  "Court Mid “Smoke” · members-only link",
  "Foam Slide “Sand” · dropping in 2 min",
  "Trail 1 “Glacier” · 40% off, tonight",
  "Court Low “Panda” · second restock, 7:15",
];
// how long an alert is worth copying, and how soon counts as instant
const FRESH = 1.7;
const INSTANT = 0.55;
const arrivalOf = (i: number) => 0.8 + i * 1.35 - (i * (i - 1) * 0.045) / 2;

type Copied = { i: number; instant: boolean };

const Bell = () => (
  <svg className={styles.bell} viewBox="0 0 8 8" aria-hidden="true" shapeRendering="crispEdges">
    <path d="M3 0h2v1h1v1h1v3h1v1H0V5h1V2h1V1h1zM3 7h2v1H3z" />
  </svg>
);

function Copy({ soundRef, onDone, touch }: Props<Extract<ScreenSpec, { kind: "copy" }>>) {
  const [phase, setPhaseState] = useState<"brief" | "run" | "caught" | "done">("brief");
  const [arrived, setArrived] = useState(0);
  const [copied, setCopied] = useState<Copied[]>([]);
  const [stale, setStale] = useState(0);
  const [streak, setStreak] = useState(0);
  const phaseRef = useRef(phase);
  const live = useRef({ t: 0, arrived: 0, stale: 0, copied: new Set<number>(), lockUntil: 0, caughtAt: 0, streak: 0 });
  const box = useRef<HTMLDivElement>(null);
  const theirs = useRef<HTMLDivElement>(null);
  const ours = useRef<HTMLDivElement>(null);
  const { pops, pop } = usePops();
  const ready = useSince(phase === "done");
  const members = 4 + copied.length * 3;
  const go = (next: typeof phase) => {
    phaseRef.current = next;
    setPhaseState(next);
  };

  // both feeds follow their newest message
  useEffect(() => {
    theirs.current?.scrollTo({ top: theirs.current.scrollHeight, behavior: "smooth" });
  }, [arrived]);
  useEffect(() => {
    ours.current?.scrollTo({ top: ours.current.scrollHeight, behavior: "smooth" });
  }, [copied]);

  useFrame(
    (dt) => {
      const s = live.current;
      if (phaseRef.current === "caught") {
        if (s.t - s.caughtAt > 2.2) go("done");
        s.t += dt;
        return;
      }
      if (phaseRef.current !== "run") return;
      s.t += dt;
      while (s.arrived < ALERTS.length && s.t >= arrivalOf(s.arrived)) {
        s.arrived += 1;
        setArrived(s.arrived);
        soundRef.current?.blip(-6 + (s.arrived % 3));
      }
      // an alert nobody copied in time is old news, and the streak goes with it
      while (s.stale < s.arrived && s.t - arrivalOf(s.stale) > FRESH) {
        if (!s.copied.has(s.stale)) {
          s.streak = 0;
          setStreak(0);
        }
        s.stale += 1;
        setStale(s.stale);
      }
      if (s.stale >= ALERTS.length) {
        s.caughtAt = s.t;
        go("caught");
        soundRef.current?.blip(-10);
      }
    },
    phase === "run" || phase === "caught",
  );

  const copy = (i: number) => {
    const s = live.current;
    if (phaseRef.current !== "run" || i >= s.arrived || s.copied.has(i)) return;
    const el = theirs.current?.querySelector<HTMLElement>(`[data-i="${i}"]`);
    const at = el && box.current ? place(el, box.current) : { x: 25, y: 60 };
    if (i < s.stale) {
      pop("old news", "ink", at.x, at.y);
      soundRef.current?.select();
      return;
    }
    const instant = s.t - arrivalOf(i) <= INSTANT;
    s.copied.add(i);
    setCopied((list) => [...list, { i, instant }]);
    s.streak += 1;
    setStreak(s.streak);
    soundRef.current?.coin();
    if (s.streak >= 3 && s.streak % 3 === 0) soundRef.current?.sparkle();
    pop(instant ? "instant" : "copied", instant ? "great" : "good", at.x, at.y);
    pop("+3", "good", 58, 9);
    punch(el, 0.04);
  };

  const press = () => {
    const s = live.current;
    if (phaseRef.current === "brief") {
      soundRef.current?.confirm();
      return go("run");
    }
    if (phaseRef.current === "done") return ready() && onDone(copied.length);
    if (phaseRef.current !== "run" || s.t < s.lockUntil) return;
    // the newest one still worth copying
    for (let i = s.arrived - 1; i >= s.stale; i -= 1)
      if (!s.copied.has(i)) return copy(i);
    // nothing new: mashing doesn't help
    s.lockUntil = s.t + 0.22;
    s.streak = 0;
    setStreak(0);
    pop("nothing new", "ink", 25, 88);
    jolt(theirs.current, 0.3);
    soundRef.current?.select();
  };
  usePress(press);

  const instants = copied.filter((c) => c.instant).length;
  const points = instants * 2 + (copied.length - instants);
  const rank = rankOf(points / (ALERTS.length * 2), [0.9, 0.7, 0.45]);
  const newest = (() => {
    for (let i = arrived - 1; i >= stale; i -= 1) if (!copied.some((c) => c.i === i)) return i;
    return -1;
  })();

  return (
    <div className={styles.scrim} data-over={phase === "done" || undefined} onClick={() => (phase === "brief" || phase === "done") && press()}>
      <Window title="Chatter · two servers" wide>
        <div className={styles.copy} ref={box}>
          <section className={styles.theirs}>
            <header>
              <b>HYPEHAUS</b>
              <small>98,214 members · # alerts</small>
              <small className={styles.rule}>rule #1: never repost our alerts</small>
            </header>
            <div className={styles.feed} ref={theirs}>
              {phase === "brief" ? <Brief dark touch={touch} text="Copy their alerts while they’re still news. Each one only stays fresh for a second." /> : null}
              {ALERTS.slice(0, arrived).map((text, i) => {
                const done = copied.some((c) => c.i === i);
                const old = !done && i < stale;
                return (
                  <button
                    type="button"
                    key={text + i}
                    data-i={i}
                    className={styles.alert}
                    data-copied={done || undefined}
                    data-stale={old || undefined}
                    data-newest={i === newest || undefined}
                    onClick={(event) => {
                      event.stopPropagation();
                      copy(i);
                    }}
                  >
                    <Bell />
                    <span>{text}</span>
                    <em>{done ? "Copied" : old ? "old news" : "Copy"}</em>
                    {!done && !old ? <i className={styles.fresh} /> : null}
                  </button>
                );
              })}
              {phase === "caught" || phase === "done" ? (
                <p className={styles.typingLine} data-dark="">
                  <b>kingcop</b> is typing
                  <span className={styles.typingDots}>
                    <i />
                    <i />
                    <i />
                  </span>
                </p>
              ) : null}
            </div>
          </section>
          <section className={styles.ours}>
            <header>
              <b>AGNotify</b>
              <small>
                <span key={members} className={styles.tick}>
                  {members}
                </span>{" "}
                members · # release-alerts
              </small>
              {streak >= 2 ? (
                <span className={styles.streak} key={streak}>
                  ×{streak}
                </span>
              ) : null}
            </header>
            <div className={styles.feed} ref={ours}>
              {copied.length === 0 ? <p className={styles.empty}>Nothing yet. Copy something.</p> : null}
              {copied.map((c) => (
                <p key={c.i} className={styles.pasted}>
                  <Bell />
                  <span>{ALERTS[c.i]}</span>
                </p>
              ))}
            </div>
          </section>
          <Pops items={pops} />
        </div>
        <footer className={styles.copyFoot}>
          <span className={styles.hint}>{touch ? "Tap an alert to copy it" : <><kbd>E</kbd> copy the newest · or click one</>}</span>
        </footer>
      </Window>
      {phase === "done" ? (
        <Results
          game="copyrush"
          kicker="CopyRush"
          rank={rank}
          score={points * 100 + copied.length}
          label={`${copied.length} copied · ${members} members`}
          reason={rank === "S" ? "Every alert, still warm. Someone was bound to notice." : rank === "A" ? "Fast hands. Faster than is wise." : rank === "B" ? "Half of it made it over." : "Copying is harder than it looks."}
          touch={touch}
          soundRef={soundRef}
        />
      ) : null}
    </div>
  );
}

/** Where an element sits inside a box, in percent, for a pop. */
function place(el: HTMLElement, box: HTMLElement) {
  const a = el.getBoundingClientRect();
  const b = box.getBoundingClientRect();
  return { x: ((a.left + a.width * 0.72 - b.left) / b.width) * 100, y: ((a.top + a.height * 0.2 - b.top) / b.height) * 100 };
}

// —— the drop: post the alert the second it goes live. The strip is the
// last few seconds before it does; the windows are real seconds, a couple
// of frames generous. The last drop has no time: watch for it, then go.

type Verdict = "perfect" | "good" | "early" | "late";
type Post = { verdict: Verdict; off: number };

const LEAD = 3.2;
const TAIL = 1.4;
const LIVE_AT = LEAD / (LEAD + TAIL);
const PERFECT = 0.1;
const GOOD = 0.24;
const SPEED = [1, 1.45, 1.9];
// what the eye sees runs a frame or two behind the clock
const LAG = 0.025;
const REACT_PERFECT = 0.34;
const REACT_GOOD = 0.58;
// when the surprise goes live, the same every time so a best is the same game
const SURPRISE = [2.4, 3.1, 2.6];
const DIGITS = "0123456789";
// the reaction clock, written without making a string every frame
const REACTION = Array.from({ length: 200 }, (_, n) => `${Math.floor(n / 100)}.${String(n % 100).padStart(2, "0")} s`);

/** "Thursday · 7:00:00 AM" → seconds after midnight; null for "any second now". */
function clockOf(time: string) {
  const m = /(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?/i.exec(time);
  if (!m) return null;
  const pm = m[4]?.toUpperCase() === "PM";
  const h = m[4] ? (Number(m[1]) % 12) + (pm ? 12 : 0) : Number(m[1]);
  return { at: h * 3600 + Number(m[2]) * 60 + Number(m[3] ?? 0), suffix: m[4]?.toUpperCase() ?? "" };
}

/** The clock's digits, each written only when it changes. */
function writeClock(digits: HTMLElement[], shown: Int8Array, secs: number) {
  const put = (i: number, d: number) => {
    if (shown[i] === d || !digits[i]) return;
    shown[i] = d;
    digits[i].textContent = d < 0 ? "" : DIGITS[d];
  };
  const cs = Math.max(0, Math.floor(secs * 100));
  const c = cs % 100;
  const s = Math.floor(cs / 100) % 60;
  const m = Math.floor(cs / 6000) % 60;
  const h = (((Math.floor(cs / 360000) % 24) + 11) % 12) + 1;
  put(0, h >= 10 ? 1 : -1);
  put(1, h % 10);
  put(2, Math.floor(m / 10));
  put(3, m % 10);
  put(4, Math.floor(s / 10));
  put(5, s % 10);
  put(6, Math.floor(c / 10));
  put(7, c % 10);
}

/** "Now" on the strip: the full-width layer slides, so it's only a transform. */
function moveNow(el: HTMLElement | null, clockT: number) {
  if (el) el.style.transform = `translate3d(${(Math.min(1, clockT / (LEAD + TAIL)) * 100).toFixed(3)}%, 0, 0)`;
}

function Drop({ spec, soundRef, onDone, touch }: Props<Extract<ScreenSpec, { kind: "drop" }>>) {
  const [phase, setPhaseState] = useState<"brief" | "run" | "hold" | "done">("brief");
  const [round, setRound] = useState(0);
  const [posts, setPosts] = useState<Post[]>([]);
  const [live, setLive] = useState(false);
  const phaseRef = useRef(phase);
  const panel = useRef<HTMLDivElement>(null);
  const strip = useRef<HTMLDivElement>(null);
  const now = useRef<HTMLDivElement>(null);
  const clock = useRef<HTMLParagraphElement>(null);
  const reaction = useRef<HTMLElement>(null);
  const digits = useRef<HTMLElement[]>([]);
  const shown = useRef(new Int8Array(8));
  const run = useRef({ t: 0, stamp: 0, hold: 0, tick: -1, close: false, live: false, liveAt: 0, cs: -1 });
  const { pops, pop } = usePops(1100);
  const ready = useSince(phase === "done");
  const total = spec.rounds.length;
  const current = spec.rounds[Math.min(round, total - 1)];
  const time = clockOf(current.time);
  const startAt = time ? time.at - LEAD : -1;
  const speed = SPEED[Math.min(round, SPEED.length - 1)];
  const goLiveAt = SURPRISE[round % SURPRISE.length];
  const go = (next: typeof phase) => {
    phaseRef.current = next;
    setPhaseState(next);
  };

  // each round starts with the strip empty and the clock a few seconds out
  useEffect(() => {
    digits.current = Array.from(clock.current?.querySelectorAll<HTMLElement>("[data-d]") ?? []);
    shown.current.fill(-2);
    if (startAt >= 0) {
      writeClock(digits.current, shown.current, startAt);
      moveNow(now.current, 0);
    }
  }, [round, startAt]);

  const settle = (verdict: Verdict, off: number) => {
    const r = run.current;
    go("hold");
    r.hold = 1.25;
    setPosts((list) => [...list, { verdict, off }]);
    const hit = verdict === "perfect" || verdict === "good";
    if (verdict === "perfect") soundRef.current?.chime();
    else if (verdict === "good") soundRef.current?.coin();
    else soundRef.current?.nope();
    // the word pops over the strip where "now" stopped (the clock says by how much)
    const b = panel.current?.getBoundingClientRect();
    const s = time ? strip.current?.getBoundingClientRect() : undefined;
    const x = b && s ? ((s.left - b.left + s.width * Math.min(1, (r.t * speed) / (LEAD + TAIL))) / b.width) * 100 : 50;
    const y = b && s ? ((s.top - b.top) / b.height) * 100 - 1 : 30;
    pop(verdict === "perfect" ? "PERFECT" : verdict === "good" ? "GOOD" : verdict === "early" ? "EARLY" : "LATE", verdict === "perfect" ? "great" : hit ? "good" : "bad", Math.max(10, Math.min(90, x)), y);
    if (hit) punch(panel.current, verdict === "perfect" ? 0.03 : 0.018);
    else jolt(strip.current ?? panel.current, 0.55);
  };

  useFrame(
    (dt) => {
      const r = run.current;
      r.stamp = performance.now();
      if (phaseRef.current === "hold") {
        r.hold -= dt;
        if (r.hold > 0) return;
        r.hold = Infinity;
        if (round + 1 >= total) return go("done");
        Object.assign(r, { t: 0, tick: -1, close: false, live: false, liveAt: 0, cs: -1 });
        setLive(false);
        setRound(round + 1);
        return go("run");
      }
      if (phaseRef.current !== "run") return;
      r.t += dt;
      if (!time) {
        // the surprise: nothing to count down to, only to watch for
        if (!r.live && r.t >= goLiveAt) {
          r.live = true;
          r.liveAt = r.t;
          setLive(true);
          soundRef.current?.notify();
        }
        if (r.live) {
          const cs = Math.min(199, Math.floor((r.t - r.liveAt) * 100));
          if (cs !== r.cs && reaction.current) reaction.current.textContent = REACTION[cs];
          r.cs = cs;
          if (r.t - r.liveAt > 1.3) settle("late", r.t - r.liveAt);
        }
        return;
      }
      const clockT = r.t * speed;
      moveNow(now.current, clockT);
      writeClock(digits.current, shown.current, time.at - LEAD + clockT);
      // the last three seconds tick, and the line gets ready
      const left = LEAD - clockT;
      const whole = Math.ceil(left);
      if (left > 0 && whole <= 3 && whole !== r.tick) {
        r.tick = whole;
        soundRef.current?.tick();
      }
      const close = left > 0 && left < 1;
      if (close !== r.close) {
        r.close = close;
        strip.current?.toggleAttribute("data-close", close);
        clock.current?.toggleAttribute("data-close", close);
      }
      if ((clockT - LEAD) / speed > GOOD + 0.08) settle("late", (clockT - LEAD) / speed);
    },
    phase === "run" || phase === "hold",
  );

  const press = () => {
    const p = phaseRef.current;
    if (p === "brief") {
      soundRef.current?.confirm();
      return go("run");
    }
    if (p === "done") return ready() && onDone(posts.filter((x) => x.verdict === "perfect" || x.verdict === "good").length);
    if (p !== "run") return;
    const r = run.current;
    // between frames: where the clock is now, less what the eye hasn't seen yet
    const t = r.t + (screensPaused() ? 0 : Math.min(0.05, (performance.now() - r.stamp) / 1000)) - LAG;
    if (!time) {
      if (!r.live) return settle("early", t - goLiveAt);
      const react = Math.max(0, t - r.liveAt);
      return settle(react <= REACT_PERFECT ? "perfect" : react <= REACT_GOOD ? "good" : "late", react);
    }
    const off = (t * speed - LEAD) / speed;
    const a = Math.abs(off);
    settle(a <= PERFECT ? "perfect" : a <= GOOD ? "good" : off < 0 ? "early" : "late", off);
  };
  usePress(press);

  const last = posts.at(-1);
  const hits = posts.filter((x) => x.verdict === "perfect" || x.verdict === "good");
  const perfects = posts.filter((x) => x.verdict === "perfect").length;
  const goods = hits.length - perfects;
  const misses = posts.length - hits.length;
  const points = perfects * 3 + goods * 2;
  const rank = points === total * 3 ? "S" : misses === 0 && points >= total * 3 - 2 ? "A" : hits.length >= Math.ceil((total * 2) / 3) ? "B" : "C";
  const avg = hits.length ? Math.round((hits.reduce((n, x) => n + Math.abs(x.off), 0) / hits.length) * 1000) : 0;
  const tally = [perfects ? `${perfects} perfect` : "", goods ? `${goods} good` : "", misses ? `${misses} missed` : ""].filter(Boolean).join(" · ");
  const zone = (GOOD * speed) / (LEAD + TAIL);
  const sweet = (PERFECT * speed) / (LEAD + TAIL);
  const marks = Math.round((LEAD + TAIL) * 2);

  return (
    <div className={styles.scrim} data-over={phase === "done" || undefined} onPointerDown={() => phase !== "done" && press()} onClick={() => phase === "done" && press()}>
      <div className={styles.drop} ref={panel}>
        <header>
          <span className={styles.live} data-on={(phase === "hold" && (last?.verdict === "perfect" || last?.verdict === "good")) || (!time && live) || undefined}>
            ● LIVE
          </span>
          <b>AGNotify · alert desk</b>
          <small>
            Drop {Math.min(round + 1, total)} of {total}
          </small>
        </header>
        <div className={styles.dropHead}>
          <p className={styles.product}>{current.name}</p>
          <p className={styles.time}>{current.time}</p>
        </div>
        {time ? (
          <>
            <p className={styles.clock} ref={clock} aria-hidden="true">
              <i data-d="" />
              <i data-d="" />
              <span>:</span>
              <i data-d="" />
              <i data-d="" />
              <span>:</span>
              <i data-d="" />
              <i data-d="" />
              <small>
                .<i data-d="" />
                <i data-d="" />
              </small>
              <em>{time.suffix}</em>
            </p>
            <div className={styles.stripWrap}>
              <div className={styles.strip} ref={strip}>
                {Array.from({ length: marks + 1 }, (_, i) => (
                  <i key={i} className={styles.tickMark} style={{ left: `${(i / marks) * 100}%` }} data-whole={i % 2 === 0 || undefined} />
                ))}
                <span className={styles.zoneBand} style={{ left: `${(LIVE_AT - zone) * 100}%`, width: `${zone * 200}%` }} />
                <span className={styles.zoneBand} data-sweet="" style={{ left: `${(LIVE_AT - sweet) * 100}%`, width: `${sweet * 200}%` }} />
                <span className={styles.liveLine} style={{ left: `${LIVE_AT * 100}%` }} />
                <div className={styles.now} ref={now}>
                  <i />
                </div>
              </div>
              <small className={styles.label} style={{ left: `${LIVE_AT * 100}%` }}>
                goes live
              </small>
            </div>
          </>
        ) : (
          <div className={styles.store} data-live={live || undefined}>
            <span className={styles.status}>{live ? "LIVE NOW" : "Coming soon"}</span>
            <b ref={reaction} className={styles.react}>
              {live ? REACTION[0] : "···"}
            </b>
            <small>{live ? "Post it." : "It goes live any second. Not before."}</small>
          </div>
        )}
        <p className={styles.result} data-result={phase === "hold" ? last?.verdict : undefined} aria-live="polite">
          {phase === "hold" && last
            ? last.verdict === "perfect"
              ? "Perfect. First in the world."
              : last.verdict === "good"
                ? "Good. Before the big servers."
                : last.verdict === "late"
                  ? "Late. The link was live without you."
                  : "Too early. The link’s not live."
            : phase === "brief"
              ? "Post each alert the moment the drop goes live. Not before."
              : ""}
        </p>
        {posts.length ? (
          <div className={styles.posted}>
            {posts.map((x, i) => (
              <p key={i} data-result={x.verdict}>
                <i className={styles.bot}>A</i>
                <span>
                  <b>AGNotify</b> @everyone {spec.rounds[i].name}
                </span>
                <em>{x.verdict}</em>
              </p>
            ))}
          </div>
        ) : null}
        <span className={styles.hint}>
          {phase === "brief" ? (touch ? "Tap to start" : <><kbd>E</kbd> start</>) : !time ? (touch ? "Tap the moment it’s live" : <><kbd>E</kbd> post the moment it’s live</>) : touch ? "Tap when it hits the line" : <><kbd>E</kbd> post when it hits the line</>}
        </span>
        <Pops items={pops} />
      </div>
      {phase === "done" ? (
        <Results
          game="drop"
          kicker="Drop report"
          rank={rank}
          score={points * 1000 + Math.max(0, 999 - avg)}
          label={tally || "Nothing posted"}
          reason={(rank === "S" ? "First, every time. To the hundredth." : rank === "A" ? "First on every one. Members noticed." : rank === "B" ? "Mostly first. Mostly is a lot." : "Late is the same as wrong.") + (hits.length ? ` Off by ${avg} ms, on average.` : "")}
          touch={touch}
          soundRef={soundRef}
        />
      ) : null}
    </div>
  );
}

// —— a reel: the hook, the views, the comments, and the hearts going up

const COMMENTS = ["how do i join??", "link in bio 👀", "this server is crazy", "W", "my cousin told me about this", "first time i ever copped", "bro called it to the second", "drop the link"];
const REEL = 5.2;
const fmt = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 100000 ? 0 : 1)}K` : String(Math.round(n)));

function Reel({ spec, soundRef, onDone, touch }: Props<Extract<ScreenSpec, { kind: "reel" }>>) {
  const [shown, setShown] = useState(0);
  const [over, setOver] = useState(false);
  const live = useRef({ t: 0, shown: 0 });
  const bar = useRef<HTMLElement>(null);
  const likes = useRef<HTMLElement>(null);
  const notes = useRef<HTMLElement>(null);
  const shares = useRef<HTMLElement>(null);
  const views = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    soundRef.current?.sparkle();
  }, [soundRef]);
  // the counts run every frame, straight into the page; the comments arrive a few a second
  useFrame(
    (dt) => {
      const s = live.current;
      s.t = Math.min(REEL, s.t + dt);
      const t = s.t / REEL;
      const e = 1 - (1 - t) ** 3;
      if (bar.current) bar.current.style.transform = `scaleX(${t.toFixed(4)})`;
      if (likes.current) likes.current.textContent = fmt(18200 * e);
      if (notes.current) notes.current.textContent = fmt(1240 * e);
      if (shares.current) shares.current.textContent = fmt(3900 * e);
      if (views.current) views.current.textContent = `▶ ${fmt(214000 * e)} views`;
      const step = Math.floor(t * COMMENTS.length);
      if (step !== s.shown) {
        s.shown = step;
        setShown(step);
      }
      if (t >= 1) setOver(true);
    },
    !over,
  );
  const skip = () => {
    if (over) return onDone();
    live.current.t = REEL;
  };
  usePress(skip);
  return (
    <div className={styles.scrim} onClick={skip}>
      <div className={styles.reel}>
        <div className={styles.reelTop}>
          <span className={styles.brand}>Instaglam</span>
          <span className={styles.progress}>
            <i ref={bar} />
          </span>
        </div>
        <div className={styles.footage}>{spec.image ? <img src={spec.image} alt="" /> : null}</div>
        <p className={styles.caption}>{spec.caption}</p>
        {over ? null : (
          <div className={styles.hearts} aria-hidden="true">
            {Array.from({ length: 8 }, (_, i) => (
              <i key={i} style={{ "--i": i } as React.CSSProperties} />
            ))}
          </div>
        )}
        <div className={styles.side}>
          <span>
            <b>♥</b>
            <span ref={likes}>0</span>
          </span>
          <span>
            <b>✎</b>
            <span ref={notes}>0</span>
          </span>
          <span>
            <b>↗</b>
            <span ref={shares}>0</span>
          </span>
        </div>
        <div className={styles.comments}>
          {COMMENTS.slice(0, shown).map((c) => (
            <p key={c}>{c}</p>
          ))}
        </div>
        <p className={styles.views} ref={views}>
          ▶ 0 views
        </p>
        <footer className={styles.reelFoot}>{over ? <Hint touch={touch} /> : <span className={styles.hint}>{touch ? "Tap to skip" : <><kbd>E</kbd> skip</>}</span>}</footer>
      </div>
    </div>
  );
}

// —— the hook: the reel's first second, tested on a hundred strangers. The
// ones who scroll away go; the ones who stop stay lit.

const AUDIENCE = 100;
// how many stop for each hook, the right one and the rest
const KEPT_RIGHT = 72;
const KEPT_WRONG = [8, 3, 5];

function Hook({ spec, soundRef, onDone, touch }: Props<Extract<ScreenSpec, { kind: "hook" }>>) {
  const [phase, setPhaseState] = useState<"pick" | "test" | "reply" | "done">("pick");
  const [selected, setSelected] = useState(0);
  const [tried, setTried] = useState<number[]>([]);
  const [kept, setKept] = useState(0);
  const phaseRef = useRef(phase);
  const live = useRef({ t: 0, counted: 0 });
  const count = useRef<HTMLElement>(null);
  const ready = useSince(phase === "done");
  const current = tried.at(-1) ?? -1;
  const go = (next: typeof phase) => {
    phaseRef.current = next;
    setPhaseState(next);
  };
  const keptOf = (i: number) => (i === spec.right ? KEPT_RIGHT : KEPT_WRONG[(i + (i > spec.right ? 2 : 0)) % KEPT_WRONG.length]);

  // the test: the strangers who don't care leave in a rush; the count follows
  useFrame(
    (dt) => {
      if (phaseRef.current !== "test") return;
      const s = live.current;
      s.t += dt;
      const target = AUDIENCE - Math.round(Math.min(1, s.t / 1.1) * (AUDIENCE - keptOf(current)));
      if (target !== s.counted && count.current) {
        s.counted = target;
        count.current.textContent = String(target);
      }
      if (s.t >= 1.5) {
        go(current === spec.right ? "done" : "reply");
        if (current === spec.right) soundRef.current?.chime();
        else soundRef.current?.nope();
      }
    },
    phase === "test",
  );

  const test = (i: number) => {
    if (tried.includes(i)) return;
    setSelected(i);
    setTried((list) => [...list, i]);
    setKept(keptOf(i));
    live.current = { t: 0, counted: AUDIENCE };
    if (count.current) count.current.textContent = String(AUDIENCE);
    soundRef.current?.confirm();
    soundRef.current?.whoosh(0.5, false, 0.1);
    go("test");
  };
  const press = () => {
    const p = phaseRef.current;
    // the hooks in the order they were tried, so the story can bring the bad ones up later
    if (p === "done") return ready() && onDone(tried);
    if (p === "reply") {
      // back to the list, on the first one not yet tried
      const next = spec.hooks.findIndex((_, i) => !tried.includes(i));
      setSelected(Math.max(0, next));
      return go("pick");
    }
    if (p === "pick") test(selected);
  };
  usePress(press);
  useArrows((step) => {
    if (phaseRef.current !== "pick") return;
    const n = spec.hooks.length;
    let i = selected;
    for (let k = 0; k < n; k += 1) {
      i = (i + step + n) % n;
      if (!tried.includes(i)) break;
    }
    setSelected(i);
    soundRef.current?.select();
  });

  const shown = phase === "pick" ? selected : current;
  const rank: Rank = tried.length <= 1 ? "S" : tried.length === 2 ? "A" : "B";
  return (
    <div className={styles.scrim} data-over={phase === "done" || undefined} onClick={() => phase !== "pick" && press()}>
      <div className={styles.phone} data-hook="">
        <div className={styles.phoneTop}>
          <span className={styles.notch} />
        </div>
        <header className={styles.thread}>
          {face("editor") ? <img src={face("editor")} alt="" /> : <i />}
          <div>
            <b>Edit reel</b>
            <small>Raymond · the first second decides everything</small>
          </div>
        </header>
        <div className={styles.preview}>
          <p className={styles.previewCaption} key={shown}>
            {spec.hooks[Math.max(0, shown)].text}
          </p>
          <div className={styles.audience} data-test={phase !== "pick" || undefined} aria-hidden="true">
            {Array.from({ length: AUDIENCE }, (_, i) => (
              <i key={i} data-gone={(phase !== "pick" && (i * 37) % AUDIENCE >= kept) || undefined} style={{ "--d": `${(i * 53) % 100}` } as React.CSSProperties} />
            ))}
          </div>
          <p className={styles.kept}>
            {phase === "pick" ? (
              "100 strangers, scrolling"
            ) : (
              <>
                <b ref={count}>{phase === "test" ? AUDIENCE : kept}</b> of 100 stopped scrolling
              </>
            )}
          </p>
        </div>
        {phase === "reply" || phase === "done" ? (
          <p className={styles.bubble} data-raymond="">
            <b>Raymond</b>
            {spec.hooks[current].reply}
          </p>
        ) : (
          <div className={styles.hooks} role="listbox">
            {spec.hooks.map((h, i) => (
              <button
                key={h.text}
                type="button"
                role="option"
                aria-selected={selected === i}
                data-on={(phase === "pick" && selected === i) || undefined}
                data-tried={tried.includes(i) || undefined}
                disabled={tried.includes(i)}
                onPointerEnter={() => phase === "pick" && !tried.includes(i) && setSelected(i)}
                onClick={(event) => {
                  event.stopPropagation();
                  if (phase === "pick") test(i);
                }}
              >
                {h.text}
              </button>
            ))}
          </div>
        )}
        <footer className={styles.phoneFoot}>
          <span className={styles.hint}>
            {phase === "reply" ? (touch ? "Tap to try another" : <><kbd>E</kbd> try another</>) : phase === "pick" ? (touch ? "Tap a hook to test it" : <>arrows to choose · <kbd>E</kbd> test it</>) : null}
          </span>
        </footer>
      </div>
      {phase === "done" ? (
        <Results game="hook" kicker="The hook" rank={rank} score={10 - tried.length} label={tried.length === 1 ? "First try" : `${tried.length} tries`} reason={rank === "S" ? "Stopped the scroll on the first go." : rank === "A" ? "Second time lucky. Raymond noticed." : "Got there. Raymond has notes."} touch={touch} soundRef={soundRef} />
      ) : null}
    </div>
  );
}

// —— growth: referrals and word of mouth, on a chart that only goes up

const MILESTONES: Array<[number, string]> = [
  [0.12, "Referral program live"],
  [0.3, "500 members"],
  [0.45, "$10K revenue"],
  [0.6, "Friends of friends of friends"],
  [0.75, "$25K revenue"],
  [0.93, "$45K revenue"],
];

const GROWTH = 7;
// a curve that starts slow and then catches: word of mouth
const curve = (x: number) => x ** 2.2 * 0.85 + x * 0.15;
const yOf = (x: number) => 200 - curve(x) * 180;
// drawn once; the chart is revealed, not redrawn, as it grows
const CHART = (() => {
  const line = Array.from({ length: 61 }, (_, i) => {
    const x = i / 60;
    const wobble = Math.sin(i * 1.7) * 0.012 * (1 - x);
    return `${i ? "L" : "M"}${(x * 560).toFixed(1)},${(200 - Math.max(0, curve(x) + wobble) * 180).toFixed(1)}`;
  }).join(" ");
  return { line, area: `${line} L560,200 L0,200 Z` };
})();
const CONFETTI = ["#2f6be8", "#f08a32", "#f2c46b", "#8fd3b6", "#1b1d22"];

function Growth({ spec, soundRef, onDone, touch }: Props<Extract<ScreenSpec, { kind: "growth" }>>) {
  const [hit, setHit] = useState(0);
  const [over, setOver] = useState(false);
  const live = useRef({ t: 0, hit: 0 });
  const reveal = useRef<SVGRectElement>(null);
  const value = useRef<HTMLElement>(null);
  const fill = useRef<HTMLElement>(null);
  useFrame(
    (dt) => {
      const s = live.current;
      s.t = Math.min(GROWTH, s.t + dt);
      const k = s.t / GROWTH;
      const v = Math.min(spec.to, Math.round(spec.from + (spec.to - spec.from) * Math.min(1, curve(k) / curve(0.93))));
      reveal.current?.setAttribute("width", (k * 560).toFixed(1));
      if (value.current) value.current.textContent = `$${v.toLocaleString("en-US")}`;
      if (fill.current) fill.current.style.transform = `scaleX(${Math.min(1, v / spec.to).toFixed(4)})`;
      let n = s.hit;
      while (n < MILESTONES.length && MILESTONES[n][0] <= k) n += 1;
      if (n > s.hit) {
        s.hit = n;
        setHit(n);
        if (n === MILESTONES.length) soundRef.current?.sting();
        else soundRef.current?.coin();
      }
      if (k >= 1) setOver(true);
    },
    !over,
  );
  const skip = () => {
    if (over) return onDone();
    live.current.t = GROWTH;
  };
  usePress(skip);
  const goal = yOf(0.93);
  return (
    <div className={styles.scrim} onClick={skip}>
      <Window title="AGNotify · dashboard" wide>
        <div className={styles.growth}>
          <div className={styles.big}>
            <small>Revenue</small>
            <strong ref={value}>${spec.from.toLocaleString("en-US")}</strong>
            <span>
              of ${spec.to.toLocaleString("en-US")} goal
              <i ref={fill} />
            </span>
          </div>
          <svg viewBox="0 0 560 210" className={styles.chart} aria-hidden="true">
            <defs>
              <clipPath id="growth-so-far">
                <rect ref={reveal} x="0" y="0" width="0" height="210" />
              </clipPath>
            </defs>
            {[0, 1, 2, 3].map((i) => (
              <line key={i} x1="0" x2="560" y1={20 + i * 60} y2={20 + i * 60} />
            ))}
            <line className={styles.goalLine} x1="0" x2="560" y1={goal} y2={goal} />
            <text className={styles.goalText} x="4" y={goal - 7}>
              ${Math.round(spec.to / 1000)}K goal
            </text>
            <g clipPath="url(#growth-so-far)">
              <path d={CHART.area} className={styles.area} />
              <path d={CHART.line} className={styles.line} />
              {MILESTONES.map(([x]) => (
                <rect key={x} className={styles.flag} x={x * 560 - 4} y={yOf(x) - 4} width="8" height="8" />
              ))}
            </g>
          </svg>
          <div className={styles.milestones}>
            {MILESTONES.slice(0, hit).map(([, text]) => (
              <span key={text}>{text}</span>
            ))}
          </div>
          {over ? (
            <div className={styles.confetti} aria-hidden="true">
              {Array.from({ length: 18 }, (_, i) => (
                <i key={i} style={{ "--i": i, background: CONFETTI[i % CONFETTI.length] } as React.CSSProperties} />
              ))}
            </div>
          ) : null}
        </div>
        <footer className={styles.copyFoot}>{over ? <Hint touch={touch} /> : <span className={styles.hint}>word of mouth, compounding · {touch ? "tap to skip" : <><kbd>E</kbd> skip</>}</span>}</footer>
      </Window>
    </div>
  );
}

// —— a character's entrance, the way the shows do it

function Intro({ spec, soundRef, onDone, touch }: Props<Extract<ScreenSpec, { kind: "intro" }>>) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    soundRef.current?.whoosh(0.5, true, 0.18);
    const hit = window.setTimeout(() => soundRef.current?.sting(), 280);
    const id = window.setTimeout(() => setReady(true), 1400);
    return () => {
      window.clearTimeout(hit);
      window.clearTimeout(id);
    };
  }, [soundRef]);
  usePress(() => ready && onDone());
  const src = face(spec.who);
  return (
    <div className={styles.intro} style={{ "--band": spec.colour } as React.CSSProperties} onClick={() => ready && onDone()}>
      <div className={styles.lines} />
      <div className={styles.band} />
      {src ? <img className={styles.introFace} src={src} alt="" /> : null}
      <div className={styles.introText}>
        <strong>{spec.name}</strong>
        <span>{spec.line}</span>
      </div>
      {ready ? <footer className={styles.introFoot}><Hint touch={touch} label="continue" /></footer> : null}
    </div>
  );
}

// —— an impact frame: a flash, speed lines, a few big words

function Impact({ spec, soundRef, onDone }: Props<Extract<ScreenSpec, { kind: "impact" }>>) {
  const done = useRef(onDone);
  useEffect(() => {
    done.current = onDone;
  });
  useEffect(() => {
    soundRef.current?.launch();
    soundRef.current?.sparkle();
    const id = window.setTimeout(() => done.current(), 1900);
    return () => window.clearTimeout(id);
  }, [soundRef]);
  return (
    <div className={styles.impact}>
      <div className={styles.flash} />
      <div className={styles.speed} />
      <strong>{spec.text}</strong>
      {spec.sub ? <span>{spec.sub}</span> : null}
    </div>
  );
}
