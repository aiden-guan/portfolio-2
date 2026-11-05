import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { PERSON, ROLES, type Role } from "@/content/worlds";

// The black page with its blank open: the sentence, and all four answers in
// a column, each in the face of the page it leads to, one of them in the
// sentence. Shared from any page that has no card of its own.

export const alt = "Hi, my name is Aiden and I am a founder, student, builder or designer.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const W = 1200;
const H = 630;
const FONT = 58;
const ROW = Math.round(FONT * 1.2);
const INK = "#f6f6f2";
const DIM = "#6c6c68";
const NAME = "#e7e7e2";
const SHOWN: Role = "student";

// as the black page sets them (Geist stands in for the system face it uses
// for "founder")
const FACE: Record<Role, { fontFamily: string; fontWeight: 400 | 500 | 600 | 900; letterSpacing: string }> = {
  founder: { fontFamily: "Geist", fontWeight: 600, letterSpacing: "-0.035em" },
  student: { fontFamily: "Archivo Black", fontWeight: 900, letterSpacing: "-0.008em" },
  builder: { fontFamily: "Geist Mono", fontWeight: 400, letterSpacing: "-0.075em" },
  designer: { fontFamily: "Pixelify Sans", fontWeight: 500, letterSpacing: "-0.01em" },
};

// The paths are written out whole so the build traces them into the function.
function fonts() {
  return Promise.all([
    readFile(join(process.cwd(), "assets/fonts/Geist-Regular.ttf")),
    readFile(join(process.cwd(), "assets/fonts/Geist-SemiBold.ttf")),
    readFile(join(process.cwd(), "assets/fonts/GeistMono-Regular.ttf")),
    readFile(join(process.cwd(), "assets/fonts/PixelifySans-Medium.woff")),
    readFile(join(process.cwd(), "assets/fonts/Archivo-ExtraCondensedBlack.woff")),
  ]);
}

export default async function OpenGraphImage() {
  const [regular, semibold, mono, pixel, condensed] = await fonts();
  const at = ROLES.indexOf(SHOWN);

  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          width: W,
          height: H,
          alignItems: "center",
          justifyContent: "center",
          background: "#000",
          color: DIM,
          fontFamily: "Geist",
          fontSize: FONT,
          letterSpacing: "-0.034em",
          lineHeight: 1.2,
        }}
      >
        {/* the column hangs one row above the sentence and two below, and
            "designer" runs past the full stop, so the whole of it is what
            sits in the middle */}
        <div
          style={{
            display: "flex",
            alignItems: "flex-end",
            marginTop: -ROW * (ROLES.length - 1 - 2 * at),
            paddingRight: Math.round(FONT * 1.3),
          }}
        >
          <div style={{ display: "flex" }}>{"Hi, my name is "}</div>
          <div style={{ display: "flex", color: NAME }}>{PERSON.first}</div>
          <div style={{ display: "flex" }}>{" and I am a"}</div>
          {/* the space before the blank, as a margin: a trailing space is trimmed */}
          <div style={{ display: "flex", position: "relative", height: ROW, marginLeft: Math.round(FONT * 0.25) }}>
            {ROLES.map((role, index) =>
              role === SHOWN ? null : (
                <div
                  key={role}
                  style={{
                    position: "absolute",
                    left: 0,
                    top: (index - at) * ROW,
                    display: "flex",
                    height: ROW,
                    color: INK,
                    opacity: 0.3,
                    whiteSpace: "nowrap",
                    ...FACE[role],
                  }}
                >
                  {role}
                </div>
              ),
            )}
            <div style={{ display: "flex", height: ROW, color: INK, whiteSpace: "nowrap", ...FACE[SHOWN] }}>{SHOWN}</div>
            <div
              style={{
                position: "absolute",
                left: 0,
                right: 0,
                bottom: Math.round(FONT * 0.04),
                height: 2,
                background: INK,
                opacity: 0.6,
              }}
            />
          </div>
          <div style={{ display: "flex" }}>.</div>
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
        { name: "Pixelify Sans", data: pixel, weight: 500, style: "normal" },
        { name: "Archivo Black", data: condensed, weight: 900, style: "normal" },
      ],
    },
  );
}
