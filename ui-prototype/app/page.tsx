import { Header } from "@/components/header";
import { UsMapInteractive } from "@/components/us-map-interactive";
import { buildUsMapData } from "@/lib/us-map";

// Compute the projected state paths on the server (the topojson is heavy); the
// interactive map is a client component that only receives the light path data.
export default function LandingPage() {
  const { states } = buildUsMapData();

  return (
    <div className="pg-page">
      <div className="pg-shell">
        <div className="pg-card">
          <Header variant="landing" />

          <div
            style={{
              padding: "56px 24px 24px",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 14,
            }}
          >
            <h1
              style={{
                margin: 0,
                fontFamily: "var(--font-sans), sans-serif",
                fontWeight: 600,
                fontSize: "clamp(32px, 5vw, 52px)",
                lineHeight: 1.06,
                letterSpacing: "-.035em",
                textAlign: "center",
                maxWidth: 900,
                textWrap: "balance",
              }}
            >
              Any U.S. parcel.
              <br />
              Sourced feasibility in seconds.
            </h1>
            <p
              style={{
                margin: 0,
                fontFamily: "var(--font-sans), sans-serif",
                fontSize: "clamp(14px, 1.6vw, 17px)",
                lineHeight: 1.5,
                color: "var(--ink2)",
                textAlign: "center",
                maxWidth: 620,
                textWrap: "balance",
              }}
            >
              Every number shows its source, confidence, and reviewer.
              Preliminary reference only — not a legal maximum.
            </p>
          </div>

          <div style={{ padding: "8px 24px 40px", maxWidth: 980, margin: "0 auto", width: "100%" }}>
            <UsMapInteractive states={states} supported={["Minnesota"]} />
          </div>
        </div>
      </div>
    </div>
  );
}
