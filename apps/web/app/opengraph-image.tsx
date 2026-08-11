import { ImageResponse } from "next/og";

/**
 * The card a shared link renders (stage A, COMPLETION_PLAN §3.10).
 *
 * Built with `next/og`, which ships inside Next itself — no new dependency,
 * no network fetch at build or request time. Two consequences shape what is
 * drawn here:
 *
 * 1. The only font available to the renderer is the one bundled with
 *    `next/og` (Latin, single weight). The product's display serif is
 *    woff2-only and Satori cannot read woff2, so hierarchy comes from size
 *    and colour rather than weight, and the text stays ASCII — a glyph the
 *    bundled font lacks renders as a hole nobody would see until it shipped.
 * 2. The mark is drawn from boxes rather than set as a character, for the
 *    same reason.
 *
 * Colours are the light palette's literal token values (app/icg.css); the
 * card cannot read CSS variables, so this is the one place they are repeated
 * — deliberately, not by drift.
 */

export const alt =
  "Inventory Close Gaurd — evidence and close-control layer for a year-end inventory close. Synthetic FY2026 demonstration dataset.";

export const size = { width: 1200, height: 630 };

export const contentType = "image/png";

const BG = "#EDE3CD";
const INK = "#0E1116";
const SOFT = "rgba(14, 17, 22, 0.62)";
const EMBER = "#C25431";
const WARN = "#6F4F16";
const WARN_LINE = "rgba(138, 99, 32, 0.42)";
const HAIR = "rgba(14, 17, 22, 0.16)";

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          background: BG,
          color: INK,
        }}
      >
        {/* The decision-panel cue: an ember rule across the top edge. */}
        <div style={{ width: "100%", height: 10, background: EMBER }} />

        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            padding: "62px 76px 58px",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <div
              style={{
                width: 84,
                height: 84,
                borderRadius: 20,
                background: INK,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <div
                style={{
                  width: 42,
                  height: 42,
                  borderRadius: 5,
                  background: EMBER,
                  transform: "rotate(45deg)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <div
                  style={{ width: 17, height: 17, borderRadius: 9, background: BG }}
                />
              </div>
            </div>
            <div
              style={{
                display: "flex",
                fontSize: 20,
                letterSpacing: 3,
                color: SOFT,
              }}
            >
              FY2026 YEAR-END INVENTORY CLOSE
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", fontSize: 78, letterSpacing: -1.5 }}>
              Inventory Close Gaurd
            </div>
            <div
              style={{
                display: "flex",
                marginTop: 22,
                maxWidth: 880,
                fontSize: 30,
                lineHeight: 1.4,
                color: SOFT,
              }}
            >
              Evidence and close-control layer for a year-end inventory close,
              reconciling NetSuite, physical operations and accounting evidence.
            </div>
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 18,
              paddingTop: 26,
              borderTop: `1px solid ${HAIR}`,
            }}
          >
            <div
              style={{
                display: "flex",
                flexShrink: 0,
                whiteSpace: "nowrap",
                padding: "7px 14px",
                border: `1px dashed ${WARN_LINE}`,
                borderRadius: 5,
                fontSize: 18,
                letterSpacing: 2.4,
                color: WARN,
              }}
            >
              SYNTHETIC DEMO
            </div>
            <div style={{ display: "flex", fontSize: 20, color: SOFT }}>
              Generated demonstration dataset for KestrelGrid AI, an invented
              company. No real financial data.
            </div>
          </div>
        </div>
      </div>
    ),
    { ...size },
  );
}
