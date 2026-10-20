import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { getPortfolioContent } from "@/lib/portfolio-content";
import { getSiteUrl } from "@/lib/site-url";

// Both sharing cards are the top of the mat: the name printed into it, and
// the business card lying across it, from the same edited content.

const MAT = "#2e5946";
const PRINT = "#386650";
const LINE = "rgba(214, 236, 222, 0.12)";
const LINE_STRONG = "rgba(214, 236, 222, 0.26)";
const INK = "#d6e8dc";
const STOCK = "#f4f0e7";
const RED = "#cf3a28";

const W = 1200;
const H = 630;
const CELL = 40;

// Static instances of the site's faces (Satori can't set variable axes).
// The paths are written out whole so the build traces them into the function.
function fonts() {
  return Promise.all([
    readFile(join(process.cwd(), "assets/fonts/Archivo-ExtraCondensedBlack.woff")),
    readFile(join(process.cwd(), "assets/fonts/Archivo-SemiBold.woff")),
    readFile(join(process.cwd(), "assets/fonts/MartianMono-Medium.woff")),
  ]);
}

export async function createPortfolioSocialImage() {
  const [{ profile }, [black, semibold, mono]] = await Promise.all([getPortfolioContent(), fonts()]);
  const name = profile.name || "Portfolio";
  const words = name.split(/\s+/).filter(Boolean).slice(0, 2);
  const longest = Math.max(...words.map((word) => word.length), 1);
  // condensed black runs about half an em a letter
  const size = Math.min(372, Math.floor((W - 96) / (longest * 0.5)));
  const domain = new URL(getSiteUrl()).hostname.replace(/^www\./, "");

  const lines = [];
  for (let x = CELL; x < W; x += CELL) {
    lines.push(
      <div
        key={`x${x}`}
        style={{ position: "absolute", top: 0, left: x, width: 1, height: H, background: x % (CELL * 5) === 0 ? LINE_STRONG : LINE }}
      />,
    );
  }
  for (let y = CELL; y < H; y += CELL) {
    lines.push(
      <div
        key={`y${y}`}
        style={{ position: "absolute", top: y, left: 0, width: W, height: 1, background: y % (CELL * 5) === 0 ? LINE_STRONG : LINE }}
      />,
    );
  }

  const cardW = 540;
  const cardH = Math.round((cardW * 51) / 89);

  return new ImageResponse(
    (
      <div style={{ position: "relative", display: "flex", width: W, height: H, background: MAT, fontFamily: "Archivo" }}>
        <div
          style={{
            position: "absolute",
            top: 22,
            left: 48,
            right: 48,
            display: "flex",
            flexDirection: "column",
            color: PRINT,
            fontFamily: "Archivo Black",
            fontSize: size,
            lineHeight: 0.8,
            letterSpacing: "-0.01em",
            textTransform: "uppercase",
          }}
        >
          {words.map((word, index) => (
            <div key={word} style={{ display: "flex", alignSelf: index % 2 ? "flex-end" : "flex-start" }}>
              {word}
            </div>
          ))}
        </div>
        {lines}

        {/* the card's width, dimensioned on the mat */}
        <div
          style={{
            position: "absolute",
            top: (H - cardH) / 2 - 22,
            left: (W - cardW) / 2,
            width: cardW,
            height: 14,
            display: "flex",
            justifyContent: "center",
            borderLeft: `1px solid ${INK}`,
            borderRight: `1px solid ${INK}`,
          }}
        >
          <div style={{ position: "absolute", top: 7, left: 0, width: cardW, height: 1, background: INK, opacity: 0.6 }} />
          <div
            style={{
              display: "flex",
              padding: "0 10px",
              background: MAT,
              color: INK,
              fontFamily: "Martian Mono",
              fontSize: 13,
              lineHeight: 1,
              marginTop: 1,
            }}
          >
            89 mm
          </div>
        </div>

        <div
          style={{
            position: "absolute",
            top: (H - cardH) / 2,
            left: (W - cardW) / 2,
            width: cardW,
            height: cardH,
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            padding: "30px 34px 26px",
            background: STOCK,
            border: `2px solid #b8321f`,
            borderRadius: 4,
            boxShadow: "0 2px 3px rgba(0,0,0,0.25), 0 18px 30px rgba(0,0,0,0.28)",
            color: "#1d1c19",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              fontFamily: "Martian Mono",
              fontSize: 12,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: "#66625a",
            }}
          >
            <div style={{ display: "flex", color: RED }}>{profile.mark}</div>
            <div style={{ display: "flex" }}>{profile.location}</div>
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", fontSize: name.length > 18 ? 46 : 58, letterSpacing: "-0.04em", lineHeight: 1 }}>
              {name}
            </div>
            {profile.descriptor ? (
              <div style={{ display: "flex", marginTop: 14, fontSize: 20 }}>{profile.descriptor}</div>
            ) : null}
            {profile.introduction ? (
              <div style={{ display: "flex", marginTop: 4, fontSize: 18, color: "#66625a" }}>{profile.introduction}</div>
            ) : null}
          </div>
          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              fontFamily: "Martian Mono",
              fontSize: 12,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: "#66625a",
            }}
          >
            {domain}
          </div>
        </div>
      </div>
    ),
    {
      width: W,
      height: H,
      fonts: [
        { name: "Archivo Black", data: black, weight: 900, style: "normal" },
        { name: "Archivo", data: semibold, weight: 600, style: "normal" },
        { name: "Martian Mono", data: mono, weight: 500, style: "normal" },
      ],
    },
  );
}
