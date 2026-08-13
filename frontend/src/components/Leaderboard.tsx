import { FACTIONS, FACTION_COLOR, FACTION_GLYPH, FACTION_LABEL } from "../contracts/faction";
import { factionScoreFor, useFactionScores } from "../hooks/useFactionWar";

/// Flat leaderboard table — no 3D, no animation needed (Build.md section 4.3).
/// Faction row indicator is glyph + color swatch, never color alone.
export function Leaderboard() {
  const { data } = useFactionScores();
  const [territory, herald] = data ?? [undefined, undefined];

  return (
    <section className="panel">
      <h2>Leaderboard</h2>
      <table>
        <thead>
          <tr>
            <th>Faction</th>
            <th>Zones controlled</th>
            <th>Herald bonuses</th>
          </tr>
        </thead>
        <tbody>
          {FACTIONS.map((f) => {
            const score = factionScoreFor(territory, herald, f);
            return (
              <tr key={f}>
                <td>
                  <span className="hud-text" style={{ color: FACTION_COLOR[f] }} aria-hidden="true">
                    {FACTION_GLYPH[f]}
                  </span>{" "}
                  {FACTION_LABEL[f]}
                </td>
                <td>{score.territory.toString()}</td>
                <td>{score.herald.toString()}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}
