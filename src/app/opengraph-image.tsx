import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

export const alt =
  "Majala & Florence — Graduation & Thanksgiving Celebration";
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = "image/png";

export default async function OpenGraphImage() {
  let photoBase64 = "";
  try {
    const photoPath = join(
      process.cwd(),
      "public",
      "assets",
      "photos",
      "twins",
      "twins-hero-bench.jpg"
    );
    const photoBuffer = await readFile(photoPath);
    photoBase64 = `data:image/jpeg;base64,${photoBuffer.toString("base64")}`;
  } catch (error) {
    console.error("Failed to load hero photo for OG image:", error);
  }

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "row",
          backgroundColor: "#193C2F",
          padding: "24px",
          position: "relative",
        }}
      >
        {/* Inner Card Border */}
        <div
          style={{
            position: "absolute",
            top: "16px",
            left: "16px",
            right: "16px",
            bottom: "16px",
            border: "1.5px solid rgba(196, 164, 108, 0.4)",
            borderRadius: "16px",
            pointerEvents: "none",
          }}
        />

        {/* Left Column: Portrait Photo */}
        <div
          style={{
            width: "440px",
            height: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            position: "relative",
            borderRadius: "12px",
            overflow: "hidden",
            border: "2px solid #C4A46C",
            backgroundColor: "#224A3B",
          }}
        >
          {photoBase64 ? (
            <img
              src={photoBase64}
              alt={alt}
              style={{
                width: "100%",
                height: "100%",
                objectFit: "cover",
                objectPosition: "center 30%",
              }}
            />
          ) : (
            <div
              style={{
                display: "flex",
                color: "#C4A46C",
                fontSize: "24px",
                fontWeight: "bold",
              }}
            >
              Majala & Florence
            </div>
          )}
        </div>

        {/* Right Column: Invitation Details */}
        <div
          style={{
            flex: 1,
            height: "100%",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            paddingLeft: "40px",
            paddingRight: "20px",
            paddingTop: "16px",
            paddingBottom: "16px",
          }}
        >
          {/* Eyebrow */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
            }}
          >
            <div
              style={{
                width: "28px",
                height: "1.5px",
                backgroundColor: "#C4A46C",
              }}
            />
            <span
              style={{
                fontSize: "14px",
                letterSpacing: "4px",
                color: "#C4A46C",
                fontWeight: 600,
                textTransform: "uppercase",
              }}
            >
              Graduation & Thanksgiving
            </span>
          </div>

          {/* Heading */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "4px",
            }}
          >
            <span
              style={{
                fontSize: "52px",
                lineHeight: 1.1,
                color: "#F7F3EA",
                fontWeight: 700,
              }}
            >
              Majala & Florence
            </span>
            <span
              style={{
                fontSize: "20px",
                color: "#C4A46C",
                fontStyle: "italic",
                marginTop: "4px",
              }}
            >
              Mwaila Family Celebration
            </span>
          </div>

          {/* Event Details Card */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "10px",
              backgroundColor: "rgba(247, 243, 234, 0.08)",
              border: "1px solid rgba(196, 164, 108, 0.35)",
              borderRadius: "10px",
              padding: "16px 20px",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "10px",
                color: "#F7F3EA",
                fontSize: "18px",
                fontWeight: 600,
              }}
            >
              <span style={{ color: "#C4A46C" }}>📅</span>
              <span>Saturday, 12 December 2026 &middot; 12:00 PM</span>
            </div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "10px",
                color: "#E8DED0",
                fontSize: "16px",
              }}
            >
              <span style={{ color: "#C4A46C" }}>📍</span>
              <span>Rainbow Ruiru Resort, Ruiru</span>
            </div>
          </div>

          {/* RSVP Call-to-action button */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                backgroundColor: "#C4A46C",
                color: "#193C2F",
                padding: "10px 24px",
                borderRadius: "9999px",
                fontSize: "15px",
                fontWeight: 700,
                letterSpacing: "0.5px",
              }}
            >
              <span>Tap to Open Invitation & RSVP</span>
              <span>&rarr;</span>
            </div>

            <span
              style={{
                fontSize: "12px",
                color: "rgba(247, 243, 234, 0.6)",
                letterSpacing: "1px",
              }}
            >
              mwaila-graduation
            </span>
          </div>
        </div>
      </div>
    ),
    {
      ...size,
    }
  );
}
