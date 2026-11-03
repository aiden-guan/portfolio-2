"use client";

/* eslint-disable @next/next/no-img-element */
import { useCallback, useEffect, useRef, useState } from "react";
import { face } from "./faces";
import { Hint, usePress, Window, type Props } from "./screen-kit";
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
      soundRef.current?.blip(n % 3);
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
          <div className={styles.server}>
            <aside>
              <b>{spec.name}</b>
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
            <label>
              Server name
              <span className={styles.field}>
                {spec.name.slice(0, typed)}
                <i className={styles.caret} />
              </span>
            </label>
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

// —— copy, paste: the big server's alerts, carried over one by one

const ALERTS = [
  "Court Low “Panda” · restock Thu 7:00 AM",
  "Retro IV “Cement” · online only, Sat 10 AM",
  "Skyline 1 “Sunrise” · raffle closes tonight",
  "Runner 2K “Grey Day” · early link in 5 min",
  "Foam Slide “Onyx” · surprise drop, now",
  "Court Hi “Varsity” · Fri 7:00 AM",
  "Trail 3 “Moss” · 30% code, 1 hour",
  "Retro I “Royal” · Sat 7:00 AM",
];

function Copy({ soundRef, onDone, touch }: Props<Extract<ScreenSpec, { kind: "copy" }>>) {
  const [arrived, setArrived] = useState(0);
  const [copied, setCopied] = useState<number[]>([]);
  const [pops, setPops] = useState<Array<{ id: number; n: number }>>([]);
  const [over, setOver] = useState(false);
  const copiedRef = useRef<number[]>([]);
  const theirs = useRef<HTMLDivElement>(null);
  const ours = useRef<HTMLDivElement>(null);
  const members = 4 + copied.length * 3;

  // both feeds follow their newest message
  useEffect(() => {
    theirs.current?.scrollTo({ top: theirs.current.scrollHeight, behavior: "smooth" });
  }, [arrived]);
  useEffect(() => {
    ours.current?.scrollTo({ top: ours.current.scrollHeight, behavior: "smooth" });
  }, [copied]);

  useEffect(() => {
    if (arrived >= ALERTS.length) {
      const id = window.setTimeout(() => setOver(true), 1600);
      return () => window.clearTimeout(id);
    }
    const id = window.setTimeout(() => {
      setArrived((n) => n + 1);
      soundRef.current?.blip(-6);
    }, arrived === 0 ? 700 : 1150);
    return () => window.clearTimeout(id);
  }, [arrived, soundRef]);

  const copy = useCallback(
    (i: number) => {
      if (copiedRef.current.includes(i) || i >= arrived || over) return;
      copiedRef.current = [...copiedRef.current, i];
      setCopied(copiedRef.current);
      setPops((p) => [...p, { id: Date.now() + i, n: 3 }]);
      soundRef.current?.coin();
    },
    [arrived, over, soundRef],
  );

  usePress(() => {
    if (over) {
      onDone(copiedRef.current.length);
      return;
    }
    // the newest one not yet copied
    for (let i = arrived - 1; i >= 0; i -= 1)
      if (!copiedRef.current.includes(i)) {
        copy(i);
        return;
      }
  });

  return (
    <div className={styles.scrim} onClick={() => over && onDone(copiedRef.current.length)}>
      <Window title="Chatter · two servers" wide>
        <div className={styles.copy}>
          <section className={styles.theirs}>
            <header>
              <b>HYPEHAUS</b>
              <small>98,214 members · # alerts</small>
              <small className={styles.rule}>rule #1: never repost our alerts</small>
            </header>
            <div className={styles.feed} ref={theirs}>
              {ALERTS.slice(0, arrived).map((text, i) => (
                <button
                  type="button"
                  key={text}
                  className={styles.alert}
                  data-copied={copied.includes(i) || undefined}
                  data-newest={(!copied.includes(i) && i === arrived - 1) || undefined}
                  onClick={() => copy(i)}
                >
                  <i>🔔</i>
                  <span>{text}</span>
                  <em>{copied.includes(i) ? "Copied" : "Copy →"}</em>
                </button>
              ))}
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
            </header>
            <div className={styles.feed} ref={ours}>
              {copied.length === 0 ? <p className={styles.empty}>Nothing yet. Copy something.</p> : null}
              {copied.map((i) => (
                <p key={i} className={styles.pasted}>
                  <i>🔔</i>
                  {ALERTS[i]}
                </p>
              ))}
            </div>
            {pops.map((p) => (
              <em key={p.id} className={styles.pop}>
                +{p.n} members
              </em>
            ))}
          </section>
        </div>
        <footer className={styles.copyFoot}>
          {over ? (
            <Hint touch={touch} label="close" />
          ) : (
            <span className={styles.hint}>{touch ? "Tap an alert to copy it" : <><kbd>E</kbd> copy the newest · or click one</>}</span>
          )}
        </footer>
      </Window>
    </div>
  );
}

