import type { Project, ThingKind } from "@/content/portfolio";

// What each project is printed as on the mat, when the editor leaves it to
// the site: the thing its own idea suggests. A prize is a ticket, a shop is
// a receipt, an approval tool is a stamped form, anything that carries mail
// is a postcard, anything that measures is a drawing.

export const THING_KINDS: ThingKind[] = ["receipt", "form", "postcard", "drawing", "ticket"];

export function projectKind(project: Project, index: number): ThingKind {
  if (project.artifact && project.artifact !== "auto") return project.artifact;
  const text = `${project.summary} ${project.detail}`.toLowerCase();
  if (/(1st|2nd|3rd|first|place|winner|won|award|finalist|prize)/i.test(project.status)) return "ticket";
  if (/(approv|safety|guard|security|permission|compliance|policy)/.test(text)) return "form";
  if (/(inbox|e-?mail|\bmail|newsletter|postal)/.test(text)) return "postcard";
  if (/(vision|measur|geometry|research|analysis|science|dataset)/.test(text)) return "drawing";
  if (/(resell|resale|sold|store|shop|revenue|\$|commerce|checkout)/.test(text)) return "receipt";
  return THING_KINDS[index % THING_KINDS.length]!;
}

export type StatusMark = "live" | "building" | "award" | "ended" | null;

// What a status says about a project.
export function statusMark(status: string): StatusMark {
  const s = status.toLowerCase();
  if (/maintain|active|live|shipping|launched/.test(s)) return "live";
  if (/progress|building|beta|wip|soon/.test(s)) return "building";
  if (/place|winner|won|award|finalist|prize/.test(s)) return "award";
  if (/retired|archived|sunset|exited|sold|acquired|closed/.test(s)) return "ended";
  return null;
}

// The word a rubber stamp says about it.
export function stampWord(status: string) {
  switch (statusMark(status)) {
    case "live":
      return "Approved";
    case "building":
      return "Pending";
    case "award":
      return "Winner";
    case "ended":
      return "Archived";
    default:
      return "Received";
  }
}

// The last amount of money a note mentions ("$500 -> $45k" gives "$45k").
export function lastAmount(text: string) {
  const amounts = text.match(/\$\s?\d[\d,.]*\s?[kKmMbB]?\b/g);
  return amounts ? amounts[amounts.length - 1]!.replace(/\s/g, "") : null;
}

export const pad = (n: number, size = 2) => String(n).padStart(size, "0");

// A link's address without its scheme, the way it's written on paper.
export function bare(href: string) {
  return href.replace(/^mailto:/, "").replace(/^https?:\/\//, "").replace(/\/$/, "");
}

// Text set in Libre Barcode 128 as a real Code 128 (set B) symbol: start
// character, the data, a checksum and the stop character, so it scans.
export function code128(text: string) {
  const data = [...text].filter((c) => c.charCodeAt(0) >= 32 && c.charCodeAt(0) <= 126).join("").slice(0, 40);
  let sum = 104;
  [...data].forEach((c, i) => {
    sum += (c.charCodeAt(0) - 32) * (i + 1);
  });
  const glyph = (value: number) => String.fromCharCode(value === 0 ? 194 : value <= 94 ? value + 32 : value + 100);
  return `Ì${data.replace(/ /g, "Â")}${glyph(sum % 103)}Î`;
}

// Splits a period like "2026—30" into when it started and ended.
export function periodParts(period: string) {
  const [start, end] = period.split(/\s*[—–-]\s*/);
  return { start: start?.trim() || period, end: end?.trim() || "" };
}

export function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0]!.toUpperCase())
    .slice(0, 3)
    .join("");
}
