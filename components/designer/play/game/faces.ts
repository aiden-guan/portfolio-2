// Dialogue portraits for the people there's no photograph of: drawn on a
// 24 × 24 grid one pixel at a time, lit the way the photo portraits are (a
// light up and to the left), shaded and dithered in a handful of flat tones,
// and cut out with a dark line so each head reads at a glance. Shown big with
// crisp edges.

type HairStyle = "neat" | "part" | "quiff" | "messy" | "cap" | "visor" | "grey" | "bald" | "long" | "buzz" | "bun";
type Top = "tee" | "hoodie" | "jacket" | "blazer" | "gown";

type Face = {
  bg: string;
  skin?: string;
  hair?: string;
  hairStyle?: HairStyle;
  /** The cap or visor. */
  cap?: string;
  shirt?: string;
  /** What shows under a jacket, the hood's lining, a gown's collar. */
  collar?: string;
  top?: Top;
  /** A hoodie's drawstrings. */
  strings?: string;
  glasses?: boolean;
  mouth?: "smile" | "grin" | "flat" | "smirk";
  brows?: "level" | "up" | "raised" | "soft";
  /** A rounder face: wider, fuller cheeks. */
  round?: boolean;
  blush?: boolean;
  icon?: "crown" | "question" | "phone" | "chatter" | "bird" | "heart";
};

