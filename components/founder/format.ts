import { formatMonth, PROJECTS, type WorldProject } from "@/content/worlds";
import { SKILL_ALIASES } from "@/content/founder";

/** "2026-10" → "Oct 2026"; a bare year stays a year. */
export function monthLabel(date: string) {
  return /^\d{4}$/.test(date) ? date : formatMonth(date);
}

/** The month it is now, for "· 1 mo" durations. */
export function thisMonth() {
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() + 1 };
}

/** LinkedIn counts both ends: Oct 2026 – Present, in Oct 2026, is "1 mo". */
export function durationLabel(start: string, now: { year: number; month: number }) {
  const [year, month] = start.split("-").map(Number);
  const months = Math.max(1, (now.year - year) * 12 + (now.month - (month || 1)) + 1);
  const years = Math.floor(months / 12);
  const rest = months % 12;
  const parts: string[] = [];
  if (years) parts.push(`${years} yr${years > 1 ? "s" : ""}`);
  if (rest) parts.push(`${rest} mo${rest > 1 ? "s" : ""}`);
  return parts.join(" ");
}

/** "A", "A and B", "A, B and C". */
export function joinNames(names: string[]) {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/** "Whop, Discord and +1 skill". */
export function skillSummary(skills: string[]) {
  if (skills.length <= 2) return joinNames(skills);
  const extra = skills.length - 2;
  return `${skills[0]}, ${skills[1]} and +${extra} skill${extra === 1 ? "" : "s"}`;
}

export function domainOf(url: string) {
  try {
    const { hostname, pathname } = new URL(url);
    const host = hostname.replace(/^www\./, "");
    return host === "github.com" ? `${host}${pathname.replace(/\/$/, "")}` : host;
  } catch {
    return url;
  }
}

export function project(slug: string): WorldProject {
  const found = PROJECTS.find((item) => item.slug === slug);
  if (!found) throw new Error(`No project "${slug}" in content/worlds.ts`);
  return found;
}

/** Every stack entry across these projects, once, in order. */
export function stackOf(slugs: string[]) {
  return [...new Set(slugs.flatMap((slug) => project(slug).stack))];
}

/** The projects that used a skill (or something that counts as it). */
export function projectsUsing(skill: string) {
  const names = [skill, ...(SKILL_ALIASES[skill] ?? [])];
  return PROJECTS.filter((item) => item.stack.some((entry) => names.includes(entry)));
}

/** The link a project opens: its live site, else its source. */
export function projectLink(item: WorldProject) {
  return item.live ?? item.source;
}

/** White or near-black letters, whichever reads on this colour. */
export function inkOn(hex: string) {
  const value = hex.replace("#", "");
  const channels = [0, 2, 4].map((at) => parseInt(value.slice(at, at + 2), 16) / 255);
  const [r, g, b] = channels.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luminance > 0.4 ? "rgba(0, 0, 0, 0.82)" : "#ffffff";
}
