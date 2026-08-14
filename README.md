# Faction Conquest

A Megapot-native territory war on Base Sepolia. Players join a faction, attack numbered zones by
buying real Megapot tickets, and the real nightly drawing decides who controls the map.

Full spec in [Build.md](./Build.md); Megapot integration reference in [llms.md](./llms.md);
phase-by-phase build status, on-chain validation transcripts, and known bugs/fixes in
[BUILD_PLAN.md](./BUILD_PLAN.md).

## Megapot integration — how deep it goes

This isn't a game that links out to Megapot; Megapot *is* the game loop, in four layers:

1. **Ticket purchase = attack.** `FactionWar.attack(normals, bonusball)` buys one real ticket via
   `Jackpot.buyTickets`, tagging it to the caller's faction. No mock lottery — it's the live
   Base Sepolia Jackpot, real USDC, real ticket price read live from `getDrawingState`.
2. **Real drawing settlement = combat resolution.** `FactionWar.triggerBattle()` calls
   `Jackpot.runJackpot()` (paying the live entropy fee) to settle that night's real drawing.
   `resolveDrawing()` reads the actual winning numbers via `getUnpackedTicket` and awards each
   drawn zone to whichever faction bought the most real tickets on that number. The map is
   permanent — captures persist across drawings.
3. **Referral fees = the war chest.** `FactionWar` is the referrer on every attack (verified
   on-chain that Jackpot allows self-referral). The real USDC referral fees Megapot pays out
   accrue to the contract and get swept + split across factions proportional to territory on
   every `resolveDrawing`. Any player on a faction can claim their faction's whole pot via
   `claimFactionTreasury` — real money, not a scoreboard number. See BUILD_PLAN.md's "War Chest"
   section for the full on-chain validation transcript (accrual, sweep, split, claim, all
   confirmed against the live contract).
4. **Individual ticket winnings.** Tickets mint straight to the player (`attack()` passes
   `msg.sender`, not FactionWar, as the recipient), so the real per-ticket Megapot jackpot is
   still directly winnable and claimable — the "My tickets" panel reads Jackpot's own
   `TicketPurchased` events and calls `claimWinnings` directly, entirely independent of
   FactionWar. Validated on-chain against a real settled drawing (see BUILD_PLAN.md's "My
   Tickets" section).

Two mechanics stack on top of Megapot's own primitives without needing any off-chain
infrastructure: the Herald race (whoever triggers settlement earns a bonus for their faction)
and the war chest claim race (whoever claims first for their team takes the whole pot).

## Layout

```
contracts/   Foundry project — FactionWar.sol, tests, deploy script, smoke-test.sh
frontend/    Vite + React + TS + wagmi/viem + React Three Fiber
Build.md     Original build brief
llms.md      Megapot developer integration guide
BUILD_PLAN.md  Phase-by-phase checklist, on-chain validation transcripts, bugs found/fixed
```

## Quickstart

```bash
# Contracts
cd contracts
cp .env.example .env   # fill in PRIVATE_KEY, RPC URL
forge test              # 9 tests, all passing
forge script script/Deploy.s.sol --rpc-url base_sepolia --broadcast

# Frontend
cd ../frontend
cp .env.example .env   # fill in VITE_FACTION_WAR_ADDRESS from the deploy above
npm install
npm run dev
```

## Status

`FactionWar` is deployed and validated end-to-end against the live Base Sepolia `Jackpot` —
real ticket purchases, a real contested 2-faction capture, real drawing settlement, and the war
chest's full accrue → sweep → split → claim cycle have all been exercised on-chain, not just in
Foundry tests (transcripts in BUILD_PLAN.md). Frontend builds clean and is wired to the live
deployment; browser-based end-to-end verification and the 3D map's capture animation are the
remaining open items — see BUILD_PLAN.md's phase tracker.
