"use client";

/* eslint-disable @next/next/no-img-element */
import { useEffect, useRef, useState, type CSSProperties, type RefObject } from "react";
import type { Sound } from "../../sound";
import { SPEAKERS, type Line } from "../chapters/types";
import type { TextSpeed } from "../save";
import { useLingering } from "./motion";
import { CHEVRON, Pixels } from "./pixels";
import styles from "./dialogue.module.css";

// The dialogue box. It stays up through a whole exchange: each line types
// in, a new speaker's portrait and name tag arrive with them, and the box
// only leaves when the talking does. Text types at the reader's speed, with
// a beat at the end of a clause, and a blip of the speaker's voice.

export type Talk = { id: number; list: Line[]; at: number; then?: () => void; choices?: Array<{ label: string; who?: string }>; pick?: (i: number) => void };
export type Typing = { done: boolean; finish: () => void };

/** How long a letter takes, and the beat after a comma or a full stop. */
const PACE: Record<Exclude<TextSpeed, "instant">, { letter: number; comma: number; stop: number }> = {
  normal: { letter: 22, comma: 120, stop: 260 },
  fast: { letter: 8, comma: 36, stop: 80 },
};

const CLOSERS = "”’\")]";

/** The pause after letter `i`: at the end of a clause, never inside "7:00". */
function beatAfter(text: string, i: number, pace: { comma: number; stop: number }) {
  if (text[i] === "…" && text[i + 1] !== undefined) return pace.stop;
  if (text[i + 1] !== " ") return 0;
  let j = i;
  while (j > 0 && CLOSERS.includes(text[j])) j -= 1;
  const c = text[j];
  if (c === "." || c === "!" || c === "?" || c === "…") return pace.stop;
  if (c === "," || c === ";" || c === ":" || c === "—") return pace.comma;
  return 0;
}

const DONE: Typing = { done: true, finish: () => {} };

/** Types `text` out a letter at a time; returns how many letters show. */
function useTyping(key: string, text: string, speed: TextSpeed, pitch: number | null, pausedRef: RefObject<boolean>, typingRef: RefObject<Typing>, soundRef: RefObject<Sound | null>) {
  const start = speed === "instant" ? text.length : 0;
  const [state, setState] = useState({ key, shown: start });
  if (state.key !== key) setState({ key, shown: start });
  // where the line had got to, so a change of speed carries on from there
  const progress = useRef({ key: "", n: 0 });

  useEffect(() => {
    if (!key) return;
    const length = text.length;
    let n = progress.current.key === key ? progress.current.n : 0;
    if (speed === "instant") n = length;
    let raf = 0;
    const show = (count: number) => {
      n = count;
      progress.current = { key, n };
      setState({ key, shown: count });
    };
    const finish = () => {
      cancelAnimationFrame(raf);
      show(length);
      typingRef.current = DONE;
    };
    if (n >= length) {
      finish();
      return;
    }
    typingRef.current = { done: false, finish };
    const pace = PACE[speed === "instant" ? "normal" : speed];
    let due = performance.now() + pace.letter;
    let held = 0;
    let since = 0;
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      // paused: hold the line where it is, and pick up exactly there
      if (pausedRef.current) {
        if (!held) held = now;
        return;
      }
      if (held) {
        due += now - held;
        held = 0;
      }
      // after a long stall (a hidden tab), carry on rather than dump the rest
      if (now - due > 250) due = now;
      let next = n;
      while (next < length && now >= due) {
        next += 1;
        due += pace.letter + beatAfter(text, next - 1, pace);
      }
      if (next === n) return;
      since += next - n;
      show(next);
      // the voice: a blip every few letters, never on a space
      if (pitch !== null && since >= 3 && /[\p{L}\p{N}]/u.test(text[next - 1])) {
        since = 0;
        soundRef.current?.blip(pitch + (next % 2));
      }
      if (next >= length) finish();
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      typingRef.current = DONE;
    };
  }, [key, text, speed, pitch, pausedRef, typingRef, soundRef]);

  return state.key === key ? state.shown : start;
}

