"use client";

/* eslint-disable @next/next/no-img-element */
import { useEffect, useMemo, useRef, useState } from "react";
import { face } from "./faces";
import { Brief, Hint, jolt, Pops, punch, rankOf, reducedMotion, Results, screensPaused, seeded, useArrows, useFrame, useHold, usePops, usePress, useSince, Window, type Props, type Rank } from "./screen-kit";
import kit from "./screens.module.css";
import styles from "./screens-berkeley.module.css";

// The screens of Berkeley and after: problem sets and a midterm (sick or
// not), the three hackathons' own games (BarkOff's bark battle, alai's
// wrong step, Continuity's thread), and alai becoming a company: a video
// call, an email, two applications, and a bug bash.

export type Question = { q: string; options: string[]; answer: number };

export type BerkeleySpec =
  | { kind: "study"; title: string; subject: string; questions: Question[]; sick?: boolean; exam?: number }
  | { kind: "bark"; rounds: number }
  | { kind: "wrongstep"; problems: Array<{ prompt: string; steps: string[]; wrong: number; nudge: string }> }
  | { kind: "thread"; subject: string; emails: Array<{ from: string; time: string; text: string }>; questions: Question[]; pins: string[] }
  | { kind: "email"; app?: string; from: string; subject: string; lines: string[]; tone?: "good" | "bad" }
  | {
      kind: "call";
      title: string;
      host: { name: string; face: string };
      guests: Array<{ name: string; face: string }>;
      questions: Array<{ q: string; options: Array<{ label: string; who: string }>; replies: string[] }>;
      outro: string;
    }
  | { kind: "form"; title: string; fields: Array<{ label: string; answer: string }>; submit: string; done: string; accent?: string }
  | { kind: "bugs"; bugs: string[]; seconds: number };

export function BerkeleyScreen(props: Props<BerkeleySpec> & { photo?: string }) {
  const { spec } = props;
  switch (spec.kind) {
    case "study":
      return <Study {...props} spec={spec} />;
    case "bark":
      return <Bark {...props} spec={spec} />;
    case "wrongstep":
      return <WrongStep {...props} spec={spec} />;
    case "thread":
      return <Thread {...props} spec={spec} />;
    case "email":
      return <Email {...props} spec={spec} />;
    case "call":
      return <Call {...props} spec={spec} />;
    case "form":
      return <Form {...props} spec={spec} />;
    case "bugs":
      return <Bugs {...props} spec={spec} />;
  }
}

const MARKS = { tick: "M4 13l5 5L20 6", cross: "M6 6l12 12M18 6L6 18" };

/** A red-pen mark, drawn on. */
function Mark({ kind }: { kind: keyof typeof MARKS }) {
  return (
    <svg className={styles.mark} data-kind={kind} viewBox="0 0 24 24" aria-hidden="true">
      <path d={MARKS[kind]} pathLength={1} />
    </svg>
  );
}

/** Answers to pick from: arrows and E, or a click, or a tap. Graded, the
 * right one gets a tick and a wrong pick a cross, in red pen. */
function Choices({
  options,
  selected,
  reveal,
  onPick,
  onHover,
  graded,
}: {
  options: Array<{ label: string; face?: string; who?: string }>;
  selected: number;
  reveal?: { right: number; picked: number } | null;
  onPick: (i: number) => void;
  onHover: (i: number) => void;
  graded?: boolean;
}) {
  return (
    <div className={styles.choices} role="listbox">
      {options.map((o, i) => (
        <button
          key={o.label}
          type="button"
          role="option"
          aria-selected={selected === i}
          className={styles.choice}
          data-on={(!reveal && selected === i) || undefined}
          data-right={(reveal && reveal.right === i) || undefined}
          data-wrong={(reveal && reveal.picked === i && reveal.right !== i) || undefined}
          onPointerEnter={() => onHover(i)}
          onClick={(event) => {
            event.stopPropagation();
            onPick(i);
          }}
        >
          <i>{o.face ? <img src={o.face} alt="" /> : String.fromCharCode(65 + i)}</i>
          <span>
            {o.who ? <b>{o.who}</b> : null}
            {o.label}
          </span>
          {graded && reveal && reveal.right === i ? <Mark kind="tick" /> : null}
          {graded && reveal && reveal.picked === i && reveal.right !== i ? <Mark kind="cross" /> : null}
        </button>
      ))}
    </div>
  );
}

// —— a problem set, or a midterm: questions, answers, a red pen, and (when
// sick) a room that won't hold still and a cough that knocks the pencil

const REASONS: Record<"set" | "sick" | "exam", Record<Rank, string>> = {
  set: { S: "Every one.", A: "Close enough to sleep on.", B: "Some of it made sense.", C: "Tomorrow, again." },
  sick: { S: "Every one. With a fever.", A: "Close enough, for a fever.", B: "The fever got a few.", C: "The fever won this one." },
  exam: { S: "A clean sheet.", A: "One slip. The rest held.", B: "Half of it, at least.", C: "It’s in there somewhere." },
};

