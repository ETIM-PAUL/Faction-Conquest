import { useReadContract } from "wagmi";
import { JACKPOT_ABI } from "../contracts/Jackpot.abi";
import { JACKPOT_ADDRESS } from "../contracts/addresses";

/// Live current-drawing state (ballMax, ticketPrice, drawingTime, etc). Polls
/// every 5s — cheap enough for a demo, revisit if it ever needs to scale.
export function useDrawingState() {
  const { data: drawingId } = useReadContract({
    address: JACKPOT_ADDRESS,
    abi: JACKPOT_ABI,
    functionName: "currentDrawingId",
    query: { refetchInterval: 5_000 },
  });

  const { data: drawingState, ...rest } = useReadContract({
    address: JACKPOT_ADDRESS,
    abi: JACKPOT_ABI,
    functionName: "getDrawingState",
    args: drawingId !== undefined ? [drawingId] : undefined,
    query: { enabled: drawingId !== undefined, refetchInterval: 5_000 },
  });

  const { data: entropyFee } = useReadContract({
    address: JACKPOT_ADDRESS,
    abi: JACKPOT_ABI,
    functionName: "getEntropyCallbackFee",
    query: { refetchInterval: 5_000 },
  });

  // Rarely changes — long stale time is fine, avoids a redundant poll.
  const { data: drawingDuration } = useReadContract({
    address: JACKPOT_ADDRESS,
    abi: JACKPOT_ABI,
    functionName: "drawingDurationInSeconds",
    query: { staleTime: 60_000 },
  });

  return { drawingId, drawingState, entropyFee, drawingDuration, ...rest };
}
