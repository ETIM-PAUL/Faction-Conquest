import { useState } from "react";
import { useAccount, useReadContract, useWriteContract } from "wagmi";
import { waitForTransactionReceipt } from "wagmi/actions";
import { FACTION_WAR_ABI } from "../contracts/FactionWar.abi";
import { USDC_ABI } from "../contracts/Jackpot.abi";
import { FACTION_WAR_ADDRESS, USDC_ADDRESS } from "../contracts/addresses";
import { FACTIONS, FACTION_COLOR, FACTION_GLYPH, FACTION_LABEL, Faction } from "../contracts/faction";
import { factionScoreFor, usePlayerFaction, useFactionScores } from "../hooks/useFactionWar";
import { wagmiConfig } from "../wagmi";

function formatUsdc(raw: bigint): string {
  return (Number(raw) / 1e6).toFixed(4);
}

/// Deposit form: faction members can top up their own faction's war chest
/// directly (FactionWar.depositToWarChest), no territory or referral fees
/// required — funds the same attack() discount other players on the faction get.
function DepositForm() {
  const { address, isConnected } = useAccount();
  const { data: playerFaction } = usePlayerFaction();
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: USDC_ADDRESS,
    abi: USDC_ABI,
    functionName: "allowance",
    args: address ? [address, FACTION_WAR_ADDRESS] : undefined,
    query: { enabled: Boolean(address) },
  });

  const { writeContractAsync } = useWriteContract();

  if (!isConnected || playerFaction === undefined || playerFaction === Faction.NONE) return null;

  const amountUnits = (() => {
    const n = Number(amount);
    if (!amount || Number.isNaN(n) || n <= 0) return 0n;
    return BigInt(Math.round(n * 1e6));
  })();

  async function deposit() {
    if (amountUnits <= 0n) return;
    setError(null);
    setBusy(true);
    try {
      if ((allowance ?? 0n) < amountUnits) {
        const approveHash = await writeContractAsync({
          address: USDC_ADDRESS,
          abi: USDC_ABI,
          functionName: "approve",
          args: [FACTION_WAR_ADDRESS, amountUnits],
        });
        await waitForTransactionReceipt(wagmiConfig, { hash: approveHash });
        await refetchAllowance();
      }

      const depositHash = await writeContractAsync({
        address: FACTION_WAR_ADDRESS,
        abi: FACTION_WAR_ABI,
        functionName: "depositToWarChest",
        args: [amountUnits],
      });
      await waitForTransactionReceipt(wagmiConfig, { hash: depositHash });
      setAmount("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Deposit failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: "flex", gap: "var(--space-1)", alignItems: "center", flexWrap: "wrap", marginTop: "var(--space-2)" }}>
      <span className="hud-text" style={{ color: FACTION_COLOR[playerFaction] }} aria-hidden="true">
        {FACTION_GLYPH[playerFaction]}
      </span>
      <input
        type="number"
        min="0"
        step="0.01"
        placeholder="USDC amount"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        style={{ width: 120 }}
      />
      <button onClick={deposit} disabled={busy || amountUnits <= 0n}>
        {busy ? "Depositing…" : `Deposit to ${FACTION_LABEL[playerFaction]} chest`}
      </button>
      {error && <span style={{ color: "var(--accent)", fontSize: "var(--text-sm)" }}>{error}</span>}
    </div>
  );
}

/// Flat leaderboard table — no 3D, no animation needed (Build.md section 4.3).
/// Faction row indicator is glyph + color swatch, never color alone. War chest
/// column is real USDC (referral fees swept on resolveDrawing, split proportional
/// to territory) — it's never withdrawn, it self-subsidizes attack() ticket
/// price for that faction instead (see AttackForm's discount preview).
export function Leaderboard() {
  const { data } = useFactionScores();
  const [territory, herald, warChest] = data ?? [undefined, undefined, undefined];

  return (
    <section className="panel">
      <h2>Leaderboard</h2>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Faction</th>
              <th>Zones controlled</th>
              <th>Herald bonuses</th>
              <th>War chest (USDC)</th>
            </tr>
          </thead>
          <tbody>
            {FACTIONS.map((f) => {
              const score = factionScoreFor(territory, herald, warChest, f);
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
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p style={{ color: "var(--text-muted)", fontSize: "var(--text-sm)", marginTop: "var(--space-1)" }}>
        Funded by referral fees (split by territory + Herald bonuses) or direct deposits from faction
        members — never withdrawn, just makes your team's attacks cheaper.
      </p>
      <DepositForm />
    </section>
  );
}
