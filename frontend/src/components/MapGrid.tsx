import { FACTIONS, FACTION_COLOR, FACTION_GLYPH, FACTION_LABEL, Faction } from "../contracts/faction";
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
/// Styled as a recessed "war table" surface per Build.md 4.2's own art
/// direction. Controller shown as color + glyph badge (never color alone —
/// game-ui-design skill's colorblind-safety rule); a pulsing corner badge
/// shows the leading faction on contested-but-unresolved zones; a legend
/// spells out the encoding so new viewers don't have to guess it.
export function MapGrid() {
  const { data } = useMapState();
  if (!data) return <p>Loading map…</p>;

  const [ballMax, controllers, liveCounts] = data;

  return (
    <section className="panel">
      <h2>Map ({ballMax} zones)</h2>

      <div className="map-table">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(10, 1fr)", gap: "6px" }}>
          {controllers.map((controller, i) => {
            const zoneNumber = i + 1;
            const counts = liveCounts[i];
            const leader = leadingFaction(counts);
            return (
              <div
                key={zoneNumber}
                className="zone-tile"
                title={`Zone ${zoneNumber} — live: R${counts[1]} B${counts[2]} G${counts[3]}`}
                style={{
                  position: "relative",
                  minWidth: 44,
                  minHeight: 44,
                  aspectRatio: "1 / 1",
                  background: FACTION_COLOR[controller as Faction],
                  color: "white",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  borderRadius: "var(--radius)",
                  border: "1px solid rgba(0,0,0,0.35)",
                  boxShadow: "0 1px 3px rgba(0,0,0,0.4)",
                }}
              >
                <span className="hud-text" style={{ fontSize: "var(--text-base)", fontWeight: 600 }}>
                  {zoneNumber}
                </span>
                <span
                  className="hud-text"
                  aria-hidden="true"
                  style={{ position: "absolute", top: 2, left: 4, fontSize: "0.75rem", opacity: 0.9 }}
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
                      fontSize: "0.75rem",
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
      </div>

      <div style={{ display: "flex", gap: "var(--space-3)", marginTop: "var(--space-2)", flexWrap: "wrap" }}>
        {[Faction.NONE, ...FACTIONS].map((f) => (
          <span key={f} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: "var(--text-sm)", color: "var(--text-muted)" }}>
            <span
              aria-hidden="true"
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                width: 18,
                height: 18,
                borderRadius: 4,
                background: FACTION_COLOR[f],
                color: "white",
                fontSize: "0.7rem",
              }}
            >
              {FACTION_GLYPH[f]}
            </span>
            {FACTION_LABEL[f]}
          </span>
        ))}
        <span style={{ fontSize: "var(--text-sm)", color: "var(--text-muted)" }}>
          <span className="pulse" style={{ display: "inline-block" }} aria-hidden="true">
            ●
          </span>{" "}
          pulsing = contested (any attacker, not just you) — clears only when this zone's number is drawn as a
          winning number
        </span>
      </div>
    </section>
  );
}
