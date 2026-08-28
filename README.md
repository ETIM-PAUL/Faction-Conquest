# ⚔ Faction Conquest

**A Megapot-native territory war.** Join a faction, attack numbered zones by buying *real*
Megapot tickets, and let the real nightly drawing decide who controls the map — no mock
lottery, no off-chain simulation, no separate "game currency."

Built for the **Best Game Powered by Megapot** track.

**🎮 Live: https://faction-conquest.vercel.app**

---

## The pitch

Lotteries are usually solitary — buy a ticket, wait, check if you won, repeat. Faction Conquest turns Megapot's real nightly drawing into a **team territory war**: every ticket you buy is an attack on a zone (the zone is literally the ticket number), every drawing is a battle, and the map is permanent — captures accumulate forever, they never reset. Winning zones makes your whole team's future tickets cheaper. You can still win the actual Megapot jackpot on your own ticket at the same time. Nothing about the core lottery is faked or mocked to make this work.

## How it plays

1. **Join a faction.** One-time, auto-balanced assignment (RED / BLUE / GREEN) — no stacking one team.
2. **Attack a zone.** Pick 5 numbers + a bonusball, same as any Megapot ticket — except each
   number you pick is a zone you're attacking for your faction.
3. **Race to trigger the drawing.** Whoever pays to settle that night's real drawing becomes the
   **Herald** for their faction — a bonus baked into the war chest split (see below).
4. **The real drawing decides everything.** When the winning numbers land, whichever faction
   bought the most tickets on each drawn number captures that zone. Permanently.
5. **Get paid two ways.** Your own ticket can still hit the real Megapot jackpot (claimable
   directly, independent of factions) — and your faction's territory makes every future attack
   cheaper for your whole team, funded by a shared war chest.

---

## Megapot integration — how deep it goes

Four layers, all against the live Base Sepolia `Jackpot` contract, no shortcuts:

1. **Ticket purchase = attack.** `FactionWar.attack(normals, bonusball)` buys one real ticket via
   `Jackpot.buyTickets`, tagging it to the caller's faction. Real USDC, real ticket price read
   live from `getDrawingState` — never hardcoded.
2. **Real drawing settlement = combat resolution.** `FactionWar.triggerBattle()` calls
   `Jackpot.runJackpot()` (paying the live entropy fee) to settle that night's real drawing.
   `resolveDrawing()` reads the actual winning numbers via `getUnpackedTicket` and awards each
   drawn zone to whichever faction bought the most real tickets on that number. The map is
   permanent — captures persist across drawings.
3. **Referral fees fund a war chest that's spent as a ticket-price discount.** `FactionWar` is
   the referrer on every attack (verified on-chain that Jackpot allows self-referral). The real
   USDC referral fees Megapot pays out accrue to the contract and get swept + split across
   factions on every `resolveDrawing`, weighted by **territory controlled and accumulated Herald
   bonuses** — triggering settlement earns your faction a real share, not just a leaderboard
   number. The chest is never withdrawn: it self-subsidizes `attack()`'s price on a tiered curve
   (25% / 50% / 75% territory share → 5% / 10% / 20% off), capped at 10% of the chest's balance
   per attack so one player can't drain it and lock teammates out. Faction members can also top
   the chest up directly via `depositToWarChest`.
4. **Individual ticket winnings.** Tickets mint straight to the player (`attack()` passes
   `msg.sender`, not `FactionWar`, as the recipient), so the real per-ticket Megapot jackpot is
   still directly winnable and claimable — the "My Tickets" panel reads Jackpot's own
   `TicketPurchased` events and calls `claimWinnings` directly, entirely independent of
   `FactionWar`.

