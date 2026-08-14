import { useCallback, useEffect, useState } from "react";
import { useAccount, usePublicClient } from "wagmi";
import { JACKPOT_ABI } from "../contracts/Jackpot.abi";
import { JACKPOT_ADDRESS } from "../contracts/addresses";

// Cross-component signal: AttackForm fires this once an attack tx confirms
// so MyTickets (a sibling, not a parent/child) can refetch without a shared
// store. usePlayerTickets listens below.
export const TICKET_PURCHASED_EVENT = "faction-war:ticket-purchased";

export type PlayerTicket = {
  drawingId: bigint;
  ticketId: bigint;
  normals: readonly number[];
  bonusball: number;
  txHash: `0x${string}`;
};

// Public RPCs cap eth_getLogs at a 10,000 block range (confirmed against
// sepolia.base.org) — stay under that. ~9,000 blocks * ~2s ≈ 5 hours, comfortably
// covering a build/demo session; a long-lived deployment would need to persist
// tickets seen rather than re-scanning from scratch.
const BLOCK_LOOKBACK = 9_000n;

/// All tickets the connected wallet has ever bought through attack() — Jackpot
/// mints tickets straight to the player (attack() passes msg.sender as
/// _recipient), so this reads Jackpot's own TicketPurchased log directly
/// rather than anything FactionWar tracks.
export function usePlayerTickets() {
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const [tickets, setTickets] = useState<PlayerTicket[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchTickets = useCallback(async () => {
    if (!address || !publicClient) {
      setTickets([]);
      return;
    }

    setLoading(true);
    try {
      const latest = await publicClient.getBlockNumber();
      const fromBlock = latest > BLOCK_LOOKBACK ? latest - BLOCK_LOOKBACK : 0n;

      const logs = await publicClient.getContractEvents({
        address: JACKPOT_ADDRESS,
        abi: JACKPOT_ABI,
        eventName: "TicketPurchased",
        args: { recipient: address },
        fromBlock,
        toBlock: "latest",
      });

      const parsed = logs
        .map((log) => {
          const { currentDrawingId, userTicketId, normals, bonusball } = log.args;
          if (currentDrawingId === undefined || userTicketId === undefined || !normals || bonusball === undefined) {
            return null;
          }
          return {
            drawingId: currentDrawingId,
            ticketId: userTicketId,
            normals,
            bonusball,
            txHash: log.transactionHash,
          };
        })
        .filter((t): t is PlayerTicket => t !== null)
        .reverse(); // newest first

      setTickets(parsed);
    } finally {
      setLoading(false);
    }
  }, [address, publicClient]);

  useEffect(() => {
    fetchTickets();
  }, [fetchTickets]);

  useEffect(() => {
    window.addEventListener(TICKET_PURCHASED_EVENT, fetchTickets);
    return () => window.removeEventListener(TICKET_PURCHASED_EVENT, fetchTickets);
  }, [fetchTickets]);

  return { tickets, loading, refetch: fetchTickets };
}