// the cast as section 4 of the design doc has them: John's denim, Jerry's
// green hoodie with the gold drawstring, Raymond's red cap, Allen's alai
// yellow and glasses, Miles going out, Jun's felt-green visor
const FACES: Record<string, Face> = {
  john: { bg: "#9cc0fa", skin: "#ecc39e", hair: "#161413", hairStyle: "part", shirt: "#4a6f9e", collar: "#f6f4ee", top: "jacket", mouth: "smirk", brows: "raised" },
  jerry: { bg: "#bfe3b4", skin: "#e2b28a", hair: "#2a2420", hairStyle: "messy", shirt: "#4f9a5c", collar: "#3f7d4a", top: "hoodie", strings: "#f2c46b", mouth: "grin", brows: "up" },
  editor: { bg: "#f6c38b", skin: "#d09a70", hair: "#1d1a19", hairStyle: "cap", cap: "#d74718", shirt: "#1b1d22", collar: "#2a2f3d", top: "hoodie", strings: "#9aa4ae", mouth: "flat", brows: "level" },
  judge: { bg: "#e4dccd", skin: "#f0c9a8", hair: "#bfbab2", hairStyle: "grey", shirt: "#2a2f3d", collar: "#f6f4ee", top: "blazer", glasses: true, mouth: "flat", brows: "level" },
  principal: { bg: "#cfd8f0", skin: "#b9805a", hair: "#2a2420", hairStyle: "bald", shirt: "#1b1d22", collar: "#2f6be8", top: "gown", glasses: true, mouth: "smile", brows: "soft" },
  camper: { bg: "#fbe3cf", skin: "#d9a277", hair: "#4a3324", hairStyle: "messy", shirt: "#f08a32", collar: "#c06a22", top: "tee", mouth: "smile", brows: "soft" },
  kingcop: { bg: "#2a1a1a", icon: "crown" },
  insider: { bg: "#1b2a4a", icon: "question" },
  phone: { bg: "#f6eedd", icon: "phone" },
  chatter: { bg: "#2a2f3d", icon: "chatter" },
  allen: { bg: "#ffe58a", skin: "#e9b98f", hair: "#161413", hairStyle: "neat", shirt: "#ffd23f", collar: "#e6b800", top: "hoodie", strings: "#f6f4ee", glasses: true, mouth: "smile", brows: "soft" },
  dylan: { bg: "#cdd2e0", skin: "#f0c9a8", hair: "#2a2420", hairStyle: "messy", shirt: "#2a2f3d", top: "tee", mouth: "grin", brows: "up" },
  samuel: { bg: "#c4d4e6", skin: "#d9a277", hair: "#1d1a19", hairStyle: "neat", shirt: "#4f6b8a", collar: "#f6f4ee", top: "jacket", mouth: "smirk", brows: "level" },
  floormate: { bg: "#f6d6b8", skin: "#d9a277", hair: "#4a3324", hairStyle: "messy", shirt: "#d74718", top: "tee", mouth: "smile", brows: "soft" },
  floormate2: { bg: "#d8e8c8", skin: "#f3cfae", hair: "#2a2420", hairStyle: "long", shirt: "#8fd3b6", top: "tee", mouth: "grin", brows: "up" },
  professor: { bg: "#e4dccd", skin: "#f0c9a8", hair: "#bfbab2", hairStyle: "grey", shirt: "#6b5a45", collar: "#d9e6f2", top: "blazer", glasses: true, mouth: "flat", brows: "level" },
  proctor: { bg: "#dfe4ec", skin: "#b9805a", hair: "#1d1a19", hairStyle: "buzz", shirt: "#1f3f8a", collar: "#f2c46b", top: "jacket", mouth: "flat", brows: "level" },
  partner: { bg: "#e8e2d6", skin: "#e9b98f", hair: "#2a2420", hairStyle: "neat", shirt: "#1b1d22", collar: "#f6f4ee", top: "blazer", glasses: true, mouth: "flat", brows: "level" },
  partner2: { bg: "#e2e6ee", skin: "#b9805a", hair: "#1d1a19", hairStyle: "long", shirt: "#2a2f3d", collar: "#d9e6f2", top: "blazer", mouth: "smile", brows: "soft" },
  founder: { bg: "#d6dae4", skin: "#e2b28a", hair: "#4a3324", hairStyle: "messy", shirt: "#2a2f3d", collar: "#8a8f99", top: "jacket", mouth: "grin", brows: "up" },
  founder2: { bg: "#e9d6e4", skin: "#b9805a", hair: "#1d1a19", hairStyle: "bun", shirt: "#1b1d22", top: "tee", glasses: true, mouth: "smirk", brows: "raised" },
  founder3: { bg: "#d8ecd0", skin: "#f3cfae", hair: "#c79a5b", hairStyle: "buzz", shirt: "#4f9a5c", collar: "#3f7d4a", top: "hoodie", strings: "#f6f4ee", mouth: "smile", brows: "soft" },
  miles: { bg: "#d8d2ee", skin: "#e2b28a", hair: "#2a2420", hairStyle: "quiff", shirt: "#1b1d22", collar: "#f6f4ee", top: "jacket", mouth: "smirk", brows: "raised" },
  jun: { bg: "#cfe6d4", skin: "#e9b98f", hair: "#1d1a19", hairStyle: "visor", cap: "#2f7a4a", shirt: "#8a8f99", collar: "#767b85", top: "hoodie", strings: "#f6f4ee", mouth: "grin", brows: "up", round: true, blush: true },
  student: { bg: "#fbe3cf", skin: "#d9a277", hair: "#2a2420", hairStyle: "long", shirt: "#9cc0fa", top: "tee", mouth: "smile", brows: "soft" },
  alai: { bg: "#fff3b8", icon: "bird" },
  dm: { bg: "#ffd6e2", icon: "heart" },
};

const N = 24;
// 4 × 4 ordered dither, the island's pattern at the size this grid can carry
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const INK = "#1b1d22";
const MOUTH = "#7a3b32";

const hex = (c: string) => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
/** A colour lighter (k > 1) or darker (k < 1). */
const tone = (c: string, k: number) =>
  "#" +
  hex(c)
    .map((v) => Math.max(0, Math.min(255, Math.round(k > 1 ? v + (255 - v) * (k - 1) : v * k))).toString(16).padStart(2, "0"))
    .join("");

