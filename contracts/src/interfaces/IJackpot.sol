// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Minimal interface for the real Megapot Jackpot contract.
/// Confirmed against https://llms.megapot.io/abi/Jackpot.json — re-verify at build
/// time since addresses/signatures on this table can change (Build.md 2.1).
interface IJackpot {
    struct Ticket {
        uint8[] normals;
        uint8 bonusball;
    }

    struct DrawingState {
        uint256 prizePool;
        uint256 ticketPrice;
        uint256 edgePerTicket;
        uint256 referralWinShare;
        uint256 referralFee;
        uint256 globalTicketsBought;
        uint256 lpEarnings;
        uint256 drawingTime;
        uint256 winningTicket;
        uint8 ballMax;
        uint8 bonusballMax;
        address payoutCalculator;
        bool jackpotLock;
    }

    function buyTickets(
        Ticket[] calldata _tickets,
        address _recipient,
        address[] calldata _referrers,
        uint256[] calldata _referralSplit,
        bytes32 _source
    ) external returns (uint256[] memory ticketIds);

    function runJackpot() external payable;

    function getDrawingState(uint256 _drawingId) external view returns (DrawingState memory);

    function getEntropyCallbackFee() external view returns (uint256 fee);

    function getUnpackedTicket(uint256 _drawingId, uint256 _packedTicket)
        external
        view
        returns (uint8[] memory normals, uint8 bonusball);

    function currentDrawingId() external view returns (uint256);

    function drawingDurationInSeconds() external view returns (uint256);

    /// @notice Accrued, unclaimed referral fees for `account` (purchase fee + win share).
    /// Confirmed on-chain (Base Sepolia): `referralFees(referrer)` returns the raw
    /// accrued USDC amount — nonzero immediately after a purchase citing that referrer.
    function referralFees(address account) external view returns (uint256);

    /// @notice Claims the full accrued referral fee balance for msg.sender in one transfer.
    function claimReferralFees() external;
}
