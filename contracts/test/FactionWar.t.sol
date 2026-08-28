// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {FactionWar} from "../src/FactionWar.sol";
import {MockJackpot} from "./mocks/MockJackpot.sol";
import {MockERC20} from "./mocks/MockERC20.sol";

contract FactionWarTest is Test {
    FactionWar war;
    MockJackpot jackpot;
    MockERC20 usdc;

    address redPlayer = makeAddr("redPlayer");
    address bluePlayer1 = makeAddr("bluePlayer1");
    address bluePlayer2 = makeAddr("bluePlayer2");
    address greenPlayer = makeAddr("greenPlayer");
    address noFactionPlayer = makeAddr("noFactionPlayer");

    uint256 constant TICKET_PRICE = 1_000_000;

    function setUp() public {
        usdc = new MockERC20();
        jackpot = new MockJackpot(address(usdc), 30, 10);
        war = new FactionWar(address(jackpot), address(usdc));

        address[5] memory players = [redPlayer, bluePlayer1, bluePlayer2, greenPlayer, noFactionPlayer];
        for (uint256 i = 0; i < players.length; i++) {
            usdc.mint(players[i], 100 * TICKET_PRICE);
            vm.prank(players[i]);
            usdc.approve(address(war), type(uint256).max);
        }

        // joinFaction() is now balanced-auto-assign only (no manual pick), but these
        // tests need specific players on specific teams to exercise multi-faction zone
        // contests deterministically — write playerFaction storage directly instead.
        _setFaction(redPlayer, FactionWar.Faction.RED);
        _setFaction(bluePlayer1, FactionWar.Faction.BLUE);
        _setFaction(bluePlayer2, FactionWar.Faction.BLUE);
        _setFaction(greenPlayer, FactionWar.Faction.GREEN);
    }

    /// @dev playerFaction is the 2nd non-constant/non-immutable state variable
    /// (slot 1) — mapping(address => Faction) public playerFaction. Bypasses
    /// joinFaction's balancing logic to pin a player to an exact faction for tests.
    function _setFaction(address player, FactionWar.Faction f) internal {
        bytes32 slot = keccak256(abi.encode(player, uint256(1)));
        vm.store(address(war), slot, bytes32(uint256(uint8(f))));
    }

    function _normals() internal pure returns (uint8[] memory n) {
        n = new uint8[](5);
        n[0] = 1;
        n[1] = 2;
        n[2] = 3;
        n[3] = 4;
        n[4] = 5;
    }

    function test_joinFaction_revertsIfAlreadyJoined() public {
        vm.expectRevert(FactionWar.AlreadyJoined.selector);
        vm.prank(redPlayer);
        war.joinFaction();
    }

    function test_joinFaction_balancesAcrossFactions() public {
        // Fresh war: RED/BLUE/GREEN all start at 0 headcount.
        FactionWar freshWar = new FactionWar(address(jackpot), address(usdc));
        address p1 = makeAddr("p1");
        address p2 = makeAddr("p2");
        address p3 = makeAddr("p3");
        address p4 = makeAddr("p4");

        vm.prank(p1);
        freshWar.joinFaction();
        assertEq(uint8(freshWar.playerFaction(p1)), uint8(FactionWar.Faction.RED), "first joiner: tie -> RED");

        vm.prank(p2);
        freshWar.joinFaction();
        assertEq(uint8(freshWar.playerFaction(p2)), uint8(FactionWar.Faction.BLUE), "RED=1: BLUE is lowest");

        vm.prank(p3);
        freshWar.joinFaction();
        assertEq(uint8(freshWar.playerFaction(p3)), uint8(FactionWar.Faction.GREEN), "RED=1,BLUE=1: GREEN is lowest");

        vm.prank(p4);
        freshWar.joinFaction();
        assertEq(uint8(freshWar.playerFaction(p4)), uint8(FactionWar.Faction.RED), "all tied at 1: RED wins tie");

        assertEq(freshWar.factionPlayerCount(FactionWar.Faction.RED), 2);
        assertEq(freshWar.factionPlayerCount(FactionWar.Faction.BLUE), 1);
        assertEq(freshWar.factionPlayerCount(FactionWar.Faction.GREEN), 1);
    }

    function test_attack_revertsWithoutFaction() public {
        vm.expectRevert(FactionWar.NoFaction.selector);
        vm.prank(noFactionPlayer);
        war.attack(_normals(), 6);
    }

    function test_attack_pullsUsdcAndTallies() public {
        uint256 before = usdc.balanceOf(redPlayer);

        vm.prank(redPlayer);
        war.attack(_normals(), 6);

        assertEq(usdc.balanceOf(redPlayer), before - TICKET_PRICE, "USDC not pulled from attacker");

        (,, uint256[] memory counts) = war.getZone(1);
        assertEq(counts[uint8(FactionWar.Faction.RED)], 1, "zone 1 should show 1 RED ticket");
    }

    function test_attack_tracksTicketsBoughtPerPlayer() public {
        assertEq(war.ticketsBoughtByPlayer(redPlayer), 0, "no tickets bought yet");

        vm.prank(redPlayer);
        war.attack(_normals(), 6);
        assertEq(war.ticketsBoughtByPlayer(redPlayer), 1, "should count the first attack as one ticket");

        uint8[] memory zone30 = new uint8[](1);
        zone30[0] = 30;
        vm.prank(redPlayer);
        war.attack(zone30, 7);
        assertEq(war.ticketsBoughtByPlayer(redPlayer), 2, "should accumulate across attacks, never reset");

        // Never resets across a resolved drawing either — it's a lifetime counter.
        uint256 drawingId = jackpot.currentDrawingId();
        jackpot.setWinningNormals(drawingId, zone30, 7);
        vm.warp(block.timestamp + 1 days);
        vm.deal(redPlayer, 1 ether);
        vm.prank(redPlayer);
        war.triggerBattle{value: 0.001 ether}();
        war.resolveDrawing(drawingId);
        assertEq(war.ticketsBoughtByPlayer(redPlayer), 2, "lifetime count survives a resolved drawing");
    }

    function test_triggerBattle_revertsBeforeDrawingTime() public {
        vm.deal(redPlayer, 1 ether);
        vm.expectRevert(FactionWar.DrawingNotReady.selector);
        vm.prank(redPlayer);
        war.triggerBattle{value: 0.001 ether}();
    }

    function test_fullLoop_tieBreakAndCapture() public {
        // Zone 1: RED 1, BLUE 2 -> BLUE captures.
        vm.prank(redPlayer);
        war.attack(_normals(), 6);
        vm.prank(bluePlayer1);
        war.attack(_normals(), 6);
        vm.prank(bluePlayer2);
        war.attack(_normals(), 6);

        // Zone 30: RED 1, GREEN 1 -> tie, RED wins (lower enum value).
        uint8[] memory zone30 = new uint8[](1);
        zone30[0] = 30;
        vm.prank(redPlayer);
        war.attack(zone30, 7);
        vm.prank(greenPlayer);
        war.attack(zone30, 7);

        uint256 drawingId = jackpot.currentDrawingId();
        uint8[] memory winningNormals = new uint8[](2);
        winningNormals[0] = 1;
        winningNormals[1] = 30;
        jackpot.setWinningNormals(drawingId, winningNormals, 6);

        vm.warp(block.timestamp + 1 days);
        vm.deal(bluePlayer1, 1 ether);
        vm.prank(bluePlayer1);
        war.triggerBattle{value: 0.001 ether}();

        assertEq(uint8(war.heraldByDrawing(drawingId)), uint8(FactionWar.Faction.BLUE));

        war.resolveDrawing(drawingId);

        (FactionWar.Faction zone1Controller,,) = war.getZone(1);
        (FactionWar.Faction zone30Controller,,) = war.getZone(30);
        assertEq(uint8(zone1Controller), uint8(FactionWar.Faction.BLUE), "zone 1 should go to BLUE (2 vs 1)");
        assertEq(uint8(zone30Controller), uint8(FactionWar.Faction.RED), "zone 30 tie should go to RED");

        (uint256[] memory territory, uint256[] memory herald,) = war.getFactionScores();
        assertEq(territory[uint8(FactionWar.Faction.BLUE)], 1);
        assertEq(territory[uint8(FactionWar.Faction.RED)], 1);
        assertEq(herald[uint8(FactionWar.Faction.BLUE)], 1, "BLUE triggered, should get the Herald bonus");

        // Live counts reset after resolution.
        (,, uint256[] memory zone1CountsAfter) = war.getZone(1);
        assertEq(zone1CountsAfter[uint8(FactionWar.Faction.RED)], 0);
        assertEq(zone1CountsAfter[uint8(FactionWar.Faction.BLUE)], 0);
    }

    function test_resolveDrawing_ignoresTicketsBoughtAfterDrawConcluded() public {
        // RED attacks zone 1 before the draw concludes.
        vm.prank(redPlayer);
        war.attack(_normals(), 6);

        uint256 drawingId = jackpot.currentDrawingId();
        uint8[] memory winningNormals = new uint8[](1);
        winningNormals[0] = 1;
        jackpot.setWinningNormals(drawingId, winningNormals, 6);

        vm.warp(block.timestamp + 1 days);
        vm.deal(redPlayer, 1 ether);
        vm.prank(redPlayer);
        war.triggerBattle{value: 0.001 ether}(); // draw concludes here; jackpot rolls to the next drawing

        // BLUE attacks the same zone *after* the draw concluded but *before*
        // resolveDrawing is called for it — these tickets belong to the next,
        // still-open drawing and must not count toward the concluded one.
        vm.prank(bluePlayer1);
        war.attack(_normals(), 6);
        vm.prank(bluePlayer2);
        war.attack(_normals(), 6);

        war.resolveDrawing(drawingId);

        (FactionWar.Faction zone1Controller,,) = war.getZone(1);
        assertEq(
            uint8(zone1Controller),
            uint8(FactionWar.Faction.RED),
            "zone 1 should go to RED - BLUE's tickets were bought after the draw concluded"
        );

        (uint256[] memory territory,,) = war.getFactionScores();
        assertEq(territory[uint8(FactionWar.Faction.RED)], 1);
        assertEq(territory[uint8(FactionWar.Faction.BLUE)], 0);

        // BLUE's tickets still landed - just tallied against the new, currently open drawing.
        (,, uint256[] memory liveCounts) = war.getZone(1);
        assertEq(liveCounts[uint8(FactionWar.Faction.BLUE)], 2);
        assertEq(liveCounts[uint8(FactionWar.Faction.RED)], 0);
    }

    function test_resolveDrawing_revertsIfNotSettled() public {
        uint256 drawingId = jackpot.currentDrawingId();
        vm.expectRevert(FactionWar.DrawingNotSettled.selector);
        war.resolveDrawing(drawingId);
    }

    function test_resolveDrawing_revertsIfAlreadyResolved() public {
        uint256 drawingId = jackpot.currentDrawingId();
        uint8[] memory winningNormals = new uint8[](1);
        winningNormals[0] = 1;
        jackpot.setWinningNormals(drawingId, winningNormals, 6);

        vm.warp(block.timestamp + 1 days);
        vm.deal(redPlayer, 1 ether);
        vm.prank(redPlayer);
        war.triggerBattle{value: 0.001 ether}();

        war.resolveDrawing(drawingId);

        vm.expectRevert(FactionWar.AlreadyResolved.selector);
        war.resolveDrawing(drawingId);
    }

    function test_warChestFunded() public {
        // 3 attacks on zone 1: RED x1, BLUE x2 -> BLUE captures zone 1.
        // 3 tickets * 1_000_000 ticketPrice * 10% mock referral fee = 300_000 accrued.
        vm.prank(redPlayer);
        war.attack(_normals(), 6);
        vm.prank(bluePlayer1);
        war.attack(_normals(), 6);
        vm.prank(bluePlayer2);
        war.attack(_normals(), 6);

        uint256 drawingId = jackpot.currentDrawingId();
        uint8[] memory winningNormals = new uint8[](1);
        winningNormals[0] = 1;
        jackpot.setWinningNormals(drawingId, winningNormals, 6);

        vm.warp(block.timestamp + 1 days);
        vm.deal(redPlayer, 1 ether);
        vm.prank(redPlayer); // RED triggers -> RED is this drawing's Herald
        war.triggerBattle{value: 0.001 ether}();

        war.resolveDrawing(drawingId);

        // Split weight: BLUE has territory=1 (captured zone 1), RED has heraldBonus=1
        // (triggered settlement) -> equal weight (1 each) -> 300_000 splits 50/50.
        (,, uint256[] memory warChest) = war.getFactionScores();
        assertEq(warChest[uint8(FactionWar.Faction.BLUE)], 150_000, "BLUE's territory weight should earn half");
        assertEq(warChest[uint8(FactionWar.Faction.RED)], 150_000, "RED's Herald weight should earn half");
        assertEq(usdc.balanceOf(address(war)), 300_000, "swept fee should sit in FactionWar's own USDC balance");

        // Chest is never withdrawn — there's no claim function anymore, it only
        // subsidizes attack() discounts (see test_attack_appliesTerritoryDiscount).
    }

    function test_warChest_sweepsOnHeraldWeightEvenWithoutTerritory() public {
        vm.prank(redPlayer);
        war.attack(_normals(), 6); // zones 1-5

        uint256 drawingId = jackpot.currentDrawingId();
        uint8[] memory winningNormals = new uint8[](1);
        winningNormals[0] = 10; // nobody attacked zone 10 -> nobody captures anything
        jackpot.setWinningNormals(drawingId, winningNormals, 6);

        vm.warp(block.timestamp + 1 days);
        vm.deal(redPlayer, 1 ether);
        vm.prank(redPlayer); // RED triggers -> RED is this drawing's Herald
        war.triggerBattle{value: 0.001 ether}();

        war.resolveDrawing(drawingId);

        // Nobody captured territory, but RED's Herald bonus gives it nonzero weight,
        // so the fee still sweeps -> RED gets the full accrued fee via Herald weight alone.
        (,, uint256[] memory warChest) = war.getFactionScores();
        assertEq(warChest[uint8(FactionWar.Faction.RED)], 100_000, "RED's Herald weight should claim the full fee");
        assertEq(usdc.balanceOf(address(war)), 100_000, "fee should be swept on Herald weight alone");
        assertEq(jackpot.referralFees(address(war)), 0, "fee should no longer sit unclaimed in Jackpot");
    }

    function test_depositToWarChest_revertsWithoutFaction() public {
        usdc.mint(noFactionPlayer, TICKET_PRICE);
        vm.prank(noFactionPlayer);
        usdc.approve(address(war), TICKET_PRICE);

        vm.expectRevert(FactionWar.NoFaction.selector);
        vm.prank(noFactionPlayer);
        war.depositToWarChest(TICKET_PRICE);
    }

    function test_depositToWarChest_revertsOnZeroAmount() public {
        vm.expectRevert(FactionWar.ZeroAmount.selector);
        vm.prank(redPlayer);
        war.depositToWarChest(0);
    }

    function test_depositToWarChest_creditsCallersFaction() public {
        uint256 depositAmount = 5_000_000;
        usdc.mint(redPlayer, depositAmount);
        vm.prank(redPlayer);
        usdc.approve(address(war), depositAmount);

        uint256 beforeBal = usdc.balanceOf(redPlayer);
        vm.prank(redPlayer);
        war.depositToWarChest(depositAmount);

        assertEq(usdc.balanceOf(redPlayer), beforeBal - depositAmount, "USDC should be pulled from depositor");
        (,, uint256[] memory warChest) = war.getFactionScores();
        assertEq(warChest[uint8(FactionWar.Faction.RED)], depositAmount, "RED's chest should be credited");
        assertEq(warChest[uint8(FactionWar.Faction.BLUE)], 0, "deposit should not spill into other factions");
    }

    function test_attack_appliesTerritoryDiscountCappedByChestBudget() public {
        // Ball max is 30. Get BLUE to control 8 zones (>= 25% -> tier 1, 5% discount)
        // by resolving 8 separate drawings each won uncontested by BLUE.
        for (uint8 z = 1; z <= 8; z++) {
            uint8[] memory zone = new uint8[](1);
            zone[0] = z;
            vm.prank(bluePlayer1);
            war.attack(zone, 6);

            uint256 drawingId = jackpot.currentDrawingId();
            jackpot.setWinningNormals(drawingId, zone, 6);
            vm.warp(block.timestamp + 1 days);
            vm.deal(bluePlayer1, 1 ether);
            vm.prank(bluePlayer1);
            war.triggerBattle{value: 0.001 ether}();
            war.resolveDrawing(drawingId);
        }

        (uint256[] memory territory,, uint256[] memory warChestBefore) = war.getFactionScores();
        assertEq(territory[uint8(FactionWar.Faction.BLUE)], 8, "BLUE should control 8/30 zones (>=25%)");
        uint256 chest = warChestBefore[uint8(FactionWar.Faction.BLUE)];
        assertGt(chest, 0, "8 rounds of attacks should have funded BLUE's chest");

        // Quote should reflect the 5% tier-1 discount, capped at 10% of the chest.
        (uint256 ticketPrice, uint256 discountBps, uint256 discountAmount, uint256 finalPrice) =
            war.getAttackQuote(bluePlayer1);
        assertEq(ticketPrice, TICKET_PRICE);
        assertEq(discountBps, 500, "8/30 = 26.6% territory should land in the 25% tier (5% off)");
        uint256 expectedDiscount = (TICKET_PRICE * 500) / 10_000;
        uint256 chestCap = (chest * 1_000) / 10_000;
        assertEq(discountAmount, expectedDiscount < chestCap ? expectedDiscount : chestCap);
        assertEq(finalPrice, ticketPrice - discountAmount);

        uint256 before = usdc.balanceOf(bluePlayer1);
        uint8[] memory freshZone = new uint8[](1);
        freshZone[0] = 20;
        vm.prank(bluePlayer1);
        war.attack(freshZone, 6);

        assertEq(usdc.balanceOf(bluePlayer1), before - finalPrice, "attacker should only pay ticketPrice - discount");

        (,, uint256[] memory warChestAfter) = war.getFactionScores();
        assertEq(
            warChestAfter[uint8(FactionWar.Faction.BLUE)],
            chest - discountAmount,
            "chest should be debited by exactly the discount granted"
        );
    }

    function test_getAttackQuote_noDiscountBelowTier() public {
        (uint256 ticketPrice, uint256 discountBps, uint256 discountAmount, uint256 finalPrice) =
            war.getAttackQuote(redPlayer);
        assertEq(ticketPrice, TICKET_PRICE);
        assertEq(discountBps, 0, "RED controls 0 zones, no tier reached");
        assertEq(discountAmount, 0);
        assertEq(finalPrice, TICKET_PRICE);
    }

}