/** A little pixel canvas: a background and a figure on a layer of its own, so it can be outlined. */
function plate(bg: string) {
  const back: string[] = new Array(N * N).fill(bg);
  const fig: Array<string | null> = new Array(N * N).fill(null);
  const inside = (x: number, y: number) => x >= 0 && y >= 0 && x < N && y < N;
  const set = (x: number, y: number, c: string | null) => {
    if (inside(x, y)) fig[y * N + x] = c;
  };
  const rect = (x: number, y: number, w: number, h: number, c: string | null) => {
    for (let j = y; j < y + h; j += 1) for (let i = x; i < x + w; i += 1) set(i, j, c);
  };
  /** Paints `c` over figure pixels already there, on the dither's cells below `level` (0 to 1). */
  const shade = (x: number, y: number, w: number, h: number, c: string, level: number) => {
    for (let j = y; j < y + h; j += 1)
      for (let i = x; i < x + w; i += 1) if (inside(i, j) && fig[j * N + i] && BAYER[(j % 4) * 4 + (i % 4)] / 16 < level) fig[j * N + i] = c;
  };
  const has = (x: number, y: number) => inside(x, y) && fig[y * N + x] !== null;
  // the light: up and to the left, dithered out across the background
  const lit = tone(bg, 1.22);
  for (let y = 0; y < N; y += 1)
    for (let x = 0; x < N; x += 1) {
      const level = Math.max(0, 1 - Math.hypot(x + 2, y + 2) / 15) * 0.85;
      if (BAYER[(y % 4) * 4 + (x % 4)] / 16 < level) back[y * N + x] = lit;
    }
  const draw = (ctx: CanvasRenderingContext2D, outline: string) => {
    for (let y = 0; y < N; y += 1)
      for (let x = 0; x < N; x += 1) {
        let c: string | null = fig[y * N + x];
        // a dark line around the figure, against the background only
        if (!c && y < N - 1 && (has(x - 1, y) || has(x + 1, y) || has(x, y - 1) || has(x, y + 1))) c = outline;
        ctx.fillStyle = c ?? back[y * N + x];
        ctx.fillRect(x, y, 1, 1);
      }
  };
  return { set, rect, shade, has, draw };
}

const cache = new Map<string, string>();

export function face(id: string) {
  const hit = cache.get(id);
  if (hit) return hit;
  const spec = FACES[id];
  if (!spec || typeof document === "undefined") return undefined;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = N;
  const ctx = canvas.getContext("2d")!;
  const p = plate(spec.bg);
  if (spec.icon) icon(p, spec.icon);
  else person(p, spec);
  p.draw(ctx, tone(spec.bg, spec.icon === "crown" || spec.icon === "question" || spec.icon === "chatter" ? 0.6 : 0.52));
  return store(id, canvas);
}

type Plate = ReturnType<typeof plate>;

