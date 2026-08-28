// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {LiquidityLocker} from "./LiquidityLocker.sol";

/// @title SixMonthLiquidityLocker
/// @notice Locks one PancakeSwap V2 LP token for exactly 180 days from deployment.
/// @dev The duration is fixed in bytecode so a deployment script cannot shorten the public commitment.
contract SixMonthLiquidityLocker is LiquidityLocker {
    uint64 public constant LOCK_DURATION = 180 days;

    constructor(IERC20 lpToken_, address beneficiary_)
        LiquidityLocker(
            lpToken_,
            beneficiary_,
            uint64(block.timestamp + LOCK_DURATION)
        )
    {}
}
