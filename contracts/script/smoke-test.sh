#!/usr/bin/env bash
# Phase 1 smoke test (Build.md section 3, step 1) — run this BEFORE writing a
# line of FactionWar. It talks to the real Jackpot contract directly with no
# wrapper in between: approve USDC, buy a ticket, wait past drawingTime,
# trigger settlement, poll until settled, decode the winning ticket.
#
# This is a manual, step-by-step tool, not a one-shot script — the "wait past
# drawingTime" step spans real clock time (drawingDurationInSeconds() is
# usually ~24h; check it first, since it can eat your whole build window).
#
# Usage:
#   cp .env.example .env   # fill in PRIVATE_KEY, RPC URL, etc.
#   source .env && export $(cut -d= -f1 .env | grep -v '^#')
#   ./script/smoke-test.sh <step>
#
# Steps, in order:
#   duration   - read drawingDurationInSeconds() — do this FIRST, today
#   state      - read current drawing's ballMax/bonusballMax/ticketPrice/drawingTime
#   approve    - approve Jackpot to pull USDC for one ticket
#   buy        - buy one real ticket with normals=1,2,3,4,5 bonusball=6 (edit below)
#   fee        - read the live entropy callback fee
#   trigger    - call runJackpot() once block.timestamp >= drawingTime
#   poll       - poll winningTicket until it's non-zero (run repeatedly)
#   decode     - decode the settled winning ticket via getUnpackedTicket

set -euo pipefail

: "${BASE_SEPOLIA_RPC_URL:?set in .env}"
: "${PRIVATE_KEY:?set in .env}"
: "${JACKPOT_ADDRESS:?set in .env}"
: "${USDC_ADDRESS:?set in .env}"

RPC=(--rpc-url "$BASE_SEPOLIA_RPC_URL")
SIGNER=(--private-key "$PRIVATE_KEY")
WALLET=$(cast wallet address "$PRIVATE_KEY")

DRAWING_STATE_SIG="getDrawingState(uint256)((uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint8,uint8,address,bool))"

drawing_id() {
  cast call "$JACKPOT_ADDRESS" "currentDrawingId()(uint256)" "${RPC[@]}"
}

case "${1:-}" in
  duration)
    echo "drawingDurationInSeconds():"
    cast call "$JACKPOT_ADDRESS" "drawingDurationInSeconds()(uint256)" "${RPC[@]}"
    ;;

  state)
    id=$(drawing_id)
    echo "currentDrawingId(): $id"
    echo "getDrawingState($id):"
    echo "  (prizePool, ticketPrice, edgePerTicket, referralWinShare, referralFee,"
    echo "   globalTicketsBought, lpEarnings, drawingTime, winningTicket, ballMax,"
    echo "   bonusballMax, payoutCalculator, jackpotLock)"
    cast call "$JACKPOT_ADDRESS" "$DRAWING_STATE_SIG" "$id" "${RPC[@]}"
    echo "Compare drawingTime above against: $(date +%s) (now, unix)"
    ;;

  approve)
    # 6-decimal USDC — this approves 1.00 USDC, adjust to the real ticketPrice from `state`.
    AMOUNT="${2:-1000000}"
    echo "Approving Jackpot to pull $AMOUNT USDC units from $WALLET..."
    cast send "$USDC_ADDRESS" "approve(address,uint256)" "$JACKPOT_ADDRESS" "$AMOUNT" \
      "${RPC[@]}" "${SIGNER[@]}"
    ;;

  buy)
    # EDIT normals/bonusball here before running — must be within this drawing's ballMax/bonusballMax.
    SOURCE_TAG=$(cast format-bytes32-string "SMOKETEST")
    echo "Buying 1 ticket: normals=[1,2,3,4,5] bonusball=6, no referrer..."
    cast send "$JACKPOT_ADDRESS" \
      "buyTickets((uint8[],uint8)[],address,address[],uint256[],bytes32)" \
      "[([1,2,3,4,5],6)]" "$WALLET" "[]" "[]" "$SOURCE_TAG" \
      "${RPC[@]}" "${SIGNER[@]}"
    ;;

  fee)
    echo "getEntropyCallbackFee() (wei):"
    cast call "$JACKPOT_ADDRESS" "getEntropyCallbackFee()(uint256)" "${RPC[@]}"
    ;;

  trigger)
    fee=$(cast call "$JACKPOT_ADDRESS" "getEntropyCallbackFee()(uint256)" "${RPC[@]}")
    echo "Calling runJackpot() with entropy fee = $fee wei..."
    cast send "$JACKPOT_ADDRESS" "runJackpot()" --value "$fee" "${RPC[@]}" "${SIGNER[@]}"
    ;;

  poll)
    id=$(drawing_id)
    prev=$((id - 1))
    echo "Polling getDrawingState($prev).winningTicket — re-run this until it's non-zero:"
    cast call "$JACKPOT_ADDRESS" "$DRAWING_STATE_SIG" "$prev" "${RPC[@]}"
    ;;

  decode)
    id="${2:?usage: smoke-test.sh decode <drawingId> <packedTicket>}"
    ticket="${3:?usage: smoke-test.sh decode <drawingId> <packedTicket>}"
    echo "getUnpackedTicket($id, $ticket):"
    cast call "$JACKPOT_ADDRESS" "getUnpackedTicket(uint256,uint256)(uint8[],uint8)" "$id" "$ticket" "${RPC[@]}"
    ;;

  *)
    echo "Usage: $0 {duration|state|approve|buy|fee|trigger|poll|decode}"
    exit 1
    ;;
esac
