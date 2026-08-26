// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IJackpot} from "./interfaces/IJackpot.sol";
import {IERC20} from "./interfaces/IERC20.sol";

/// @title FactionWar
/// @notice Thin wrapper around the real Megapot Jackpot contract that tags every
/// ticket purchase with a faction and turns each drawing's winning numbers into
/// territory capture. See Build.md section 2 for the full spec this implements.
///
/// Decisions locked for this build (Build.md section 5 open items):
/// - 3 factions: RED, BLUE, GREEN.
/// - bonusball is purchase-only, not a capturable zone — only `normals` resolve.
/// - Tie-break on equal ticket counts: lowest Faction enum value wins (RED > BLUE > GREEN).
///
/// War chest: FactionWar is the referrer on every attack (self-referral — confirmed
/// on-chain against Base Sepolia that Jackpot allows referrer == msg.sender). Real
/// USDC referral fees accrue to this contract and get swept + split across factions
/// on every resolveDrawing, weighted by territory controlled *and* accumulated Herald
/// bonuses (`_sweepAndFundWarChest`) — triggering settlement earns a real share of the
/// chest, not just a leaderboard stat. Faction members can also top the chest up
/// directly via `depositToWarChest`. The chest is never withdrawn — it self-subsidizes
/// ticket price: the more zones a faction controls, the cheaper `attack()` gets for
/// everyone on that faction (see `_quoteDiscount`). Each attack only draws a capped
/// slice of the chest so one player can't burn through the whole pot and lock
/// teammates out of the discount.
contract FactionWar {
    enum Faction {
        NONE,
        RED,
        BLUE,
        GREEN
    }

    uint8 public constant FACTION_COUNT = 3;
    uint256 public constant FULL_REFERRAL_SPLIT = 1e18;
    uint256 public constant BPS_DENOMINATOR = 10_000;

    // Territory-share tiers (% of ballMax controlled, in bps) -> ticket discount (in bps).
    uint256 public constant TIER1_TERRITORY_BPS = 2_500; // 25% of zones
    uint256 public constant TIER2_TERRITORY_BPS = 5_000; // 50% of zones
    uint256 public constant TIER3_TERRITORY_BPS = 7_500; // 75% of zones
    uint256 public constant TIER1_DISCOUNT_BPS = 500; // 5% off
    uint256 public constant TIER2_DISCOUNT_BPS = 1_000; // 10% off
    uint256 public constant TIER3_DISCOUNT_BPS = 2_000; // 20% off

    // Caps how much of the faction's chest a single attack can spend on its own
    // discount, so the chest lasts across many attacks instead of one player
    // draining it before teammates get a turn.
    uint256 public constant MAX_CHEST_BPS_PER_ATTACK = 1_000; // 10% of current chest balance

    // Each Herald bonus counts as this many zone-equivalents when splitting swept
    // referral fees across factions — triggering settlement earns a share of the
    // chest split, not just a leaderboard number.
    uint256 public constant HERALD_WEIGHT = 1;

    struct ZoneState {
        Faction controller;
        uint256 lastCapturedDrawing;
    }

    IJackpot public immutable jackpot;
    IERC20 public immutable usdc;

    mapping(uint8 => ZoneState) private zones; // number => zone, 1..ballMax
    mapping(address => Faction) public playerFaction;
    mapping(uint256 => Faction) public heraldByDrawing; // drawingId => faction that triggered settlement
    mapping(uint256 => bool) public drawingResolved;
    mapping(Faction => uint256) public territoryCount;
    mapping(Faction => uint256) public heraldBonus;
    mapping(Faction => uint256) public factionWarChest; // claimable USDC, funded by referral fees
    mapping(Faction => uint256) public factionPlayerCount; // headcount, for balanced auto-assignment
    // zoneNum => drawingId => Faction => ticket count. Scoped per drawing so tickets
    // bought after a drawing's numbers are drawn (i.e. after jackpot.currentDrawingId()
    // has already advanced to the next round) can never be tallied into that concluded
    // drawing's resolution — only attacks placed before the draw concluded count.
    mapping(uint8 => mapping(uint256 => mapping(uint8 => uint256))) private ticketsByZoneDrawing;

    uint256 public lastResolvedDrawing;

    event FactionJoined(address indexed player, Faction faction);
    event ZoneAttacked(
        uint256 indexed drawingId, Faction indexed faction, uint8[] normals, uint8 bonusball, address indexed player
    );
    event BattleTriggered(uint256 indexed drawingId, Faction indexed faction, address caller);
    event ZonesResolved(uint256 indexed drawingId, uint8[] capturedZones, Faction[] winningFactions);
    event WarChestFunded(uint256 indexed drawingId, uint256 totalSwept, uint256[] shares);
    event WarChestDeposited(Faction indexed faction, address indexed depositor, uint256 amount);
    event TicketDiscounted(
        uint256 indexed drawingId,
        Faction indexed faction,
        address indexed player,
        uint256 discountBps,
        uint256 discountAmount,
        uint256 pricePaid
    );

    error InvalidFaction();
    error NoFaction();
    error AlreadyJoined();
    error AlreadyResolved();
    error DrawingNotSettled();
    error DrawingNotReady();
    error RefundFailed();
    error UsdcTransferFailed();
    error UsdcApproveFailed();
    error ZeroAmount();

    constructor(address _jackpot, address _usdc) {
        jackpot = IJackpot(_jackpot);
        usdc = IERC20(_usdc);
    }

    /// @notice One-time, permanent faction assignment for the caller — no manual pick,
    /// no re-picking. Assigns to whichever faction currently has the fewest players so
    /// factions stay roughly balanced instead of everyone piling onto one team.
    function joinFaction() external {
        if (playerFaction[msg.sender] != Faction.NONE) revert AlreadyJoined();

        Faction assigned = Faction.RED;
        uint256 lowest = factionPlayerCount[Faction.RED];
        for (uint8 f = 2; f <= FACTION_COUNT; f++) {
            uint256 count = factionPlayerCount[Faction(f)];
            if (count < lowest) {
                lowest = count;
                assigned = Faction(f);
            }
        }

        playerFaction[msg.sender] = assigned;
        factionPlayerCount[assigned] += 1;
        emit FactionJoined(msg.sender, assigned);
    }

    /// @notice Buy one real Megapot ticket on the caller's behalf, tagged to their faction.
    /// Price is discounted based on the faction's territory share, subsidized from that
    /// faction's own war chest (see `_quoteDiscount`) — the caller still pays the rest.
    function attack(uint8[] calldata normals, uint8 bonusball) external {
        Faction faction = playerFaction[msg.sender];
        if (faction == Faction.NONE) revert NoFaction();

        uint256 drawingId = jackpot.currentDrawingId();
        IJackpot.DrawingState memory state = jackpot.getDrawingState(drawingId);

        (uint256 discountBps, uint256 discountAmount) = _quoteDiscount(faction, state.ticketPrice, state.ballMax);
        uint256 pricePaid = state.ticketPrice - discountAmount;

        if (pricePaid > 0) {
            if (!usdc.transferFrom(msg.sender, address(this), pricePaid)) revert UsdcTransferFailed();
        }
        if (discountAmount > 0) {
            factionWarChest[faction] -= discountAmount;
        }
        if (!usdc.approve(address(jackpot), state.ticketPrice)) revert UsdcApproveFailed();

        IJackpot.Ticket[] memory tickets = new IJackpot.Ticket[](1);
        tickets[0] = IJackpot.Ticket({normals: normals, bonusball: bonusball});

        // FactionWar itself is the referrer — this is what funds the war chest.
        address[] memory referrers = new address[](1);
        referrers[0] = address(this);
        uint256[] memory splits = new uint256[](1);
        // Jackpot's _referralSplit is 1e18-scale (same as referralFee/referralWinShare),
        // NOT basis points — confirmed on-chain against Base Sepolia after ReferralSplitSumInvalid
        // reverts on a 10_000 guess. Full split to the single referrer = 1e18.
        splits[0] = FULL_REFERRAL_SPLIT;

        jackpot.buyTickets(tickets, msg.sender, referrers, splits, bytes32("FACTIONWAR"));

        for (uint256 i = 0; i < normals.length; i++) {
            ticketsByZoneDrawing[normals[i]][drawingId][uint8(faction)] += 1;
        }

        emit ZoneAttacked(drawingId, faction, normals, bonusball, msg.sender);
        if (discountAmount > 0) {
            emit TicketDiscounted(drawingId, faction, msg.sender, discountBps, discountAmount, pricePaid);
        }
    }

    /// @notice Preview what `attack()` would cost `player` right now — for the frontend to
    /// show the discount before they commit to a transaction.
    function getAttackQuote(address player)
        external
        view
        returns (uint256 ticketPrice, uint256 discountBps, uint256 discountAmount, uint256 finalPrice)
    {
        IJackpot.DrawingState memory state = jackpot.getDrawingState(jackpot.currentDrawingId());
        ticketPrice = state.ticketPrice;

        Faction faction = playerFaction[player];
        if (faction != Faction.NONE) {
            (discountBps, discountAmount) = _quoteDiscount(faction, ticketPrice, state.ballMax);
        }
        finalPrice = ticketPrice - discountAmount;
    }

    /// @notice Top up the caller's own faction's war chest directly, no territory or
    /// referral fees required. Restricted to faction members — you can only fund your
    /// own team. Deposited USDC funds the same territory-tier attack() discount as
    /// swept referral fees; it's never withdrawn.
    function depositToWarChest(uint256 amount) external {
        Faction faction = playerFaction[msg.sender];
        if (faction == Faction.NONE) revert NoFaction();
        if (amount == 0) revert ZeroAmount();

        if (!usdc.transferFrom(msg.sender, address(this), amount)) revert UsdcTransferFailed();
        factionWarChest[faction] += amount;

        emit WarChestDeposited(faction, msg.sender, amount);
    }

    /// @notice Race to trigger nightly settlement; caller's faction becomes the Herald for this drawing.
    function triggerBattle() external payable {
        Faction faction = playerFaction[msg.sender];
        if (faction == Faction.NONE) revert NoFaction();

        uint256 drawingId = jackpot.currentDrawingId();
        IJackpot.DrawingState memory state = jackpot.getDrawingState(drawingId);
        if (block.timestamp < state.drawingTime) revert DrawingNotReady();

        uint256 fee = jackpot.getEntropyCallbackFee();
        jackpot.runJackpot{value: fee}();

        heraldByDrawing[drawingId] = faction;
        emit BattleTriggered(drawingId, faction, msg.sender);

        if (msg.value > fee) {
            (bool ok,) = msg.sender.call{value: msg.value - fee}("");
            if (!ok) revert RefundFailed();
        }
    }

    /// @notice Resolve a settled drawing into zone captures. Callable by anyone, once.
    function resolveDrawing(uint256 drawingId) external {
        if (drawingResolved[drawingId]) revert AlreadyResolved();

        IJackpot.DrawingState memory state = jackpot.getDrawingState(drawingId);
        if (state.winningTicket == 0) revert DrawingNotSettled();

        (uint8[] memory normals,) = jackpot.getUnpackedTicket(drawingId, state.winningTicket);

        uint8[] memory captured = new uint8[](normals.length);
        Faction[] memory winners = new Faction[](normals.length);

        for (uint256 i = 0; i < normals.length; i++) {
            uint8 zoneNum = normals[i];
            ZoneState storage zone = zones[zoneNum];

            Faction winner = Faction.RED;
            uint256 highest = ticketsByZoneDrawing[zoneNum][drawingId][uint8(Faction.RED)];
            for (uint8 f = 2; f <= FACTION_COUNT; f++) {
                uint256 count = ticketsByZoneDrawing[zoneNum][drawingId][f];
                if (count > highest) {
                    highest = count;
                    winner = Faction(f);
                }
            }

            // A drawn zone nobody attacked (before the draw concluded) stays as-is
            // (no attacker to award it to).
            if (highest > 0) {
                if (zone.controller != winner) {
                    if (zone.controller != Faction.NONE) territoryCount[zone.controller] -= 1;
                    territoryCount[winner] += 1;
                }
                zone.controller = winner;
                zone.lastCapturedDrawing = drawingId;
            }

            for (uint8 f = 1; f <= FACTION_COUNT; f++) {
                delete ticketsByZoneDrawing[zoneNum][drawingId][f];
            }

            captured[i] = zoneNum;
            winners[i] = zone.controller;
        }

        Faction herald = heraldByDrawing[drawingId];
        if (herald != Faction.NONE) {
            heraldBonus[herald] += 1;
        }

        drawingResolved[drawingId] = true;
        lastResolvedDrawing = drawingId;

        emit ZonesResolved(drawingId, captured, winners);

        _sweepAndFundWarChest(drawingId);
    }

    /// @dev Territory-share -> discount-bps tiers. 0 territory or 0 ballMax -> no discount.
    function _discountBps(Faction faction, uint8 ballMax) internal view returns (uint256) {
        if (ballMax == 0) return 0;
        uint256 territoryBps = (territoryCount[faction] * BPS_DENOMINATOR) / ballMax;
        if (territoryBps >= TIER3_TERRITORY_BPS) return TIER3_DISCOUNT_BPS;
        if (territoryBps >= TIER2_TERRITORY_BPS) return TIER2_DISCOUNT_BPS;
        if (territoryBps >= TIER1_TERRITORY_BPS) return TIER1_DISCOUNT_BPS;
        return 0;
    }

    /// @dev Discount amount is capped both by the tier's own bps of ticket price and by
    /// `MAX_CHEST_BPS_PER_ATTACK` of the faction's current chest balance — so a single
    /// attack can never take more than a fraction of the chest, leaving the rest for
    /// teammates' attacks.
    function _quoteDiscount(Faction faction, uint256 ticketPrice, uint8 ballMax)
        internal
        view
        returns (uint256 discountBps, uint256 discountAmount)
    {
        discountBps = _discountBps(faction, ballMax);
        if (discountBps == 0) return (0, 0);

        uint256 chest = factionWarChest[faction];
        if (chest == 0) return (discountBps, 0);

        uint256 rawDiscount = (ticketPrice * discountBps) / BPS_DENOMINATOR;
        uint256 maxFromChest = (chest * MAX_CHEST_BPS_PER_ATTACK) / BPS_DENOMINATOR;

        discountAmount = rawDiscount;
        if (discountAmount > maxFromChest) discountAmount = maxFromChest;
        if (discountAmount > chest) discountAmount = chest;
    }

    /// @dev Sweeps any USDC referral fees accrued to this contract and splits them
    /// across factions proportional to a weight combining territory controlled
    /// *after* this round's captures and accumulated Herald bonuses (each Herald
    /// bonus counts as `HERALD_WEIGHT` zone-equivalents) — triggering settlement
    /// earns a faction a share of the chest even before it holds any territory.
    /// If every faction's weight is zero, the fees stay accrued in Jackpot (not
    /// swept) until a future round when they can be split.
    function _sweepAndFundWarChest(uint256 drawingId) internal {
        uint256 accrued = jackpot.referralFees(address(this));
        if (accrued == 0) return;

        uint256[] memory weights = new uint256[](FACTION_COUNT + 1);
        uint256 totalWeight;
        for (uint8 f = 1; f <= FACTION_COUNT; f++) {
            uint256 weight = territoryCount[Faction(f)] + heraldBonus[Faction(f)] * HERALD_WEIGHT;
            weights[f] = weight;
            totalWeight += weight;
        }
        if (totalWeight == 0) return;

        jackpot.claimReferralFees();

        uint256[] memory shares = new uint256[](FACTION_COUNT + 1);
        for (uint8 f = 1; f <= FACTION_COUNT; f++) {
            uint256 share = (accrued * weights[f]) / totalWeight;
            factionWarChest[Faction(f)] += share;
            shares[f] = share;
        }

        emit WarChestFunded(drawingId, accrued, shares);
    }

    // ---------------------------------------------------------------------
    // Views
    // ---------------------------------------------------------------------

    /// @notice Single zone's controller + live (unresolved) per-faction ticket counts
    /// for the currently open drawing. `liveCounts` is indexed by Faction enum value
    /// (0=NONE unused, 1=RED, 2=BLUE, 3=GREEN).
    function getZone(uint8 number)
        external
        view
        returns (Faction controller, uint256 lastCapturedDrawing, uint256[] memory liveCounts)
    {
        ZoneState storage zone = zones[number];
        uint256 drawingId = jackpot.currentDrawingId();
        liveCounts = new uint256[](FACTION_COUNT + 1);
        for (uint8 f = 1; f <= FACTION_COUNT; f++) {
            liveCounts[f] = ticketsByZoneDrawing[number][drawingId][f];
        }
        return (zone.controller, zone.lastCapturedDrawing, liveCounts);
    }

    /// @notice Full map for the frontend to poll. Reads `ballMax` live from the current drawing.
    function getMapState()
        external
        view
        returns (uint8 ballMax, Faction[] memory controllers, uint256[][] memory liveCounts)
    {
        uint256 drawingId = jackpot.currentDrawingId();
        IJackpot.DrawingState memory state = jackpot.getDrawingState(drawingId);
        ballMax = state.ballMax;

        controllers = new Faction[](ballMax);
        liveCounts = new uint256[][](ballMax);

        for (uint8 i = 1; i <= ballMax; i++) {
            ZoneState storage zone = zones[i];
            controllers[i - 1] = zone.controller;

            uint256[] memory counts = new uint256[](FACTION_COUNT + 1);
            for (uint8 f = 1; f <= FACTION_COUNT; f++) {
                counts[f] = ticketsByZoneDrawing[i][drawingId][f];
            }
            liveCounts[i - 1] = counts;
        }
    }

    /// @notice Leaderboard data: territory count, Herald bonuses, and war chest balance
    /// (USDC, 6 decimals) — the chest subsidizes attack() discounts, it is never
    /// withdrawn — all indexed by Faction enum value.
    function getFactionScores()
        external
        view
        returns (uint256[] memory territory, uint256[] memory herald, uint256[] memory warChest)
    {
        territory = new uint256[](FACTION_COUNT + 1);
        herald = new uint256[](FACTION_COUNT + 1);
        warChest = new uint256[](FACTION_COUNT + 1);
        for (uint8 f = 1; f <= FACTION_COUNT; f++) {
            territory[f] = territoryCount[Faction(f)];
            herald[f] = heraldBonus[Faction(f)];
            warChest[f] = factionWarChest[Faction(f)];
        }
    }
}
