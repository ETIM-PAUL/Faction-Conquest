import { useCallback, useEffect, useState } from "react";
import { useAccount, usePublicClient } from "wagmi";
import { JACKPOT_ABI } from "../contracts/Jackpot.abi";
import { JACKPOT_ADDRESS } from "../contracts/addresses";

// Same cap as usePlayerTickets — public RPCs reject eth_getLogs beyond a
// 10,000 block range.
const BLOCK_LOOKBACK = 9_000n;

/// Tickets are ERC-721s burned on claimWinnings, and the minimal Jackpot ABI here
/// has no "isClaimed" view — so claimed state is derived the same way
/// usePlayerTickets derives ownership: by indexing TicketWinningsClaimed logs.
/// Needed because MyTickets' local per-row "claimed" state is just React state:
/// it resets on remount/reload, so without this the "Claim winnings" button
/// reappears for a ticket already claimed on a previous visit.
export function useClaimedTickets() {
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const [claimedIds, setClaimedIds] = useState<Set<string>>(new Set());

  const fetchClaimed = useCallback(async () => {
    if (!address || !publicClient) {
      setClaimedIds(new Set());
      return;
    }

    const latest = await publicClient.getBlockNumber();
    const fromBlock = latest > BLOCK_LOOKBACK ? latest - BLOCK_LOOKBACK : 0n;

    const logs = await publicClient.getContractEvents({
      address: JACKPOT_ADDRESS,
      abi: JACKPOT_ABI,
      eventName: "TicketWinningsClaimed",
      args: { userAddress: address },
      fromBlock,
      toBlock: "latest",
    });

    setClaimedIds((prev) => {
      const next = new Set(prev);
      for (const log of logs) {
        if (log.args.userTicketId !== undefined) next.add(log.args.userTicketId.toString());
      }
      return next;
    });
  }, [address, publicClient]);

  useEffect(() => {
    fetchClaimed();
  }, [fetchClaimed]);

  useEffect(() => {
    if (!publicClient || !address) return;
    return publicClient.watchContractEvent({
      address: JACKPOT_ADDRESS,
      abi: JACKPOT_ABI,
      eventName: "TicketWinningsClaimed",
      args: { userAddress: address },
      onLogs(logs) {
        setClaimedIds((prev) => {
          const next = new Set(prev);
          for (const log of logs) {
            if (log.args.userTicketId !== undefined) next.add(log.args.userTicketId.toString());
          }
          return next;
        });
      },
    });
  }, [publicClient, address]);

  return { claimedIds };
}
