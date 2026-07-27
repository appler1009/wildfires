import { ImageResponse } from "next/og";

export const size = { width: 64, height: 64 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#0d0b09",
        }}
      >
        <div
          style={{
            width: 34,
            height: 34,
            borderRadius: "9999px",
            display: "flex",
            background:
              "radial-gradient(circle at 35% 30%, #ffcf6b 0%, #ff5a1f 45%, #b8431a 80%)",
          }}
        />
      </div>
    ),
    size,
  );
}
