import { useAccount, useConnect, useDisconnect } from "wagmi";

export function ConnectWallet() {
  const { address, isConnected, chain } = useAccount();
  const { connectors, connect } = useConnect();
  const { disconnect } = useDisconnect();

  if (isConnected) {
    return (
      <p>
        {address?.slice(0, 6)}…{address?.slice(-4)} on {chain?.name ?? "unknown chain"}{" "}
        <button onClick={() => disconnect()}>Disconnect</button>
      </p>
    );
  }

  return (
    <div>
      {connectors.map((connector) => (
        <button key={connector.id} onClick={() => connect({ connector })}>
          Connect {connector.name}
        </button>
      ))}
    </div>
  );
}
