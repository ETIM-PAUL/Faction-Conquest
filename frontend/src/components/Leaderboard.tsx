import { FACTIONS, FACTION_LABEL } from "../contracts/faction";
import { factionScoreFor, useFactionScores } from "../hooks/useFactionWar";

/// Flat leaderboard table — no 3D, no animation needed (Build.md section 4.3).
export function Leaderboard() {
  const { data } = useFactionScores();
  const [territory, herald] = data ?? [undefined, undefined];

  return (
    <section>
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
                <td>{FACTION_LABEL[f]}</td>
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