Two mechanics stack on top of Megapot's own primitives without any off-chain infrastructure: the
**Herald race** (whoever triggers settlement earns their faction a share of the war chest) and
**faction-funded discounts** (territory dominance literally makes your team's tickets cheaper).

---

## Features

- 🏴 **Faction system** — auto-balanced, permanent assignment across 3 factions.
- ⚔ **Attack = real ticket purchase**, tagged to a zone and a faction.
- 🗺 **Permanent territory map** — flat grid view and a 3D map (React Three Fiber).
- 🏆 **Herald race** — pay to trigger the nightly settlement, earn your faction a war-chest share.
- 💰 **War chest** — funded by real referral fees *and* direct faction deposits, weighted by
  territory + Herald bonuses, spent automatically as a tiered ticket-price discount.
- 🎟 **My Tickets** — track and claim your own real Megapot jackpot winnings, independent of the faction game.
- 📜 **Live battle log** — every attack, trigger, resolution, discount, and chest event streamed from on-chain logs.
- 💬 **Faction chat** — wallet-gated, per-faction (Supabase), This is also gated per faction. Allowing faction members to plan collectively on which zone to attack.

---

## Architecture

```
Player Wallet
     │
     ▼
┌─────────────────┐        attack() / triggerBattle() / resolveDrawing()
│   FactionWar     │───────────────────────────────────────────────────┐
│  (this repo)     │                                                   │
└─────────────────┘                                                   ▼
     │  ▲                                                    ┌──────────────────┐
     │  │ tallies, territory,                                │  Jackpot          │
     │  │ war chest, discounts                                │  (real Megapot)   │
     │  ▼                                                    └──────────────────┘
┌─────────────────┐                                                   │
│ Frontend (React) │◀──────────────────────────────────────────────────┘
│ wagmi/viem reads  │        buyTickets / runJackpot / claimWinnings
│ + live event logs │        (real USDC, real drawings)
└─────────────────┘
```

`FactionWar` never holds custody of a player's winnings or replaces any Jackpot mechanic — it's
a thin, stateful wrapper that *tags* real purchases with a faction and *reacts* to real
settlement, then layers territory/war-chest game state on top.

## Tech stack

| Layer | Stack |
|---|---|
| Contracts | Solidity 0.8.24, Foundry (build/test/deploy) |
| Frontend | Vite, React 19, TypeScript, wagmi + viem, React Three Fiber |
| Chat | Supabase (wallet-gated faction channels) |
| Chain | Base Sepolia (`84532`), real Megapot `Jackpot` + USDC |

---

## Quickstart

```bash
# Contracts
cd contracts
cp .env.example .env      # fill in PRIVATE_KEY, BASE_SEPOLIA_RPC_URL
forge test                
forge script script/Deploy.s.sol --rpc-url base_sepolia --broadcast

# Frontend
cd ../frontend
cp .env.example .env      # fill in VITE_FACTION_WAR_ADDRESS from the deploy above
npm install
npm run dev
```

### Regenerating the ABI after a contract change

```bash
cd contracts
forge inspect FactionWar abi --json > /tmp/abi.json
# then rebuild frontend/src/contracts/FactionWar.abi.ts from it (see the file's own header comment)
```

## Project layout

```
contracts/   Foundry project — FactionWar.sol, tests, deploy script, smoke-test.sh
frontend/    Vite + React + TS + wagmi/viem + React Three Fiber
supabase/    Faction chat auth + migrations
```

---

## Testing

```bash
cd contracts && forge test -vv
```

15/15 passing, covering: faction join/balancing, attack tallying, tie-break resolution, double-
resolve guard, territory/Herald bookkeeping, the war-chest sweep (including the Herald-weighted
split), direct chest deposits, and the territory-tier discount (including its per-attack chest
cap).

## Status

- **Core loop (attack → trigger → resolve → capture)** — on-chain validated against real Base
  Sepolia drawings with two funded wallets, including a genuine contested 2-vs-1 capture. See
  BUILD_PLAN.md's Phase 2 transcript.
- **War chest accrual/sweep** — on-chain validated end-to-end (accrue → safe deferral when
  untargeted → sweep → proportional split → payout) against real referral fees. See BUILD_PLAN.md's
  "War Chest" section.
- **Territory-tier discounts, Herald-weighted split, direct chest deposits** — implemented,
  covered by the Foundry suite, and **redeployed** to Base Sepolia at
  [`0x541804a3BAc7b275054f14481814131c223BE2BC`](https://sepolia.basescan.org/address/0x541804a3BAc7b275054f14481814131c223BE2BC)
  (`contracts/.env` and `frontend/.env` both point at it).
- **My Tickets (individual jackpot claim)** — on-chain validated against a real settled drawing; now also previews expected payout via Megapot's `getTicketTierIds` +
`PayoutCalculator.getExpectedDrawingTierPayouts` before claiming, so a $0 ticket never costs gas to find out.
- **Frontend** — builds and type-checks clean, wired to the live deployment; full click-through browser verification of the newest features (discount UI, deposit form, payout preview, claimed-ticket persistence) is the next step before demo.

---

## License

MIT
