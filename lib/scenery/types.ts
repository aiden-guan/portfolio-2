// A scene is painted in design units: X runs 0..width left to right and Y
// 0..height top to bottom (160 x 100 unless the scene says otherwise). The
// renderer crops that frame to the viewport like `object-fit: cover` around the
// scene's focus, so a phone sees a slice and a monitor the whole view.
export const DESIGN_W = 160;
export const DESIGN_H = 100;

export type Grid = {
  cols: number;
  rows: number;
  // Design-space centre of every cell, row major.
  X: Float32Array;
  Y: Float32Array;
  // Design units covered by one cell, and the design point at the grid's top left.
  unit: number;
  x0: number;
  y0: number;
};

// What a frame writes for each cell. Colours are 0..1 and may run over 1 for
// glare. `floor` keeps a minimum dot in dark areas; `glyph` forces a character
// (a rain streak, a fish) instead of a dot sized by brightness.
export type Cells = {
  r: Float32Array;
  g: Float32Array;
  b: Float32Array;
  floor: Float32Array;
  glyph: Uint16Array;
};

export type Frame = (t: number, cells: Cells) => void;

// Sparse glyphs drawn over the page itself (rain on the glass, rising bubbles).
export type Weather = (t: number, ctx: CanvasRenderingContext2D, width: number, height: number) => void;

export type TitleShader = (u: number, v: number, t: number, out: [number, number, number]) => void;

export type SceneProgram = {
  fps: number;
  focusX: number;
  focusY: number;
  width?: number;
  height?: number;
  // On wide screens, zoom in and put this design point under the name column.
  anchor?: { x: number; y: number; atY: number; zoom: number };
  // How much of the scene shows behind the name column's text and the reading column.
  veil: { identity: number; content: number };
  // Painted as ink on paper rather than light on a dark ground.
  light?: boolean;
  // Fetches whatever the scene paints from (a photo, its region mask).
  load?: () => Promise<void>;
  build: (grid: Grid) => Frame;
  weather?: (width: number, height: number) => Weather;
  title: TitleShader;
};
