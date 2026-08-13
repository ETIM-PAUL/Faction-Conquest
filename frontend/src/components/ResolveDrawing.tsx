import { useReadContract, useWaitForTransactionReceipt, useWriteContract } from "wagmi";
import { FACTION_WAR_ABI } from "../contracts/FactionWar.abi";
import { JACKPOT_ABI } from "../contracts/Jackpot.abi";
import { FACTION_WAR_ADDRESS, JACKPOT_ADDRESS } from "../contracts/addresses";
import { useDrawingState } from "../hooks/useDrawingState";

/// The most recently settled drawing is always currentDrawingId() - 1
/// (see llms.md "How to check if a drawing is settled"). Resolve it into
/// zone captures once Jackpot has actually settled it.
export function ResolveDrawing() {
  const { drawingId } = useDrawingState();
  const settledId = drawingId !== undefined && drawingId > 0n ? drawingId - 1n : undefined;

  const { data: settledState } = useReadContract({
    address: JACKPOT_ADDRESS,
    abi: JACKPOT_ABI,
    functionName: "getDrawingState",
    args: settledId !== undefined ? [settledId] : undefined,
    query: { enabled: settledId !== undefined, refetchInterval: 5_000 },
  });

  const { data: alreadyResolved, refetch } = useReadContract({
    address: FACTION_WAR_ADDRESS,
    abi: FACTION_WAR_ABI,
    functionName: "drawingResolved",
    args: settledId !== undefined ? [settledId] : undefined,
    query: { enabled: settledId !== undefined, refetchInterval: 5_000 },
  });

  const { writeContract, data: hash, isPending } = useWriteContract();
  const { isLoading: isConfirming } = useWaitForTransactionReceipt({
    hash,
    query: { enabled: Boolean(hash) },
  });

  const canResolve = settledState !== undefined && settledState.winningTicket !== 0n && alreadyResolved === false;

  function resolve() {
    if (settledId === undefined) return;
    writeContract(
      {
        address: FACTION_WAR_ADDRESS,
        abi: FACTION_WAR_ABI,
        functionName: "resolveDrawing",
        args: [settledId],
      },
      { onSuccess: () => refetch() },
    );
  }

  return (
    <section>
      <h2>Resolved state</h2>
      {settledId === undefined && <p>Waiting for first drawing…</p>}
      {settledId !== undefined && settledState?.winningTicket === 0n && (
        <p>Drawing #{settledId.toString()} not settled yet — trigger battle above once eligible.</p>
      )}
      {settledId !== undefined && alreadyResolved === true && (
        <p>Drawing #{settledId.toString()} already resolved — map is up to date.</p>
      )}
      {canResolve && (
        <>
          <p>Drawing #{settledId?.toString()} settled and ready to resolve into zone captures.</p>
          <button onClick={resolve} disabled={isPending || isConfirming}>
            Resolve drawing
          </button>
        </>
      )}
    </section>
  );
}
