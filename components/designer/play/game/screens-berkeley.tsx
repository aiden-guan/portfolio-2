"use client";

/* eslint-disable @next/next/no-img-element */
import { useCallback, useEffect, useRef, useState } from "react";
import { face } from "./faces";
import { Hint, screensPaused, useArrows, usePress, Window, type Props } from "./screen-kit";
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

/** Answers to pick from: arrows and E, or a click, or a tap. */
function Choices({
  options,
  selected,
  reveal,
  onPick,
  onHover,
}: {
  options: Array<{ label: string; face?: string; who?: string }>;
  selected: number;
  reveal?: { right: number; picked: number } | null;
  onPick: (i: number) => void;
  onHover: (i: number) => void;
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
        </button>
      ))}
    </div>
  );
}

// —— a problem set, or a midterm: questions, answers, and (when sick) a
// room that won't hold still

function Study({ spec, soundRef, onDone, touch }: Props<Extract<BerkeleySpec, { kind: "study" }>>) {
  const [at, setAt] = useState(0);
  const [selected, setSelected] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [score, setScore] = useState(0);
  const [left, setLeft] = useState(spec.exam ?? 0);
  const [cough, setCough] = useState(0);
  const jolt = useRef<HTMLDivElement>(null);
  const total = spec.questions.length;
  // in an exam, time running out ends it too
  const timeUp = Boolean(spec.exam) && left === 0;
  const finished = at >= total || timeUp;
  const q = spec.questions[Math.min(at, total - 1)];

  // the clock, in an exam
  useEffect(() => {
    if (!spec.exam || finished) return;
    const id = window.setInterval(() => !screensPaused() && setLeft((s) => Math.max(0, s - 1)), 1000);
    return () => window.clearInterval(id);
  }, [spec.exam, finished]);
  useEffect(() => {
    if (timeUp) soundRef.current?.alarm();
  }, [timeUp, soundRef]);

  // coughing, now and then
  useEffect(() => {
    if (!spec.sick || finished) return;
    let id = 0;
    const next = () => {
      id = window.setTimeout(() => {
        if (!screensPaused()) {
          setCough((n) => n + 1);
          soundRef.current?.cough();
          jolt.current?.animate(
            [{ transform: "none" }, { transform: "translate(-6px, 3px) rotate(-0.8deg)" }, { transform: "translate(5px, -2px) rotate(0.5deg)" }, { transform: "none" }],
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
    if (finished || picked !== null) return;
    setSelected(i);
    setPicked(i);
    const right = i === q.answer;
    if (right) {
      setScore((s) => s + 1);
      soundRef.current?.coin();
    } else soundRef.current?.nope();
    window.setTimeout(() => {
      setPicked(null);
      setSelected(0);
      setAt((n) => n + 1);
    }, right ? 750 : 1300);
  };
  usePress(() => (finished ? onDone(score) : picked === null ? pick(selected) : undefined));
  useArrows((step) => {
    if (finished || picked !== null) return;
    setSelected((s) => (s + step + q.options.length) % q.options.length);
    soundRef.current?.select();
  });

  const clock = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`;
  const body = finished ? (
    <div className={styles.studyDone}>
      <small>{spec.exam ? "Pencils down" : "Done for tonight"}</small>
      <strong>
        {score} / {total}
      </strong>
      <span>{score === total ? "Every one." : score >= total - 1 ? "Close enough to sleep on." : "Tomorrow, again."}</span>
      <Hint touch={touch} label="continue" />
    </div>
  ) : (
    <>
      <div className={styles.qHead}>
        <span>{spec.subject}</span>
        <span>
          {at + 1} of {total}
        </span>
        {spec.exam ? <b data-low={left < 10 || undefined}>{clock}</b> : null}
      </div>
      <p className={styles.question} key={at}>
        {q.q}
      </p>
      <Choices
        options={q.options.map((label) => ({ label }))}
        selected={selected}
        reveal={picked === null ? null : { right: q.answer, picked }}
        onPick={pick}
        onHover={(i) => picked === null && setSelected(i)}
      />
      <div className={styles.dots}>
        {spec.questions.map((_, i) => (
          <i key={i} data-done={i < at || undefined} data-now={i === at || undefined} />
        ))}
      </div>
      <span className={kit.hint}>{touch ? "Tap an answer" : <>arrows to choose · <kbd>E</kbd> answer</>}</span>
    </>
  );

  return (
    <div className={kit.scrim} data-sick={spec.sick || undefined} onClick={() => finished && onDone(score)}>
      {spec.sick ? <div className={styles.fever} aria-hidden="true" /> : null}
      <div className={styles.sway} data-sick={spec.sick || undefined}>
        <div className={styles.jolt} ref={jolt}>
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
    </div>
  );
}

// —— BarkOff: two webcams, one question. They bark; you answer, on the beat

function Bark({ spec, soundRef, onDone, touch, photo }: Props<Extract<BerkeleySpec, { kind: "bark" }>> & { photo?: string }) {
  const [round, setRound] = useState(0);
  const [turn, setTurn] = useState<"them" | "you" | "result">("them");
  const [result, setResult] = useState<null | "AWOOOO" | "WOOF" | "yip.">(null);
  const [tug, setTug] = useState(0);
  const [score, setScore] = useState(0);
  const needle = useRef<HTMLElement>(null);
  const pos = useRef(0);
  const finished = round >= spec.rounds;

  // the challenger goes first
  useEffect(() => {
    if (finished || turn !== "them") return;
    const a = window.setTimeout(() => soundRef.current?.bark(4 + round), 350);
    const b = window.setTimeout(() => soundRef.current?.bark(2 + round), 620);
    const c = window.setTimeout(() => setTurn("you"), 1500);
    return () => [a, b, c].forEach((id) => window.clearTimeout(id));
  }, [turn, round, finished, soundRef]);

  // then the meter, faster each round
  useEffect(() => {
    if (turn !== "you") return;
    const start = performance.now();
    const speed = 0.9 + round * 0.35;
    let raf = 0;
    const frame = () => {
      const t = (performance.now() - start) / 1000;
      pos.current = Math.abs(((t * speed + 1) % 2) - 1);
      if (needle.current) needle.current.style.left = `${(pos.current * 100).toFixed(1)}%`;
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [turn, round]);

  const bark = () => {
    if (finished) return onDone(score);
    if (turn !== "you") return;
    const p = pos.current;
    const r = p > 0.86 ? "AWOOOO" : p > 0.62 ? "WOOF" : "yip.";
    setResult(r);
    setTurn("result");
    soundRef.current?.bark(r === "AWOOOO" ? -5 : r === "WOOF" ? 0 : 9);
    if (r === "AWOOOO") window.setTimeout(() => soundRef.current?.bark(-7), 180);
    const gain = r === "AWOOOO" ? 2 : r === "WOOF" ? 1 : -1;
    setScore((s) => s + Math.max(0, gain));
    setTug((t) => Math.max(-3, Math.min(6, t + gain)));
    window.setTimeout(() => {
      setResult(null);
      setRound((n) => n + 1);
      setTurn("them");
      if (round + 1 >= spec.rounds) soundRef.current?.sting();
    }, 1500);
  };
  usePress(bark);

  const challenger = face("judge");
  return (
    <div className={kit.scrim} onPointerDown={() => !finished && bark()} onClick={() => finished && bark()}>
      <Window title="BarkOff · live" wide>
        <div className={styles.bark}>
          <div className={styles.cams}>
            <figure data-talking={turn === "result" || undefined}>
              {photo ? <img src={photo} alt="" /> : null}
              <figcaption>You</figcaption>
              <div className={styles.wave} data-size={turn === "result" ? result : undefined}>
                {Array.from({ length: 9 }, (_, i) => (
                  <i key={i} style={{ "--i": i } as React.CSSProperties} />
                ))}
              </div>
              {result ? <strong className={styles.barkWord}>{result}</strong> : null}
            </figure>
            <span className={styles.vs}>VS</span>
            <figure data-talking={(turn === "them" && !finished) || undefined}>
              {challenger ? <img src={challenger} alt="" /> : null}
              <figcaption>Challenger</figcaption>
              <div className={styles.wave} data-size={turn === "them" && !finished ? "WOOF" : undefined}>
                {Array.from({ length: 9 }, (_, i) => (
                  <i key={i} style={{ "--i": i } as React.CSSProperties} />
                ))}
              </div>
              {turn === "them" && !finished ? <strong className={styles.barkWord}>WOOF!</strong> : null}
            </figure>
          </div>
          <div className={styles.crowd}>
            <small>The room</small>
            <span>
              <i style={{ width: `${Math.round(50 + tug * 8)}%` }} />
            </span>
          </div>
          {finished ? (
            <div className={styles.barkDone}>
              <strong>{score >= spec.rounds ? "Best bark in the room." : "The room's on your side. Barely."}</strong>
              <Hint touch={touch} label="continue" />
            </div>
          ) : (
            <div className={styles.barkMeter} data-live={turn === "you" || undefined}>
              <div className={styles.track}>
                <i className={styles.good} />
                <i className={styles.great} />
                <i className={styles.needle} ref={needle} />
              </div>
              <span className={kit.hint}>
                {turn === "you" ? (touch ? "Tap to bark, in the gold" : <><kbd>E</kbd> bark, in the gold</>) : `Round ${round + 1} of ${spec.rounds} · they bark first`}
              </span>
            </div>
          )}
        </div>
      </Window>
    </div>
  );
}

// —— alai: find the step where the working goes wrong, before it's too late

function WrongStep({ spec, soundRef, onDone, touch }: Props<Extract<BerkeleySpec, { kind: "wrongstep" }>>) {
  const [at, setAt] = useState(0);
  const [selected, setSelected] = useState(0);
  const [found, setFound] = useState(false);
  const [miss, setMiss] = useState(0);
  const [firstTry, setFirstTry] = useState(0);
  const missed = useRef(false);
  const finished = at >= spec.problems.length;
  const p = spec.problems[Math.min(at, spec.problems.length - 1)];

  const check = (i: number) => {
    if (finished) return onDone(firstTry);
    if (found) {
      setFound(false);
      setSelected(0);
      missed.current = false;
      setAt((n) => n + 1);
      return;
    }
    setSelected(i);
    if (i === p.wrong) {
      setFound(true);
      if (!missed.current) setFirstTry((n) => n + 1);
      soundRef.current?.chime();
    } else {
      missed.current = true;
      setMiss((n) => n + 1);
      soundRef.current?.nope();
    }
  };
  usePress(() => check(selected));
  useArrows((step) => {
    if (found || finished) return;
    setSelected((s) => (s + step + p.steps.length) % p.steps.length);
    soundRef.current?.select();
  });

  return (
    <div className={kit.scrim} onClick={() => (finished || found) && check(selected)}>
      <div className={styles.ipad}>
        <div className={styles.ipadScreen}>
          <header className={styles.alaiBar}>
            <b>alai</b>
            <span>{finished ? "Session done" : `Problem ${at + 1} of ${spec.problems.length}`}</span>
          </header>
          {finished ? (
            <div className={styles.studyDone}>
              <small>Wrong steps caught</small>
              <strong>
                {firstTry} / {spec.problems.length}
              </strong>
              <span>On the first try. The tutor never gave the answer away.</span>
              <Hint touch={touch} label="continue" />
            </div>
          ) : (
            <>
              <p className={styles.prompt}>{p.prompt}</p>
              <ol className={styles.steps} key={`${at}-${miss}`} data-shake={miss > 0 || undefined}>
                {p.steps.map((s, i) => (
                  <li
                    key={s}
                    data-on={selected === i || undefined}
                    data-wrong={(found && i === p.wrong) || undefined}
                    onPointerEnter={() => !found && setSelected(i)}
                    onClick={(event) => {
                      event.stopPropagation();
                      check(i);
                    }}
                    style={{ "--tilt": `${((i * 37) % 5) - 2}` } as React.CSSProperties}
                  >
                    {s}
                  </li>
                ))}
              </ol>
              <div className={styles.nudge} data-shown={found || undefined}>
                <i aria-hidden="true" />
                <span>{found ? p.nudge : "Which step is wrong? Circle it."}</span>
              </div>
              <span className={kit.hint}>{found ? (touch ? "Tap for the next one" : <><kbd>E</kbd> next problem</>) : touch ? "Tap the wrong step" : <><kbd>E</kbd> circle the wrong step</>}</span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// —— Continuity: a long thread, and the few facts a fresh agent needs from it

function Thread({ spec, soundRef, onDone, touch }: Props<Extract<BerkeleySpec, { kind: "thread" }>>) {
  const [at, setAt] = useState(0);
  const [selected, setSelected] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [score, setScore] = useState(0);
  const finished = at >= spec.questions.length;
  const q = spec.questions[Math.min(at, spec.questions.length - 1)];

  const pick = (i: number) => {
    if (finished) return onDone(score);
    if (picked !== null) return;
    setPicked(i);
    if (i === q.answer) {
      setScore((s) => s + 1);
      soundRef.current?.coin();
    } else soundRef.current?.nope();
    window.setTimeout(() => {
      setPicked(null);
      setSelected(0);
      setAt((n) => n + 1);
      if (at + 1 >= spec.questions.length) soundRef.current?.sting();
    }, 1100);
  };
  usePress(() => (picked === null ? pick(selected) : undefined));
  useArrows((step) => {
    if (finished || picked !== null) return;
    setSelected((s) => (s + step + q.options.length) % q.options.length);
    soundRef.current?.select();
  });

  return (
    <div className={kit.scrim} onClick={() => finished && onDone(score)}>
      <Window title="Continuity · thread memory" wide>
        <div className={styles.thread}>
          <section className={styles.mails}>
            <header>{spec.subject}</header>
            {spec.emails.map((m, i) => (
              <article key={i} style={{ "--d": `${i * 120}ms` } as React.CSSProperties}>
                <b>{m.from}</b>
                <small>{m.time}</small>
                <p>{m.text}</p>
              </article>
            ))}
          </section>
          <section className={styles.state}>
            <header>Handoff state</header>
            <div className={styles.pins}>
              {spec.pins.slice(0, at).map((pin) => (
                <span key={pin}>{pin}</span>
              ))}
            </div>
            {finished ? (
              <div className={styles.handoff}>
                <strong>Handoff ready</strong>
                <span>One call for the next agent, not twenty emails.</span>
                <Hint touch={touch} label="continue" />
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
    </div>
  );
}

// —— an email, read one line at a time

function Email({ spec, soundRef, onDone, touch }: Props<Extract<BerkeleySpec, { kind: "email" }>>) {
  const [shown, setShown] = useState(0);
  const done = shown >= spec.lines.length;
  useEffect(() => {
    soundRef.current?.notify();
  }, [soundRef]);
  useEffect(() => {
    if (done) return;
    const id = window.setTimeout(() => setShown((n) => n + 1), shown === 0 ? 700 : 900 + spec.lines[shown - 1].length * 12);
    return () => window.clearTimeout(id);
  }, [shown, done, spec.lines]);
  const press = () => (done ? onDone() : setShown(spec.lines.length));
  usePress(press);
  return (
    <div className={kit.scrim} onClick={press}>
      <Window title={spec.app ?? "Mail"} wide>
        <div className={styles.email} data-tone={spec.tone}>
          <header>
            <i>{spec.from.slice(0, 1)}</i>
            <div>
              <b>{spec.from}</b>
              <strong>{spec.subject}</strong>
            </div>
          </header>
          <div className={styles.body}>
            {spec.lines.slice(0, shown).map((line, i) => (
              <p key={i} data-key={/unfortunately|congratulations|not to move forward|your score/i.test(line) || undefined}>
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

// —— a video call: the partner asks, the two of you answer

function Call({ spec, soundRef, onDone, touch, photo }: Props<Extract<BerkeleySpec, { kind: "call" }>> & { photo?: string }) {
  const [at, setAt] = useState(0);
  const [phase, setPhase] = useState<"ask" | "answer" | "reply" | "outro" | "ended">("ask");
  const [selected, setSelected] = useState(0);
  const [picks, setPicks] = useState<number[]>([]);
  const [typed, setTyped] = useState(0);
  const [seconds, setSeconds] = useState(0);
  const total = spec.questions.length;
  const q = spec.questions[Math.min(at, total - 1)];
  const caption = phase === "ask" || phase === "answer" ? q.q : phase === "reply" ? q.replies[picks[at] ?? 0] : spec.outro;
  const speaking = phase === "ask" || phase === "reply" || phase === "outro";
  const full = typed >= caption.length;

  useEffect(() => {
    const id = window.setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => window.clearInterval(id);
  }, []);
  useEffect(() => {
    if (!speaking) return;
    let n = 0;
    const id = window.setInterval(() => {
      n += 1;
      setTyped(n);
      if (n % 3 === 0) soundRef.current?.blip(-5 + (n % 2));
      if (n >= caption.length) window.clearInterval(id);
    }, 24);
    return () => window.clearInterval(id);
  }, [caption, speaking, soundRef]);

  const advance = () => {
    if (phase === "ended") return onDone(picks);
    if (speaking && !full) return setTyped(caption.length);
    if (phase === "ask") {
      setPhase("answer");
      return;
    }
    if (phase === "answer") {
      soundRef.current?.confirm();
      setPicks((p) => [...p, selected]);
      setTyped(0);
      setPhase("reply");
      return;
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
          <div className={styles.host} data-talking={(speaking && !full) || undefined}>
            <img src={face(spec.host.face)} alt="" />
            <span className={styles.tag}>{spec.host.name}</span>
            <span className={styles.rec}>
              <i /> {clock}
            </span>
          </div>
          <div className={styles.guests}>
            <figure>
              {photo ? <img src={photo} alt="" /> : null}
              <figcaption>Aiden</figcaption>
            </figure>
            {spec.guests.map((g) => (
              <figure key={g.name}>
                <img src={face(g.face)} alt="" />
                <figcaption>{g.name}</figcaption>
              </figure>
            ))}
          </div>
          {phase === "ended" ? (
            <div className={styles.ended}>
              <strong>Call ended</strong>
              <Hint touch={touch} label="continue" />
            </div>
          ) : (
            <div className={styles.caption}>
              <p>
                {caption.slice(0, speaking ? typed : caption.length)}
                {speaking && !full ? <span className={styles.rest}>{caption.slice(typed)}</span> : null}
              </p>
              {phase === "answer" ? (
                <Choices
                  options={q.options.map((o) => ({ label: o.label, who: o.who === "aiden" ? "Aiden" : o.who.charAt(0).toUpperCase() + o.who.slice(1), face: o.who === "aiden" ? photo : face(o.who) }))}
                  selected={selected}
                  onPick={(i) => {
                    setSelected(i);
                    soundRef.current?.confirm();
                    setPicks((p) => [...p, i]);
                    setTyped(0);
                    setPhase("reply");
                  }}
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
        </div>
      </Window>
    </div>
  );
}

// —— an application: each press writes the next answer, then send it

function Form({ spec, soundRef, onDone, touch }: Props<Extract<BerkeleySpec, { kind: "form" }>>) {
  const [field, setField] = useState(0);
  const [typed, setTyped] = useState(0);
  const [sent, setSent] = useState(false);
  const total = spec.fields.length;
  const current = spec.fields[Math.min(field, total - 1)];
  const writing = field < total && typed < current.answer.length;
  const list = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (field >= total) return;
    let n = 0;
    const id = window.setInterval(() => {
      n += 2;
      setTyped(Math.min(n, current.answer.length));
      if (n % 4 === 0) soundRef.current?.keys();
      if (n >= current.answer.length) window.clearInterval(id);
    }, 26);
    return () => window.clearInterval(id);
  }, [field, total, current.answer, soundRef]);
  useEffect(() => {
    list.current?.querySelector("[data-now]")?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [field]);

  const press = useCallback(() => {
    if (sent) return onDone();
    if (writing) return setTyped(current.answer.length);
    if (field < total) {
      soundRef.current?.select();
      setTyped(0);
      setField((n) => n + 1);
      return;
    }
    soundRef.current?.sting();
    setSent(true);
  }, [sent, writing, current.answer.length, field, total, onDone, soundRef]);
  usePress(press);

  return (
    <div className={kit.scrim} onClick={press}>
      <Window title={spec.title} wide>
        <div className={styles.form} style={{ "--accent": spec.accent ?? "#2f6be8" } as React.CSSProperties}>
          <div className={styles.fields} ref={list}>
            {spec.fields.map((f, i) => (
              <label key={f.label} data-now={i === field || undefined} data-done={i < field || undefined}>
                <span>{f.label}</span>
                <p>
                  {i < field ? f.answer : i === field ? f.answer.slice(0, typed) : ""}
                  {i === field && writing ? <i className={kit.caret} /> : null}
                </p>
              </label>
            ))}
          </div>
          <footer>
            {sent ? (
              <span className={styles.sent}>✓ {spec.done}</span>
            ) : (
              <button type="button" className={styles.submit} data-ready={field >= total || undefined}>
                {touch ? null : <kbd>E</kbd>} {field >= total ? spec.submit : "Next answer"}
              </button>
            )}
            {sent ? <Hint touch={touch} label="continue" /> : null}
          </footer>
        </div>
      </Window>
    </div>
  );
}

// —— the bug bash: bugs turn up on alai's screens; squash them before they ship

const TILES = ["Camera", "Pencil", "Voice", "Steps", "Hints", "Sync"];

function Bugs({ spec, soundRef, onDone, touch }: Props<Extract<BerkeleySpec, { kind: "bugs" }>>) {
  const [bugs, setBugs] = useState<Array<{ id: number; tile: number; label: string; born: number }>>([]);
  const [cursor, setCursor] = useState(0);
  const [squashed, setSquashed] = useState<Array<{ id: number; label: string }>>([]);
  const [left, setLeft] = useState(spec.seconds);
  const [spawned, setSpawned] = useState(0);
  const finished = left <= 0;
  const next = useRef(0);
  const live = useRef<Array<{ id: number; tile: number; label: string; born: number }>>([]);

  useEffect(() => {
    if (finished) return;
    const id = window.setInterval(() => !screensPaused() && setLeft((s) => s - 1), 1000);
    return () => window.clearInterval(id);
  }, [finished]);
  useEffect(() => {
    if (finished) return;
    const id = window.setInterval(() => {
      if (screensPaused()) return;
      // the ones nobody caught crawl off; a new one turns up where there's room
      const now = performance.now();
      const alive = live.current.filter((b) => now - b.born < 2600);
      const free = TILES.map((_, i) => i).filter((i) => !alive.some((b) => b.tile === i));
      if (free.length && alive.length < 3) {
        next.current += 1;
        alive.push({ id: next.current, tile: free[Math.floor(Math.random() * free.length)], label: spec.bugs[next.current % spec.bugs.length], born: now });
        setSpawned((n) => n + 1);
      }
      live.current = alive;
      setBugs(alive);
    }, 750);
    return () => window.clearInterval(id);
  }, [finished, spec.bugs]);

  const squash = (tile: number) => {
    if (finished) return onDone(squashed.length);
    const bug = bugs.find((b) => b.tile === tile);
    if (!bug) {
      soundRef.current?.select();
      return;
    }
    soundRef.current?.coin();
    live.current = live.current.filter((b) => b.id !== bug.id);
    setBugs(live.current);
    setSquashed((list) => [...list, { id: bug.id, label: bug.label }]);
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
        setCursor(n - 1);
        squash(n - 1);
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  });

  return (
    <div className={kit.scrim} onClick={() => finished && onDone(squashed.length)}>
      <div className={styles.ipad} data-wide="">
        <div className={styles.ipadScreen}>
          <header className={styles.alaiBar}>
            <b>alai</b>
            <span>Bug bash · {finished ? "shipped" : `0:${String(Math.max(0, left)).padStart(2, "0")}`}</span>
          </header>
          {finished ? (
            <div className={styles.studyDone}>
              <small>Squashed</small>
              <strong>
                {squashed.length} / {Math.max(squashed.length, spawned)}
              </strong>
              <span>{squashed.length >= spawned * 0.7 ? "Cleaner than any tutor out there." : "The rest go in Monday’s sprint."}</span>
              <Hint touch={touch} label="continue" />
            </div>
          ) : (
            <>
              <div className={styles.tiles}>
                {TILES.map((name, i) => {
                  const bug = bugs.find((b) => b.tile === i);
                  return (
                    <button key={name} type="button" className={styles.tile} data-on={cursor === i || undefined} onPointerDown={() => squash(i)} onPointerEnter={() => setCursor(i)}>
                      <small>
                        {touch ? null : <kbd>{i + 1}</kbd>} {name}
                      </small>
                      {bug ? (
                        <span className={styles.bug} key={bug.id}>
                          <i aria-hidden="true" />
                          {bug.label}
                        </span>
                      ) : (
                        <em>✓ fine</em>
                      )}
                    </button>
                  );
                })}
              </div>
              <div className={styles.fixed}>
                {squashed.slice(-3).map((b) => (
                  <span key={b.id}>fixed: {b.label}</span>
                ))}
              </div>
              <span className={kit.hint}>{touch ? "Tap a bug to squash it" : <>arrows or 1–6 to aim · <kbd>E</kbd> squash</>}</span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
