import { useAccount, useWaitForTransactionReceipt, useWriteContract } from "wagmi";
import { FACTION_WAR_ABI } from "../contracts/FactionWar.abi";
import { FACTION_WAR_ADDRESS } from "../contracts/addresses";
import { FACTION_COLOR, FACTION_GLYPH, FACTION_LABEL, Faction } from "../contracts/faction";
import { usePlayerFaction } from "../hooks/useFactionWar";

/// Faction assignment is permanent and balanced by the contract (whichever
/// faction has the fewest players gets the next joiner) — there's no manual
/// pick and no re-picking, so this is a single "join" action, not a chooser.
export function FactionSelect() {
  const { isConnected } = useAccount();
  const { data: currentFaction, refetch } = usePlayerFaction();
  const { writeContract, data: hash, isPending } = useWriteContract();
  const { isLoading: isConfirming } = useWaitForTransactionReceipt({
    hash,
    query: { enabled: Boolean(hash) },
  });

  function join() {
    writeContract(
      {
        address: FACTION_WAR_ADDRESS,
        abi: FACTION_WAR_ABI,
        functionName: "joinFaction",
        args: [],
      },
      { onSuccess: () => refetch() },
    );
  }

  const joined = currentFaction !== undefined && currentFaction !== Faction.NONE;

  return (
    <section className="panel">
      <h2>Faction</h2>
      {!isConnected && <p style={{ color: "var(--accent)" }}>Connect your wallet to join a faction.</p>}

      {isConnected && !joined && (
        <>
          <p style={{ color: "var(--text-muted)", fontSize: "var(--text-sm)" }}>
            You'll be assigned to whichever faction currently has the fewest players — permanent, no picking.
          </p>
          <button onClick={join} disabled={isPending || isConfirming}>
            {isPending || isConfirming ? "Joining…" : "Join a faction"}
          </button>
        </>
      )}

      {isConnected && joined && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "var(--space-1) var(--space-2)",
            borderRadius: "var(--radius)",
            background: FACTION_COLOR[currentFaction as Faction],
            color: "white",
            width: "fit-content",
          }}
        >
          <span className="hud-text" style={{ fontSize: "1.5rem", lineHeight: 1 }} aria-hidden="true">
            {FACTION_GLYPH[currentFaction as Faction]}
          </span>
          <span className="hud-text">You're on: {FACTION_LABEL[currentFaction as Faction]}</span>
        </div>
      )}
    </section>
  );
}
