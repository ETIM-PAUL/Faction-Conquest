// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {FactionWar} from "../src/FactionWar.sol";

/// @notice Deploys FactionWar against the Jackpot/USDC addresses and per-faction
/// referrer wallets in .env. Run: `forge script script/Deploy.s.sol --rpc-url base_sepolia --broadcast`
contract Deploy is Script {
    function run() external returns (FactionWar factionWar) {
        address jackpot = vm.envAddress("JACKPOT_ADDRESS");
        address usdc = vm.envAddress("USDC_ADDRESS");
        address redReferrer = vm.envAddress("RED_REFERRER");
        address blueReferrer = vm.envAddress("BLUE_REFERRER");
        address greenReferrer = vm.envAddress("GREEN_REFERRER");

        vm.startBroadcast();
        factionWar = new FactionWar(jackpot, usdc, redReferrer, blueReferrer, greenReferrer);
        vm.stopBroadcast();

        console.log("FactionWar deployed at:", address(factionWar));
        console.log("Set FACTION_WAR_ADDRESS in both contracts/.env and frontend/.env to this value.");
    }
}
