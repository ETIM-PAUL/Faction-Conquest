import { useEffect, useState } from "react";
import { useWaitForTransactionReceipt, useWriteContract } from "wagmi";
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

/// "Trigger this drawing and earn the Herald bonus" (Build.md section 4.3).
export function TriggerBattle() {
  const { data: playerFaction } = usePlayerFaction();
  const { drawingState, entropyFee } = useDrawingState();
  const now = useNow();

  const { writeContract, data: hash, isPending } = useWriteContract();
  const { isLoading: isConfirming } = useWaitForTransactionReceipt({
    hash,
    query: { enabled: Boolean(hash) },
  });

  const drawingTime = Number(drawingState?.drawingTime ?? 0);
  const secondsRemaining = drawingTime - now;
  const eligible = drawingState !== undefined && secondsRemaining <= 0;
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
    <section>
      <h2>Trigger battle</h2>
      {!eligible ? (
        <p>Next drawing settles in {Math.max(secondsRemaining, 0)}s</p>
      ) : (
        <>
          <p>
            Settlement is open. Trigger this drawing and earn the Herald bonus for {label} — costs{" "}
            {entropyFee !== undefined ? `${Number(entropyFee) / 1e18} ETH` : "…"} (entropy callback fee).
          </p>
          <button onClick={trigger} disabled={isPending || isConfirming || entropyFee === undefined}>
            Trigger battle
          </button>
        </>
      )}
    </section>
  );
}
