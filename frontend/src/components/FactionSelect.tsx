import { useWaitForTransactionReceipt, useWriteContract } from "wagmi";
import { FACTION_WAR_ABI } from "../contracts/FactionWar.abi";
import { FACTION_WAR_ADDRESS } from "../contracts/addresses";
import { FACTIONS, FACTION_COLOR, FACTION_LABEL, type Faction } from "../contracts/faction";
import { usePlayerFaction } from "../hooks/useFactionWar";

export function FactionSelect() {
  const { data: currentFaction, refetch } = usePlayerFaction();
  const { writeContract, data: hash, isPending } = useWriteContract();
  const { isLoading: isConfirming } = useWaitForTransactionReceipt({
    hash,
    query: { enabled: Boolean(hash) },
  });

  function join(f: Faction) {
    writeContract(
      {
        address: FACTION_WAR_ADDRESS,
        abi: FACTION_WAR_ABI,
        functionName: "joinFaction",
        args: [f],
      },
      { onSuccess: () => refetch() },
    );
  }

  return (
    <section>
      <h2>Choose a faction</h2>
      <div style={{ display: "flex", gap: "0.75rem" }}>
        {FACTIONS.map((f) => (
          <button
            key={f}
            onClick={() => join(f)}
            disabled={isPending || isConfirming}
            style={{
              padding: "1rem 1.5rem",
              border: currentFaction === f ? "3px solid white" : "1px solid #666",
              background: FACTION_COLOR[f],
              color: "white",
              cursor: "pointer",
            }}
          >
            {FACTION_LABEL[f]}
          </button>
        ))}
      </div>
      {currentFaction !== undefined && currentFaction !== 0 && (
        <p>You're on: {FACTION_LABEL[currentFaction as Faction]}</p>
      )}
    </section>
  );
}
