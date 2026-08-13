import { FACTION_COLOR, type Faction } from "../contracts/faction";
import { useMapState } from "../hooks/useFactionWar";

/// Phase 3 (Build.md section 3, step 3): plain grid of numbered boxes, no
/// styling. Confirm the full attack → settle → capture loop end to end here
/// BEFORE any 3D work starts — this is the thing the 3D map (phase 4)
/// eventually replaces, not something it wraps.
export function MapGrid() {
  const { data } = useMapState();
  if (!data) return <p>Loading map…</p>;

  const [ballMax, controllers, liveCounts] = data;

  return (
    <section>
      <h2>Map ({ballMax} zones)</h2>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(10, 1fr)", gap: "4px", maxWidth: 500 }}>
        {controllers.map((controller, i) => {
          const zoneNumber = i + 1;
          const counts = liveCounts[i];
          const totalLive = counts.reduce((sum, c) => sum + c, 0n);
          return (
            <div
              key={zoneNumber}
              title={`Zone ${zoneNumber} — live: R${counts[1]} B${counts[2]} G${counts[3]}`}
              style={{
                background: FACTION_COLOR[controller as Faction],
                color: "white",
                textAlign: "center",
                padding: "0.5rem 0",
                fontSize: "0.8rem",
                outline: totalLive > 0n ? "2px solid white" : "none",
              }}
            >
              {zoneNumber}
            </div>
          );
        })}
      </div>
    </section>
  );
}
