import { useState } from "react";
import { useAccount } from "wagmi";
import { ConnectWallet } from "./components/ConnectWallet";
import { FactionSelect } from "./components/FactionSelect";
import { AttackForm } from "./components/AttackForm";
import { TriggerBattle } from "./components/TriggerBattle";
import { ResolveDrawing } from "./components/ResolveDrawing";
import { Leaderboard } from "./components/Leaderboard";
import { BattleLog } from "./components/BattleLog";
import { MapGrid } from "./components/MapGrid";
import { MapScene } from "./three/MapScene";
import { FACTION_WAR_ADDRESS } from "./contracts/addresses";

function App() {
  const { isConnected } = useAccount();
  const [show3D, setShow3D] = useState(false);

  return (
    <div style={{ minHeight: "100vh" }}>
      <header
        className="panel"
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          borderRadius: 0,
          borderLeft: "none",
          borderRight: "none",
          borderTop: "none",
          padding: "var(--space-2) var(--space-3)",
          marginBottom: 0,
        }}
      >
        <h1 style={{ margin: 0, fontSize: "var(--text-lg)" }}>⚔ Faction Conquest</h1>
        <ConnectWallet />
      </header>

      <div style={{ padding: "var(--space-3)" }}>
        {!FACTION_WAR_ADDRESS && (
          <p style={{ color: "var(--accent)" }}>
            VITE_FACTION_WAR_ADDRESS is unset — deploy FactionWar (contracts/script/Deploy.s.sol) and set it in
            .env before any faction/attack/battle actions will work.
          </p>
        )}

        {!isConnected && FACTION_WAR_ADDRESS && (
          <p className="panel" style={{ color: "var(--accent)" }}>
            You're browsing read-only. Connect your wallet to join a faction, attack zones, and trigger battles.
          </p>
        )}

        {FACTION_WAR_ADDRESS && (
          <div style={{ display: "flex", gap: "var(--space-3)", flexWrap: "wrap", alignItems: "flex-start" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)", flex: "1 1 320px", minWidth: 320 }}>
              <FactionSelect />
              <AttackForm />
              <TriggerBattle />
              <ResolveDrawing />
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)", flex: "2 1 480px", minWidth: 320 }}>
              <div style={{ display: "flex", justifyContent: "flex-end" }}>
                <button onClick={() => setShow3D((v) => !v)}>
                  {show3D ? "Show flat grid" : "Show 3D map"}
                </button>
              </div>

              {show3D ? (
                <div className="panel" style={{ height: 420, padding: 0, overflow: "hidden" }}>
                  <MapScene />
                </div>
              ) : (
                <MapGrid />
              )}

              <Leaderboard />
              <BattleLog />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