function Study({ spec, soundRef, onDone, touch }: Props<Extract<BerkeleySpec, { kind: "study" }>>) {
  const [at, setAt] = useState(0);
  const [selected, setSelected] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [marks, setMarks] = useState<boolean[]>([]);
  const [left, setLeft] = useState(spec.exam ?? 0);
  const [cough, setCough] = useState(0);
  const shaken = useRef<HTMLDivElement>(null);
  const lockUntil = useRef(0);
  const live = useRef({ options: 4, revealing: false });
  const total = spec.questions.length;
  const score = marks.filter(Boolean).length;
  const timeUp = Boolean(spec.exam) && left === 0;
  const finished = at >= total || timeUp;
  const ready = useSince(finished);
  const q = spec.questions[Math.min(at, total - 1)];
  let streak = 0;
  for (let i = marks.length - 1; i >= 0 && marks[i]; i -= 1) streak += 1;
  useEffect(() => {
    live.current = { options: q.options.length, revealing: picked !== null };
  });

  // the clock, in an exam; the last five seconds tick
  useEffect(() => {
    if (!spec.exam || finished) return;
    const id = window.setInterval(() => !screensPaused() && setLeft((s) => Math.max(0, s - 1)), 1000);
    return () => window.clearInterval(id);
  }, [spec.exam, finished]);
  useEffect(() => {
    if (spec.exam && !finished && left > 0 && left <= 5) soundRef.current?.tick();
  }, [left, spec.exam, finished, soundRef]);
  useEffect(() => {
    if (timeUp) soundRef.current?.alarm();
  }, [timeUp, soundRef]);

  // coughing, now and then: the room jolts, and the pencil slips to the next answer
  useEffect(() => {
    if (!spec.sick || finished) return;
    let id = 0;
    const next = () => {
      id = window.setTimeout(() => {
        if (!screensPaused()) {
          setCough((n) => n + 1);
          soundRef.current?.cough();
          lockUntil.current = performance.now() + 380;
          const { options, revealing } = live.current;
          if (!revealing) setSelected((s) => (s + (Math.random() < 0.5 ? 1 : options - 1)) % options);
          if (!reducedMotion())
            shaken.current?.animate(
              [{ translate: "0 0", rotate: "0deg" }, { translate: "-6px 3px", rotate: "-0.8deg" }, { translate: "5px -2px", rotate: "0.5deg" }, { translate: "0 0", rotate: "0deg" }],
              { duration: 340, easing: "ease-out" },
            );
        }
        next();
      }, 3800 + Math.random() * 3200);
    };
    next();
    return () => window.clearTimeout(id);
  }, [spec.sick, finished, soundRef]);

  const pick = (i: number) => {
    if (finished || picked !== null || performance.now() < lockUntil.current) return;
    setSelected(i);
    setPicked(i);
    const right = i === q.answer;
    setMarks((m) => [...m, right]);
    if (right) soundRef.current?.coin();
    else soundRef.current?.nope();
    window.setTimeout(
      () => {
        setPicked(null);
        setSelected(0);
        setAt((n) => n + 1);
      },
      right ? 800 : 1400,
    );
  };
  const finish = () => ready() && onDone(score);
  usePress(() => (finished ? finish() : picked === null ? pick(selected) : undefined));
  useArrows((step) => {
    if (finished || picked !== null) return;
    setSelected((s) => (s + step + q.options.length) % q.options.length);
    soundRef.current?.select();
  });

  const kind = spec.exam ? "exam" : spec.sick ? "sick" : "set";
  const rank = rankOf(score / total);
  const clock = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`;
  const body = (
    <>
      <div className={styles.qHead}>
        <span>{spec.subject}</span>
        <span>
          {Math.min(at + 1, total)} of {total}
        </span>
        {streak >= 2 ? (
          <em className={styles.streak} key={streak}>
            {streak} in a row
          </em>
        ) : null}
        {spec.exam ? <b data-low={left < 10 || undefined}>{clock}</b> : null}
      </div>
      <p className={styles.question} key={at}>
        {q.q}
      </p>
      <Choices
        graded
        options={q.options.map((label) => ({ label }))}
        selected={selected}
        reveal={picked === null ? null : { right: q.answer, picked }}
        onPick={pick}
        onHover={(i) => picked === null && setSelected(i)}
      />
      <div className={styles.dots}>
        {spec.questions.map((_, i) => (
          <i key={i} data-right={marks[i] === true || undefined} data-wrong={marks[i] === false || undefined} data-now={(i === at && !finished) || undefined} />
        ))}
      </div>
      <span className={kit.hint}>{touch ? "Tap an answer" : <>arrows to choose · <kbd>E</kbd> answer</>}</span>
    </>
  );

  return (
    <div className={kit.scrim} data-sick={spec.sick || undefined} data-over={finished || undefined} onClick={() => finished && finish()}>
      {spec.sick ? <div className={styles.fever} aria-hidden="true" /> : null}
      <div className={styles.sway} data-sick={spec.sick || undefined}>
        <div className={styles.jolt} ref={shaken}>
          {spec.exam ? (
            <div className={styles.paper}>
              <header>
                <strong>{spec.title}</strong>
                <span>Name: Aiden Guan</span>
              </header>
              {body}
            </div>
          ) : (
            <Window title={spec.title} wide>
              <div className={styles.study}>{body}</div>
            </Window>
          )}
          {cough > 0 && !finished ? (
            <span className={styles.coughWord} key={`c${cough}`} aria-hidden="true">
              *cough*
            </span>
          ) : null}
        </div>
      </div>
      {finished ? (
        <Results
          game={`study:${spec.title}`}
          kicker={spec.exam ? (timeUp ? "Time’s up" : "Pencils down") : spec.sick ? "Enough for tonight" : "Done for tonight"}
          rank={rank}
          score={score * 1000 + (spec.exam ? left : 0)}
          label={`${score} / ${total}`}
          reason={REASONS[kind][rank]}
          touch={touch}
          soundRef={soundRef}
        />
      ) : null}
    </div>
  );
}

// —— BarkOff: two webcams, one question. They bark; you take a breath and
// let it go. Hold it, let go in the gold. Hold it too long and the voice
// cracks.

type BarkWord = "AWOOOO" | "WOOF" | "yip.";
const BARK_ROUNDS = [
  { word: "WOOF!", barks: 1, level: 0.72, fill: 0.9, great: 0.82 },
  { word: "WOOF WOOF!", barks: 2, level: 0.8, fill: 1.1, great: 0.85 },
  { word: "AWOOOO!", barks: 3, level: 0.9, fill: 1.32, great: 0.88 },
];
const GOOD_AT = 0.6;
const TOP = 0.975;
const SLACK = 0.015;
// a breath fills fast, then slow at the top
const breathOf = (k: number) => (k <= 1 ? 1 - (1 - k) ** 1.6 : 1);
const DB = Array.from({ length: 61 }, (_, n) => `${60 + n} dB`);

function Bark({ spec, soundRef, onDone, touch, photo }: Props<Extract<BerkeleySpec, { kind: "bark" }>> & { photo?: string }) {
  const [phase, setPhaseState] = useState<"brief" | "them" | "ready" | "charge" | "result" | "done">("brief");
  const [round, setRound] = useState(0);
  const [barks, setBarks] = useState<Array<{ word: BarkWord; db: number; crack: boolean }>>([]);
  const [tug, setTug] = useState(0);
  const phaseRef = useRef(phase);
  const fill = useRef<HTMLElement>(null);
  const db = useRef<HTMLElement>(null);
  const you = useRef<HTMLElement>(null);
  const them = useRef<HTMLElement>(null);
  const meter = useRef<HTMLDivElement>(null);
  const live = useRef({ wait: 0, k: 0, db: -1, barked: 0 });
  const { pops, pop } = usePops(1000);
  const ready = useSince(phase === "done");
  const total = spec.rounds;
  const r = BARK_ROUNDS[Math.min(round, BARK_ROUNDS.length - 1)];
  const go = (next: typeof phase) => {
    phaseRef.current = next;
    setPhaseState(next);
  };

  const release = (crack: boolean) => {
    const s = live.current;
    const m = breathOf(s.k);
    const word: BarkWord = crack ? "yip." : m >= r.great - SLACK && m <= TOP + SLACK ? "AWOOOO" : m >= GOOD_AT - SLACK ? "WOOF" : "yip.";
    const gain = word === "AWOOOO" ? 2 : word === "WOOF" ? 1 : -1;
    const level = Math.round(60 + Math.min(1, m) * 55 - (crack ? 18 : 0));
    setBarks((list) => [...list, { word, db: level, crack }]);
    setTug((t) => Math.max(-3, Math.min(6, t + gain)));
    s.wait = 1.6;
    go("result");
    soundRef.current?.bark(word === "AWOOOO" ? -5 : word === "WOOF" ? 0 : 9);
    if (word === "AWOOOO") window.setTimeout(() => soundRef.current?.bark(-7), 170);
    pop(crack ? "voice cracked" : word === "AWOOOO" ? "the room loses it" : word === "WOOF" ? "solid" : "…", word === "AWOOOO" ? "great" : word === "WOOF" ? "good" : "bad", 50, 64);
    if (word === "AWOOOO") {
      jolt(you.current, 0.9, 320);
      jolt(them.current, 0.4, 260);
    } else if (word === "WOOF") jolt(you.current, 0.45);
    else punch(you.current, 0.04);
  };

  useFrame(
    (dt) => {
      const s = live.current;
      const p = phaseRef.current;
      if (p === "them") {
        s.wait -= dt;
        // the challenger's barks, a beat apart
        const due = Math.floor((1.5 - s.wait - 0.2) / 0.26) + 1;
        if (s.barked < Math.min(r.barks, due)) {
          s.barked += 1;
          soundRef.current?.bark((r.barks === 3 ? -2 : 4) + round - s.barked);
        }
        if (s.wait <= 0) go("ready");
      } else if (p === "charge") {
        s.k += dt * r.fill;
        const m = breathOf(s.k);
        // over the top the breath shakes, then the voice goes
        const over = s.k > 1 ? Math.sin(s.k * 90) * 0.012 : 0;
        if (fill.current) fill.current.style.transform = `scaleX(${(m + over).toFixed(4)})`;
        const level = Math.round(Math.min(1, m) * 60);
        if (level !== s.db && db.current) db.current.textContent = DB[level];
        s.db = level;
        if (s.k > 1.14) release(true);
      } else if (p === "result") {
        s.wait -= dt;
        if (s.wait > 0) return;
        s.wait = Infinity;
        if (round + 1 >= total) {
          soundRef.current?.sting();
          return go("done");
        }
        setRound(round + 1);
        s.k = 0;
        s.barked = 0;
        s.wait = 1.5;
        if (fill.current) fill.current.style.transform = "scaleX(0)";
        go("them");
      }
    },
    phase === "them" || phase === "charge" || phase === "result",
  );

  const down = () => {
    const p = phaseRef.current;
    if (p === "brief") {
      soundRef.current?.confirm();
      live.current.wait = 1.5;
      live.current.barked = 0;
      return go("them");
    }
    if (p === "done") return ready() && onDone(barks.reduce((n, b) => n + (b.word === "AWOOOO" ? 2 : b.word === "WOOF" ? 1 : 0), 0));
    if (p !== "ready") return;
    live.current.k = 0;
    live.current.db = -1;
    go("charge");
  };
  const up = () => {
    if (phaseRef.current === "charge") release(live.current.k > 1);
  };
  useHold(down, up);

  const score = barks.reduce((n, b) => n + (b.word === "AWOOOO" ? 2 : b.word === "WOOF" ? 1 : 0), 0);
  const awoos = barks.filter((b) => b.word === "AWOOOO").length;
  const woofs = barks.filter((b) => b.word === "WOOF").length;
  const yips = barks.length - awoos - woofs;
  const rank: Rank = score >= total * 2 ? "S" : score >= total * 2 - 1 ? "A" : score >= total ? "B" : "C";
  const last = barks.at(-1);
  const challenger = face("student");
  const talking = phase === "them" ? "them" : phase === "result" || phase === "charge" ? "you" : null;

  return (
    <div
      className={kit.scrim}
      data-over={phase === "done" || undefined}
      onPointerDown={(event) => {
        if ((event.target as HTMLElement).closest("button")) return;
        down();
      }}
      onPointerUp={up}
      onPointerCancel={up}
    >
      <Window title="BarkOff · live" wide>
        <div className={styles.bark}>
          <div className={styles.cams}>
            <figure ref={you} data-talking={talking === "you" || undefined}>
              {photo ? <img src={photo} alt="" /> : null}
              <figcaption>You</figcaption>
              <div className={styles.wave} data-size={phase === "result" ? last?.word : phase === "charge" ? "WOOF" : undefined}>
                {Array.from({ length: 9 }, (_, i) => (
                  <i key={i} style={{ "--i": i } as React.CSSProperties} />
                ))}
              </div>
              {phase === "result" && last ? (
                <strong className={styles.barkWord} data-word={last.word} key={barks.length}>
                  {last.word}
                </strong>
              ) : null}
            </figure>
            <span className={styles.vs}>VS</span>
            <figure ref={them} data-talking={talking === "them" || undefined}>
              {challenger ? <img src={challenger} alt="" /> : null}
              <figcaption>Challenger</figcaption>
              <div className={styles.wave} data-size={phase === "them" ? "WOOF" : undefined}>
                {Array.from({ length: 9 }, (_, i) => (
                  <i key={i} style={{ "--i": i } as React.CSSProperties} />
                ))}
              </div>
              {phase === "them" ? (
                <strong className={styles.barkWord} key={`t${round}`}>
                  {r.word}
                </strong>
              ) : null}
            </figure>
          </div>
          <div className={styles.crowd}>
            <small>The room</small>
            <span>
              <i style={{ width: `${Math.round(50 + tug * 8)}%` }} />
            </span>
          </div>
          {phase === "brief" ? (
            <Brief touch={touch} text="They bark first. Then hold to take a breath, and let go in the gold." />
          ) : (
            <div className={styles.breath} ref={meter} data-live={phase === "ready" || phase === "charge" || phase === "result" || undefined}>
              <div className={styles.track}>
                <i className={styles.good} style={{ left: `${GOOD_AT * 100}%`, width: `${(r.great - GOOD_AT) * 100}%` }} />
                <i className={styles.great} style={{ left: `${r.great * 100}%`, width: `${(TOP - r.great) * 100}%` }} />
                <i className={styles.fill} ref={fill} />
                <i className={styles.theirs} style={{ left: `${r.level * 100}%` }} />
              </div>
              <div className={styles.breathFoot}>
                <small>
                  Round {Math.min(round + 1, total)} of {total}
                </small>
                <b ref={db}>{phase === "result" && last ? `${last.db} dB` : "60 dB"}</b>
                <span className={kit.hint}>
                  {phase === "charge" ? (
                    "let go in the gold"
                  ) : phase === "ready" ? (
                    touch ? (
                      "Hold, then let go in the gold"
                    ) : (
                      <>
                        hold <kbd>E</kbd> then let go in the gold
                      </>
                    )
                  ) : (
                    "they bark first"
                  )}
                </span>
              </div>
            </div>
          )}
        </div>
        <Pops items={pops} />
      </Window>
      {phase === "done" ? (
        <Results
          game="bark"
          kicker="BarkOff · final"
          rank={rank}
          score={score * 100 + barks.reduce((n, b) => Math.max(n, b.db), 0)}
          label={[awoos ? `${awoos} AWOOOO` : "", woofs ? `${woofs} WOOF` : "", yips ? `${yips} yip.` : ""].filter(Boolean).join(" · ")}
          reason={rank === "S" ? "Best bark in the room. Possibly the building." : rank === "A" ? "The room’s on your side." : rank === "B" ? "The room’s on your side. Barely." : "The challenger barks on."}
          touch={touch}
          soundRef={soundRef}
        />
      ) : null}
    </div>
  );
}

// —— alai: the student writes, a step at a time, and you catch the step
// where it goes wrong while they're still writing. That's the whole idea.

const WRITE = 0.95;
const GAP = 0.5;
const startOf = (k: number) => 0.35 + k * (WRITE + GAP);

function WrongStep({ spec, soundRef, onDone, touch }: Props<Extract<BerkeleySpec, { kind: "wrongstep" }>>) {
  const [phase, setPhaseState] = useState<"brief" | "write" | "found" | "done">("brief");
  const [at, setAt] = useState(0);
  const [written, setWritten] = useState(0);
  const [selected, setSelected] = useState(0);
  const [fine, setFine] = useState<number[]>([]);
  const [typed, setTyped] = useState(0);
  const [scores, setScores] = useState<Array<{ first: boolean; live: boolean }>>([]);
  const phaseRef = useRef(phase);
  const live = useRef({ t: 0, written: 0, missed: false, typed: 0, paused: false });
  const pad = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLOListElement>(null);
  const { pops, pop } = usePops(900);
  const ready = useSince(phase === "done");
  const total = spec.problems.length;
  const p = spec.problems[Math.min(at, total - 1)];
  const done = written >= p.steps.length;
  const go = (next: typeof phase) => {
    phaseRef.current = next;
    setPhaseState(next);
  };

  useFrame(
    (dt) => {
      const s = live.current;
      // CSS keeps time for the handwriting; it stops when the game does
      const paused = screensPaused();
      if (paused !== s.paused) {
        s.paused = paused;
        pad.current?.toggleAttribute("data-paused", paused);
      }
      if (phaseRef.current === "write") {
        s.t += dt;
        while (s.written < p.steps.length && s.t >= startOf(s.written)) {
          s.written += 1;
          setWritten(s.written);
          soundRef.current?.keys();
        }
      } else if (phaseRef.current === "found" && s.typed < p.nudge.length) {
        s.t += dt;
        const n = Math.min(p.nudge.length, Math.floor(s.t * 46));
        if (n !== s.typed) {
          if (Math.floor(n / 3) !== Math.floor(s.typed / 3)) soundRef.current?.blip(10 + (n % 2));
          s.typed = n;
          setTyped(n);
        }
      }
    },
    phase === "write" || phase === "found",
  );

  const begin = (index: number) => {
    Object.assign(live.current, { t: 0, written: 0, missed: false, typed: 0 });
    setWritten(0);
    setSelected(0);
    setFine([]);
    setTyped(0);
    setAt(index);
    go("write");
  };

  const check = (i: number) => {
    const s = live.current;
    const now = phaseRef.current;
    if (now === "brief") {
      soundRef.current?.confirm();
      return begin(0);
    }
    if (now === "done") return ready() && onDone(scores.filter((x) => x.first).length);
    if (now === "found") {
      if (s.typed < p.nudge.length) {
        s.typed = p.nudge.length;
        setTyped(p.nudge.length);
        return;
      }
      if (at + 1 >= total) {
        soundRef.current?.sting();
        return go("done");
      }
      return begin(at + 1);
    }
    if (i >= s.written) return;
    const step = list.current?.children[i] as HTMLElement | undefined;
    const box = pad.current?.getBoundingClientRect();
    const r = step?.getBoundingClientRect();
    const x = box && r ? ((r.left + r.width * 0.5 - box.left) / box.width) * 100 : 50;
    const y = box && r ? ((r.top - box.top) / box.height) * 100 : 40;
    if (i === p.wrong) {
      const caughtLive = s.written < p.steps.length || s.t < startOf(p.steps.length - 1) + WRITE;
      setScores((list) => [...list, { first: !s.missed, live: caughtLive }]);
      s.t = 0;
      s.typed = 0;
      go("found");
      soundRef.current?.chime();
      pop(caughtLive ? "caught it live" : "caught it", caughtLive ? "great" : "good", Math.min(80, x), y);
      punch(step, 0.03);
      return;
    }
    s.missed = true;
    setFine((list) => (list.includes(i) ? list : [...list, i]));
    soundRef.current?.nope();
    pop("that one’s fine", "bad", Math.min(80, x), y);
    jolt(step, 0.4);
  };
  usePress(() => check(selected));
  useArrows((step) => {
    if (phaseRef.current !== "write" || live.current.written === 0) return;
    setSelected((s) => (s + step + live.current.written) % live.current.written);
    soundRef.current?.select();
  });

  const first = scores.filter((x) => x.first).length;
  const points = scores.reduce((n, x) => n + (x.first ? (x.live ? 3 : 2) : 1), 0);
  const rank = rankOf(points / (total * 3), [1, 0.78, 0.55]);

  return (
    <div className={kit.scrim} data-over={phase === "done" || undefined} onClick={() => (phase === "brief" || phase === "found" || phase === "done") && check(selected)}>
      <div className={styles.ipad}>
        <div className={styles.ipadScreen} ref={pad}>
          <header className={styles.alaiBar}>
            <b>alai</b>
            <span>{phase === "done" ? "Session done" : `Problem ${at + 1} of ${total}`}</span>
          </header>
          <p className={styles.prompt}>{p.prompt}</p>
          {phase === "brief" ? (
            <Brief touch={touch} text="A student is writing it out. Circle the step that goes wrong, before they finish." />
          ) : (
            <ol className={styles.steps} ref={list} key={at}>
              {p.steps.slice(0, written).map((s, i) => (
                <li
                  key={s}
                  data-on={(phase === "write" && selected === i) || undefined}
                  data-wrong={(phase !== "write" && i === p.wrong) || undefined}
                  data-fine={fine.includes(i) || undefined}
                  data-writing={(phase === "write" && i === written - 1 && !done) || undefined}
                  onPointerEnter={() => phase === "write" && setSelected(i)}
                  onClick={(event) => {
                    event.stopPropagation();
                    check(i);
                  }}
                  style={{ "--tilt": `${((i * 37) % 5) - 2}`, "--n": s.length } as React.CSSProperties}
                >
                  <span className={styles.ink}>{s}</span>
                  {(phase !== "write" && i === p.wrong) || fine.includes(i) ? (
                    <svg className={styles.ring} viewBox="0 0 100 40" preserveAspectRatio="none" aria-hidden="true">
                      <ellipse cx="50" cy="20" rx="48" ry="17" pathLength={1} />
                    </svg>
                  ) : null}
                </li>
              ))}
            </ol>
          )}
          <div className={styles.nudge} data-shown={phase === "found" || undefined}>
            <Bird />
            <span>{phase === "found" ? p.nudge.slice(0, typed) : phase === "write" ? (done ? "They’re done. Was it right?" : "Watching the page…") : "Which step is wrong? Circle it."}</span>
          </div>
          <span className={kit.hint}>
            {phase === "found"
              ? touch
                ? "Tap for the next one"
                : <><kbd>E</kbd> next problem</>
              : phase === "write"
                ? touch
                  ? "Tap the wrong step"
                  : <>arrows to choose · <kbd>E</kbd> circle it</>
                : null}
          </span>
          <Pops items={pops} />
        </div>
      </div>
      {phase === "done" ? (
        <Results
          game="wrongstep"
          kicker="alai · session"
          rank={rank}
          score={points}
          label={`${first} / ${total} first try`}
          reason={rank === "S" ? "Caught every one mid-sentence." : rank === "A" ? "Caught them before the answer box." : rank === "B" ? "Got there, after a false alarm or two." : "alai would have said something sooner."}
          touch={touch}
          soundRef={soundRef}
        />
      ) : null}
    </div>
  );
}

/** A bug, in pixels: antennae, a shell, six legs, two red eyes. */
function BugSprite() {
  return (
    <svg className={styles.bug} viewBox="0 0 10 8" aria-hidden="true" shapeRendering="crispEdges">
      <path d="M2 0h1v1H2zM7 0h1v1H7zM3 1h1v1H3zM6 1h1v1H6zM2 2h6v1H2zM1 3h8v1H1zM0 4h10v1H0zM1 5h8v1H1zM0 6h1v1H0zM2 6h6v1H2zM9 6h1v1H9zM2 7h1v1H2zM7 7h1v1H7z" />
      <path className={styles.bugEyes} d="M3 3h1v1H3zM6 3h1v1H6z" />
    </svg>
  );
}

/** alai's little yellow bird, in pixels. */
function Bird() {
  return (
    <svg className={styles.bird} viewBox="0 0 12 10" aria-hidden="true" shapeRendering="crispEdges">
      <path className={styles.birdBody} d="M3 1h5v1h1v1h1v4H9v1H8v1H3V8H2V7H1V3h1V2h1z" />
      <path className={styles.birdBeak} d="M10 4h2v1h-2z" />
      <path className={styles.birdEye} d="M7 3h1v1H7z" />
      <path className={styles.birdWing} d="M3 5h3v1H5v1H3z" />
    </svg>
  );
}

// —— Continuity: a long thread, and the few facts a fresh agent needs from it.
// Each answer lights the email that backs it.

/** The latest email that backs `text` up: the one sharing most of its
 * numbers and names. */
function sourceOf(emails: Array<{ text: string }>, text: string) {
  const want = text.match(/\$?\d+|[A-Z][a-z]+/g) ?? [];
  let best = -1;
  let hits = 0;
  emails.forEach((m, i) => {
    const has = new Set(m.text.match(/\$?\d+|[A-Z][a-z]+/g) ?? []);
    const n = want.filter((w) => has.has(w)).length;
    if (n > 0 && n >= hits) {
      best = i;
      hits = n;
    }
  });
  return { best, hits };
}

function Thread({ spec, soundRef, onDone, touch }: Props<Extract<BerkeleySpec, { kind: "thread" }>>) {
  const [at, setAt] = useState(0);
  const [selected, setSelected] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [marks, setMarks] = useState<boolean[]>([]);
  const mails = useRef<HTMLElement>(null);
  const total = spec.questions.length;
  const finished = at >= total;
  const ready = useSince(finished);
  const q = spec.questions[Math.min(at, total - 1)];
  const score = marks.filter(Boolean).length;
  const sources = useMemo(() => spec.questions.map((x) => sourceOf(spec.emails, x.options[x.answer]).best), [spec]);
  const stale = picked !== null && picked !== q.answer ? sourceOf(spec.emails, q.options[picked]) : null;
  const staleAt = stale && stale.hits >= 2 && stale.best !== sources[at] ? stale.best : -1;

  // the email that backs the answer comes into view
  useEffect(() => {
    if (picked === null) return;
    const el = mails.current?.querySelector<HTMLElement>("[data-source]");
    el?.scrollIntoView({ block: "nearest", behavior: reducedMotion() ? "auto" : "smooth" });
  }, [picked]);

  const pick = (i: number) => {
    if (finished) return ready() && onDone(score);
    if (picked !== null) return;
    setSelected(i);
    setPicked(i);
    const right = i === q.answer;
    setMarks((m) => [...m, right]);
    if (right) soundRef.current?.coin();
    else soundRef.current?.nope();
    window.setTimeout(
      () => {
        setPicked(null);
        setSelected(0);
        setAt((n) => n + 1);
        soundRef.current?.select();
        if (at + 1 >= total) soundRef.current?.sting();
      },
      right ? 1100 : 1700,
    );
  };
  usePress(() => (picked === null ? pick(selected) : undefined));
  useArrows((step) => {
    if (finished || picked !== null) return;
    setSelected((s) => (s + step + q.options.length) % q.options.length);
    soundRef.current?.select();
  });

  const rank = rankOf(score / total, [1, 0.66, 0.5]);
  return (
    <div className={kit.scrim} data-over={finished || undefined} onClick={() => finished && pick(0)}>
      <Window title="Continuity · thread memory" wide>
        <div className={styles.thread}>
          <section className={styles.mails} ref={mails}>
            <header>{spec.subject}</header>
            {spec.emails.map((m, i) => (
              <article
                key={i}
                style={{ "--d": `${i * 120}ms` } as React.CSSProperties}
                data-source={(picked !== null && sources[at] === i) || undefined}
                data-stale={staleAt === i || undefined}
              >
                <b>{m.from}</b>
                <small>{m.time}</small>
                <p>{m.text}</p>
                {picked !== null && sources[at] === i ? <em>current</em> : staleAt === i ? <em data-stale="">replaced</em> : null}
              </article>
            ))}
          </section>
          <section className={styles.state}>
            <header>
              Handoff state <span>{Math.min(at, total)} of {total} pinned</span>
            </header>
            <div className={styles.pins}>
              {spec.pins.slice(0, at).map((pin, i) => (
                <span key={pin} data-missed={marks[i] === false || undefined}>
                  {pin}
                </span>
              ))}
            </div>
            {finished ? (
              <div className={styles.handoff}>
                <strong>Handoff ready</strong>
                <span>One call for the next agent, not twenty emails.</span>
              </div>
            ) : (
              <>
                <p className={styles.question}>{q.q}</p>
                <Choices
                  options={q.options.map((label) => ({ label }))}
                  selected={selected}
                  reveal={picked === null ? null : { right: q.answer, picked }}
                  onPick={pick}
                  onHover={(i) => picked === null && setSelected(i)}
                />
                <span className={kit.hint}>{touch ? "Tap the answer the thread backs up" : <>arrows to choose · <kbd>E</kbd> pin it</>}</span>
              </>
            )}
          </section>
        </div>
      </Window>
      {finished ? (
        <Results
          game="thread"
          kicker="Continuity · handoff"
          rank={rank}
          score={score}
          label={`${score} / ${total} facts right`}
          reason={rank === "S" ? "One call. No rereading." : rank === "A" ? "One stale fact almost got through." : rank === "B" ? "Half the handoff needs a second look." : "The next agent will reread all of it."}
          touch={touch}
          soundRef={soundRef}
        />
      ) : null}
    </div>
  );
}

// —— an email, read one line at a time; the line that matters takes a breath first

const KEY_LINE = /unfortunately|congratulations|not to move forward|your score/i;

function Email({ spec, soundRef, onDone, touch }: Props<Extract<BerkeleySpec, { kind: "email" }>>) {
  const [shown, setShown] = useState(0);
  const done = shown >= spec.lines.length;
  useEffect(() => {
    soundRef.current?.notify();
  }, [soundRef]);
  useEffect(() => {
    if (done) return;
    const next = spec.lines[shown];
    const id = window.setTimeout(() => setShown((n) => n + 1), shown === 0 ? 700 : 900 + spec.lines[shown - 1].length * 12 + (KEY_LINE.test(next) ? 700 : 0));
    return () => window.clearTimeout(id);
  }, [shown, done, spec.lines]);
  const press = () => (done ? onDone() : setShown(spec.lines.length));
  usePress(press);
  return (
    <div className={kit.scrim} onClick={press}>
      <Window title={spec.app ?? "Mail"} wide>
        <div className={styles.email} data-tone={spec.tone}>
          <div className={styles.mailBar} aria-hidden="true">
            <span>Inbox</span>
            <span>Archive</span>
            <span>Reply</span>
          </div>
          <header>
            <i>{spec.from.slice(0, 1)}</i>
            <div>
              <b>{spec.from}</b>
              <strong>{spec.subject}</strong>
              <small>to me</small>
            </div>
          </header>
          <div className={styles.body}>
            {spec.lines.slice(0, shown).map((line, i) => (
              <p key={i} data-key={KEY_LINE.test(line) || undefined}>
                {line}
              </p>
            ))}
          </div>
          <footer>{done ? <Hint touch={touch} /> : <span className={kit.dots}>···</span>}</footer>
        </div>
      </Window>
    </div>
  );
}

// —— a video call: the partner asks, one of you answers, out loud

function Call({ spec, soundRef, onDone, touch, photo }: Props<Extract<BerkeleySpec, { kind: "call" }>> & { photo?: string }) {
  const [at, setAt] = useState(0);
  const [phase, setPhase] = useState<"ask" | "answer" | "say" | "reply" | "outro" | "ended">("ask");
  const [selected, setSelected] = useState(0);
  const [picks, setPicks] = useState<number[]>([]);
  const [typed, setTyped] = useState(0);
  const [seconds, setSeconds] = useState(0);
  const total = spec.questions.length;
  const q = spec.questions[Math.min(at, total - 1)];
  const pick = picks[at] ?? 0;
  const caption = phase === "ask" || phase === "answer" ? q.q : phase === "say" ? q.options[pick].label : phase === "reply" ? q.replies[pick] : spec.outro;
  const speaking = phase === "ask" || phase === "say" || phase === "reply" || phase === "outro";
  const full = typed >= caption.length;
  const who = phase === "say" ? q.options[pick].who : speaking ? "host" : null;
  const nameOf = (id: string) => (id === "aiden" ? "Aiden" : id.charAt(0).toUpperCase() + id.slice(1));

  useEffect(() => {
    if (phase === "ended") return;
    const id = window.setInterval(() => !screensPaused() && setSeconds((s) => s + 1), 1000);
    return () => window.clearInterval(id);
  }, [phase]);
  useEffect(() => {
    if (!speaking) return;
    let n = 0;
    const id = window.setInterval(
      () => {
        if (screensPaused()) return;
        n += 1;
        setTyped(n);
        if (n % 3 === 0) soundRef.current?.blip(phase === "say" ? (who === "aiden" ? 0 : -1) + (n % 2) : -5 + (n % 2));
        if (n >= caption.length) window.clearInterval(id);
      },
      phase === "say" ? 17 : 24,
    );
    return () => window.clearInterval(id);
  }, [caption, speaking, phase, who, soundRef]);

  const answer = (i: number) => {
    soundRef.current?.confirm();
    setSelected(i);
    setPicks((p) => [...p, i]);
    setTyped(0);
    setPhase("say");
  };
  const advance = () => {
    if (phase === "ended") return onDone(picks);
    if (speaking && !full) return setTyped(caption.length);
    if (phase === "ask") return setPhase("answer");
    if (phase === "answer") return answer(selected);
    if (phase === "say") {
      setTyped(0);
      return setPhase("reply");
    }
    if (phase === "reply") {
      setTyped(0);
      setSelected(0);
      if (at + 1 < total) {
        setAt((n) => n + 1);
        setPhase("ask");
      } else setPhase("outro");
      return;
    }
    if (phase === "outro") {
      soundRef.current?.select();
      setPhase("ended");
    }
  };
  usePress(advance);
  useArrows((step) => {
    if (phase !== "answer") return;
    setSelected((s) => (s + step + q.options.length) % q.options.length);
    soundRef.current?.select();
  });

  const clock = `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
  return (
    <div className={kit.scrim} onClick={phase === "answer" ? undefined : advance}>
      <Window title={spec.title} wide>
        <div className={styles.call} data-ended={phase === "ended" || undefined}>
          <div className={styles.host} data-talking={(who === "host" && !full) || undefined} data-nod={phase === "reply" || undefined}>
            <img src={face(spec.host.face)} alt="" />
            <span className={styles.tag}>
              <MicIcon on={who === "host"} /> {spec.host.name}
            </span>
            <span className={styles.rec}>
              <i /> {clock}
            </span>
          </div>
          <div className={styles.guests}>
            <figure data-talking={(who === "aiden" && !full) || undefined}>
              {photo ? <img src={photo} alt="" /> : null}
              <figcaption>
                <MicIcon on={who === "aiden"} /> Aiden
              </figcaption>
            </figure>
            {spec.guests.map((g) => (
              <figure key={g.name} data-talking={(who === g.face && !full) || undefined}>
                <img src={face(g.face)} alt="" />
                <figcaption>
                  <MicIcon on={who === g.face} /> {g.name}
                </figcaption>
              </figure>
            ))}
          </div>
          {phase === "ended" ? (
            <div className={styles.ended}>
              <strong>Call ended · {clock}</strong>
              <Hint touch={touch} label="continue" />
            </div>
          ) : (
            <div className={styles.caption}>
              <p>
                {phase === "say" ? <b>{nameOf(q.options[pick].who)}</b> : speaking ? <b>{spec.host.name}</b> : null}
                {caption.slice(0, speaking ? typed : caption.length)}
                {speaking && !full ? <span className={styles.rest}>{caption.slice(typed)}</span> : null}
              </p>
              {phase === "answer" ? (
                <Choices
                  options={q.options.map((o) => ({ label: o.label, who: nameOf(o.who), face: o.who === "aiden" ? photo : face(o.who) }))}
                  selected={selected}
                  onPick={answer}
                  onHover={setSelected}
                />
              ) : null}
              {phase === "answer" ? (
                <span className={kit.hint}>{touch ? "Tap who answers" : <>arrows to choose · <kbd>E</kbd> answer</>}</span>
              ) : full ? (
                <span className={kit.hint}>{touch ? "Tap to go on" : <><kbd>E</kbd> go on</>}</span>
              ) : null}
            </div>
          )}
          <div className={styles.controls} aria-hidden="true">
            <span>
              <MicIcon on />
            </span>
            <span>
              <svg viewBox="0 0 10 8" shapeRendering="crispEdges">
                <path d="M0 1h7v6H0zM7 3h1V2h1V1h1v6H9V6H8V5H7z" />
              </svg>
            </span>
            <span data-leave="">Leave</span>
          </div>
        </div>
      </Window>
    </div>
  );
}