function person(p: Plate, f: Face) {
  const skin = f.skin!, hair = f.hair ?? INK;
  const skinLit = tone(skin, 1.07), skinShadow = tone(skin, 0.85), skinDeep = tone(skin, 0.72);
  const shirt = f.shirt ?? "#2a2f3d", shirtShade = tone(shirt, 0.78);
  const round = Boolean(f.round);
  // the head's box: wider and set lower for a round face
  const x0 = round ? 6 : 7, x1 = round ? 17 : 16, y0 = round ? 6 : 5, y1 = round ? 17 : 16;

  // shoulders, then the neck (in the jaw's shadow)
  p.rect(2, 20, 20, 4, shirt);
  p.rect(3, 19, 18, 1, shirt);
  p.set(2, 20, null);
  p.set(21, 20, null);
  p.shade(15, 19, 7, 5, shirtShade, 0.55);
  p.rect(19, 20, 3, 4, shirtShade);
  p.rect(10, 16, 4, 4, skinShadow);
  p.rect(10, 18, 4, 1, skinDeep);
  clothes(p, f, shirt, shirtShade);

  // the head, its corners rounded, lit from the upper left
  p.rect(x0, y0, x1 - x0 + 1, y1 - y0 + 1, skin);
  for (const [x, y] of [
    [x0, y0],
    [x1, y0],
    [x0, y1],
    [x1, y1],
  ])
    p.set(x, y, null);
  if (round) {
    p.set(x0, y1 - 1, null);
    p.set(x1, y1 - 1, null);
    p.rect(x0 + 2, y1 + 1, x1 - x0 - 3, 1, skin); // a fuller chin
  }
  p.shade(x0 + 1, y0 + 1, 3, 4, skinLit, 0.5);
  p.rect(x1, y0 + 2, 1, y1 - y0 - 2, skinShadow);
  p.shade(x1 - 1, y0 + 3, 1, y1 - y0 - 4, skinShadow, 0.5);
  p.rect(x0 + 2, y1, x1 - x0 - 3, 1, skinShadow);
  // ears, the far one in shadow
  p.rect(x0 - 1, 10, 1, 3, skin);
  p.rect(x1 + 1, 10, 1, 3, skinShadow);
  p.set(x1 + 1, 11, skinDeep);

  // eyes with a catchlight toward the light, a nose, a mouth
  const ex = round ? [9, 14] : [9, 13];
  const ey = round ? 11 : 10;
  for (const x of ex) {
    p.rect(x, ey, 2, 2, INK);
    p.set(x, ey, "#ffffff");
  }
  p.set(12, ey + 3, skinShadow);
  p.set(12, ey + 2, skinShadow);
  if (f.blush) {
    p.shade(x0 + 1, ey + 3, 2, 1, "#e88a9a", 0.75);
    p.shade(x1 - 2, ey + 3, 2, 1, "#d97a8a", 0.75);
  }
  const my = ey + 5;
  switch (f.mouth ?? "flat") {
    case "smile":
      p.rect(10, my, 4, 1, MOUTH);
      p.set(9, my - 1, MOUTH);
      p.set(14, my - 1, MOUTH);
      break;
    case "grin":
      p.rect(9, my - 1, 6, 2, MOUTH);
      p.rect(10, my - 1, 4, 1, "#ffffff");
      break;
    case "smirk":
      p.rect(10, my, 3, 1, MOUTH);
      p.set(13, my - 1, MOUTH);
      break;
    default:
      p.rect(10, my, 4, 1, MOUTH);
  }
  // brows: the cheapest way to an expression at this size
  const brow = tone(hair === "#bfbab2" ? "#8f8a82" : hair, hair === INK || hair === "#161413" || hair === "#1d1a19" ? 1 : 0.85);
  const by = ey - 2;
  switch (f.glasses ? "none" : (f.brows ?? "level")) {
    case "none":
      break;
    case "up":
      p.rect(ex[0], by - 1, 2, 1, brow);
      p.rect(ex[1], by - 1, 2, 1, brow);
      break;
    case "raised":
      p.rect(ex[0], by, 2, 1, brow);
      p.rect(ex[1], by - 1, 2, 1, brow);
      break;
    case "soft":
      p.set(ex[0], by, brow);
      p.set(ex[0] + 1, by - 1, brow);
      p.set(ex[1], by - 1, brow);
      p.set(ex[1] + 1, by, brow);
      break;
    default:
      p.rect(ex[0], by, 2, 1, brow);
      p.rect(ex[1], by, 2, 1, brow);
  }
  if (f.glasses) {
    // browline frames: a dark bar where the brows would be, fine sides, a lens
    // catching the light over the eye
    const rim = tone(INK, 1.9);
    for (const x of ex) {
      p.rect(x - 1, ey - 1, 4, 1, INK);
      p.rect(x - 1, ey, 1, 2, rim);
      p.rect(x + 2, ey, 1, 2, rim);
      p.set(x, ey, "#f6f8fb");
      p.set(x + 1, ey, tone(skin, 1.2));
      p.rect(x, ey + 1, 2, 1, INK);
    }
    p.rect(ex[0] + 2, ey - 1, ex[1] - ex[0] - 2, 1, INK);
    p.set(x0, ey - 1, INK);
    p.set(x1, ey - 1, INK);
  }
  hairOn(p, f, hair, x0, x1, y0);
}

