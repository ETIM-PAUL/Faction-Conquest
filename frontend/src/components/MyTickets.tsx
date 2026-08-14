import { useState } from "react";
import { decodeEventLog } from "viem";
import { useReadContract, useWriteContract } from "wagmi";
import { waitForTransactionReceipt } from "wagmi/actions";
import { JACKPOT_ABI } from "../contracts/Jackpot.abi";
import { JACKPOT_ADDRESS } from "../contracts/addresses";
import { useClaimedTickets } from "../hooks/useClaimedTickets";
import { usePlayerTickets, type PlayerTicket } from "../hooks/usePlayerTickets";
import { wagmiConfig } from "../wagmi";

function matchCount(ticketNormals: readonly number[], winningNormals: readonly number[]): number {
  const winningSet = new Set(winningNormals);
  return ticketNormals.filter((n) => winningSet.has(n)).length;
}

function TicketRow({ ticket, alreadyClaimed }: { ticket: PlayerTicket; alreadyClaimed: boolean }) {
  // "claimed" here is just optimistic UI for the instant after a successful tx —
  // `alreadyClaimed` (derived on-chain from TicketWinningsClaimed logs, see
  // useClaimedTickets) is the actual source of truth and is what survives a
  // remount/reload.
  const [status, setStatus] = useState<"idle" | "claiming" | "claimed" | "error">("idle");
  const [resultText, setResultText] = useState<string | null>(null);
  const { writeContractAsync } = useWriteContract();

  const { data: drawingState } = useReadContract({
    address: JACKPOT_ADDRESS,
    abi: JACKPOT_ABI,
    functionName: "getDrawingState",
    args: [ticket.drawingId],
    query: { refetchInterval: 10_000 },
  });

  const settled = drawingState !== undefined && drawingState.winningTicket !== 0n;

  const { data: winning } = useReadContract({
    address: JACKPOT_ADDRESS,
    abi: JACKPOT_ABI,
    functionName: "getUnpackedTicket",
    args: settled ? [ticket.drawingId, drawingState.winningTicket] : undefined,
    query: { enabled: settled },
  });

  const matched = winning ? matchCount(ticket.normals, winning[0]) : null;
  const bonusMatch = winning ? winning[1] === ticket.bonusball : null;

  async function claim() {
    setStatus("claiming");
    setResultText(null);
    try {
      const hash = await writeContractAsync({
        address: JACKPOT_ADDRESS,
        abi: JACKPOT_ABI,
        functionName: "claimWinnings",
        args: [[ticket.ticketId]],
      });
      const receipt = await waitForTransactionReceipt(wagmiConfig, { hash });

      let amountText = "Claim submitted";
      for (const log of receipt.logs) {
        try {
          const decoded = decodeEventLog({
            abi: JACKPOT_ABI,
            eventName: "TicketWinningsClaimed",
            data: log.data,
            topics: log.topics,
          });
          amountText = `Claimed ${(Number(decoded.args.winningsAmount) / 1e6).toFixed(4)} USDC`;
        } catch {
          // not the event we're looking for, ignore
        }
      }
      setResultText(amountText);
      setStatus("claimed");
    } catch (err) {
      setResultText(err instanceof Error ? err.message : "Claim failed");
      setStatus("error");
    }
  }

  return (
    <li
      className="panel"
      style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "var(--space-1)" }}
    >
      <div>
        <p style={{ marginBottom: 2 }}>
          Drawing #{ticket.drawingId.toString()} — [{ticket.normals.join(", ")}] + {ticket.bonusball}
        </p>
        <p style={{ color: "var(--text-muted)", fontSize: "var(--text-sm)", marginBottom: 0 }}>
          {!settled
            ? "Drawing not settled yet"
            : matched !== null
              ? `Matched ${matched}/5 normals${bonusMatch ? " + bonusball" : ""}`
              : "Checking…"}
        </p>
        {resultText && <p style={{ color: "var(--accent)", fontSize: "var(--text-sm)", marginBottom: 0 }}>{resultText}</p>}
        {alreadyClaimed && !resultText && (
          <p style={{ color: "var(--text-muted)", fontSize: "var(--text-sm)", marginBottom: 0 }}>Already claimed</p>
        )}
      </div>
      {settled && status !== "claimed" && !alreadyClaimed && (
        <button onClick={claim} disabled={status === "claiming"}>
          {status === "claiming" ? "Claiming…" : "Claim winnings"}
        </button>
      )}
    </li>
  );
}

/// Individual ticket winnings — separate from the faction war chest. Tickets
/// mint straight to the player (attack() passes msg.sender as _recipient), so
/// claiming is a direct Jackpot.claimWinnings call, nothing to do with
/// FactionWar. Closes the loop Build.md's mechanic otherwise leaves open:
/// buying a ticket through the game can win the real Megapot jackpot.
export function MyTickets() {
  const { tickets, loading } = usePlayerTickets();
  const { claimedIds } = useClaimedTickets();

  return (
    <section className="panel">
      <h2>My tickets</h2>
      {loading && <p style={{ color: "var(--text-muted)" }}>Loading…</p>}
      {!loading && tickets.length === 0 && (
        <p style={{ color: "var(--text-muted)" }}>No tickets bought yet — attack a zone to buy one.</p>
      )}
      {tickets.length > 0 && (
        <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
          {tickets.map((t) => (
            <TicketRow
              key={t.txHash + t.ticketId.toString()}
              ticket={t}
              alreadyClaimed={claimedIds.has(t.ticketId.toString())}
            />
          ))}
        </ul>
      )}
    </section>
  );
}
