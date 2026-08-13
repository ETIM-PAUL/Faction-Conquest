# Faction Conquest

Megapot-native territory war on Base Sepolia. Full spec in [Build.md](./Build.md); Megapot
integration reference in [llms.md](./llms.md); phase-by-phase status and next actions in
[BUILD_PLAN.md](./BUILD_PLAN.md) — **start there**.

## Layout

```
contracts/   Foundry project — FactionWar.sol, tests, deploy script, smoke-test.sh
frontend/    Vite + React + TS + wagmi/viem + React Three Fiber
Build.md     Original build brief
llms.md      Megapot developer integration guide
BUILD_PLAN.md  Phase-by-phase checklist and current status
```

## Quickstart

```bash
# Contracts
cd contracts
cp .env.example .env   # fill in PRIVATE_KEY, RPC URL, referrer addresses
forge test              # 7 tests, all passing
forge script script/Deploy.s.sol --rpc-url base_sepolia --broadcast

# Frontend
cd ../frontend
cp .env.example .env   # fill in VITE_FACTION_WAR_ADDRESS from the deploy above
npm install
npm run dev
```

## Status

Contract written, unit-tested (mocked Jackpot/USDC), and compiling clean. Frontend scaffolded
and building clean, all Build.md section 4.3 UI pieces present as components. Nothing has been
deployed or run against the live Base Sepolia Jackpot yet — see BUILD_PLAN.md Phase 1 for the
smoke test to run first and Phase 2 for deployment steps.
