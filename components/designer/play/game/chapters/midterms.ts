import { Vector3 } from "three";
import { someone } from "../people";
import { ROWS, SEATS_X } from "../rooms/hall";
import type { Question } from "../screens-berkeley";
import type { ActorSpec } from "../stage";
import { say, type Ctx } from "./types";

// Midterms, both rounds of them: Data C8, then Math 52. The hall with the
// course on the board, a proctor walking the front, everyone already
// seated, and the sitting itself. The question banks are the classes' own
// kind of problem: tables and inference for Data C8, integrals and series
// for Math 52.

export const DATA_MIDTERM_1: Question[] = [
  { q: "tbl.group('major') returns a table with…", options: ["one row per student", "one row per major, and a count", "only the first major", "the same table, sorted"], answer: 1 },
  { q: "make_array(1, 2, 3) * 2", options: ["array([1, 2, 3, 1, 2, 3])", "array([2, 4, 6])", "12", "An error"], answer: 1 },
  { q: "tbl.where('age', are.above(20)).num_rows counts…", options: ["every row", "the rows where age is over 20", "the columns", "the ages, added up"], answer: 1 },
  { q: "A p-value of 0.01 means:", options: ["The null is 1% likely to be true", "If the null were true, data this extreme would turn up about 1% of the time", "The effect is 1% big", "Reject the alternative"], answer: 1 },
  { q: "Running a simulation more times makes the empirical distribution…", options: ["more random", "closer to the true probability distribution", "wider", "exactly normal"], answer: 1 },
];

export const MATH_MIDTERM_1: Question[] = [
  { q: "∫ x·eˣ dx", options: ["x·eˣ + C", "x²eˣ / 2 + C", "x·eˣ − eˣ + C", "eˣ + C"], answer: 2 },
  { q: "∫ from 1 to ∞ of 1/x² dx", options: ["∞", "1", "0", "1/2"], answer: 1 },
  { q: "∫ 1 / (1 + x²) dx", options: ["ln(1 + x²) + C", "arctan x + C", "1/x + C", "x + C"], answer: 1 },
  { q: "∫ sin x · cos x dx", options: ["sin²x / 2 + C", "cos x + C", "sin x · cos x + C", "−sin x + C"], answer: 0 },
  { q: "Which one diverges?", options: ["∫ from 1 to ∞ of 1/x² dx", "∫ from 1 to ∞ of 1/x dx", "∫ from 0 to 1 of x dx", "∫ from 0 to 1 of eˣ dx"], answer: 1 },
];

export const DATA_MIDTERM_2: Question[] = [
  { q: "The slope of the regression line is…", options: ["r · (SD of y / SD of x)", "mean of y / mean of x", "r²", "SD of x / SD of y"], answer: 0 },
  { q: "A bigger random sample makes the distribution of the sample mean…", options: ["wider", "narrower", "skewed", "no different"], answer: 1 },
  { q: "The Central Limit Theorem says the sample mean is roughly normal when…", options: ["the population is normal", "the sample is large and drawn at random with replacement", "the sample is small", "always"], answer: 1 },
  { q: "A classifier is 99% accurate on data that’s 99% one class. That’s…", options: ["excellent", "possibly useless", "definitely overfit", "impossible"], answer: 1 },
];

export const MATH_MIDTERM_2: Question[] = [
  { q: "Does Σ 1/n, from n = 1 to ∞, converge?", options: ["Yes, to 1", "Yes, to 2", "No: the harmonic series diverges", "Only past n = 100"], answer: 2 },
  { q: "Σ 1/2ⁿ, from n = 1 to ∞", options: ["1/2", "1", "2", "∞"], answer: 1 },
  { q: "The Taylor series of eˣ at 0 is…", options: ["Σ xⁿ", "Σ n·xⁿ", "Σ xⁿ / n!", "Σ (−1)ⁿ xⁿ"], answer: 2 },
  { q: "The radius of convergence of Σ xⁿ is…", options: ["0", "1", "2", "∞"], answer: 1 },
];

/** The week-before review for Math 52: integration techniques. */
export const MATH_REVIEW: Question[] = [
  { q: "Integration by parts: ∫ u dv =", options: ["uv + ∫ v du", "uv − ∫ v du", "∫ u du · ∫ v dv", "u′v′"], answer: 1 },
  { q: "∫ ln x dx", options: ["1/x + C", "x ln x + C", "x ln x − x + C", "ln x² + C"], answer: 2 },
  { q: "Partial fractions: 1 / (x(x + 1)) =", options: ["1/x + 1/(x + 1)", "1/x − 1/(x + 1)", "1/(x + 1)", "x/(x + 1)"], answer: 1 },
];

/** Aiden's seat: second row, just right of the aisle. */
export const HALL_SEAT = new Vector3(SEATS_X[6], 0, ROWS[1].z);

/** A hall's worth of people, Aiden's seat left empty. */
export function hallStudents(seed: number, pose: "sit" | "type" = "sit"): ActorSpec[] {
  const list: ActorSpec[] = [];
  ROWS.forEach((row, r) =>
    SEATS_X.forEach((x, i) => {
      if (r === 1 && i === 6) return;
      if ((r * 5 + i * 3 + seed) % 7 === 0) return;
      list.push({ id: `s${r}-${i}`, look: someone(seed + r * 31 + i * 7), at: new Vector3(x, 0, row.z), heading: Math.PI, pose: pose === "type" && (r + i) % 3 ? "sit" : pose, seat: row.seat, solid: false });
    }),
  );
  return list;
}

/** A midterm's hall: the course and the midterm on the board, papers face
 * down, a proctor walking the front. `seated` skips the walk in. */
export async function examHall(ctx: Ctx, { course, exam, seed, day, clock, seated = false }: { course: string; exam: string; seed: number; day: string; clock: number; seated?: boolean }) {
  await ctx.scene({
    id: "hall",
    hall: "exam",
    slide: course,
    exam,
    actors: [
      { id: "proctor", look: someone(seed + 1, { style: "jacket", top: 0x1f3f8a, inner: 0xf2c46b, hair: "buzz" }), at: new Vector3(-0.3, 0, -3.4), heading: 0, label: "Proctor", behaviour: "wander", area: { x0: -2, x1: 2, z0: -3.9, z1: -2.6 } },
      ...hallStudents(seed),
    ],
    banner: { place: course, time: exam },
    day,
    clock,
  });
  if (seated) {
    ctx.stage().place(HALL_SEAT, Math.PI);
    ctx.stage().pose("sit", 0, ROWS[1].seat);
  }
}

/** Sitting it: into the seat, "begin", the paper and its clock, "pencils down". */
export async function sitExam(ctx: Ctx, { title, subject, questions, sick = false, seconds }: { title: string; subject: string; questions: Question[]; sick?: boolean; seconds: number }) {
  const stage = ctx.stage();
  stage.place(HALL_SEAT, Math.PI);
  stage.pose("sit", 0, ROWS[1].seat);
  await ctx.say([say("proctor", "Phones away. Begin.")]);
  const right = (await ctx.open<number>({ kind: "study", title, subject, questions, sick, exam: seconds })) ?? 0;
  await ctx.say([say("proctor", "Pencils down.")]);
  stage.pose(sick ? "sick" : "stand");
  return right;
}
