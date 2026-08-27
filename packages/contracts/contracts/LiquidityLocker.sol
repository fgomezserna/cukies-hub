// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {VestingWallet} from "@openzeppelin/contracts/finance/VestingWallet.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @title LiquidityLocker
/// @notice Holds one V2 LP token until a fixed timestamp and then releases it to an immutable beneficiary.
/// @dev Uses OpenZeppelin VestingWallet with a zero duration, which makes the vesting start a one-shot timelock.
contract LiquidityLocker is VestingWallet {
    IERC20 public immutable lpToken;
    uint64 public immutable unlockTime;

    event LiquidityReleased(address indexed caller, address indexed beneficiary, uint256 amount);

    error InvalidLpToken();
    error UnlockTimeNotFuture();
    error LiquidityStillLocked(uint256 currentTime, uint256 unlockTime);
    error NoLiquidityToRelease();
    error BeneficiaryChangeDisabled();

    constructor(IERC20 lpToken_, address beneficiary_, uint64 unlockTime_)
        VestingWallet(beneficiary_, unlockTime_, 0)
    {
        if (address(lpToken_) == address(0)) revert InvalidLpToken();
        if (unlockTime_ <= block.timestamp) revert UnlockTimeNotFuture();

        lpToken = lpToken_;
        unlockTime = unlockTime_;
    }

    function lockedLiquidity() public view returns (uint256) {
        return lpToken.balanceOf(address(this));
    }

    function releasableLiquidity() public view returns (uint256) {
        return releasable(address(lpToken));
    }

    /// @notice Releases the complete LP balance to the immutable beneficiary after the unlock timestamp.
    /// @dev Anyone may execute this function; funds always go to owner(), whose mutation is disabled below.
    function releaseLiquidity() external returns (uint256 amount) {
        if (block.timestamp < unlockTime) revert LiquidityStillLocked(block.timestamp, unlockTime);

        amount = releasableLiquidity();
        if (amount == 0) revert NoLiquidityToRelease();

        super.release(address(lpToken));
        emit LiquidityReleased(msg.sender, owner(), amount);
    }

    /// @dev Prevent bypassing the explicit early-release revert through VestingWallet.release(token).
    function release(address token) public override {
        if (token == address(lpToken) && block.timestamp < unlockTime) {
            revert LiquidityStillLocked(block.timestamp, unlockTime);
        }
        super.release(token);
    }

    /// @dev The beneficiary is fixed at deployment so the public lock commitment cannot be redirected.
    function transferOwnership(address) public pure override {
        revert BeneficiaryChangeDisabled();
    }

    /// @dev Renouncing would burn the eventual LP withdrawal destination and is therefore disabled.
    function renounceOwnership() public pure override {
        revert BeneficiaryChangeDisabled();
    }
}
