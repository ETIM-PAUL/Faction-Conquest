import { useAccount, useWaitForTransactionReceipt, useWriteContract } from "wagmi";
import { FACTION_WAR_ABI } from "../contracts/FactionWar.abi";
import { FACTION_WAR_ADDRESS } from "../contracts/addresses";
import { FACTIONS, FACTION_COLOR, FACTION_GLYPH, FACTION_LABEL } from "../contracts/faction";
import { factionScoreFor, usePlayerFaction, useFactionScores } from "../hooks/useFactionWar";

function formatUsdc(raw: bigint): string {
  return (Number(raw) / 1e6).toFixed(4);
}

/// Flat leaderboard table — no 3D, no animation needed (Build.md section 4.3).
/// Faction row indicator is glyph + color swatch, never color alone. War chest
/// column is real, claimable USDC (referral fees swept on resolveDrawing,
/// split proportional to territory) — whole-pot, first-claimer-for-your-team.
export function Leaderboard() {
  const { isConnected } = useAccount();
  const { data } = useFactionScores();
  const { data: playerFaction } = usePlayerFaction();
  const [territory, herald, warChest] = data ?? [undefined, undefined, undefined];

  const { writeContract, data: hash, isPending } = useWriteContract();
  const { isLoading: isConfirming } = useWaitForTransactionReceipt({
    hash,
    query: { enabled: Boolean(hash) },
  });

  function claim(f: number) {
    writeContract({
      address: FACTION_WAR_ADDRESS,
      abi: FACTION_WAR_ABI,
      functionName: "claimFactionTreasury",
      args: [f],
    });
  }

  return (
    <section className="panel">
      <h2>Leaderboard</h2>
      <table>
        <thead>
          <tr>
            <th>Faction</th>
            <th>Zones controlled</th>
            <th>Herald bonuses</th>
            <th>War chest (USDC)</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {FACTIONS.map((f) => {
            const score = factionScoreFor(territory, herald, warChest, f);
            const canClaim = isConnected && playerFaction === f && score.warChest > 0n;
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
                <td className={score.warChest > 0n ? "text-critical" : undefined}>{formatUsdc(score.warChest)}</td>
                <td>
                  {canClaim && (
                    <button onClick={() => claim(f)} disabled={isPending || isConfirming}>
                      Claim
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p style={{ color: "var(--text-muted)", fontSize: "var(--text-sm)", marginTop: "var(--space-1)" }}>
        War chests are funded by real referral fees on every attack, split by territory on each resolved
        drawing. Any player on a faction can claim the whole pot — first one there wins it for the team.
      </p>
    </section>
  );
}
