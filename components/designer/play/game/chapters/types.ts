import type { Vector3 } from "three";
import type { Sound } from "../../sound";
import type { Look } from "../people";
import type { ScreenSpec } from "../screens";
import type { ActorSpec, Stage } from "../stage";
import type { WingmanResult } from "../wingman";
import type { EventId } from "../rooms/hackathon";

// How a chapter is written. A chapter is a few acts (each one a place the
// player can continue from), what each step asks of the player, and what
// using things does. It talks to the game through a Ctx, and most of what
// it does reads as a script: say this, open that, walk there, wait.

export type ChapterId = "prologue" | "ch1" | "ch2" | "ch3" | "ch4";

export type Line = { who: string; text: string };

export type SceneId = "bedroom" | "street" | "hallway" | "auditorium" | "field" | "dorm" | "hall" | "glade" | "hackathon" | "office";

export type SceneSetup = {
  id: SceneId;
  night?: boolean;
  /** Things to show (the bedroom's board, the dorm's tissues…), hallway trophies. */
  features?: string[];
  trophies?: number;
  /** The lecture hall as a lecture or a midterm: the course on the board, and which midterm. */
  hall?: "lecture" | "exam";
  slide?: string;
  exam?: string;
  /** Which hackathon. */
  event?: EventId;
  /** The office at golden hour or later. */
  dusk?: boolean;
  lying?: boolean;
  dog?: "bed" | "follow" | false;
  actors?: ActorSpec[];
  at?: Vector3;
  heading?: number;
  hero?: Look;
  /** The card that says where and when, on arriving. */
  banner?: { place: string; time: string };
  /** The HUD's day, and its clock in minutes since midnight. */
  day: string;
  clock: number;
};

export type Ctx = {
  step: () => string;
  go: (step: string) => void;
  say: (lines: Line[]) => Promise<void>;
  /** A question in the dialogue box, with answers to pick from. */
  choose: (prompt: Line, options: Array<{ label: string; who?: string }>) => Promise<number>;
  open: <T = unknown>(screen: ScreenSpec) => Promise<T>;
  scene: (setup: SceneSetup) => Promise<void>;
  stage: () => Stage;
  wait: (ms: number) => Promise<void>;
  /** Money in the wallet, with the little +$ that floats up. */
  earn: (amount: number) => void;
  stat: (name: "members" | "revenue" | "ready" | "wins", value: number, ms?: number) => void;
  hearts: (who: "john" | "jerry", value: number) => void;
  /** A word over someone's head (or a point), for a moment. */
  bubble: (target: string | Vector3, text: string, ms?: number) => void;
  glint: () => void;
  sound: () => Sound | null;
  /** Wingman: takes over the world until it's played, then hands it back. */
  minigame: (id: "wingman") => Promise<WingmanResult>;
  /** Where Continue will pick up from. */
  checkpoint: (act: number) => void;
  end: () => void;
};

export type Stats = { money: number; members?: number; revenue?: number; hearts?: { john: number; jerry: number }; ready?: number; wins?: number };

export type Chapter = {
  id: ChapterId;
  number: string;
  title: string;
  /** One line, for the Chapters screen. */
  line: string;
  /** The few lines on paper before the title card. */
  intro: string[];
  /** What the HUD shows besides the clock: the wallet (unless it's off), members, a revenue goal,
   * friendship, a readiness bar (its label), and a count of first places. */
  hud: { money?: boolean; members?: boolean | string; goal?: number; hearts?: boolean; ready?: string; wins?: boolean };
  /** Each act starts the chapter from somewhere; the stats it starts with. */
  acts: Array<{ stats: Stats; run: (ctx: Ctx) => Promise<void> | void }>;
  objectives: Record<string, string>;
  /** What each step points at: the marker floats over it. */
  targets?: Record<string, string>;
  use: (id: string, ctx: Ctx) => Promise<void> | void;
  /** Pressing use while lying in bed. */
  wake?: (ctx: Ctx) => Promise<void> | void;
  end: {
    title: string;
    /** The last chapter there is, for now: the card says so. */
    tbc?: boolean;
    stats: Array<[string, string]>;
    next: { number: string; title: string; line: string; chapter?: ChapterId };
  };
};

export type Speaker = { name: string; tag: "cobalt" | "orange" | "ink" | "green" | "denim" | "red" | "gold"; pitch: number; face?: string };

/** Who can speak, how their name tag looks, the pitch of their voice, and
 * their portrait (a photo for Aiden and Phoebe, drawn for everyone else). */
export const SPEAKERS: Record<string, Speaker> = {
  aiden: { name: "Aiden", tag: "cobalt", pitch: 0, face: "photo:aiden" },
  phoebe: { name: "Phoebe", tag: "orange", pitch: 9, face: "photo:phoebe" },
  phone: { name: "Phone", tag: "ink", pitch: -6, face: "phone" },
  note: { name: "", tag: "ink", pitch: -6 },
  john: { name: "John", tag: "denim", pitch: -3, face: "john" },
  jerry: { name: "Jerry", tag: "green", pitch: 5, face: "jerry" },
  editor: { name: "Raymond", tag: "red", pitch: -2, face: "editor" },
  kingcop: { name: "kingcop", tag: "red", pitch: -8, face: "kingcop" },
  camper: { name: "Camper", tag: "orange", pitch: 2, face: "camper" },
  judge: { name: "Judge", tag: "ink", pitch: -5, face: "judge" },
  principal: { name: "Principal", tag: "gold", pitch: -4, face: "principal" },
  chatter: { name: "Chatter", tag: "ink", pitch: -6, face: "chatter" },
  allen: { name: "Allen", tag: "gold", pitch: -1, face: "allen" },
  miles: { name: "Miles", tag: "denim", pitch: -3, face: "miles" },
  jun: { name: "Jun", tag: "green", pitch: 7, face: "jun" },
  dylan: { name: "Dylan", tag: "ink", pitch: 1, face: "dylan" },
  samuel: { name: "Samuel", tag: "green", pitch: -2, face: "samuel" },
  floormate: { name: "Floormate", tag: "orange", pitch: 3, face: "floormate" },
  floormate2: { name: "Floormate", tag: "green", pitch: 7, face: "floormate2" },
  professor: { name: "Professor", tag: "ink", pitch: -6, face: "professor" },
  proctor: { name: "Proctor", tag: "ink", pitch: -4, face: "proctor" },
  partner: { name: "Partner", tag: "ink", pitch: -5, face: "partner" },
  founder: { name: "Founder", tag: "cobalt", pitch: 0, face: "founder" },
  founder2: { name: "Founder", tag: "red", pitch: 5, face: "founder2" },
  founder3: { name: "Founder", tag: "green", pitch: 2, face: "founder3" },
  student: { name: "Student", tag: "orange", pitch: 8, face: "student" },
  alai: { name: "alai", tag: "gold", pitch: 10, face: "alai" },
};

export const say = (who: string, text: string): Line => ({ who, text });
