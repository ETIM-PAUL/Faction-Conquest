import { useQuery } from "@tanstack/react-query";
import { useAccount } from "wagmi";
import {
  fetchWalletStats,
  fetchWalletWins,
  isUnknownWallet,
  SAMPLE_STATS,
  SAMPLE_WINS,
  type WalletStats,
  type Win,
} from "../lib/megapot";

export type MegapotProfile = {
  stats: WalletStats | undefined;
  wins: Win[];
  /// True when we're rendering SAMPLE_* instead of the connected wallet's own
  /// record — i.e. the mainnet index has never seen this address. Always drives
  /// a visible banner; never let the UI show sample numbers unlabelled.
  isPlaceholder: boolean;
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
};

/// Wallet profile from Megapot's Data API. Stats and wins are two independent
/// endpoints; stats is the one that decides placeholder-vs-real, so wins only
/// fetches once we know the wallet is actually indexed (saves a guaranteed-empty
/// request on every Sepolia connect).
///
/// Data is off-chain and mainnet-only — see lib/megapot.ts. For the on-chain,
/// testnet-correct view of this same wallet's tickets, see usePlayerTickets.
export function useMegapotProfile(): MegapotProfile {
  const { address } = useAccount();

  const statsQuery = useQuery({
    queryKey: ["megapot", "wallet-stats", address],
    queryFn: ({ signal }) => fetchWalletStats(address!, signal),
    enabled: Boolean(address),
    // Aggregates only move when a round settles — no reason to poll hard.
    staleTime: 60_000,
    retry: 1,
  });

  const known = statsQuery.data !== undefined && !isUnknownWallet(statsQuery.data);

  const winsQuery = useQuery({
    queryKey: ["megapot", "wallet-wins", address],
    queryFn: ({ signal }) => fetchWalletWins(address!, signal),
    enabled: Boolean(address) && known,
    staleTime: 60_000,
    retry: 1,
  });

  // On an API error we deliberately do NOT fall back to the sample — a failed
  // request is a different story from "wallet not on mainnet", and quietly
  // showing someone else's numbers as if they were yours would be worse than
  // showing the error.
  const failed = statsQuery.isError;
  const isPlaceholder = !failed && statsQuery.data !== undefined && !known;

  return {
    stats: failed ? undefined : isPlaceholder ? SAMPLE_STATS : statsQuery.data,
    wins: failed ? [] : isPlaceholder ? SAMPLE_WINS : (winsQuery.data ?? []),
    isPlaceholder,
    isLoading: statsQuery.isLoading || (known && winsQuery.isLoading),
    error: (statsQuery.error as Error | null) ?? null,
    refetch: () => {
      void statsQuery.refetch();
      if (known) void winsQuery.refetch();
    },
  };
}
