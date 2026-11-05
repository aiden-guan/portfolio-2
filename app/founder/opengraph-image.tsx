import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { COUNTS, ORGS, PROFILE } from "@/content/founder";

// The top of the LockedIn profile, as the page draws it: the wordmark, the
// banner, the photo in its #BUILDING frame, the name, the headline and the
// two logos beside them. Everything it says comes from content/founder.ts.

export const alt = "Aiden Guan’s LockedIn profile: building alai, 3× 1st place at hackathons, Business + Data Science at UC Berkeley.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const W = 1200;
const H = 630;
const BLUE = "#0a66c2";
const TEXT = "rgba(0, 0, 0, 0.9)";
const TEXT_2 = "rgba(0, 0, 0, 0.6)";
const LINE = "rgba(140, 140, 140, 0.2)";
const GREEN = "#4a9a4f";

const CARD_X = 56;
const CARD_Y = 100;
const CARD_W = W - CARD_X * 2;
const BANNER_H = 206;
const PHOTO = 188;
const FRAME = 6;

// The frame is the page's SVG (components/founder/profile.tsx), in its own
// 152-unit box: a green ring thickest at the lower left, and the word set on
// an arc of radius 69.5 round the middle of it.
const BOX = 152;
const SCALE = PHOTO / BOX;
const UP = 4;
const RING =
  "M0 76a76 76 0 1 0 152 0A76 76 0 1 0 0 76zm18.78-7.78a65 65 0 1 0 130 0 65 65 0 1 0-130 0z";
const WORD = "#BUILDING";
// a touch bigger than the page's 12.5, as Geist SemiBold is lighter than the
// bold system face the page uses
const WORD_SIZE = 15;
// Geist SemiBold's advances, in em, less a little for a round letter, which
// otherwise looks set apart from a straight one
const ADVANCE: Record<string, number> = { "#": 0.552, B: 0.695, U: 0.699, I: 0.29, L: 0.586, D: 0.708, N: 0.748, G: 0.726 };
const ROUND: Record<string, number> = { G: 0.1 };

function arcLetters() {
  const tracking = 2.2;
  const widths = [...WORD].map((letter) => (ADVANCE[letter] ?? 0.66) * WORD_SIZE + tracking);
  const pull = [...WORD].map((letter) => (ROUND[letter] ?? 0) * WORD_SIZE);
  const total = widths.reduce((sum, width) => sum + width, 0) - tracking - pull.reduce((sum, n) => sum + n, 0);
  const radius = 69.5;
  // the page sets the baseline on the arc, so a capital's middle sits this
  // much nearer the centre
  const middleOf = radius - WORD_SIZE * 0.36;
  let run = 0;
  return [...WORD].map((letter, index) => {
    run -= pull[index];
    const middle = run + (widths[index] - tracking) / 2;
    run += widths[index];
    // the page's path runs anticlockwise from the left round the bottom, and
    // the word is centred on it (135°, the lower left)
    const angle = ((135 + ((total / 2 - middle) / radius) * (180 / Math.PI)) * Math.PI) / 180;
    return {
      letter,
      x: (76 + middleOf * Math.cos(angle)) * SCALE,
      y: (76 + middleOf * Math.sin(angle)) * SCALE,
      width: (widths[index] - tracking) * SCALE,
      turn: (angle * 180) / Math.PI - 90,
    };
  });
}

// A CSS gradient's line, for an SVG gradient across a w×h box.
function gradientLine(angle: number, w: number, h: number) {
  const turn = (angle * Math.PI) / 180;
  const dx = Math.sin(turn);
  const dy = -Math.cos(turn);
  const half = (Math.abs(w * dx) + Math.abs(h * dy)) / 2;
  const at = (n: number) => n.toFixed(1);
  return `x1="${at(w / 2 - dx * half)}" y1="${at(h / 2 - dy * half)}" x2="${at(w / 2 + dx * half)}" y2="${at(h / 2 + dy * half)}"`;
}

