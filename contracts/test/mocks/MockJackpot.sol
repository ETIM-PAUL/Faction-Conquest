// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IJackpot} from "../../src/interfaces/IJackpot.sol";
import {IERC20} from "../../src/interfaces/IERC20.sol";

/// @notice Test double for the real Jackpot contract. Settles synchronously (no
/// entropy callback) and lets tests pre-declare the "winning" normals per
/// drawingId via `setWinningNormals` — it does not replicate Megapot's real
/// packed-ticket encoding, only the interface contract FactionWar depends on.
contract MockJackpot is IJackpot {
    IERC20 public immutable usdcToken;
    uint256 public entropyFee = 0.001 ether;
    uint256 public currentId = 1;
    uint256 private nextTicketId = 1;

    mapping(uint256 => DrawingState) private states;
    mapping(uint256 => uint8[]) private winningNormals;
    mapping(uint256 => uint8) private winningBonusball;

    uint256 private constant WINNING_TICKET_SENTINEL = 777;

    constructor(address _usdc, uint8 _ballMax, uint8 _bonusballMax) {
        usdcToken = IERC20(_usdc);
        _openDrawing(_ballMax, _bonusballMax);
    }

    function _openDrawing(uint8 ballMax, uint8 bonusballMax) internal {
        states[currentId] = DrawingState({
            prizePool: 0,
            ticketPrice: 1_000_000, // 1.00 mock USDC (6 decimals)
            edgePerTicket: 0,
            referralWinShare: 0,
            referralFee: 0,
            globalTicketsBought: 0,
            lpEarnings: 0,
            drawingTime: block.timestamp + 1 days,
            winningTicket: 0,
            ballMax: ballMax,
            bonusballMax: bonusballMax,
            payoutCalculator: address(0),
            jackpotLock: false
        });
    }

    function buyTickets(
        Ticket[] calldata _tickets,
        address, /* _recipient */
        address[] calldata, /* _referrers */
        uint256[] calldata, /* _referralSplit */
        bytes32 /* _source */
    ) external returns (uint256[] memory ticketIds) {
        DrawingState storage s = states[currentId];
        uint256 cost = s.ticketPrice * _tickets.length;
        usdcToken.transferFrom(msg.sender, address(this), cost);

        ticketIds = new uint256[](_tickets.length);
        for (uint256 i = 0; i < _tickets.length; i++) {
            ticketIds[i] = nextTicketId++;
        }
        s.globalTicketsBought += _tickets.length;
    }

    function runJackpot() external payable {
        require(msg.value >= entropyFee, "insufficient entropy fee");
        DrawingState storage s = states[currentId];
        require(block.timestamp >= s.drawingTime, "too early");
        require(!s.jackpotLock, "already locked");

        s.jackpotLock = true;
        s.winningTicket = WINNING_TICKET_SENTINEL;

        uint8 ballMax = s.ballMax;
        uint8 bonusballMax = s.bonusballMax;
        currentId += 1;
        _openDrawing(ballMax, bonusballMax);
    }

    function getDrawingState(uint256 _drawingId) external view returns (DrawingState memory) {
        return states[_drawingId];
    }

    function getEntropyCallbackFee() external view returns (uint256) {
        return entropyFee;
    }

    function getUnpackedTicket(uint256 _drawingId, uint256 /* _packedTicket */ )
        external
        view
        returns (uint8[] memory normals, uint8 bonusball)
    {
        normals = winningNormals[_drawingId];
        bonusball = winningBonusball[_drawingId];
    }

    function currentDrawingId() external view returns (uint256) {
        return currentId;
    }

    function drawingDurationInSeconds() external pure returns (uint256) {
        return 1 days;
    }

    // ---- test helpers ----

    function setWinningNormals(uint256 drawingId, uint8[] calldata normals, uint8 bonusball) external {
        winningNormals[drawingId] = normals;
        winningBonusball[drawingId] = bonusball;
    }
}
