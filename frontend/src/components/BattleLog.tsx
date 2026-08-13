import { useState } from "react";
import { useWatchContractEvent } from "wagmi";
import { FACTION_WAR_ABI } from "../contracts/FactionWar.abi";
import { FACTION_WAR_ADDRESS } from "../contracts/addresses";
import { FACTION_GLYPH, FACTION_LABEL, type Faction } from "../contracts/faction";

const MAX_VISIBLE = 5;

type Entry = { id: string; text: string };

function factionTag(f: Faction) {
  return `${FACTION_GLYPH[f]} ${FACTION_LABEL[f]}`;
}

/// Notification Queue Management pattern (game-ui-design skill): newest on
/// top, capped visible count, brief fade-in — turns the contract's own
/// events into a live feed instead of requiring a block explorer to see
/// what's happening.
export function BattleLog() {
  const [entries, setEntries] = useState<Entry[]>([]);

  function push(text: string) {
    setEntries((prev) => [{ id: `${Date.now()}-${Math.random()}`, text }, ...prev].slice(0, MAX_VISIBLE));
  }

  useWatchContractEvent({
    address: FACTION_WAR_ADDRESS,
    abi: FACTION_WAR_ABI,
    eventName: "ZoneAttacked",
    enabled: Boolean(FACTION_WAR_ADDRESS),
    onLogs(logs) {
      for (const log of logs) {
        const { faction, normals } = log.args;
        if (faction === undefined || !normals) continue;
        push(`${factionTag(faction as Faction)} attacked zone${normals.length > 1 ? "s" : ""} ${normals.join(", ")}`);
      }
    },
  });

  useWatchContractEvent({
    address: FACTION_WAR_ADDRESS,
    abi: FACTION_WAR_ABI,
    eventName: "BattleTriggered",
    enabled: Boolean(FACTION_WAR_ADDRESS),
    onLogs(logs) {
      for (const log of logs) {
        const { faction, drawingId } = log.args;
        if (faction === undefined || drawingId === undefined) continue;
        push(`${factionTag(faction as Faction)} triggered battle for drawing #${drawingId} — Herald bonus earned`);
      }
    },
  });

  useWatchContractEvent({
    address: FACTION_WAR_ADDRESS,
    abi: FACTION_WAR_ABI,
    eventName: "ZonesResolved",
    enabled: Boolean(FACTION_WAR_ADDRESS),
    onLogs(logs) {
      for (const log of logs) {
        const { drawingId, capturedZones, winningFactions } = log.args;
        if (!capturedZones || !winningFactions) continue;
        const captures = capturedZones
          .map((zone, i) => `#${zone}→${FACTION_GLYPH[winningFactions[i] as Faction]}`)
          .join(", ");
        push(`Drawing #${drawingId} resolved: ${captures}`);
      }
    },
  });

  if (!FACTION_WAR_ADDRESS) return null;

  return (
    <section className="panel">
      <h2>Battle log</h2>
      {entries.length === 0 ? (
        <p style={{ color: "var(--text-muted)" }}>No activity yet — attacks and settlements will appear here.</p>
      ) : (
        <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: "var(--space-1)" }}>
          {entries.map((e) => (
            <li key={e.id} className="fade-in" style={{ fontSize: "var(--text-sm)", color: "var(--text-muted)" }}>
              {e.text}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
