import { useState } from "react";
import { useAccount } from "wagmi";
import { ConnectWallet } from "./components/ConnectWallet";
import { FactionSelect } from "./components/FactionSelect";
import { AttackForm } from "./components/AttackForm";
import { TriggerBattle } from "./components/TriggerBattle";
import { ResolveDrawing } from "./components/ResolveDrawing";
import { Leaderboard } from "./components/Leaderboard";
import { MapGrid } from "./components/MapGrid";
import { MapScene } from "./three/MapScene";
import { FACTION_WAR_ADDRESS } from "./contracts/addresses";

function App() {
  const { isConnected } = useAccount();
  const [show3D, setShow3D] = useState(false);

  return (
    <div style={{ padding: "1rem", fontFamily: "sans-serif" }}>
      <h1>Faction Conquest</h1>
      <ConnectWallet />

      {!FACTION_WAR_ADDRESS && (
        <p style={{ color: "orange" }}>
          VITE_FACTION_WAR_ADDRESS is unset — deploy FactionWar (contracts/script/Deploy.s.sol) and set it in
          .env before any faction/attack/battle actions will work.
        </p>
      )}

      {isConnected && FACTION_WAR_ADDRESS && (
        <>
          <FactionSelect />
          <AttackForm />
          <TriggerBattle />
          <ResolveDrawing />
          <Leaderboard />

          <button onClick={() => setShow3D((v) => !v)}>{show3D ? "Show flat grid" : "Show 3D map (phase 4)"}</button>
          {show3D ? <MapScene /> : <MapGrid />}
        </>
      )}
    </div>
  );
}

export default App;