function MicIcon({ on }: { on: boolean }) {
  return (
    <svg className={styles.mic} data-on={on || undefined} viewBox="0 0 6 8" aria-hidden="true" shapeRendering="crispEdges">
      <path d="M2 0h2v1h1v3H4v1H2V4H1V1h1zM0 3h1v1h1v1h2V4h1V3h1v2H5v1H4v2H2V6H1V5H0z" />
    </svg>
  );
}

// —— an application: you type it, a word a press (or hold to keep going),
// then send it. The YC box really is fifty characters.

// characters a second, holding the key down: steady, and slower than a fast pair of hands
const HOLD_RATE = 22;
const limitOf = (label: string) => {
  const m = /(\d+)\s*characters/i.exec(label);
  return m ? Number(m[1]) : 0;
};

function Form({ spec, soundRef, onDone, touch }: Props<Extract<BerkeleySpec, { kind: "form" }>>) {
  const [field, setField] = useState(0);
  const [typed, setTyped] = useState(0);
  const [phase, setPhaseState] = useState<"type" | "sending" | "sent">("type");
  const [wpm, setWpm] = useState(0);
  const phaseRef = useRef(phase);
  const live = useRef({ field: 0, typed: 0, holding: false, acc: 0, wait: 0, chars: 0, first: 0, last: 0, sending: 0 });
  const list = useRef<HTMLDivElement>(null);
  const submit = useRef<HTMLButtonElement>(null);
  const ready = useSince(phase === "sent");
  const total = spec.fields.length;
  const go = (next: typeof phase) => {
    phaseRef.current = next;
    setPhaseState(next);
  };

  useEffect(() => {
    list.current?.querySelector("[data-now]")?.scrollIntoView({ block: "nearest", behavior: reducedMotion() ? "auto" : "smooth" });
  }, [field]);

  /** Types up to `to` characters into the current field, moving on when it's full. */
  const typeTo = (to: number) => {
    const s = live.current;
    if (s.field >= total) return;
    const answer = spec.fields[s.field].answer;
    const next = Math.min(answer.length, to);
    if (next <= s.typed) return;
    const now = performance.now();
    if (!s.first) s.first = now;
    s.last = now;
    s.chars += next - s.typed;
    s.typed = next;
    setTyped(next);
    const minutes = (s.last - s.first) / 60000;
    if (minutes > 0.02) setWpm(Math.round(s.chars / 5 / minutes));
    if (next >= answer.length) {
      soundRef.current?.select();
      s.field += 1;
      s.typed = 0;
      setField(s.field);
      setTyped(0);
    }
  };
  /** One press: the rest of the next word, and the space after it. */
  const typeWord = () => {
    const s = live.current;
    const answer = spec.fields[s.field]?.answer;
    if (!answer) return;
    let end = s.typed;
    while (end < answer.length && answer[end] === " ") end += 1;
    while (end < answer.length && answer[end] !== " ") end += 1;
    if (end < answer.length) end += 1;
    soundRef.current?.keys();
    typeTo(end);
  };
  const send = () => {
    go("sending");
    live.current.sending = 0.75;
    soundRef.current?.confirm();
    punch(submit.current, 0.08);
  };

  useFrame(
    (dt) => {
      const s = live.current;
      if (phaseRef.current === "sending") {
        s.sending -= dt;
        if (s.sending <= 0) {
          soundRef.current?.sting();
          go("sent");
        }
        return;
      }
      if (!s.holding || s.field >= total) return;
      // held down: after a beat, it keeps typing at a steady clip
      if (s.wait > 0) {
        s.wait -= dt;
        return;
      }
      s.acc += dt * HOLD_RATE;
      if (s.acc >= 1) {
        const n = Math.floor(s.acc);
        s.acc -= n;
        if ((s.typed + n) % 4 < n) soundRef.current?.keys();
        typeTo(s.typed + n);
      }
    },
    phase === "type" || phase === "sending",
  );

  const down = () => {
    const s = live.current;
    if (phaseRef.current === "sent") return ready() && onDone();
    if (phaseRef.current !== "type") return;
    if (s.field >= total) return send();
    typeWord();
    s.holding = true;
    s.wait = 0.32;
    s.acc = 0;
  };
  const up = () => {
    live.current.holding = false;
  };
  useHold(down, up);

  const rank: Rank = wpm >= 320 ? "S" : wpm >= 220 ? "A" : wpm >= 140 ? "B" : "C";
  const allDone = field >= total;
  return (
    <div className={kit.scrim} data-over={phase === "sent" || undefined} onPointerDown={down} onPointerUp={up} onPointerCancel={up}>
      <Window title={spec.title} wide>
        <div className={styles.form} style={{ "--accent": spec.accent ?? "#2f6be8" } as React.CSSProperties}>
          <div className={styles.fields} ref={list}>
            {spec.fields.map((f, i) => {
              const limit = limitOf(f.label);
              const count = i < field ? f.answer.length : i === field ? typed : 0;
              return (
                <label key={f.label} data-now={i === field || undefined} data-done={i < field || undefined}>
                  <span>
                    {f.label}
                    {limit ? (
                      <em data-near={count >= limit * 0.9 || undefined}>
                        {count}/{limit}
                      </em>
                    ) : null}
                  </span>
                  <p>
                    {i < field ? f.answer : i === field ? f.answer.slice(0, typed) : ""}
                    {i === field ? <i className={kit.caret} /> : null}
                  </p>
                </label>
              );
            })}
          </div>
          <footer>
            <span className={styles.typing}>
              {field === 0 && typed === 0 ? (
                touch ? (
                  "Each tap types a word. Hold to keep going."
                ) : (
                  "Each press types a word. Hold to keep going."
                )
              ) : (
                <>
                  <b>{wpm}</b> wpm · {Math.min(field, total)} of {total} answered
                </>
              )}
            </span>
            {phase === "sent" ? (
              <span className={styles.sent}>✓ {spec.done}</span>
            ) : (
              <button type="button" ref={submit} className={styles.submit} data-ready={(allDone && phase === "type") || undefined} data-sending={phase === "sending" || undefined}>
                {phase === "sending" ? (
                  "Sending…"
                ) : (
                  <>
                    {touch ? null : <kbd>E</kbd>} {allDone ? spec.submit : touch ? "Tap to type" : "type"}
                  </>
                )}
              </button>
            )}
          </footer>
        </div>
      </Window>
      {phase === "sent" ? (
        <Results
          game={`form:${spec.title}`}
          kicker={spec.done.replace(/\.$/, "")}
          rank={rank}
          score={wpm}
          label={`${wpm} words a minute`}
          reason={rank === "S" ? "Faster than the deadline." : rank === "A" ? "In with time to spare." : rank === "B" ? "In." : "In. Eventually."}
          touch={touch}
          soundRef={soundRef}
        />
      ) : null}
    </div>
  );
}

