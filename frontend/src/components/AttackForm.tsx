import { useMemo, useState } from "react";
import { useAccount, useReadContract, useWriteContract } from "wagmi";
import { waitForTransactionReceipt } from "wagmi/actions";
import { FACTION_WAR_ABI } from "../contracts/FactionWar.abi";
import { USDC_ABI } from "../contracts/Jackpot.abi";
import { FACTION_WAR_ADDRESS, USDC_ADDRESS } from "../contracts/addresses";
import { Faction } from "../contracts/faction";
import { useDrawingState } from "../hooks/useDrawingState";
import { usePlayerFaction, useMapState } from "../hooks/useFactionWar";
import { TICKET_PURCHASED_EVENT } from "../hooks/usePlayerTickets";
import { wagmiConfig } from "../wagmi";
import { NumberPicker } from "./NumberPicker";

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
  const { data: mapState } = useMapState();
  const [normals, setNormals] = useState<number[]>([]);
  const [bonusball, setBonusball] = useState<number | null>(null);
  const [step, setStep] = useState<Step>("idle");
  const [error, setError] = useState<string | null>(null);

  const ballMax = drawingState?.ballMax ?? 0;
  const bonusballMax = drawingState?.bonusballMax ?? 0;
  const ticketPrice = drawingState?.ticketPrice ?? 0n;

  // A faction can't attack zones it already controls — no point spending on
  // your own territory. Zone `n`'s controller is `controllers[n - 1]`.
  const ownZones = useMemo(() => {
    const zones = new Set<number>();
    if (!mapState || !playerFaction || playerFaction === Faction.NONE) return zones;
    const [, controllers] = mapState;
    controllers.forEach((controller, i) => {
      if (controller === playerFaction) zones.add(i + 1);
    });
    return zones;
  }, [mapState, playerFaction]);

  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: USDC_ADDRESS,
    abi: USDC_ABI,
    functionName: "allowance",
    args: address ? [address, FACTION_WAR_ADDRESS] : undefined,
    query: { enabled: Boolean(address) },
  });

  const { writeContractAsync } = useWriteContract();

  const needsApproval = (allowance ?? 0n) < ticketPrice;
  const ready = normals.length === NORMALS_REQUIRED && bonusball !== null;
  const busy = step !== "idle";

  function toggleNormal(n: number) {
    if (ownZones.has(n)) return;
    setNormals((prev) => (prev.includes(n) ? prev.filter((x) => x !== n) : [...prev, n]));
  }

  function selectBonusball(n: number) {
    setBonusball((prev) => (prev === n ? null : n));
  }

  async function attackFlow() {
    if (!ready || bonusball === null) return;
    if (normals.some((n) => ownZones.has(n))) {
      setError("You can't attack a zone your own faction already controls.");
      return;
    }
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
          marginBottom: "var(--space-2)",
        }}
      >
        <p style={{ color: "var(--text-muted)", marginBottom: 0 }}>Ticket price</p>
        <span className="text-critical">{(Number(ticketPrice) / 1e6).toFixed(2)} USDC</span>
      </div>

      <p style={{ color: "var(--text-muted)", fontSize: "var(--text-sm)" }}>
        Normals — pick {NORMALS_REQUIRED} ({normals.length}/{NORMALS_REQUIRED})
        {ownZones.size > 0 && " — greyed-out zones are already yours"}
      </p>
      <NumberPicker
        mode="toggle"
        max={ballMax || 1}
        selected={normals}
        onToggle={toggleNormal}
        limit={NORMALS_REQUIRED}
        disabledNumbers={ownZones}
        disabledTitle="Your faction already controls this zone"
      />

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
