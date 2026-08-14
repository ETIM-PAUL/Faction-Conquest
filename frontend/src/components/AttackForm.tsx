import { useState } from "react";
import { useAccount, useReadContract, useWriteContract } from "wagmi";
import { waitForTransactionReceipt } from "wagmi/actions";
import { FACTION_WAR_ABI } from "../contracts/FactionWar.abi";
import { USDC_ABI } from "../contracts/Jackpot.abi";
import { FACTION_WAR_ADDRESS, USDC_ADDRESS } from "../contracts/addresses";
import { Faction } from "../contracts/faction";
import { useDrawingState } from "../hooks/useDrawingState";
import { usePlayerFaction, useFactionScores, factionScoreFor } from "../hooks/useFactionWar";
import { TICKET_PURCHASED_EVENT } from "../hooks/usePlayerTickets";
import { wagmiConfig } from "../wagmi";
import { NumberPicker } from "./NumberPicker";

// Mirrors FactionWar.sol's tier constants — kept in sync by hand, it's tiny
// (see BPS_DENOMINATOR / TIER*_TERRITORY_BPS / TIER*_DISCOUNT_BPS).
const DISCOUNT_TIERS = [
  { territoryPct: 25, discountPct: 5 },
  { territoryPct: 50, discountPct: 10 },
  { territoryPct: 75, discountPct: 20 },
] as const;

const NORMALS_REQUIRED = 5;

type Step = "idle" | "approving" | "attacking";

