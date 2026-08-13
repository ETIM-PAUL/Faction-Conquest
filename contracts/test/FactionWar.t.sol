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

        vm.prank(redPlayer);
        war.joinFaction(FactionWar.Faction.RED);
        vm.prank(bluePlayer1);
        war.joinFaction(FactionWar.Faction.BLUE);
        vm.prank(bluePlayer2);
        war.joinFaction(FactionWar.Faction.BLUE);
        vm.prank(greenPlayer);
        war.joinFaction(FactionWar.Faction.GREEN);
    }

    function _normals() internal pure returns (uint8[] memory n) {
        n = new uint8[](5);
        n[0] = 1;
        n[1] = 2;
        n[2] = 3;
        n[3] = 4;
        n[4] = 5;
    }

    function test_joinFaction_revertsOnNone() public {
        vm.expectRevert(FactionWar.InvalidFaction.selector);
        vm.prank(noFactionPlayer);
        war.joinFaction(FactionWar.Faction.NONE);
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

    function test_warChestFundedAndClaimable() public {
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
        vm.prank(redPlayer);
        war.triggerBattle{value: 0.001 ether}();

        war.resolveDrawing(drawingId);

        // BLUE is the sole territory holder after this resolution -> gets the whole accrued fee.
        (,, uint256[] memory warChest) = war.getFactionScores();
        assertEq(warChest[uint8(FactionWar.Faction.BLUE)], 300_000, "BLUE should get the full war chest");
        assertEq(warChest[uint8(FactionWar.Faction.RED)], 0);
        assertEq(usdc.balanceOf(address(war)), 300_000, "swept fee should sit in FactionWar's own USDC balance");

        vm.expectRevert(FactionWar.NoFaction.selector);
        vm.prank(redPlayer);
        war.claimFactionTreasury(FactionWar.Faction.BLUE);

        uint256 beforeBal = usdc.balanceOf(bluePlayer1);
        vm.prank(bluePlayer1);
        war.claimFactionTreasury(FactionWar.Faction.BLUE);
        assertEq(usdc.balanceOf(bluePlayer1), beforeBal + 300_000, "claimer should receive the full chest");

        (,, uint256[] memory warChestAfter) = war.getFactionScores();
        assertEq(warChestAfter[uint8(FactionWar.Faction.BLUE)], 0, "chest should be zeroed after claim");

        vm.expectRevert(FactionWar.EmptyWarChest.selector);
        vm.prank(bluePlayer2);
        war.claimFactionTreasury(FactionWar.Faction.BLUE);
    }

    function test_warChest_notSweptWhenNoTerritoryYet() public {
        vm.prank(redPlayer);
        war.attack(_normals(), 6); // zones 1-5

        uint256 drawingId = jackpot.currentDrawingId();
        uint8[] memory winningNormals = new uint8[](1);
        winningNormals[0] = 10; // nobody attacked zone 10
        jackpot.setWinningNormals(drawingId, winningNormals, 6);

        vm.warp(block.timestamp + 1 days);
        vm.deal(redPlayer, 1 ether);
        vm.prank(redPlayer);
        war.triggerBattle{value: 0.001 ether}();

        war.resolveDrawing(drawingId);

        // Nobody captured anything -> total territory is still zero -> fee stays unswept.
        (,, uint256[] memory warChest) = war.getFactionScores();
        assertEq(warChest[uint8(FactionWar.Faction.RED)], 0);
        assertEq(usdc.balanceOf(address(war)), 0, "fee should remain accrued in Jackpot, not swept");
        assertEq(jackpot.referralFees(address(war)), 100_000, "1 ticket's 10% fee still sitting unclaimed in Jackpot");
    }
}
