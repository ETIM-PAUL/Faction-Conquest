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
