import { useAccount, useReadContract } from "wagmi";
import { FACTION_WAR_ABI } from "../contracts/FactionWar.abi";
import { FACTION_WAR_ADDRESS } from "../contracts/addresses";
import { Faction } from "../contracts/faction";

const enabled = Boolean(FACTION_WAR_ADDRESS);

export function usePlayerFaction() {
  const { address } = useAccount();
  return useReadContract({
    address: FACTION_WAR_ADDRESS,
    abi: FACTION_WAR_ABI,
    functionName: "playerFaction",
    args: address ? [address] : undefined,
    query: { enabled: enabled && Boolean(address), refetchInterval: 5_000 },
  });
}

/// Full map (Build.md `getMapState`) — one poll drives both the flat grid
/// (phase 3) and the 3D scene (phase 4).
export function useMapState() {
  return useReadContract({
    address: FACTION_WAR_ADDRESS,
    abi: FACTION_WAR_ABI,
    functionName: "getMapState",
    query: { enabled, refetchInterval: 5_000 },
  });
}

/// Leaderboard data: territory + Herald bonus per faction (phase 5).
export function useFactionScores() {
  return useReadContract({
    address: FACTION_WAR_ADDRESS,
    abi: FACTION_WAR_ABI,
    functionName: "getFactionScores",
    query: { enabled, refetchInterval: 5_000 },
  });
}

export function factionScoreFor(
  territory: readonly bigint[] | undefined,
  herald: readonly bigint[] | undefined,
  faction: Faction,
) {
  return {
    territory: territory?.[faction] ?? 0n,
    herald: herald?.[faction] ?? 0n,
  };
}