/// Attack form (Build.md phase 3 / section 4.3, restyled as a HUD panel).
/// One click does the whole flow: approve USDC to FactionWar (only if the
/// current allowance is too low), wait for it to confirm, then attack —
/// no second click required. FactionWar forwards the real purchase to
/// Jackpot.buyTickets. Every entry needs exactly 5 normals + 1 bonusball
/// (llms.md: "every entry needs 5 normals + bonusball"), so the picker
/// enforces that instead of trusting free-text input.
export function AttackForm() {
  const { address, isConnected } = useAccount();
  const { drawingState } = useDrawingState();
  const { data: playerFaction } = usePlayerFaction();
  const [normals, setNormals] = useState<number[]>([]);
  const [bonusball, setBonusball] = useState<number | null>(null);
  const [step, setStep] = useState<Step>("idle");
  const [error, setError] = useState<string | null>(null);

  const ballMax = drawingState?.ballMax ?? 0;
  const bonusballMax = drawingState?.bonusballMax ?? 0;
  const ticketPrice = drawingState?.ticketPrice ?? 0n;

  // Territory-tier discount, subsidized from the caller's faction war chest —
  // shown before they commit to a transaction (FactionWar.getAttackQuote).
  const { data: quote } = useReadContract({
    address: FACTION_WAR_ADDRESS,
    abi: FACTION_WAR_ABI,
    functionName: "getAttackQuote",
    args: address ? [address] : undefined,
    query: { enabled: Boolean(address) && Boolean(FACTION_WAR_ADDRESS), refetchInterval: 5_000 },
  });
  const [, discountBps, discountAmount, finalPrice] = quote ?? [0n, 0n, 0n, 0n];
  const hasDiscount = discountAmount > 0n;
  const payablePrice = hasDiscount ? finalPrice : ticketPrice;

  // Same numbers that drive getAttackQuote's tier check, read here purely to
  // explain to the player *why* they do or don't have a discount right now.
  const { data: scores } = useFactionScores();
  const [territory, , warChest] = scores ?? [undefined, undefined, undefined];
  const hasFaction = playerFaction !== undefined && playerFaction !== Faction.NONE;
  const score = hasFaction ? factionScoreFor(territory, undefined, warChest, playerFaction) : null;
  const territoryPct = hasFaction && ballMax > 0 && score ? (Number(score.territory) * 100) / ballMax : 0;
  const nextTier = DISCOUNT_TIERS.find((t) => territoryPct < t.territoryPct);

  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: USDC_ADDRESS,
    abi: USDC_ABI,
    functionName: "allowance",
    args: address ? [address, FACTION_WAR_ADDRESS] : undefined,
    query: { enabled: Boolean(address) },
  });

  const { writeContractAsync } = useWriteContract();

  const needsApproval = (allowance ?? 0n) < payablePrice;
  const ready = normals.length === NORMALS_REQUIRED && bonusball !== null;
  const busy = step !== "idle";

  function toggleNormal(n: number) {
    setNormals((prev) => (prev.includes(n) ? prev.filter((x) => x !== n) : [...prev, n]));
  }

  function selectBonusball(n: number) {
    setBonusball((prev) => (prev === n ? null : n));
  }

  async function attackFlow() {
    if (!ready || bonusball === null) return;
    setError(null);

    try {
      if (needsApproval) {
        setStep("approving");
        const approveHash = await writeContractAsync({
          address: USDC_ADDRESS,
          abi: USDC_ABI,
          functionName: "approve",
          args: [FACTION_WAR_ADDRESS, ticketPrice * 100n], // headroom for a few attacks before re-approving
        });
        await waitForTransactionReceipt(wagmiConfig, { hash: approveHash });
        await refetchAllowance();
      }

      setStep("attacking");
      const attackHash = await writeContractAsync({
        address: FACTION_WAR_ADDRESS,
        abi: FACTION_WAR_ABI,
        functionName: "attack",
        args: [[...normals].sort((a, b) => a - b), bonusball],
      });
      await waitForTransactionReceipt(wagmiConfig, { hash: attackHash });
      setNormals([]);
      window.dispatchEvent(new Event(TICKET_PURCHASED_EVENT));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Transaction failed");
    } finally {
      setStep("idle");
    }
  }

  const disabled = !isConnected || busy || !ready;

  let label = "Buy ticket / attack";
  if (step === "approving") label = "Approving USDC…";
  else if (step === "attacking") label = "Attacking…";
  else if (needsApproval) label = "Approve + attack";

  return (
    <section className="panel">
      <h2>Attack a zone</h2>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          marginBottom: hasDiscount ? 0 : "var(--space-2)",
        }}
      >
        <p style={{ color: "var(--text-muted)", marginBottom: 0 }}>Ticket price</p>
        {hasDiscount ? (
          <span>
            <span style={{ color: "var(--text-muted)", textDecoration: "line-through", marginRight: "var(--space-1)" }}>
              {(Number(ticketPrice) / 1e6).toFixed(2)}
            </span>
            <span className="text-critical">{(Number(payablePrice) / 1e6).toFixed(2)} USDC</span>
          </span>
        ) : (
          <span className="text-critical">{(Number(ticketPrice) / 1e6).toFixed(2)} USDC</span>
        )}
      </div>
      {!hasFaction ? (
        <p style={{ color: "var(--text-muted)", fontSize: "var(--text-sm)", marginBottom: "var(--space-2)" }}>
          Join a faction to see discount eligibility.
        </p>
      ) : hasDiscount ? (
        <p style={{ color: "var(--text-muted)", fontSize: "var(--text-sm)", marginBottom: "var(--space-2)" }}>
          🏰 {(Number(discountBps) / 100).toFixed(0)}% territory discount — {(Number(discountAmount) / 1e6).toFixed(4)}{" "}
          USDC subsidized from your faction's war chest ({territoryPct.toFixed(0)}% territory controlled)
        </p>
      ) : (
        <p style={{ color: "var(--text-muted)", fontSize: "var(--text-sm)", marginBottom: "var(--space-2)" }}>
          🏰 No discount yet — your faction controls {territoryPct.toFixed(0)}% of zones
          {nextTier
            ? `, reach ${nextTier.territoryPct}% for ${nextTier.discountPct}% off tickets`
            : ""}
          {score && score.warChest === 0n && territoryPct >= (DISCOUNT_TIERS[0]?.territoryPct ?? 0)
            ? " (your faction's war chest is also empty — deposit or capture more zones to fund it)"
            : ""}
          . Tiers: 25%→5% off · 50%→10% off · 75%→20% off, funded by the faction's war chest.
        </p>
      )}

      <p style={{ color: "var(--text-muted)", fontSize: "var(--text-sm)" }}>
        Normals — pick {NORMALS_REQUIRED} ({normals.length}/{NORMALS_REQUIRED})
      </p>
      <NumberPicker mode="toggle" max={ballMax || 1} selected={normals} onToggle={toggleNormal} limit={NORMALS_REQUIRED} />

      <p style={{ color: "var(--text-muted)", fontSize: "var(--text-sm)", marginTop: "var(--space-2)" }}>
        Bonusball {bonusball !== null ? `— ${bonusball}` : ""}
      </p>
      <NumberPicker mode="radio" max={bonusballMax || 1} selected={bonusball} onSelect={selectBonusball} />

      <div style={{ marginTop: "var(--space-2)" }}>
        {!isConnected ? (
          <p style={{ color: "var(--accent)" }}>Connect your wallet to attack.</p>
        ) : (
          <button onClick={attackFlow} disabled={disabled}>
            {label}
          </button>
        )}
        {error && (
          <p style={{ color: "var(--accent)", fontSize: "var(--text-sm)", marginTop: "var(--space-1)" }}>{error}</p>
        )}
      </div>
    </section>
  );
}