// —— the drop: post the alert the second it goes live

function Drop({ spec, soundRef, onDone, touch }: Props<Extract<ScreenSpec, { kind: "drop" }>>) {
  const [round, setRound] = useState(0);
  const [result, setResult] = useState<null | "perfect" | "good" | "late" | "early">(null);
  const [score, setScore] = useState<string[]>([]);
  const marker = useRef<HTMLDivElement>(null);
  const start = useRef(0);
  const pos = useRef(0);
  const speed = 0.42 + round * 0.14;
  const finished = round >= spec.rounds.length;

  useEffect(() => {
    if (finished || result) return;
    start.current = performance.now();
    let raf = 0;
    const frame = () => {
      const t = (performance.now() - start.current) / 1000;
      // there and back: a pass is a chance
      const p = Math.abs(((t * speed + 0.0) % 2) - 1);
      pos.current = 1 - p;
      if (marker.current) marker.current.style.left = `${(pos.current * 100).toFixed(2)}%`;
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [round, result, finished, speed]);

  const press = () => {
    if (finished) {
      onDone(score.filter((s) => s !== "late" && s !== "early").length);
      return;
    }
    if (result) return;
    const d = Math.abs(pos.current - 0.5);
    const r = d < 0.05 ? "perfect" : d < 0.12 ? "good" : pos.current < 0.5 ? "early" : "late";
    setResult(r);
    setScore((s) => [...s, r]);
    if (r === "perfect") soundRef.current?.chime();
    else if (r === "good") soundRef.current?.coin();
    else soundRef.current?.select();
    window.setTimeout(() => {
      setResult(null);
      setRound((n) => n + 1);
    }, 1300);
  };
  usePress(press);

  const now = spec.rounds[Math.min(round, spec.rounds.length - 1)];
  return (
    <div className={styles.scrim} onPointerDown={() => !finished && press()} onClick={() => finished && press()}>
      <div className={styles.drop}>
        <header>
          <span className={styles.live} data-on={result === "perfect" || result === "good" || undefined}>
            ● LIVE
          </span>
          <b>AGNotify · alert</b>
          <small>
            Drop {Math.min(round + 1, spec.rounds.length)} of {spec.rounds.length}
          </small>
        </header>
        {finished ? (
          <div className={styles.dropDone}>
            <strong>{score.filter((s) => s === "perfect").length ? "First, every time." : "Close enough. Members noticed."}</strong>
            <div className={styles.tally}>
              {score.map((s, i) => (
                <span key={i} data-result={s}>
                  {s}
                </span>
              ))}
            </div>
            <Hint touch={touch} label="continue" />
          </div>
        ) : (
          <>
            <p className={styles.product}>{now.name}</p>
            <p className={styles.time}>{now.time}</p>
            <div className={styles.meter}>
              <span className={styles.zone} />
              <span className={styles.perfect} />
              <div className={styles.marker} ref={marker} />
              <small className={styles.label}>goes live</small>
            </div>
            <p className={styles.result} data-result={result ?? undefined}>
              {result === "perfect" ? "Perfect. First in the world." : result === "good" ? "Good. Before the big servers." : result === "late" ? "Late. They got it first." : result === "early" ? "Too early. The link's not live." : ""}
            </p>
            <span className={styles.hint}>{touch ? "Tap when it hits the line" : <><kbd>E</kbd> post when it hits the line</>}</span>
          </>
        )}
      </div>
    </div>
  );
}

// —— a reel: the hook, the views, the comments

const COMMENTS = ["how do i join??", "link in bio 👀", "this server is crazy", "W", "my cousin told me about this", "first time i ever copped", "bro called it to the second", "drop the link"];

function Reel({ spec, soundRef, onDone, touch }: Props<Extract<ScreenSpec, { kind: "reel" }>>) {
  const [t, setT] = useState(0);
  const start = useRef(0);
  useEffect(() => {
    start.current = performance.now();
    let raf = 0;
    const frame = () => {
      const k = Math.min(1, (performance.now() - start.current) / 5200);
      setT(k);
      if (k < 1) raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    soundRef.current?.sparkle();
    return () => cancelAnimationFrame(raf);
  }, [soundRef]);
  const e = 1 - (1 - t) ** 3;
  const fmt = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 100000 ? 0 : 1)}K` : String(Math.round(n)));
  const skip = () => (t >= 1 ? onDone() : (start.current = performance.now() - 5200));
  usePress(skip);
  const comments = COMMENTS.slice(0, Math.floor(t * COMMENTS.length));
  return (
    <div className={styles.scrim} onClick={skip}>
      <div className={styles.reel}>
        <div className={styles.reelTop}>
          <span className={styles.brand}>Instaglam</span>
          <span className={styles.progress}>
            <i style={{ width: `${(t * 100).toFixed(1)}%` }} />
          </span>
        </div>
        <div className={styles.footage}>{spec.image ? <img src={spec.image} alt="" /> : null}</div>
        <p className={styles.caption}>{spec.caption}</p>
        <div className={styles.side}>
          <span>
            <b>♥</b>
            {fmt(18200 * e)}
          </span>
          <span>
            <b>✎</b>
            {fmt(1240 * e)}
          </span>
          <span>
            <b>↗</b>
            {fmt(3900 * e)}
          </span>
        </div>
        <div className={styles.comments}>
          {comments.map((c) => (
            <p key={c}>{c}</p>
          ))}
        </div>
        <p className={styles.views}>▶ {fmt(214000 * e)} views</p>
        <footer className={styles.reelFoot}>{t >= 1 ? <Hint touch={touch} /> : <span className={styles.hint}>{touch ? "Tap to skip" : <><kbd>E</kbd> skip</>}</span>}</footer>
      </div>
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

function Growth({ spec, soundRef, onDone, touch }: Props<Extract<ScreenSpec, { kind: "growth" }>>) {
  const [t, setT] = useState(0);
  const last = useRef(0);
  const start = useRef(0);
  useEffect(() => {
    start.current = performance.now();
    let raf = 0;
    const frame = () => {
      const k = Math.min(1, (performance.now() - start.current) / 7000);
      setT(k);
      const hit = MILESTONES.filter(([at]) => at <= k).length;
      if (hit > last.current) {
        last.current = hit;
        if (hit === MILESTONES.length) soundRef.current?.sting();
        else soundRef.current?.coin();
      }
      if (k < 1) raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [soundRef]);
  const skip = () => (t >= 1 ? onDone() : (start.current = performance.now() - 7000));
  usePress(skip);
  // a curve that starts slow and then catches: word of mouth
  const curve = (x: number) => x ** 2.2 * 0.85 + x * 0.15;
  const points = Array.from({ length: 61 }, (_, i) => {
    const x = i / 60;
    const wobble = Math.sin(i * 1.7) * 0.012 * (1 - x);
    return [x, Math.max(0, curve(x) + wobble)] as const;
  }).filter(([x]) => x <= t);
  const path = points.map(([x, y], i) => `${i ? "L" : "M"}${(x * 560).toFixed(1)},${(200 - y * 180).toFixed(1)}`).join(" ");
  const value = Math.round(spec.from + (spec.to - spec.from) * Math.min(1, curve(t) / curve(0.93)));
  const shown = MILESTONES.filter(([at]) => at <= t);
  return (
    <div className={styles.scrim} onClick={skip}>
      <Window title="AGNotify · dashboard" wide>
        <div className={styles.growth}>
          <div className={styles.big}>
            <small>Revenue</small>
            <strong>${Math.min(spec.to, value).toLocaleString("en-US")}</strong>
            <span>
              of ${spec.to.toLocaleString("en-US")} goal
              <i style={{ width: `${Math.min(100, (value / spec.to) * 100).toFixed(1)}%` }} />
            </span>
          </div>
          <svg viewBox="0 0 560 210" className={styles.chart} aria-hidden="true">
            {[0, 1, 2, 3].map((i) => (
              <line key={i} x1="0" x2="560" y1={20 + i * 60} y2={20 + i * 60} />
            ))}
            <path d={`${path} L${(points.at(-1)?.[0] ?? 0) * 560},200 L0,200 Z`} className={styles.area} />
            <path d={path} className={styles.line} />
          </svg>
          <div className={styles.milestones}>
            {shown.map(([, text]) => (
              <span key={text}>{text}</span>
            ))}
          </div>
          {t >= 1 ? <div className={styles.confetti} aria-hidden="true">{Array.from({ length: 28 }, (_, i) => <i key={i} style={{ "--i": i } as React.CSSProperties} />)}</div> : null}
        </div>
        <footer className={styles.copyFoot}>{t >= 1 ? <Hint touch={touch} /> : <span className={styles.hint}>word of mouth, compounding · {touch ? "tap to skip" : <><kbd>E</kbd> skip</>}</span>}</footer>
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
