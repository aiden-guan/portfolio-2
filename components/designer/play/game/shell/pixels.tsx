import type { CSSProperties } from "react";
import type { Emote } from "../chapters/types";

// The interface's little pictures, drawn a pixel at a time: rows of letters,
// a colour for each letter, turned into crisp SVG once when the module loads.
// Nothing in the shell is a font glyph or an emoji, so every icon sits on the
// same pixel grid as the rest of the game. CSS sizes them: an icon is its
// width and height in pixels (--w, --h) times the size of a pixel (--px).

type Path = { fill: string; d: string };
type Layer = { part?: string; paths: Path[]; w: number; h: number };
export type Art = { w: number; h: number; layers: Array<{ part?: string; paths: Path[] }> };

const INK = "#1b1d22";
const PAPER = "#fbf8f1";
const COBALT = "#2f6be8";
const COBALT_DEEP = "#1f4fb8";
const ORANGE = "#f08a32";
const ORANGE_DEEP = "#c4621a";
const ORANGE_LIGHT = "#ffd3a6";
const RED = "#e8475a";
const RED_DEEP = "#b8324a";
const VEIN = "#d74718";
const GOLD = "#f2c46b";
const GOLD_DEEP = "#c9952e";
const GREEN = "#3f9a3a";
const SKY = "#7cc4f2";
const SKY_DEEP = "#3f8fd0";
const SHINE = "#fff6dc";
const LINE = "#c9c2b4";

function layer(rows: string[], palette: Record<string, string>, part?: string): Layer {
  const runs = new Map<string, string>();
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; ) {
      const fill = palette[row[x]];
      if (!fill) {
        x += 1;
        continue;
      }
      let n = 1;
      while (row[x + n] === row[x]) n += 1;
      runs.set(fill, `${runs.get(fill) ?? ""}M${x} ${y}h${n}v1h-${n}z`);
      x += n;
    }
  });
  return { part, w: Math.max(...rows.map((r) => r.length)), h: rows.length, paths: [...runs].map(([fill, d]) => ({ fill, d })) };
}

function compose(...layers: Layer[]): Art {
  return {
    w: Math.max(...layers.map((l) => l.w)),
    h: Math.max(...layers.map((l) => l.h)),
    layers: layers.map(({ part, paths }) => ({ part, paths })),
  };
}

/** An icon. `parts` names a CSS class for each animated part of it. */
export function Pixels({ art, className, parts, label, style }: { art: Art; className?: string; parts?: Record<string, string | undefined>; label?: string; style?: CSSProperties }) {
  return (
    <svg
      className={className}
      viewBox={`0 0 ${art.w} ${art.h}`}
      style={{ "--w": art.w, "--h": art.h, ...style } as CSSProperties}
      shapeRendering="crispEdges"
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      focusable="false"
    >
      {art.layers.map((l, i) => (
        <g key={i} className={l.part ? parts?.[l.part] : undefined}>
          {l.paths.map((p) => (
            <path key={p.fill} fill={p.fill} d={p.d} />
          ))}
        </g>
      ))}
    </svg>
  );
}

// —— the HUD

const STAR_ROWS = ["...o...", "..ooo..", "oooooOd", ".ooooD.", "..ooD..", ".oo.oD.", ".o...d."];
export const STAR = compose(
  layer(STAR_ROWS, { o: ORANGE, O: ORANGE, D: ORANGE_DEEP, d: ORANGE_DEEP }),
  layer(STAR_ROWS, { o: SHINE, O: SHINE, D: SHINE, d: SHINE }, "shine"),
);

export const HEART = compose(layer([".rr.rr.", "rwrrrrr", "rrrrrrs", ".rrrrs.", "..rrs..", "...s..."], { r: RED, w: "#ffd9de", s: RED_DEEP }));
export const HEART_EMPTY = compose(layer([".kk.kk.", "k..k..k", "k.....k", ".k...k.", "..k.k..", "...k..."], { k: LINE }));

export const TROPHY = compose(
  layer(["ggggggg", "gwggggG", ".ggggG.", "..ggG..", "...G...", "..ggG..", ".gggGG."], { g: GOLD, G: GOLD_DEEP, w: SHINE }),
);