export function Dialogue({
  talk,
  speed,
  touch,
  pausedRef,
  typingRef,
  soundRef,
  faceOf,
  selected,
  confirming,
  onNext,
  onChoices,
  onPick,
  onHover,
}: {
  talk: Talk | null;
  speed: TextSpeed;
  touch: boolean;
  pausedRef: RefObject<boolean>;
  typingRef: RefObject<Typing>;
  soundRef: RefObject<Sound | null>;
  faceOf: (who: string | undefined) => string | undefined;
  selected: number;
  /** The answer that's been picked, while the box takes it in. */
  confirming: number | null;
  onNext: () => void;
  onChoices: () => void;
  onPick: (i: number) => void;
  onHover: (i: number) => void;
}) {
  const { shown: current, leaving } = useLingering(talk, 170);
  const line = current ? current.list[current.at] : null;
  const key = current ? `${current.id}-${current.at}` : "";
  const text = line?.text ?? "";
  const speaker = line ? (SPEAKERS[line.who] ?? SPEAKERS.note) : SPEAKERS.note;
  const note = line?.who === "note";
  const count = useTyping(key, text, speed, note || !line ? null : speaker.pitch, pausedRef, typingRef, soundRef);
  const typed = count >= text.length;
  const choices = current?.choices;
  const offer = Boolean(choices) && typed;

  // answers take a beat before they'll take a press, so mashing through the
  // lines never picks one unseen; they light up once they're ready
  const [armed, setArmed] = useState("");
  useEffect(() => {
    if (!offer) return;
    onChoices();
    const id = window.setTimeout(() => setArmed(key), 320);
    return () => window.clearTimeout(id);
  }, [offer, key, onChoices]);

  if (!current || !line) return null;
  const face = faceOf(line.who);
  const more = current.at < current.list.length - 1;
  return (
    <div
      className={styles.box}
      data-ui=""
      data-note={note || undefined}
      data-leaving={leaving || undefined}
      data-choosing={offer || undefined}
      onClick={offer || leaving ? undefined : onNext}
      role="group"
      aria-label={speaker.name || "Narration"}
    >
      {/* read out whole, once, rather than a letter at a time */}
      <span className={styles.sr} aria-live="polite">
        {speaker.name ? `${speaker.name}: ` : ""}
        {text}
      </span>
      {note ? null : (
        <div key={`face-${line.who}`} className={styles.face} data-talking={!typed || undefined}>
          {face ? <img src={face} alt="" /> : <span className={styles.faceIcon} />}
        </div>
      )}
      {speaker.name ? (
        <span key={`name-${line.who}`} className={styles.name} data-tag={speaker.tag}>
          {speaker.name}
        </span>
      ) : null}
      <div className={styles.speech}>
        <p key={key} className={styles.text} aria-hidden="true">
          {text.slice(0, count)}
          <span className={styles.rest}>{text.slice(count)}</span>
        </p>
        {offer && choices ? (
          <div className={styles.choices} role="listbox" aria-label="Answers" data-armed={armed === key || undefined} data-confirming={confirming !== null || undefined}>
            {choices.map((c, i) => (
              <button
                key={c.label}
                type="button"
                role="option"
                aria-selected={selected === i}
                className={styles.choice}
                data-on={selected === i || undefined}
                data-picked={confirming === i || undefined}
                style={{ "--i": i } as CSSProperties}
                onPointerEnter={() => onHover(i)}
                onFocus={() => onHover(i)}
                onClick={(event) => {
                  event.stopPropagation();
                  onPick(i);
                }}
              >
                {c.who ? <img src={faceOf(c.who)} alt="" /> : null}
                <span className={styles.answer}>
                  {c.who ? <b>{SPEAKERS[c.who]?.name}</b> : null}
                  {c.label}
                </span>
                {touch ? null : <kbd aria-hidden="true">{selected === i ? "E" : i + 1}</kbd>}
              </button>
            ))}
          </div>
        ) : null}
      </div>
      {choices ? null : (
        <span className={styles.more} data-shown={typed || undefined} aria-hidden="true">
          {more && !touch ? <small>hold E to skip</small> : null}
          <Pixels art={CHEVRON} className={styles.chevron} />
        </span>
      )}
    </div>
  );
}
