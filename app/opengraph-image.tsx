import { ImageResponse } from "next/og";
import { profile } from "@/content/portfolio";

export const alt = `${profile.name} — ${profile.descriptor}`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          background: "#f6f5f0",
          color: "#151513",
          fontFamily: "Arial, sans-serif",
          padding: "70px 78px",
        }}
      >
        <div
          style={{
            width: "32%",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            borderRight: "1px solid #c9c7bf",
            paddingRight: "48px",
          }}
        >
          <div style={{ display: "flex", fontSize: 18, letterSpacing: "0.12em" }}>
            {profile.mark}
          </div>
          <div style={{ display: "flex", fontSize: 18, color: "#68665f" }}>
            {profile.location}
          </div>
        </div>
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            paddingLeft: "64px",
          }}
        >
          <div style={{ display: "flex", fontSize: 72, letterSpacing: "-0.055em" }}>
            {profile.name}
          </div>
          <div
            style={{
              display: "flex",
              marginTop: 24,
              fontSize: 28,
              color: "#68665f",
            }}
          >
            {profile.descriptor}
          </div>
        </div>
      </div>
    ),
    size,
  );
}