export const CHECK = compose(layer(["......g", ".....gg", "g...gg.", "gg.gg..", ".ggg...", "..g...."], { g: GREEN }));

export const BULLET = compose(layer(["..c..", ".ccc.", "ccccc", ".ccc.", "..c.."], { c: COBALT }));

export const LOCK = compose(layer(["..kkk..", ".k...k.", ".k...k.", "kkkkkkk", "kkk.kkk", "kkk.kkk", "kkkkkkk"], { k: "#9a958b" }));

export const CHEVRON = compose(layer(["ccccccc", ".ccccc.", "..ccc..", "...c..."], { c: COBALT }));

export const POINTER = compose(layer(["c...", "cc..", "ccc.", "cccc", "ccc.", "cc..", "c..."], { c: PAPER }));

export const PAUSE = compose(layer(["kk.kk", "kk.kk", "kk.kk", "kk.kk", "kk.kk"], { k: INK }));

export const TAP = compose(layer(["..kkk..", ".k...k.", "k.ccc.k", "k.ccc.k", "k.ccc.k", ".k...k.", "..kkk.."], { k: INK, c: COBALT }));

export const SPARK = compose(layer(["..g..", "..g..", "ggwgg", "..g..", "..g.."], { g: GOLD, w: SHINE }));

// The clock in the HUD: a face with two hands, in eight directions each.
const DIRS: Array<[number, number]> = [
  [0, -1],
  [1, -1],
  [1, 0],
  [1, 1],
  [0, 1],
  [-1, 1],
  [-1, 0],
  [-1, -1],
];
const clocks = new Map<string, Art>();
export function clockArt(minutes: number, night: boolean) {
  const m = Math.round(((minutes % 60) / 60) * 8) % 8;
  const h = Math.round((((minutes / 60) % 12) / 12) * 8) % 8;
  const key = `${m}-${h}-${night}`;
  const cached = clocks.get(key);
  if (cached) return cached;
  const grid = ["..kkkkk..", ".kfffffk.", "kfffffffk", "kfffffffk", "kfffffffk", "kfffffffk", "kfffffffk", ".kfffffk.", "..kkkkk.."].map((r) => r.split(""));
  const hand = (dir: number, length: number, mark: string) => {
    const [dx, dy] = DIRS[dir];
    const n = dx && dy ? length - 1 : length;
    for (let i = 1; i <= n; i += 1) grid[4 + dy * i][4 + dx * i] = mark;
  };
  hand(m, 3, "m");
  hand(h, 2, "h");
  grid[4][4] = "h";
  const art = compose(layer(grid.map((r) => r.join("")), { k: INK, f: night ? "#2b3a63" : PAPER, m: night ? GOLD : COBALT, h: night ? PAPER : INK }));
  clocks.set(key, art);
  return art;
}

// —— in the world

// The objective's diamond: orange, lit from the top left, an ink line, and a
// ring of paper round that, so it reads over a dark room and a busy wall alike.
export const DIAMOND = compose(
  layer(
    Array.from({ length: 13 }, (_, y) =>
      Array.from({ length: 13 }, (_, x) => {
        const d = Math.abs(x - 6) + Math.abs(y - 6);
        if (d > 6) return ".";
        if (d === 6) return "p";
        if (d === 5) return "k";
        if (d === 4 && x <= 6 && y <= 6) return "w";
        if (d === 4 && x >= 6 && y >= 6) return "d";
        return "o";
      }).join(""),
    ),
    { p: PAPER, k: INK, w: ORANGE_LIGHT, o: ORANGE, d: ORANGE_DEEP },
  ),
);

/** A word bubble's tail: its top row sits on the bubble's ink line. */
export const TAIL = compose(layer(["kpppk", ".kpk.", "..k.."], { k: INK, p: PAPER }));

// An emote: a paper bubble with a tail, and a symbol in it. Each symbol is
// drawn on the bubble's grid, in parts the CSS can move on their own.
const BUBBLE = layer(
  [
    "..kkkkkkkkkkk..",
    ".kpppppppppppk.",
    "kpppppppppppppk",
    "kpppppppppppppk",
    "kpppppppppppppk",
    "kpppppppppppppk",
    "kpppppppppppppk",
    "kpppppppppppppk",
    "kpppppppppppppk",
    "kpppppppppppppk",
    ".kpppppppppppk.",
    "..kkkkpppkkkk..",
    "......kpk......",
    ".......k.......",
  ],
  { k: INK, p: PAPER },
);

