import { useState } from "react";
import { useAccount, useReadContract, useWaitForTransactionReceipt, useWriteContract } from "wagmi";
import { FACTION_WAR_ABI } from "../contracts/FactionWar.abi";
import { USDC_ABI } from "../contracts/Jackpot.abi";
import { FACTION_WAR_ADDRESS, USDC_ADDRESS } from "../contracts/addresses";
import { useDrawingState } from "../hooks/useDrawingState";

/// Flat, unstyled attack form (Build.md phase 3 / section 4.3). Approves USDC
/// to FactionWar once (if needed), then calls attack(normals, bonusball) —
/// FactionWar itself forwards the real purchase to Jackpot.buyTickets.
export function AttackForm() {
  const { address } = useAccount();
  const { drawingState } = useDrawingState();
  const [normalsInput, setNormalsInput] = useState("1,2,3,4,5");
  const [bonusball, setBonusball] = useState(1);

  const ballMax = drawingState?.ballMax ?? 0;
  const bonusballMax = drawingState?.bonusballMax ?? 0;
  const ticketPrice = drawingState?.ticketPrice ?? 0n;

  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: USDC_ADDRESS,
    abi: USDC_ABI,
    functionName: "allowance",
    args: address ? [address, FACTION_WAR_ADDRESS] : undefined,
    query: { enabled: Boolean(address) },
  });

  const { writeContract, data: hash, isPending } = useWriteContract();
  const { isLoading: isConfirming } = useWaitForTransactionReceipt({
    hash,
    query: { enabled: Boolean(hash) },
  });

  const needsApproval = (allowance ?? 0n) < ticketPrice;

  function approve() {
    writeContract(
      {
        address: USDC_ADDRESS,
        abi: USDC_ABI,
        functionName: "approve",
        args: [FACTION_WAR_ADDRESS, ticketPrice * 100n], // headroom for a few attacks before re-approving
      },
      { onSuccess: () => refetchAllowance() },
    );
  }

  function attack() {
    const normals = normalsInput
      .split(",")
      .map((n) => Number(n.trim()))
      .filter((n) => Number.isInteger(n) && n > 0);

    writeContract({
      address: FACTION_WAR_ADDRESS,
      abi: FACTION_WAR_ABI,
      functionName: "attack",
      args: [normals, bonusball],
    });
  }

  return (
    <section>
      <h2>Attack a zone</h2>
      <p>
        Ball range: 1–{ballMax || "?"} · Bonusball: 1–{bonusballMax || "?"} · Ticket price:{" "}
        {(Number(ticketPrice) / 1e6).toFixed(2)} USDC
      </p>
      <label>
        Normals (comma-separated):{" "}
        <input value={normalsInput} onChange={(e) => setNormalsInput(e.target.value)} />
      </label>
      <br />
      <label>
        Bonusball:{" "}
        <input
          type="number"
          min={1}
          max={bonusballMax || undefined}
          value={bonusball}
          onChange={(e) => setBonusball(Number(e.target.value))}
        />
      </label>
      <br />
      {needsApproval ? (
        <button onClick={approve} disabled={isPending || isConfirming}>
          Approve USDC
        </button>
      ) : (
        <button onClick={attack} disabled={isPending || isConfirming}>
          Buy ticket / attack
        </button>
      )}
    </section>
  );
}
