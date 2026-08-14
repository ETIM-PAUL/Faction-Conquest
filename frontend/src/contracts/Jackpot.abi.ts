// Minimal read-only subset of the real Megapot Jackpot ABI — just what the UI
// needs directly (ticket price, drawing countdown, entropy fee). Confirmed
// against https://llms.megapot.io/abi/Jackpot.json — re-verify if addresses
// or signatures change (Build.md 2.1).
export const JACKPOT_ABI = [
  {
    type: "function",
    name: "currentDrawingId",
    inputs: [],
    outputs: [{ name: "", type: "uint256", internalType: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "drawingDurationInSeconds",
    inputs: [],
    outputs: [{ name: "", type: "uint256", internalType: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getEntropyCallbackFee",
    inputs: [],
    outputs: [{ name: "fee", type: "uint256", internalType: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getUnpackedTicket",
    inputs: [
      { name: "_drawingId", type: "uint256", internalType: "uint256" },
      { name: "_packedTicket", type: "uint256", internalType: "uint256" },
    ],
    outputs: [
      { name: "normals", type: "uint8[]", internalType: "uint8[]" },
      { name: "bonusball", type: "uint8", internalType: "uint8" },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getDrawingState",
    inputs: [{ name: "_drawingId", type: "uint256", internalType: "uint256" }],
    outputs: [
      {
        name: "",
        type: "tuple",
        internalType: "struct IJackpot.DrawingState",
        components: [
          { name: "prizePool", type: "uint256", internalType: "uint256" },
          { name: "ticketPrice", type: "uint256", internalType: "uint256" },
          { name: "edgePerTicket", type: "uint256", internalType: "uint256" },
          { name: "referralWinShare", type: "uint256", internalType: "uint256" },
          { name: "referralFee", type: "uint256", internalType: "uint256" },
          { name: "globalTicketsBought", type: "uint256", internalType: "uint256" },
          { name: "lpEarnings", type: "uint256", internalType: "uint256" },
          { name: "drawingTime", type: "uint256", internalType: "uint256" },
          { name: "winningTicket", type: "uint256", internalType: "uint256" },
          { name: "ballMax", type: "uint8", internalType: "uint8" },
          { name: "bonusballMax", type: "uint8", internalType: "uint8" },
          { name: "payoutCalculator", type: "address", internalType: "contract IPayoutCalculator" },
          { name: "jackpotLock", type: "bool", internalType: "bool" },
        ],
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "claimWinnings",
    inputs: [{ name: "_userTicketIds", type: "uint256[]", internalType: "uint256[]" }],
    outputs: [],
    stateMutability: "nonpayable",
  },
  // Preview a ticket's payout before spending gas on claimWinnings: tierId = normalMatches * 2 +
  // bonusballMatch (tiers 0 and 2 pay nothing). Pair with PAYOUT_CALCULATOR_ABI's
  // getExpectedDrawingTierPayouts, called against the drawing's own `payoutCalculator` address —
  // confirmed against https://llms.megapot.io/tasks/claim-winnings.
  {
    type: "function",
    name: "getTicketTierIds",
    inputs: [{ name: "_ticketIds", type: "uint256[]", internalType: "uint256[]" }],
    outputs: [{ name: "tierIds", type: "uint256[]", internalType: "uint256[]" }],
    stateMutability: "view",
  },
  // Confirmed on-chain: topic0 0x1171a029...d37b372 matches every attack() purchase's
  // Jackpot-side log in this session — field order/types verified against real logs.
  {
    type: "event",
    name: "TicketPurchased",
    inputs: [
      { name: "recipient", type: "address", indexed: true },
      { name: "currentDrawingId", type: "uint256", indexed: true },
      { name: "source", type: "bytes32", indexed: true },
      { name: "userTicketId", type: "uint256", indexed: false },
      { name: "normals", type: "uint8[]", indexed: false },
      { name: "bonusball", type: "uint8", indexed: false },
      { name: "referralScheme", type: "bytes32", indexed: false },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "TicketWinningsClaimed",
    inputs: [
      { name: "userAddress", type: "address", indexed: true },
      { name: "drawingId", type: "uint256", indexed: true },
      { name: "userTicketId", type: "uint256", indexed: false },
      { name: "matchedNormals", type: "uint256", indexed: false },
      { name: "bonusballMatch", type: "bool", indexed: false },
      { name: "winningsAmount", type: "uint256", indexed: false },
    ],
    anonymous: false,
  },
] as const;

// Per-drawing payout calculator (address comes from DrawingState.payoutCalculator — it's not a
// fixed address, read it live per drawing rather than hardcoding one). getExpectedDrawingTierPayouts
// returns a fixed-size 12-slot array; drawingTierPayouts[tierId] is that tier's per-ticket USDC
// payout (6 decimals) for the given drawing. Confirmed against
// https://llms.megapot.io/tasks/claim-winnings.
export const PAYOUT_CALCULATOR_ABI = [
  {
    type: "function",
    name: "getExpectedDrawingTierPayouts",
    inputs: [
      { name: "_drawingId", type: "uint256", internalType: "uint256" },
      { name: "_prizePool", type: "uint256", internalType: "uint256" },
      { name: "_normalMax", type: "uint8", internalType: "uint8" },
      { name: "_bonusballMax", type: "uint8", internalType: "uint8" },
    ],
    outputs: [{ name: "drawingTierPayouts", type: "uint256[12]", internalType: "uint256[12]" }],
    stateMutability: "view",
  },
] as const;

// USDC (mock ERC20 on Base Sepolia) — just approve/allowance/balanceOf.
export const USDC_ABI = [
  {
    type: "function",
    name: "approve",
    inputs: [
      { name: "spender", type: "address", internalType: "address" },
      { name: "amount", type: "uint256", internalType: "uint256" },
    ],
    outputs: [{ name: "", type: "bool", internalType: "bool" }],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "allowance",
    inputs: [
      { name: "owner", type: "address", internalType: "address" },
      { name: "spender", type: "address", internalType: "address" },
    ],
    outputs: [{ name: "", type: "uint256", internalType: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "balanceOf",
    inputs: [{ name: "account", type: "address", internalType: "address" }],
    outputs: [{ name: "", type: "uint256", internalType: "uint256" }],
    stateMutability: "view",
  },
] as const;
