import { useWaitForTransactionReceipt, useWriteContract } from "wagmi";
import { FACTION_WAR_ABI } from "../contracts/FactionWar.abi";
import { FACTION_WAR_ADDRESS } from "../contracts/addresses";
import { FACTIONS, FACTION_COLOR, FACTION_GLYPH, FACTION_LABEL, type Faction } from "../contracts/faction";
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
    <section className="panel">
      <h2>Choose a faction</h2>
      <div style={{ display: "flex", gap: "var(--space-1)" }}>
        {FACTIONS.map((f) => {
          const selected = currentFaction === f;
          return (
            <button
              key={f}
              onClick={() => join(f)}
              disabled={isPending || isConfirming}
              aria-pressed={selected}
              style={{
                flex: 1,
                minHeight: 64,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 4,
                border: selected ? "2px solid var(--accent)" : "1px solid var(--panel-border)",
                boxShadow: selected ? "0 0 8px var(--accent)" : "none",
                background: FACTION_COLOR[f],
                color: "white",
              }}
            >
              <span className="hud-text" style={{ fontSize: "1.5rem", lineHeight: 1 }} aria-hidden="true">
                {FACTION_GLYPH[f]}
                {selected ? " ✓" : ""}
              </span>
              <span className="hud-text">{FACTION_LABEL[f]}</span>
            </button>
          );
        })}
      </div>
      {currentFaction !== undefined && currentFaction !== 0 && (
        <p>
          You're on: {FACTION_GLYPH[currentFaction as Faction]} {FACTION_LABEL[currentFaction as Faction]}
        </p>
      )}
    </section>
  );
}
