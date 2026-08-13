import { useState } from "react";
import { useAccount, useReadContract, useWaitForTransactionReceipt, useWriteContract } from "wagmi";
import { FACTION_WAR_ABI } from "../contracts/FactionWar.abi";
import { USDC_ABI } from "../contracts/Jackpot.abi";
import { FACTION_WAR_ADDRESS, USDC_ADDRESS } from "../contracts/addresses";
import { useDrawingState } from "../hooks/useDrawingState";
import { NumberPicker } from "./NumberPicker";

const NORMALS_REQUIRED = 5;

/// Attack form (Build.md phase 3 / section 4.3, restyled as a HUD panel).
/// Approves USDC to FactionWar once (if needed), then calls
/// attack(normals, bonusball) — FactionWar forwards the real purchase to
/// Jackpot.buyTickets. Every entry needs exactly 5 normals + 1 bonusball
/// (llms.md: "every entry needs 5 normals + bonusball"), so the picker
/// enforces that instead of trusting free-text input.
export function AttackForm() {
  const { address, isConnected } = useAccount();
  const { drawingState } = useDrawingState();
  const [normals, setNormals] = useState<number[]>([]);
  const [bonusball, setBonusball] = useState<number | null>(null);

  const ballMax = drawingState?.ballMax ?? 0;
  const bonusballMax = drawingState?.bonusballMax ?? 0;
  const ticketPrice = drawingState?.ticketPrice ?? 0n;

  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: USDC_ADDRESS,
    abi: USDC_ABI,
    functionName: "allowance",
    args: address ? [address, FACTION_WAR_ADDRESS] : undefined,
    query: { enabled: Boolean(address) },
  });

  const { writeContract, data: hash, isPending } = useWriteContract();
  const { isLoading: isConfirming } = useWaitForTransactionReceipt({
    hash,
    query: { enabled: Boolean(hash) },
  });

  const needsApproval = (allowance ?? 0n) < ticketPrice;
  const ready = normals.length === NORMALS_REQUIRED && bonusball !== null;

  function toggleNormal(n: number) {
    setNormals((prev) => (prev.includes(n) ? prev.filter((x) => x !== n) : [...prev, n]));
  }

  function selectBonusball(n: number) {
    setBonusball((prev) => (prev === n ? null : n));
  }

  function approve() {
    writeContract(
      {
        address: USDC_ADDRESS,
        abi: USDC_ABI,
        functionName: "approve",
        args: [FACTION_WAR_ADDRESS, ticketPrice * 100n], // headroom for a few attacks before re-approving
      },
      { onSuccess: () => refetchAllowance() },
    );
  }

  function attack() {
    if (!ready || bonusball === null) return;
    writeContract(
      {
        address: FACTION_WAR_ADDRESS,
        abi: FACTION_WAR_ABI,
        functionName: "attack",
        args: [[...normals].sort((a, b) => a - b), bonusball],
      },
      { onSuccess: () => setNormals([]) },
    );
  }

  const disabled = !isConnected || isPending || isConfirming;

  return (
    <section className="panel">
      <h2>Attack a zone</h2>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          marginBottom: "var(--space-2)",
        }}
      >
        <p style={{ color: "var(--text-muted)", marginBottom: 0 }}>Ticket price</p>
        <span className="text-critical">{(Number(ticketPrice) / 1e6).toFixed(2)} USDC</span>
      </div>

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
        ) : needsApproval ? (
          <button onClick={approve} disabled={disabled}>
            Approve USDC
          </button>
        ) : (
          <button onClick={attack} disabled={disabled || !ready}>
            Buy ticket / attack
          </button>
        )}
      </div>
    </section>
  );
}
