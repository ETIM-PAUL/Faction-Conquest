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
/// proportional to territory on every resolveDrawing. Any player on a faction can
/// claim their faction's whole pot — first to claim for your team takes it, which
/// is a deliberate coordination/race mechanic, not an oversight.
contract FactionWar {
    enum Faction {
        NONE,
        RED,
        BLUE,
        GREEN
    }

    uint8 public constant FACTION_COUNT = 3;
    uint256 public constant FULL_REFERRAL_SPLIT = 1e18;

    struct ZoneState {
        mapping(uint8 => uint256) ticketsByFaction; // Faction => count, current open drawing
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

    uint256 public lastResolvedDrawing;

    event FactionJoined(address indexed player, Faction faction);
    event ZoneAttacked(
        uint256 indexed drawingId, Faction indexed faction, uint8[] normals, uint8 bonusball, address indexed player
    );
    event BattleTriggered(uint256 indexed drawingId, Faction indexed faction, address caller);
    event ZonesResolved(uint256 indexed drawingId, uint8[] capturedZones, Faction[] winningFactions);
    event WarChestFunded(uint256 indexed drawingId, uint256 totalSwept, uint256[] shares);
    event WarChestClaimed(Faction indexed faction, address indexed claimer, uint256 amount);

    error InvalidFaction();
    error NoFaction();
    error AlreadyJoined();
    error AlreadyResolved();
    error DrawingNotSettled();
    error DrawingNotReady();
    error RefundFailed();
    error UsdcTransferFailed();
    error UsdcApproveFailed();
    error EmptyWarChest();

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
    function attack(uint8[] calldata normals, uint8 bonusball) external {
        Faction faction = playerFaction[msg.sender];
        if (faction == Faction.NONE) revert NoFaction();

        uint256 drawingId = jackpot.currentDrawingId();
        IJackpot.DrawingState memory state = jackpot.getDrawingState(drawingId);

        if (!usdc.transferFrom(msg.sender, address(this), state.ticketPrice)) revert UsdcTransferFailed();
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
            zones[normals[i]].ticketsByFaction[uint8(faction)] += 1;
        }

        emit ZoneAttacked(drawingId, faction, normals, bonusball, msg.sender);
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
            uint256 highest = zone.ticketsByFaction[uint8(Faction.RED)];
            for (uint8 f = 2; f <= FACTION_COUNT; f++) {
                uint256 count = zone.ticketsByFaction[f];
                if (count > highest) {
                    highest = count;
                    winner = Faction(f);
                }
            }

            // A drawn zone nobody attacked stays as-is (no attacker to award it to).
            if (highest > 0) {
                if (zone.controller != winner) {
                    if (zone.controller != Faction.NONE) territoryCount[zone.controller] -= 1;
                    territoryCount[winner] += 1;
                }
                zone.controller = winner;
                zone.lastCapturedDrawing = drawingId;
            }

            for (uint8 f = 1; f <= FACTION_COUNT; f++) {
                zone.ticketsByFaction[f] = 0;
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

    /// @notice Claims this faction's entire war chest for msg.sender. Requires msg.sender
    /// be on that faction. Whole-pot, first-claimer-takes-it — a deliberate race, not a bug.
    function claimFactionTreasury(Faction f) external {
        if (playerFaction[msg.sender] != f) revert NoFaction();
        uint256 amount = factionWarChest[f];
        if (amount == 0) revert EmptyWarChest();

        factionWarChest[f] = 0;
        if (!usdc.transfer(msg.sender, amount)) revert UsdcTransferFailed();

        emit WarChestClaimed(f, msg.sender, amount);
    }

    /// @dev Sweeps any USDC referral fees accrued to this contract and splits them
    /// across factions proportional to total territory controlled *after* this
    /// round's captures. If nobody controls any territory yet, the fees stay
    /// accrued in Jackpot (not swept) until a future round when they can be split.
    function _sweepAndFundWarChest(uint256 drawingId) internal {
        uint256 accrued = jackpot.referralFees(address(this));
        if (accrued == 0) return;

        uint256 totalTerritory = territoryCount[Faction.RED] + territoryCount[Faction.BLUE] + territoryCount[Faction.GREEN];
        if (totalTerritory == 0) return;

        jackpot.claimReferralFees();

        uint256[] memory shares = new uint256[](FACTION_COUNT + 1);
        for (uint8 f = 1; f <= FACTION_COUNT; f++) {
            uint256 share = (accrued * territoryCount[Faction(f)]) / totalTerritory;
            factionWarChest[Faction(f)] += share;
            shares[f] = share;
        }

        emit WarChestFunded(drawingId, accrued, shares);
    }

    // ---------------------------------------------------------------------
    // Views
    // ---------------------------------------------------------------------

    /// @notice Single zone's controller + live (unresolved) per-faction ticket counts.
    /// `liveCounts` is indexed by Faction enum value (0=NONE unused, 1=RED, 2=BLUE, 3=GREEN).
    function getZone(uint8 number)
        external
        view
        returns (Faction controller, uint256 lastCapturedDrawing, uint256[] memory liveCounts)
    {
        ZoneState storage zone = zones[number];
        liveCounts = new uint256[](FACTION_COUNT + 1);
        for (uint8 f = 1; f <= FACTION_COUNT; f++) {
            liveCounts[f] = zone.ticketsByFaction[f];
        }
        return (zone.controller, zone.lastCapturedDrawing, liveCounts);
    }

    /// @notice Full map for the frontend to poll. Reads `ballMax` live from the current drawing.
    function getMapState()
        external
        view
        returns (uint8 ballMax, Faction[] memory controllers, uint256[][] memory liveCounts)
    {
        IJackpot.DrawingState memory state = jackpot.getDrawingState(jackpot.currentDrawingId());
        ballMax = state.ballMax;

        controllers = new Faction[](ballMax);
        liveCounts = new uint256[][](ballMax);

        for (uint8 i = 1; i <= ballMax; i++) {
            ZoneState storage zone = zones[i];
            controllers[i - 1] = zone.controller;

            uint256[] memory counts = new uint256[](FACTION_COUNT + 1);
            for (uint8 f = 1; f <= FACTION_COUNT; f++) {
                counts[f] = zone.ticketsByFaction[f];
            }
            liveCounts[i - 1] = counts;
        }
    }

    /// @notice Leaderboard data: territory count, Herald bonuses, and claimable war
    /// chest (USDC, 6 decimals), all indexed by Faction enum value.
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