// —— the bug bash: bugs crawl down alai's six screens toward the release;
// squash them before they ship. It gets busier as the build gets closer.

const TILES = ["Camera", "Pencil", "Voice", "Steps", "Hints", "Sync"];
const CLOCKS = Array.from({ length: 100 }, (_, n) => `0:${String(n).padStart(2, "0")}`);
type Bug = { id: number; tile: number; label: string; born: number; life: number; dead: number; shipped: number };
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;

function Bugs({ spec, soundRef, onDone, touch }: Props<Extract<BerkeleySpec, { kind: "bugs" }>>) {
  const [phase, setPhaseState] = useState<"brief" | "run" | "done">("brief");
  const [bugs, setBugs] = useState<Bug[]>([]);
  const [cursor, setCursor] = useState(0);
  const [tally, setTally] = useState({ squashed: 0, shipped: 0, spawned: 0, combo: 0 });
  const [log, setLog] = useState<Array<{ id: number; label: string; shipped: boolean }>>([]);
  const phaseRef = useRef(phase);
  const game = useRef({ t: 0, next: 0.4, id: 0, rng: seeded(23), bugs: [] as Bug[], squashed: 0, shipped: 0, spawned: 0, combo: 0, second: -1, paused: false });
  const tiles = useRef<Array<HTMLElement | null>>([]);
  const screen = useRef<HTMLDivElement>(null);
  const clock = useRef<HTMLElement>(null);
  const { pops, pop } = usePops(800);
  const ready = useSince(phase === "done");
  const go = (next: typeof phase) => {
    phaseRef.current = next;
    setPhaseState(next);
  };
  const sync = () => {
    const g = game.current;
    setBugs(g.bugs.slice());
    setTally({ squashed: g.squashed, shipped: g.shipped, spawned: g.spawned, combo: g.combo });
  };
  const centre = (tile: number) => {
    const box = screen.current?.getBoundingClientRect();
    const r = tiles.current[tile]?.getBoundingClientRect();
    return box && r ? { x: ((r.left + r.width / 2 - box.left) / box.width) * 100, y: ((r.top + r.height * 0.4 - box.top) / box.height) * 100 } : { x: 50, y: 50 };
  };

  useFrame(
    (dt) => {
      const g = game.current;
      const paused = screensPaused();
      if (paused !== g.paused) {
        g.paused = paused;
        screen.current?.toggleAttribute("data-paused", paused);
      }
      if (phaseRef.current !== "run") return;
      g.t += dt;
      const k = Math.min(1, g.t / spec.seconds);
      const left = Math.max(0, Math.ceil(spec.seconds - g.t));
      if (left !== g.second) {
        g.second = left;
        if (clock.current) clock.current.textContent = CLOCKS[Math.min(99, left)];
        if (left > 0 && left <= 3) soundRef.current?.tick();
      }
      let changed = false;
      for (const b of g.bugs) {
        // one that reaches the bottom of its screen ships
        if (!b.dead && !b.shipped && g.t - b.born >= b.life) {
          b.shipped = g.t;
          g.shipped += 1;
          g.combo = 0;
          changed = true;
          soundRef.current?.nope();
          jolt(tiles.current[b.tile], 0.35);
          const c = centre(b.tile);
          pop("shipped", "bad", c.x, c.y);
          setLog((list) => [...list.slice(-2), { id: b.id, label: b.label, shipped: true }]);
        }
      }
      // the squashed and the shipped leave once their moment is over
      if (g.bugs.some((b) => (b.dead && g.t - b.dead > 0.5) || (b.shipped && g.t - b.shipped > 0.5))) {
        g.bugs = g.bugs.filter((b) => !((b.dead && g.t - b.dead > 0.5) || (b.shipped && g.t - b.shipped > 0.5)));
        changed = true;
      }
      // a new one where there's room, more often as the release gets close
      let alive = 0;
      for (const b of g.bugs) if (!b.dead && !b.shipped) alive += 1;
      const most = k < 0.3 ? 2 : k < 0.65 ? 3 : 4;
      if (g.t >= g.next && g.t < spec.seconds - 0.8 && alive < most) {
        const free = TILES.map((_, i) => i).filter((i) => !g.bugs.some((b) => b.tile === i));
        if (free.length) {
          g.id += 1;
          g.spawned += 1;
          const tile = free[Math.floor(g.rng() * free.length)];
          g.bugs.push({ id: g.id, tile, label: spec.bugs[(g.id - 1) % spec.bugs.length], born: g.t, life: lerp(3.1, 1.8, k), dead: 0, shipped: 0 });
          g.next = g.t + lerp(1.0, 0.42, k) * (0.8 + g.rng() * 0.4);
          changed = true;
        }
      }
      if (g.t >= spec.seconds) {
        // the build goes out with whatever's still crawling
        for (const b of g.bugs)
          if (!b.dead && !b.shipped) {
            b.shipped = g.t;
            g.shipped += 1;
          }
        g.combo = 0;
        sync();
        soundRef.current?.sting();
        return go("done");
      }
      if (changed) sync();
    },
    phase === "run",
  );

  const squash = (tile: number) => {
    const g = game.current;
    if (phaseRef.current === "brief") {
      soundRef.current?.confirm();
      return go("run");
    }
    if (phaseRef.current === "done") return ready() && onDone(g.squashed);
    const bug = g.bugs.find((b) => b.tile === tile && !b.dead && !b.shipped);
    const c = centre(tile);
    if (!bug) {
      g.combo = 0;
      sync();
      jolt(tiles.current[tile], 0.25);
      soundRef.current?.select();
      pop("miss", "ink", c.x, c.y);
      return;
    }
    bug.dead = g.t;
    g.squashed += 1;
    g.combo += 1;
    sync();
    setLog((list) => [...list.slice(-2), { id: bug.id, label: bug.label, shipped: false }]);
    soundRef.current?.splat();
    if (g.combo % 5 === 0) soundRef.current?.sparkle();
    pop(g.combo >= 3 ? `×${g.combo}` : "+1", g.combo >= 5 ? "great" : "good", c.x, c.y);
    punch(tiles.current[tile], 0.05);
  };
  usePress(() => squash(cursor));
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (screensPaused() || event.repeat) return;
      // three across, two down
      const key = event.key.toLowerCase();
      const move = key === "arrowleft" || key === "a" ? -1 : key === "arrowright" || key === "d" ? 1 : key === "arrowup" || key === "w" ? -3 : key === "arrowdown" || key === "s" ? 3 : 0;
      if (move) {
        event.preventDefault();
        event.stopImmediatePropagation();
        setCursor((c) => (c + move + TILES.length) % TILES.length);
        soundRef.current?.select();
        return;
      }
      const n = Number(event.key);
      if (n >= 1 && n <= TILES.length) {
        event.preventDefault();
        event.stopImmediatePropagation();
        setCursor(n - 1);
        squash(n - 1);
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  });

  const frac = tally.spawned ? tally.squashed / tally.spawned : 0;
  const rank: Rank = tally.spawned && tally.shipped === 0 ? "S" : rankOf(frac, [1, 0.8, 0.6]);
  return (
    <div className={kit.scrim} data-over={phase === "done" || undefined} onClick={() => (phase === "brief" || phase === "done") && squash(cursor)}>
      <div className={styles.ipad} data-wide="">
        <div className={styles.ipadScreen} ref={screen}>
          <header className={styles.alaiBar}>
            <b>alai</b>
            <span className={styles.build}>
              Bug bash · ships in <b ref={clock}>{CLOCKS[Math.min(99, spec.seconds)]}</b>
              <i data-run={phase !== "brief" || undefined} style={{ animationDuration: `${spec.seconds}s` }} />
            </span>
          </header>
          {phase === "brief" ? <Brief touch={touch} text="Bugs crawl down the six screens. Squash each one before it reaches the bottom and ships." /> : null}
          <div className={styles.tiles} data-idle={phase === "brief" || undefined}>
            {TILES.map((name, i) => {
              const bug = bugs.find((b) => b.tile === i);
              return (
                <button
                  key={name}
                  ref={(el) => {
                    tiles.current[i] = el;
                  }}
                  type="button"
                  className={styles.tile}
                  data-on={cursor === i || undefined}
                  data-shipped={bug?.shipped ? "" : undefined}
                  onPointerDown={(event) => {
                    event.stopPropagation();
                    setCursor(i);
                    squash(i);
                  }}
                  onPointerEnter={() => setCursor(i)}
                >
                  <small>
                    {touch ? null : <kbd>{i + 1}</kbd>} {name}
                  </small>
                  <span className={styles.lane}>
                    {bug ? (
                      <span className={styles.crawl} key={bug.id} data-dead={bug.dead ? "" : undefined} data-gone={bug.shipped ? "" : undefined} style={{ animationDuration: `${bug.life}s` }}>
                        <BugSprite />
                      </span>
                    ) : null}
                  </span>
                  <em data-bug={(bug && !bug.dead && !bug.shipped) || undefined} data-fixed={bug?.dead ? "" : undefined} data-shipped={bug?.shipped ? "" : undefined}>
                    {bug ? bug.label : "✓ fine"}
                  </em>
                </button>
              );
            })}
          </div>
          <div className={styles.fixed}>
            {log.map((b) => (
              <span key={b.id} data-shipped={b.shipped || undefined}>
                {b.shipped ? "shipped" : "fixed"}: {b.label}
              </span>
            ))}
            {tally.combo >= 2 ? (
              <b className={styles.combo} key={tally.combo}>
                ×{tally.combo}
              </b>
            ) : null}
          </div>
          <span className={kit.hint}>{touch ? "Tap a bug to squash it" : <>arrows or 1–6 to aim · <kbd>E</kbd> squash</>}</span>
          <Pops items={pops} />
        </div>
      </div>
      {phase === "done" ? (
        <Results
          game="bugbash"
          kicker="Bug bash · shipped"
          rank={rank}
          score={tally.squashed * 100 - tally.shipped * 10}
          label={`${tally.squashed} squashed · ${tally.shipped} shipped`}
          reason={rank === "S" ? "Nothing shipped that shouldn’t have." : rank === "A" ? "A couple for Monday’s sprint." : rank === "B" ? "Some got out. Users will say." : "The rest go in Monday’s sprint."}
          touch={touch}
          soundRef={soundRef}
        />
      ) : null}
    </div>
  );
}