function clothes(p: Plate, f: Face, shirt: string, shirtShade: string) {
  const collar = f.collar ?? tone(shirt, 0.7);
  switch (f.top ?? "tee") {
    case "tee":
      // a crew neck
      p.rect(9, 19, 6, 1, tone(shirt, 0.7));
      break;
    case "hoodie":
      // the hood lies round the neck, the strings hang from it
      p.rect(6, 18, 12, 2, collar);
      p.rect(9, 18, 6, 1, tone(collar, 0.8));
      p.shade(14, 18, 4, 2, tone(collar, 0.8), 0.6);
      if (f.strings) {
        p.rect(10, 20, 1, 3, f.strings);
        p.rect(13, 20, 1, 2, f.strings);
      }
      break;
    case "jacket":
    case "blazer":
      // what's under it in a V, the lapels either side
      p.rect(10, 19, 4, 5, collar);
      p.rect(11, 22, 2, 2, tone(collar, 0.85));
      p.rect(8, 19, 2, 3, tone(shirt, f.top === "jacket" ? 1.25 : 1.12));
      p.rect(14, 19, 2, 3, tone(shirtShade, f.top === "jacket" ? 1.2 : 1.08));
      p.set(9, 22, tone(shirt, 1.25));
      p.set(14, 22, shirtShade);
      break;
    case "gown":
      p.rect(7, 19, 10, 2, collar);
      p.shade(12, 19, 5, 2, tone(collar, 0.8), 0.5);
      break;
  }
}

