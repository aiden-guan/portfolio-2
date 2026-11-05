// The island's numerals, three pixels wide and five tall: Rally's scoreboard
// counts in them, and the page's place tags are numbered in them. No three.js
// here, so the page can use them without loading the island.

export const DIGITS: Record<string, string[]> = {
  "0": ["###", "#.#", "#.#", "#.#", "###"],
  "1": [".#.", "##.", ".#.", ".#.", "###"],
  "2": ["###", "..#", "###", "#..", "###"],
  "3": ["###", "..#", ".##", "..#", "###"],
  "4": ["#.#", "#.#", "###", "..#", "..#"],
  "5": ["###", "#..", "###", "..#", "###"],
  "6": ["###", "#..", "###", "#.#", "###"],
  "7": ["###", "..#", ".#.", ".#.", ".#."],
  "8": ["###", "#.#", "###", "#.#", "###"],
  "9": ["###", "#.#", "###", "..#", "###"],
};

/** An SVG path of `text` in the numerals, one unit a pixel, from (x, y). */
export function digitsPath(text: string, x: number, y: number) {
  let d = "";
  [...text].forEach((ch, i) => {
    DIGITS[ch]?.forEach((row, r) =>
      [...row].forEach((c, k) => {
        if (c === "#") d += `M${x + i * 4 + k} ${y + r}h1v1h-1z`;
      }),
    );
  });
  return d;
}
