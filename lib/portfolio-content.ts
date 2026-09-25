import { get, put } from "@vercel/blob";
import {
  defaultPortfolio,
  MAX_PROJECT_IMAGES,
  type PortfolioContent,
  type PortfolioImage,
  type Project,
  type ProjectLink,
  type SectionId,
  type TimelineEntry,
} from "@/content/portfolio";

const CONTENT_PATH = "portfolio/content.json";
const MAX_TEXT_LENGTH = 600;

export class PortfolioContentError extends Error {}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readText(value: unknown, maxLength = MAX_TEXT_LENGTH) {
  if (typeof value !== "string") return null;
  const text = value.trim();
  return text.length > 0 && text.length <= maxLength ? text : null;
}

function readTextArray(value: unknown, maxItems: number) {
  if (!Array.isArray(value) || value.length > maxItems) return null;

  const items = value.map((item) => readText(item));
  return items.every((item): item is string => item !== null) ? items : null;
}

function isSafeHref(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" || url.protocol === "mailto:";
  } catch {
    return false;
  }
}

function readHref(value: unknown) {
  const href = readText(value, 500);
  return href && isSafeHref(href) ? href : null;
}

function readProfileLinks(value: unknown) {
  if (!Array.isArray(value) || value.length > 12) return null;

  const links = value.map((item) => {
    if (!isRecord(item)) return null;
    const label = readText(item.label, 50);
    const href = readHref(item.href);
    return label && href ? { label, href } : null;
  });

  return links.every((item): item is { label: string; href: string } => item !== null)
    ? links
    : null;
}

function readImageSrc(value: unknown) {
  const src = readText(value, 800);
  if (!src || src.includes("\\") || src.includes("..") || /\s/.test(src)) return null;
  if (src.startsWith("/")) return src.startsWith("//") ? null : src;

  try {
    const url = new URL(src);
    return url.protocol === "https:" ? src : null;
  } catch {
    return null;
  }
}

function readImages(value: unknown): PortfolioImage[] {
  if (!Array.isArray(value)) return [];

  const images: PortfolioImage[] = [];
  for (const item of value) {
    if (images.length >= MAX_PROJECT_IMAGES || !isRecord(item)) continue;
    const src = readImageSrc(item.src);
    if (!src) continue;
    const alt = typeof item.alt === "string" ? item.alt.trim().slice(0, 180) : "";
    images.push({ src, alt });
  }

  return images;
}

function readProjectLinks(value: unknown) {
  if (!Array.isArray(value) || value.length > 6) return null;

  const links = value.map((item) => {
    if (!isRecord(item) || (item.label !== "live" && item.label !== "source")) {
      return null;
    }

    const href = readHref(item.href);
    return href ? { label: item.label, href } : null;
  });

  return links.every((item): item is ProjectLink => item !== null) ? links : null;
}

function readProject(value: unknown): Project | null {
  if (!isRecord(value)) return null;

  const name = readText(value.name, 100);
  const status = readText(value.status, 80);
  const summary = readText(value.summary, 240);
  const detail = readText(value.detail, MAX_TEXT_LENGTH);
  const stack = readTextArray(value.stack, 16);
  const links = readProjectLinks(value.links);
  const images = readImages(value.images);

  return name && status && summary && detail && stack && links
    ? { name, status, summary, detail, stack, links, images }
    : null;
}

function readProjects(value: unknown) {
  if (!Array.isArray(value) || value.length > 50) return null;
  const projects = value.map(readProject);
  return projects.every((item): item is Project => item !== null) ? projects : null;
}

function readTimelineEntry(value: unknown): TimelineEntry | null {
  if (!isRecord(value)) return null;

  const organization = readText(value.organization, 100);
  const role = readText(value.role, 100);
  const period = readText(value.period, 60);
  const summary = readText(value.summary, MAX_TEXT_LENGTH);
  const images = readImages(value.images);

  return organization && role && period && summary
    ? { organization, role, period, summary, images }
    : null;
}

function readTimeline(value: unknown) {
  if (!Array.isArray(value) || value.length > 50) return null;
  const timeline = value.map(readTimelineEntry);
  return timeline.every((item): item is TimelineEntry => item !== null) ? timeline : null;
}

