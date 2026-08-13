import { FACTION_COLOR, FACTION_GLYPH, Faction } from "../contracts/faction";
import { useMapState } from "../hooks/useFactionWar";

function leadingFaction(counts: readonly bigint[]): Faction | null {
  let leader: Faction | null = null;
  let highest = 0n;
  for (const f of [Faction.RED, Faction.BLUE, Faction.GREEN] as const) {
    const count = counts[f];
    if (count > highest) {
      highest = count;
      leader = f;
    }
  }
  return leader;
}

/// Phase 3 (Build.md section 3, step 3): flat grid of numbered zones — the
/// thing the 3D map (phase 4) eventually replaces, not something it wraps.
/// Controller shown as color + glyph badge (never color alone — game-ui-design
/// skill's colorblind-safety rule); a pulsing corner badge shows the leading
/// faction on contested-but-unresolved zones.
export function MapGrid() {
  const { data } = useMapState();
  if (!data) return <p>Loading map…</p>;

  const [ballMax, controllers, liveCounts] = data;

  return (
    <section className="panel">
      <h2>Map ({ballMax} zones)</h2>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(10, 1fr)", gap: "4px", maxWidth: 520 }}>
        {controllers.map((controller, i) => {
          const zoneNumber = i + 1;
          const counts = liveCounts[i];
          const leader = leadingFaction(counts);
          return (
            <div
              key={zoneNumber}
              title={`Zone ${zoneNumber} — live: R${counts[1]} B${counts[2]} G${counts[3]}`}
              style={{
                position: "relative",
                minWidth: 44,
                minHeight: 44,
                background: FACTION_COLOR[controller as Faction],
                color: "white",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                borderRadius: "var(--radius)",
              }}
            >
              <span className="hud-text" style={{ fontSize: "var(--text-sm)" }}>
                {zoneNumber}
              </span>
              <span
                className="hud-text"
                aria-hidden="true"
                style={{ position: "absolute", top: 2, left: 4, fontSize: "0.7rem", opacity: 0.85 }}
              >
                {FACTION_GLYPH[controller as Faction]}
              </span>
              {leader !== null && (
                <span
                  className="pulse hud-text"
                  aria-label={`Contested, currently leading: ${FACTION_GLYPH[leader]}`}
                  style={{
                    position: "absolute",
                    bottom: 1,
                    right: 3,
                    fontSize: "0.65rem",
                    color: FACTION_COLOR[leader],
                  }}
                >
                  {FACTION_GLYPH[leader]}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