const at = (y: number, rows: string[]) => [...Array<string>(y).fill(""), ...rows];

export const EMOTES: Record<Emote, Art> = {
  "!": compose(BUBBLE, layer(at(2, ["......ood", "......ood", "......ood", "......ood", "", "......ood", "......ood"]), { o: ORANGE, d: ORANGE_DEEP }, "a")),
  "?": compose(BUBBLE, layer(at(2, [".....cccc", "....cc..cc", "........cb", ".......cb", "......cb", "", "......cb"]), { c: COBALT, b: COBALT_DEEP }, "a")),
  heart: compose(BUBBLE, layer(at(2, ["....rr...rr", "...rwrr.rrrr", "...rrrrrrrrr", "....rrrrrrs", ".....rrrrs", "......rrs", ".......s"]), { r: RED, w: "#ffd9de", s: RED_DEEP }, "a")),
  sweat: compose(BUBBLE, layer(at(2, [".......a", ".......a", "......aaa", ".....aaaaA", ".....waaaA", ".....aaaAA", "......AAA"]), { a: SKY, A: SKY_DEEP, w: "#e6f5ff" }, "a")),
  note: compose(BUBBLE, layer(at(2, [".......ccc", ".......c.cc", ".......c...c", ".......c...b", ".......c", ".....ccc", "....cccb", ".....bb"]), { c: COBALT, b: COBALT_DEEP }, "a")),
  zzz: compose(
    BUBBLE,
    layer(at(2, [".......ccccc", "..........c", ".........c", "........c", ".......ccccc"]), { c: COBALT }, "a"),
    layer(at(6, ["..cccc", "....c", "...c", "..cccc"]), { c: COBALT_DEEP }, "b"),
  ),
  idea: compose(
    BUBBLE,
    layer(at(2, ["...y.......y", "", "..yy.......yy", "", "...y.......y"]), { y: GOLD_DEEP }, "b"),
    layer(at(2, ["......ggg", ".....gwggg", ".....ggggG", ".....ggggG", "......gGG", "......mmm", ".......m"]), { g: GOLD, G: GOLD_DEEP, w: SHINE, m: "#5d5a55" }, "a"),
  ),
  anger: compose(BUBBLE, layer(at(3, [".....R...R", "...RRR...RRR", "", "", "", "...RRR...RRR", ".....R...R"]), { R: VEIN }, "a")),
  dots: compose(
    BUBBLE,
    layer(at(6, ["..kk", "..kk"]), { k: INK }, "a"),
    layer(at(6, ["......kk", "......kk"]), { k: INK }, "b"),
    layer(at(6, ["..........kk", "..........kk"]), { k: INK }, "c"),
  ),
};

// —— moments: a cobalt stamp with a spark when found, a dim one when not,
// and a question mark for the secret ones nobody has found yet

const STAMP = [
  ".kkkkkkkkkkk.",
  "kccccccccccck",
  "kccccccccccck",
  "kcccccgccccck",
  "kccccgggcccck",
  "kcccgggggccck",
  "kcggggwggggck",
  "kcccgggggccck",
  "kccccgggcccck",
  "kcccccgccccck",
  "kccccccccccck",
  "kccccccccccck",
  ".kkkkkkkkkkk.",
];
const SECRET = [
  ".kkkkkkkkkkk.",
  "kccccccccccck",
  "kccccccccccck",
  "kcccqqqqcccck",
  "kccqqccqqccck",
  "kccccccqqccck",
  "kcccccqqcccck",
  "kccccqqccccck",
  "kccccccccccck",
  "kccccqqccccck",
  "kccccccccccck",
  "kccccccccccck",
  ".kkkkkkkkkkk.",
];
export const MOMENT = compose(layer(STAMP, { k: INK, c: COBALT, g: GOLD, w: SHINE }));
export const MOMENT_DIM = compose(layer(STAMP, { k: LINE, c: "#ece7dd", g: LINE, w: LINE }));
export const MOMENT_SECRET = compose(layer(SECRET, { k: LINE, c: "#ece7dd", q: "#a19c92" }));
