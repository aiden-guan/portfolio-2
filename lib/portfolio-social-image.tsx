import { ImageResponse } from "next/og";
import { getPortfolioContent } from "@/lib/portfolio-content";
import { getSiteUrl } from "@/lib/site-url";

// Both sharing cards use the same edited content and visual treatment.
export async function createPortfolioSocialImage() {
  const { profile, navigation } = await getPortfolioContent();
  const name = profile.name || "Portfolio";
  const domain = new URL(getSiteUrl()).hostname.replace(/^www\./, "");

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          background: "#f6f5f0",
          color: "#151513",
          fontFamily: "sans-serif",
          padding: "52px 64px",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            paddingBottom: 24,
            borderBottom: "1px solid #cbc9c0",
            color: "#6c6a63",
            fontSize: 17,
            letterSpacing: "0.08em",
          }}
        >
          <div style={{ display: "flex" }}>{profile.mark}</div>
          <div style={{ display: "flex" }}>PORTFOLIO</div>
        </div>

        <div style={{ display: "flex", flex: 1, alignItems: "center" }}>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              width: 780,
              paddingRight: 48,
            }}
          >
            <div
              style={{
                display: "flex",
                fontSize: name.length > 24 ? 64 : name.length > 16 ? 80 : 104,
                letterSpacing: "-0.065em",
                lineHeight: 1.02,
                maxHeight: 210,
                overflow: "hidden",
              }}
            >
              {name}
            </div>
            {profile.descriptor ? (
              <div style={{ display: "flex", marginTop: 28, fontSize: 25 }}>
                {profile.descriptor}
              </div>
            ) : null}
            {profile.introduction ? (
              <div
                style={{
                  display: "flex",
                  marginTop: 12,
                  maxWidth: 590,
                  maxHeight: 84,
                  overflow: "hidden",
                  color: "#6c6a63",
                  fontSize: 27,
                  lineHeight: 1.45,
                }}
              >
                {profile.introduction}
              </div>
            ) : null}
          </div>

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              flex: 1,
              paddingLeft: 34,
              borderLeft: "1px solid #cbc9c0",
            }}
          >
            {navigation.map((item, index) => (
              <div
                key={item.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  padding: "22px 0",
                  borderBottom: index < navigation.length - 1 ? "1px solid #cbc9c0" : "none",
                }}
              >
                <div style={{ display: "flex", width: 40, color: "#97948a", fontSize: 15 }}>
                  {String(index + 1).padStart(2, "0")}
                </div>
                <div style={{ display: "flex", fontSize: 23 }}>{item.label}</div>
              </div>
            ))}
          </div>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            borderTop: "1px solid #cbc9c0",
            paddingTop: 24,
            color: "#6c6a63",
            fontSize: 18,
          }}
        >
          <div style={{ display: "flex" }}>{profile.location}</div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {domain}
            <span style={{ color: "#9f3e24", fontSize: 22 }}>↗</span>
          </div>
        </div>
      </div>
    ),
    { width: 1200, height: 630 },
  );
}
