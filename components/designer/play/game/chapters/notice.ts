import type { FeatId } from "./feats";
import type { Chapter, Ctx, Line } from "./types";

// What the game notices while you poke around. Each room keeps count of
// what's been used in it, so a thing can say something new the second
// time, and so the game can tell when every last thing in it has been
// tried. A new scene is a new room, so the counting starts over with each.

type Notes = { used: Set<string>; times: Map<string, number>; last: string; run: number };

const notes = new WeakMap<object, Notes>();
// the moments the noticing hands out, asked for once a visit
const given = new Set<FeatId>();

function of(ctx: Ctx): Notes {
  const room = ctx.stage().room;
  let n = notes.get(room);
  if (!n) notes.set(room, (n = { used: new Set(), times: new Map(), last: "", run: 0 }));
  return n;
}

function once(ctx: Ctx, id: FeatId) {
  if (given.has(id)) return;
  given.add(id);
  ctx.feat(id);
}

/** How many times this has come up in this room, this time included. */
export function nth(ctx: Ctx, key: string) {
  const n = of(ctx);
  const count = (n.times.get(key) ?? 0) + 1;
  n.times.set(key, count);
  return count;
}

/** Something new each time it comes up, and the last of them from then on. */
export function again<T>(ctx: Ctx, key: string, list: readonly T[]): T {
  return list[Math.min(nth(ctx, key), list.length) - 1];
}

/** How many times running the thing just used has been used. */
export const running = (ctx: Ctx) => of(ctx).run;

/** A look in a mirror, or anything that will do for one. */
export async function mirror(ctx: Ctx, lines: Line[]) {
  await ctx.say(lines);
  ctx.glint();
  ctx.sound()?.sparkle();
  ctx.feat("mirror");
}

/** Phoebe, petted: a wag, and three in a row is a moment. */
export async function pet(ctx: Ctx, lines: Line[]) {
  ctx.stage().cheer();
  await ctx.say(lines);
  if (running(ctx) === 3) ctx.feat("phoebe");
}

/** A chapter's use(), with the noticing done first. */
export function noticing(respond: Chapter["use"]): Chapter["use"] {
  return (id, ctx) => {
    const n = of(ctx);
    n.run = n.last === id ? n.run + 1 : 1;
    n.last = id;
    n.used.add(id);
    // every last thing in a room, when there are plenty of things in it
    const things = ctx.stage().room.spots;
    if (things.length >= 8 && things.every((s) => n.used.has(s.id))) once(ctx, "diligence");
    // playing in the hours the game keeps
    if (new Date().getHours() === 3) once(ctx, "threeam");
    return respond(id, ctx);
  };
}
