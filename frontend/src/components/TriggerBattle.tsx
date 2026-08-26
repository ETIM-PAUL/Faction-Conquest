import { useEffect, useState } from "react";
import { useAccount, useWaitForTransactionReceipt, useWriteContract } from "wagmi";
import { FACTION_WAR_ABI } from "../contracts/FactionWar.abi";
import { FACTION_WAR_ADDRESS } from "../contracts/addresses";
import { usePlayerFaction } from "../hooks/useFactionWar";
import { useDrawingState } from "../hooks/useDrawingState";
import { FACTION_LABEL, type Faction } from "../contracts/faction";

function useNow() {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const id = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1_000);
    return () => clearInterval(id);
  }, []);
  return now;
}

const RADIUS = 36;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/// Cooldown Indicator pattern (game-ui-design skill): clock-sweep ring +
/// numeric overlay, dims on cooldown, glows when ready — same combined
/// approach the skill calls out as the strongest option for ability timers.
function CooldownRing({ progress, ready, label }: { progress: number; label: string; ready: boolean }) {
  const offset = CIRCUMFERENCE * (1 - progress);
  return (
    <div style={{ position: "relative", width: 88, height: 88 }}>
      <svg width={88} height={88} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={44} cy={44} r={RADIUS} stroke="var(--panel-border)" strokeWidth={6} fill="none" />
        <circle
          cx={44}
          cy={44}
          r={RADIUS}
          stroke={ready ? "var(--accent)" : "var(--text-muted)"}
          strokeWidth={6}
          fill="none"
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={offset}
          strokeLinecap="round"
          style={{
            filter: ready ? "drop-shadow(0 0 6px var(--accent))" : "none",
            transition: "stroke-dashoffset 1s linear",
          }}
        />
      </svg>
      <div
        className="hud-text"
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: "var(--text-sm)",
          fontWeight: 600,
          color: ready ? "var(--accent)" : "var(--text)",
          textAlign: "center",
        }}
      >
        {label}
      </div>
    </div>
  );
}

/// "Trigger this drawing and earn the Herald bonus" (Build.md section 4.3).
export function TriggerBattle() {
  const { isConnected } = useAccount();
  const { data: playerFaction } = usePlayerFaction();
  const { drawingState, entropyFee, drawingDuration } = useDrawingState();
  const now = useNow();

  const { writeContract, data: hash, isPending } = useWriteContract();
  const { isLoading: isConfirming } = useWaitForTransactionReceipt({
    hash,
    query: { enabled: Boolean(hash) },
  });

  const drawingTime = Number(drawingState?.drawingTime ?? 0);
  const duration = Number(drawingDuration ?? 0);
  const secondsRemaining = Math.max(drawingTime - now, 0);
  const eligible = drawingState !== undefined && drawingTime > 0 && secondsRemaining <= 0;
  const progress = duration > 0 ? Math.min(secondsRemaining / duration, 1) : 0;
  const label = playerFaction ? FACTION_LABEL[playerFaction as Faction] : "your faction";

  function trigger() {
    if (entropyFee === undefined) return;
    writeContract({
      address: FACTION_WAR_ADDRESS,
      abi: FACTION_WAR_ABI,
      functionName: "triggerBattle",
      value: entropyFee,
    });
  }

  return (
    <section className="panel">
      <h2>Trigger battle</h2>
      <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: "var(--space-2)" }}>
        <CooldownRing progress={progress} ready={eligible} label={eligible ? "READY" : `${secondsRemaining}s`} />
        <div>
          {!eligible ? (
            <p>Next drawing settles in {secondsRemaining}s</p>
          ) : (
            <>
              <p>
                Settlement is open. Trigger this drawing and earn the Herald bonus for {label} — costs{" "}
                <span className="text-critical">
                  {entropyFee !== undefined ? `${Number(entropyFee) / 1e18} ETH` : "…"}
                </span>{" "}
                (entropy callback fee).
              </p>
              {!isConnected ? (
                <p style={{ color: "var(--accent)" }}>Connect your wallet to trigger battle.</p>
              ) : (
                <button onClick={trigger} disabled={isPending || isConfirming || entropyFee === undefined}>
                  Trigger battle
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </section>
  );
}
