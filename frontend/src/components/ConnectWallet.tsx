import { useAccount, useChainId, useConnect, useDisconnect, useSwitchChain } from "wagmi";
import { baseSepolia } from "wagmi/chains";

export function ConnectWallet() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { connectors, connect, isPending: isConnecting } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain, isPending: isSwitching } = useSwitchChain();

  if (!isConnected) {
    const primary = connectors[0];
    return (
      <button onClick={() => primary && connect({ connector: primary })} disabled={!primary || isConnecting}>
        {isConnecting ? "Connecting…" : primary ? "Connect wallet" : "No wallet found"}
      </button>
    );
  }

  const wrongNetwork = chainId !== baseSepolia.id;

  if (wrongNetwork) {
    return (
      <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: "var(--space-1)" }}>
        <span style={{ color: "var(--accent)" }}>Wrong network</span>
        <button onClick={() => switchChain({ chainId: baseSepolia.id })} disabled={isSwitching}>
          {isSwitching ? "Switching…" : "Switch to Base Sepolia"}
        </button>
      </div>
    );
  }

  return (
    <p style={{ margin: 0 }}>
      {address?.slice(0, 6)}…{address?.slice(-4)} on {baseSepolia.name}{" "}
      <button onClick={() => disconnect()}>Disconnect</button>
    </p>
  );
}
