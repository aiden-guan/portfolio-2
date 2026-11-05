import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { PERSON, PROJECTS, type WorldProject } from "@/content/worlds";

// The top of /builder: the name, "Builds" and how many, and the first row of
// thumbnails with their names, marks and lines, from content/worlds.ts.

export const alt = `Builds: ${PROJECTS.length} projects by ${PERSON.name}, each a thumbnail, starting with ${PROJECTS.slice(0, 3)
  .map((project) => project.name)
  .join(", ")}.`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const W = 1200;
const H = 630;
const INK = "#111";
const DIM = "#6b6b6b";
const GUTTER = 56;
const GAP = 28;
const CARD_W = Math.floor((W - GUTTER * 2 - GAP * 2) / 3);
const CARD_H = Math.round((CARD_W * 10) / 16);

// The paths are written out whole so the build traces them into the function.
function fonts() {
  return Promise.all([
    readFile(join(process.cwd(), "assets/fonts/Geist-Regular.ttf")),
    readFile(join(process.cwd(), "assets/fonts/Geist-SemiBold.ttf")),
    readFile(join(process.cwd(), "assets/fonts/GeistMono-Regular.ttf")),
  ]);
}

// The renderer can't read WebP, so thumbnails are JPEG copies (assets/og);
// the row is the first three builds that have one.
async function firstRow() {
  const row: { project: WorldProject; image: string }[] = [];
  for (const project of PROJECTS) {
    if (row.length === 3) break;
    try {
      const data = await readFile(join(process.cwd(), "assets/og/projects", `${project.slug}.jpg`));
      row.push({ project, image: `data:image/jpeg;base64,${data.toString("base64")}` });
    } catch {
      // no copy for this one; the next build takes its place
    }
  }
  return row;
}

// as components/builder/status draws it: green when live, a ring until it's
// out, half full while it's being built, grey once it's given away or sold
function Mark({ status }: { status: WorldProject["status"] }) {
  const color =
    status === "Live" ? "#1f9d55" : status === "In progress" || status === "Waitlist" ? "#dd8f12" : status === "Exited" ? "#b0b0ac" : "#8a8a87";
  const ring = status === "Prototype" || status === "Waitlist";
  const half = status === "In progress";
  return (
    <div
      style={{
        display: "flex",
        width: 10,
        height: 10,
        borderRadius: status === "Exited" ? 2 : 5,
        border: ring || half ? `2px solid ${color}` : `0px solid ${color}`,
        backgroundColor: ring || half ? "transparent" : color,
        // (the renderer takes no "none" here, so the half fill is added only when wanted)
        ...(half ? { backgroundImage: `linear-gradient(90deg, ${color} 50%, transparent 50%)` } : {}),
      }}
    />
  );
}

function Trophy() {
  return (
    <svg width="18" height="18" viewBox="0 0 12 12">
      <path d="M3.4 1.6h5.2v2.7a2.6 2.6 0 0 1-5.2 0Z" fill="#b4861c" />
      <path
        d="M3.4 2.6H2.3a.6.6 0 0 0-.6.6c0 1.15.75 2 1.95 2.15M8.6 2.6h1.1a.6.6 0 0 1 .6.6c0 1.15-.75 2-1.95 2.15M6 6.9v2.1M4.1 10.4h3.8"
        fill="none"
        stroke="#b4861c"
        strokeWidth="1.1"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default async function OpenGraphImage() {
  const [[regular, semibold, mono], row] = await Promise.all([fonts(), firstRow()]);

  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          width: W,
          height: H,
          padding: `36px ${GUTTER}px 0`,
          background: "#f7f7f5",
          color: INK,
          fontFamily: "Geist",
        }}
      >
        <div style={{ display: "flex", fontSize: 22, fontWeight: 600, letterSpacing: "-0.01em" }}>{PERSON.name}</div>

        <div style={{ display: "flex", alignItems: "flex-start", marginTop: 34 }}>
          <div style={{ display: "flex", marginLeft: -6, fontSize: 150, fontWeight: 600, lineHeight: 0.9, letterSpacing: "-0.055em" }}>Builds</div>
          <div style={{ display: "flex", marginTop: 10, marginLeft: 16, fontFamily: "Geist Mono", fontSize: 22, color: DIM }}>{PROJECTS.length}</div>
        </div>

        <div style={{ display: "flex", gap: GAP, marginTop: 42 }}>
          {row.map(({ project, image }) => (
            <div key={project.slug} style={{ display: "flex", flexDirection: "column", width: CARD_W }}>
              <div
                style={{
                  position: "relative",
                  display: "flex",
                  width: CARD_W,
                  height: CARD_H,
                  overflow: "hidden",
                  borderRadius: 14,
                  background: project.tone === "dark" ? "#1a1a1a" : "#ebebe8",
                }}
              >
                <img src={image} width={CARD_W} height={CARD_H} alt="" style={{ objectFit: "cover" }} />
                {/* a hairline, so pale screenshots don't melt into the page */}
                <div
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: CARD_W,
                    height: CARD_H,
                    display: "flex",
                    borderRadius: 14,
                    border: "1px solid rgba(0, 0, 0, 0.08)",
                  }}
                />
              </div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 16 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 22, fontWeight: 600, letterSpacing: "-0.014em" }}>
                  {project.name}
                  {project.award ? <Trophy /> : null}
                </div>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    fontFamily: "Geist Mono",
                    fontSize: 14,
                    letterSpacing: "0.04em",
                    color: DIM,
                    textTransform: "uppercase",
                  }}
                >
                  <Mark status={project.status} />
                  {project.status}
                </div>
              </div>
              <div style={{ display: "flex", marginTop: 6, fontSize: 18, lineHeight: 1.4, color: DIM, letterSpacing: "-0.006em" }}>{project.line}</div>
            </div>
          ))}
        </div>
      </div>
    ),
    {
      width: W,
      height: H,
      fonts: [
        { name: "Geist", data: regular, weight: 400, style: "normal" },
        { name: "Geist", data: semibold, weight: 600, style: "normal" },
        { name: "Geist Mono", data: mono, weight: 400, style: "normal" },
      ],
    },
  );
}