// The page's banner (founder.module.css .banner), layer for layer: the navy
// sweep, a blue glow from the top right, a shadow from the bottom left, a
// grid of dots that comes in from the left, and faint rings low on the right.
function Banner() {
  const w = CARD_W;
  const h = BANNER_H;
  const cx = w * 0.88;
  const cy = h * 1.35;
  const rings: string[] = [];
  for (let r = 34; r < Math.hypot(cx, cy); r += 34) {
    rings.push(`<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#fff" stroke-opacity="0.07" stroke-width="1.3"/>`);
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
<defs>
<linearGradient id="base" gradientUnits="userSpaceOnUse" ${gradientLine(115, w, h)}><stop offset="0" stop-color="#0a2549"/><stop offset="0.48" stop-color="#0d3a72"/><stop offset="1" stop-color="#17599f"/></linearGradient>
<radialGradient id="glow" gradientUnits="userSpaceOnUse" cx="0" cy="0" r="1" gradientTransform="translate(${w} 0) scale(${w * 0.7} ${h * 1.4})"><stop offset="0" stop-color="#60a5eb" stop-opacity="0.5"/><stop offset="0.6" stop-color="#60a5eb" stop-opacity="0"/></radialGradient>
<radialGradient id="shade" gradientUnits="userSpaceOnUse" cx="0" cy="0" r="1" gradientTransform="translate(0 ${h}) scale(${w * 0.55} ${h * 1.2})"><stop offset="0" stop-color="#031026" stop-opacity="0.7"/><stop offset="0.7" stop-color="#031026" stop-opacity="0"/></radialGradient>
<pattern id="dots" width="16" height="16" patternUnits="userSpaceOnUse"><circle cx="8" cy="8" r="1.25" fill="#fff" fill-opacity="0.32"/></pattern>
<linearGradient id="dotsFade" gradientUnits="userSpaceOnUse" ${gradientLine(105, w, h)}><stop offset="0.22" stop-color="#fff" stop-opacity="0"/><stop offset="0.78" stop-color="#fff"/></linearGradient>
<linearGradient id="ringsFade" gradientUnits="userSpaceOnUse" ${gradientLine(90, w, h)}><stop offset="0.35" stop-color="#fff" stop-opacity="0"/><stop offset="0.85" stop-color="#fff"/></linearGradient>
<linearGradient id="sheen" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="${h}"><stop offset="0" stop-color="#fff" stop-opacity="0.07"/><stop offset="0.45" stop-color="#fff" stop-opacity="0"/></linearGradient>
<mask id="dotsMask"><rect width="${w}" height="${h}" fill="url(#dotsFade)"/></mask>
<mask id="ringsMask"><rect width="${w}" height="${h}" fill="url(#ringsFade)"/></mask>
</defs>
<rect width="${w}" height="${h}" fill="url(#base)"/>
<rect width="${w}" height="${h}" fill="url(#shade)"/>
<rect width="${w}" height="${h}" fill="url(#glow)"/>
<rect width="${w}" height="${h}" fill="url(#dots)" mask="url(#dotsMask)"/>
<g mask="url(#ringsMask)">${rings.join("")}<rect width="${w}" height="${h}" fill="url(#sheen)"/></g>
</svg>`;
  return <img src={`data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`} width={w} height={h} alt="" />;
}

// The paths are written out whole so the build traces them into the function.
// The renderer can't read WebP, so the photo and logos are JPEG/PNG copies of
// the page's own (assets/og).
function files() {
  return Promise.all([
    readFile(join(process.cwd(), "assets/fonts/Geist-Regular.ttf")),
    readFile(join(process.cwd(), "assets/fonts/Geist-SemiBold.ttf")),
    readFile(join(process.cwd(), "assets/og/aiden.jpg")),
  ]);
}

const dataUrl = (data: Buffer, type: string) => `data:${type};base64,${data.toString("base64")}`;

// a logo without a copy gets LinkedIn's blank grey square, as on the page
async function logoFor(org: string) {
  try {
    return dataUrl(await readFile(join(process.cwd(), "assets/og/logos", `${org}.png`)), "image/png");
  } catch {
    return null;
  }
}

export default async function OpenGraphImage() {
  const [regular, semibold, photo] = await files();
  const chips = await Promise.all(
    PROFILE.chips.map(async ({ org }) => ({ name: ORGS[org].name, image: await logoFor(org) })),
  );
  const letters = arcLetters();
  const frameTop = CARD_Y + BANNER_H - Math.round((PHOTO + FRAME * 2) * 0.68);

  return new ImageResponse(
    (
      <div style={{ position: "relative", display: "flex", width: W, height: H, background: "#f4f2ee", fontFamily: "Geist", color: TEXT }}>
        {/* the bar along the top, with the wordmark */}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: W,
            height: 72,
            display: "flex",
            alignItems: "center",
            paddingLeft: CARD_X,
            background: "#fff",
            boxShadow: `0 1px 0 ${LINE}`,
          }}
        >
          <div style={{ display: "flex", alignItems: "flex-end", color: BLUE, fontSize: 34, fontWeight: 600, letterSpacing: "-0.035em", lineHeight: 1 }}>
            <div style={{ display: "flex" }}>Locked</div>
            <div
              style={{
                position: "relative",
                display: "flex",
                width: 29,
                height: 29,
                marginLeft: 2,
                marginBottom: 1,
                borderRadius: 4,
                background: BLUE,
              }}
            >
              <div style={{ position: "absolute", right: 3, bottom: 1, display: "flex", color: "#fff", fontSize: 27, letterSpacing: "-0.025em", lineHeight: 1 }}>
                in
              </div>
            </div>
          </div>
        </div>

        {/* the top card, running off the bottom as the page does */}
        <div
          style={{
            position: "absolute",
            top: CARD_Y,
            left: CARD_X,
            width: CARD_W,
            height: H,
            display: "flex",
            flexDirection: "column",
            borderRadius: 12,
            background: "#fff",
            boxShadow: `0 0 0 1px ${LINE}`,
            overflow: "hidden",
          }}
        >
          <div
            style={{ display: "flex", width: CARD_W, height: BANNER_H }}
          >
            <Banner />
          </div>

          <div style={{ display: "flex", padding: "0 40px", marginTop: Math.round(PHOTO * 0.5) + 6 }}>
            <div style={{ display: "flex", flexDirection: "column", width: 660 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ display: "flex", fontSize: 44, fontWeight: 600, letterSpacing: "-0.02em", lineHeight: 1.15 }}>{PROFILE.name}</div>
                <svg width="30" height="30" viewBox="0 0 16 16" style={{ marginTop: 4 }}>
                  <path
                    fill={TEXT_2}
                    fillRule="evenodd"
                    d="M8 1 2.5 3v4.3c0 3.4 2.3 6.4 5.5 7.7 3.2-1.3 5.5-4.3 5.5-7.7V3zm-.8 9.6L4.8 8.2l1.06-1.06L7.2 8.48l3-3 1.06 1.06z"
                  />
                </svg>
              </div>
              <div style={{ display: "flex", marginTop: 8, fontSize: 25, lineHeight: 1.4, letterSpacing: "-0.005em" }}>{PROFILE.headline}</div>
              <div style={{ display: "flex", marginTop: 10, fontSize: 21, color: TEXT_2 }}>
                {PROFILE.location}
                <span style={{ margin: "0 8px" }}>·</span>
                <span style={{ color: BLUE, fontWeight: 600 }}>Contact info</span>
              </div>
              <div style={{ display: "flex", marginTop: 10, fontSize: 21, color: BLUE }}>
                <span style={{ fontWeight: 600 }}>{COUNTS.projects}</span>
                <span style={{ marginLeft: 6 }}>projects</span>
                <span style={{ margin: "0 8px" }}>·</span>
                <span style={{ fontWeight: 600 }}>{COUNTS.firstPlaces}</span>
                <span style={{ marginLeft: 6 }}>first places</span>
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 18, marginLeft: "auto", marginTop: 4, width: 300 }}>
              {chips.map(({ name, image }) => (
                <div key={name} style={{ display: "flex", alignItems: "center", gap: 16 }}>
                  {image ? (
                    <img src={image} width={52} height={52} alt="" style={{ borderRadius: 6 }} />
                  ) : (
                    <div style={{ display: "flex", width: 52, height: 52, borderRadius: 6, background: "#e9e5df" }} />
                  )}
                  <div style={{ display: "flex", fontSize: 23, fontWeight: 600 }}>{name}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* the photo in its frame, over the banner's edge */}
        <div
          style={{
            position: "absolute",
            top: frameTop,
            left: CARD_X + 34,
            display: "flex",
            width: PHOTO + FRAME * 2,
            height: PHOTO + FRAME * 2,
            padding: FRAME,
            borderRadius: "50%",
            background: "#fff",
          }}
        >
          <img src={dataUrl(photo, "image/jpeg")} width={PHOTO} height={PHOTO} alt="" style={{ borderRadius: "50%" }} />
          <svg width={PHOTO} height={PHOTO} viewBox={`0 0 ${BOX} ${BOX}`} style={{ position: "absolute", top: FRAME, left: FRAME }}>
            <path fill={GREEN} fillRule="evenodd" d={RING} />
          </svg>
          {/* Layout snaps every box to a whole pixel, which at this size
              bunches the letters up, so the word is laid out four times as
              big and scaled down (a transform isn't snapped). Each letter
              hangs from its point on the arc, and the point is what turns:
              a box of no size turns about itself. */}
          <div
            style={{
              position: "absolute",
              top: FRAME + PHOTO / 2 - (PHOTO * UP) / 2,
              left: FRAME + PHOTO / 2 - (PHOTO * UP) / 2,
              width: PHOTO * UP,
              height: PHOTO * UP,
              display: "flex",
              transform: `scale(${1 / UP})`,
            }}
          >
            {letters.map(({ letter, x, y, width, turn }, index) => (
              <div
                key={index}
                style={{
                  position: "absolute",
                  top: y * UP,
                  left: x * UP,
                  width: 0,
                  height: 0,
                  display: "flex",
                  transform: `rotate(${turn}deg)`,
                }}
              >
                <div
                  style={{
                    position: "absolute",
                    top: (-WORD_SIZE * SCALE * UP) / 2,
                    left: (-width * UP) / 2,
                    width: width * UP,
                    height: WORD_SIZE * SCALE * UP,
                    display: "flex",
                    alignItems: "center",
                    color: "#fff",
                    fontSize: WORD_SIZE * SCALE * UP,
                    fontWeight: 600,
                    lineHeight: 1,
                  }}
                >
                  {letter}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    ),
    {
      width: W,
      height: H,
      fonts: [
        { name: "Geist", data: regular, weight: 400, style: "normal" },
        { name: "Geist", data: semibold, weight: 600, style: "normal" },
      ],
    },
  );
}