function hairOn(p: Plate, f: Face, hair: string, x0: number, x1: number, y0: number) {
  const lit = tone(hair, hair === INK || hair === "#161413" || hair === "#1d1a19" ? 1.55 : 1.28);
  const dark = tone(hair, 0.72);
  const style = f.hairStyle ?? "neat";
  const crown = (top: number) => {
    p.rect(x0, top + 1, x1 - x0 + 1, y0 + 2 - top, hair);
    p.rect(x0 + 1, top, x1 - x0 - 1, 1, hair);
    p.rect(x0 - 1, y0 + 1, 1, 5, hair);
    p.rect(x1 + 1, y0 + 1, 1, 4, dark);
  };
  switch (style) {
    case "neat":
    case "part": {
      crown(y0 - 2);
      // a fringe swept to one side, the part showing
      p.rect(x0, y0 + 2, 6, 1, hair);
      p.rect(x0, y0 + 3, 3, 1, hair);
      p.set(x0 + 3, y0 - 1, style === "part" ? tone(hair, 1.9) : dark);
      p.rect(x0 + 1, y0 - 1, 2, 1, lit);
      p.set(x0 + 4, y0, lit);
      p.rect(x1 - 2, y0 + 1, 3, 2, dark);
      break;
    }
    case "quiff": {
      crown(y0 - 2);
      // swept up and back, for going out
      p.rect(x0 + 1, y0 - 3, 6, 1, hair);
      p.rect(x0 + 3, y0 - 4, 3, 1, hair);
      p.rect(x0 + 2, y0 - 3, 2, 1, lit);
      p.set(x0 + 4, y0 - 4, lit);
      p.rect(x0, y0 + 2, 2, 1, hair);
      p.rect(x1 - 2, y0 + 1, 3, 2, dark);
      break;
    }
    case "messy": {
      crown(y0 - 2);
      // tufts that won't lie down
      p.rect(x0, y0 - 3, 2, 1, hair);
      p.rect(x0 + 3, y0 - 3, 3, 1, hair);
      p.rect(x0 + 4, y0 - 4, 2, 1, hair);
      p.rect(x0 + 7, y0 - 3, 2, 1, hair);
      p.rect(x1, y0 - 1, 2, 1, hair);
      p.rect(x0, y0 + 2, 2, 2, hair);
      p.rect(x0 + 3, y0 + 2, 2, 2, hair);
      p.rect(x0 + 6, y0 + 2, 2, 1, hair);
      p.rect(x0 + 4, y0 - 4, 2, 1, lit);
      p.rect(x0 + 1, y0 - 1, 2, 1, lit);
      p.set(x0 + 4, y0 - 2, lit);
      p.rect(x1 - 1, y0 + 1, 2, 2, dark);
      break;
    }
    case "cap": {
      // hair under a cap, its brim out front and to the side
      p.rect(x0 - 1, y0 + 2, 1, 4, hair);
      p.rect(x1 + 1, y0 + 2, 1, 3, dark);
      const c = f.cap ?? "#d74718";
      p.rect(x0, y0 - 2, x1 - x0 + 1, 4, c);
      p.rect(x0 + 1, y0 - 3, x1 - x0 - 1, 1, c);
      p.rect(x0 - 3, y0 + 1, 7, 2, tone(c, 0.78));
      p.rect(x0 + 1, y0 - 2, 3, 1, tone(c, 1.3));
      p.rect(x1 - 2, y0 - 2, 3, 3, tone(c, 0.82));
      p.set(x0 + 5, y0 - 3, tone(c, 0.7));
      break;
    }
    case "visor": {
      // a poker visor: a band and a brim, the hair standing up over it
      crown(y0 - 2);
      p.rect(x0 + 1, y0 - 3, 3, 1, hair);
      p.set(x0 + 6, y0 - 3, hair);
      p.rect(x0 + 1, y0 - 2, 2, 1, lit);
      const c = f.cap ?? "#2f7a4a";
      p.rect(x0 - 1, y0 + 1, x1 - x0 + 3, 2, c);
      p.rect(x0 - 2, y0 + 3, x1 - x0 + 5, 1, tone(c, 0.72));
      p.rect(x0, y0 + 1, 4, 1, tone(c, 1.3));
      p.rect(x1 - 2, y0 + 1, 4, 2, tone(c, 0.85));
      break;
    }
    case "grey":
      p.rect(x0, y0 - 1, x1 - x0 + 1, 2, hair);
      p.rect(x0 - 1, y0, 2, 5, hair);
      p.rect(x1, y0, 2, 5, dark);
      p.rect(x0 + 1, y0 - 1, 3, 1, lit);
      break;
    case "bald":
      p.rect(x0 - 1, 9, 1, 3, hair);
      p.rect(x1 + 1, 9, 1, 2, dark);
      p.rect(x0 + 2, y0, 3, 1, tone(f.skin!, 1.25));
      break;
    case "buzz":
      p.rect(x0, y0 - 1, x1 - x0 + 1, 2, hair);
      p.rect(x0 + 1, y0 - 2, x1 - x0 - 1, 1, hair);
      p.rect(x0 - 1, y0, 1, 4, hair);
      p.rect(x1 + 1, y0, 1, 3, dark);
      p.rect(x0 + 1, y0 - 2, 3, 1, lit);
      p.rect(x1 - 2, y0 - 1, 3, 2, dark);
      break;
    case "bun":
      crown(y0 - 2);
      // a knot on top, round
      p.rect(x0 + 2, y0 - 4, 6, 2, hair);
      p.rect(x0 + 3, y0 - 5, 4, 1, hair);
      p.rect(x0 + 3, y0 - 5, 2, 1, lit);
      p.set(x0 + 2, y0 - 4, lit);
      p.rect(x0 + 6, y0 - 4, 2, 2, dark);
      p.rect(x0 + 1, y0 - 1, 2, 1, lit);
      p.rect(x1 - 2, y0 + 1, 3, 2, dark);
      break;
    case "long":
      crown(y0 - 2);
      p.rect(x0 - 2, y0 + 1, 3, 14, hair);
      p.rect(x1, y0 + 1, 3, 14, dark);
      p.rect(x0 + 1, y0 + 2, 5, 1, hair);
      p.rect(x0 + 1, y0 - 1, 3, 1, lit);
      p.rect(x0 - 2, y0 + 4, 1, 6, lit);
      break;
  }
}

