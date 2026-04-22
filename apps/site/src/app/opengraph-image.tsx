import { ImageResponse } from "next/og";

export const runtime = "edge";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OG() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "flex-start",
          backgroundColor: "#09090b",
          color: "#fafafa",
          padding: 80,
          fontFamily: "Inter, system-ui, sans-serif",
        }}
      >
        <div style={{ fontSize: 28, color: "#a78bfa", marginBottom: 16 }}>
          NextAPI · Video AI Infrastructure
        </div>
        <div style={{ fontSize: 76, fontWeight: 600, lineHeight: 1.05 }}>
          OpenRouter for Video AI.
        </div>
        <div style={{ fontSize: 28, color: "#a1a1aa", marginTop: 24 }}>
          Official Volcengine Seedance Partner · 1 of 20 globally
        </div>
      </div>
    ),
    size,
  );
}