function readSections(value: unknown) {
  if (!isRecord(value)) return null;
  const sectionIds: SectionId[] = ["work", "experience", "about"];
  const sections = Object.fromEntries(
    sectionIds.map((id) => {
      const section = value[id];
      if (!isRecord(section)) return [id, null];
      const label = readText(section.label, 100);
      const title = readText(section.title, 180);
      return [id, label && title ? { label, title } : null];
    }),
  );

  return sectionIds.every((id) => sections[id] !== null)
    ? (sections as PortfolioContent["sections"])
    : null;
}

function readNavigation(value: unknown) {
  if (!Array.isArray(value) || value.length !== 3) return null;

  const navigation = value.map((item) => {
    if (!isRecord(item) || !["work", "experience", "about"].includes(String(item.id))) {
      return null;
    }
    const label = readText(item.label, 60);
    return label ? { id: item.id as SectionId, label } : null;
  });

  const ids = navigation.filter(Boolean).map((item) => item?.id);
  return navigation.every((item) => item !== null) && new Set(ids).size === 3
    ? navigation
    : null;
}

export function parsePortfolioContent(value: unknown): PortfolioContent | null {
  if (!isRecord(value)) return null;

  const profile = isRecord(value.profile) ? value.profile : null;
  const seo = isRecord(value.seo) ? value.seo : null;
  const about = isRecord(value.about) ? value.about : null;
  const name = profile && readText(profile.name, 100);
  const mark = profile && readText(profile.mark, 40);
  const descriptor = profile && readText(profile.descriptor, 120);
  const introduction = profile && readText(profile.introduction, 300);
  const email = profile && readText(profile.email, 200);
  const location = profile && readText(profile.location, 120);
  const locationLabel = profile && readText(profile.locationLabel, 80);
  const profileLinks = profile && readProfileLinks(profile.links);
  const title = seo && readText(seo.title, 160);
  const description = seo && readText(seo.description, 300);
  const socialDescription = seo && readText(seo.socialDescription, 300);
  const navigation = readNavigation(value.navigation);
  const sections = readSections(value.sections);
  const projects = readProjects(value.projects);
  const timeline = readTimeline(value.timeline);
  const paragraphs = about && readTextArray(about.paragraphs, 12);
  const interests = readTextArray(value.interests, 24);

  if (
    !name ||
    !mark ||
    !descriptor ||
    !introduction ||
    !email ||
    !location ||
    !locationLabel ||
    !profileLinks ||
    !title ||
    !description ||
    !socialDescription ||
    !navigation ||
    !sections ||
    !projects ||
    !timeline ||
    !paragraphs ||
    !interests
  ) {
    return null;
  }

  return {
    profile: {
      name,
      mark,
      descriptor,
      introduction,
      email,
      location,
      locationLabel,
      links: profileLinks,
    },
    seo: { title, description, socialDescription },
    navigation,
    sections,
    projects,
    timeline,
    about: { paragraphs },
    interests,
  };
}

export function isContentStoreConfigured() {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN || process.env.VERCEL_OIDC_TOKEN);
}

export async function getPortfolioContent() {
  if (!isContentStoreConfigured()) return defaultPortfolio;

  try {
    const result = await get(CONTENT_PATH, {
      access: "private",
      useCache: false,
    });

    if (!result || result.statusCode !== 200 || !result.stream) return defaultPortfolio;

    const content = await new Response(result.stream).json();
    return parsePortfolioContent(content) ?? defaultPortfolio;
  } catch {
    return defaultPortfolio;
  }
}

export async function savePortfolioContent(value: unknown) {
  const content = parsePortfolioContent(value);
  if (!content) {
    throw new PortfolioContentError("The content payload is not valid.");
  }

  if (!isContentStoreConfigured()) {
    throw new PortfolioContentError("Content storage is not configured.");
  }

  await put(CONTENT_PATH, JSON.stringify(content), {
    access: "private",
    allowOverwrite: true,
    cacheControlMaxAge: 60,
    contentType: "application/json",
  });

  return content;
}