function icon(p: Plate, kind: NonNullable<Face["icon"]>) {
  if (kind === "crown") {
    const gold = "#f2c46b", deep = "#c98f2c";
    p.rect(5, 9, 14, 7, gold);
    p.rect(5, 6, 2, 3, gold);
    p.rect(11, 5, 2, 4, gold);
    p.rect(17, 6, 2, 3, gold);
    p.rect(7, 8, 2, 1, gold);
    p.rect(15, 8, 2, 1, gold);
    p.shade(13, 9, 6, 7, deep, 0.5);
    p.rect(6, 10, 2, 1, "#fbe6b6");
    p.rect(8, 12, 2, 2, "#d74718");
    p.rect(14, 12, 2, 2, "#2f6be8");
    p.rect(5, 16, 14, 2, deep);
    p.rect(4, 19, 16, 1, "#d74718");
    return;
  }
  if (kind === "question") {
    // someone in the dark, a question for a face
    p.rect(7, 6, 10, 12, "#0f1a33");
    p.rect(5, 16, 14, 8, "#0f1a33");
    p.set(7, 6, null);
    p.set(16, 6, null);
    p.rect(10, 8, 4, 1, "#9cc0fa");
    p.rect(14, 9, 1, 2, "#9cc0fa");
    p.rect(12, 11, 2, 1, "#9cc0fa");
    p.rect(11, 12, 1, 2, "#9cc0fa");
    p.set(11, 15, "#9cc0fa");
    return;
  }
  if (kind === "phone") {
    p.rect(7, 3, 10, 18, "#1b1d22");
    p.rect(8, 5, 8, 13, "#9cc0fa");
    p.rect(8, 5, 8, 2, "#2f6be8");
    p.shade(8, 7, 3, 11, "#bcd5fb", 0.4);
    p.rect(9, 9, 5, 1, "#f6f4ee");
    p.rect(9, 11, 4, 1, "#f6f4ee");
    p.rect(11, 19, 2, 1, "#6d6b65");
    return;
  }
  if (kind === "bird") {
    // Ally, alai's little yellow bird
    p.rect(6, 7, 12, 11, "#ffd23f");
    p.rect(5, 9, 1, 7, "#ffd23f");
    p.set(6, 7, null);
    p.set(17, 7, null);
    p.shade(13, 12, 5, 6, "#f2b800", 0.5);
    p.rect(18, 10, 2, 5, "#f2b800");
    p.rect(9, 18, 6, 1, "#e6a800");
    p.rect(13, 10, 2, 2, "#1d1a19");
    p.set(13, 10, "#ffffff");
    p.rect(17, 12, 4, 2, "#f08a32");
    p.rect(8, 13, 4, 3, "#f2b800");
    p.rect(7, 8, 3, 1, "#ffe58a");
    p.rect(10, 19, 1, 2, "#f08a32");
    p.rect(13, 19, 1, 2, "#f08a32");
    return;
  }
  if (kind === "heart") {
    p.rect(6, 8, 5, 3, "#ff5f8f");
    p.rect(13, 8, 5, 3, "#ff5f8f");
    p.rect(5, 9, 14, 5, "#ff5f8f");
    p.rect(6, 14, 12, 2, "#ff5f8f");
    p.rect(8, 16, 8, 2, "#ff5f8f");
    p.rect(10, 18, 4, 1, "#ff5f8f");
    p.shade(12, 10, 7, 8, "#e0457a", 0.5);
    p.rect(7, 9, 2, 2, "#ffc2d4");
    return;
  }
  // chatter: a speech bubble, two dots of eyes
  p.rect(4, 6, 16, 10, "#8a6cff");
  p.set(4, 6, null);
  p.set(19, 6, null);
  p.rect(6, 16, 4, 3, "#8a6cff");
  p.shade(13, 7, 7, 9, "#7457e8", 0.5);
  p.rect(5, 7, 4, 1, "#a892ff");
  p.rect(8, 10, 2, 2, "#f6f4ee");
  p.rect(14, 10, 2, 2, "#f6f4ee");
}

function store(id: string, canvas: HTMLCanvasElement) {
  const url = canvas.toDataURL("image/png");
  cache.set(id, url);
  return url;
}
