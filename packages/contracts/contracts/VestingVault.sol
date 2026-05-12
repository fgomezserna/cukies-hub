// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @title VestingVault
/// @notice Custodies UKI and releases linear vesting schedules created by authorized managers.
contract VestingVault is AccessControl {
    using SafeERC20 for IERC20;

    bytes32 public constant VESTING_MANAGER_ROLE = keccak256("VESTING_MANAGER_ROLE");

    IERC20 public immutable ukiToken;

    struct VestingSchedule {
        uint128 totalAmount;
        uint128 releasedAmount;
        uint64 start;
        uint64 duration;
    }

    mapping(address beneficiary => VestingSchedule) private _schedules;
    uint256 public totalAllocated;
    uint256 public totalReleased;

    event VestingCreated(address indexed beneficiary, uint256 amount, uint64 start, uint64 duration);
    event TokensReleased(address indexed beneficiary, uint256 amount);

    error InvalidToken();
    error InvalidBeneficiary();
    error InvalidAmount();
    error InvalidSchedule();
    error ConflictingSchedule();
    error NothingToRelease();
    error InsufficientUnallocatedBalance();

    constructor(IERC20 ukiToken_, address admin) {
        if (address(ukiToken_) == address(0)) revert InvalidToken();
        if (admin == address(0)) revert InvalidBeneficiary();

        ukiToken = ukiToken_;
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
    }

    function createVesting(address beneficiary, uint256 amount, uint64 start, uint64 duration)
        external
        onlyRole(VESTING_MANAGER_ROLE)
    {
        if (beneficiary == address(0)) revert InvalidBeneficiary();
        if (amount == 0 || amount > type(uint128).max) revert InvalidAmount();
        if (duration == 0) revert InvalidSchedule();
        VestingSchedule storage schedule = _schedules[beneficiary];
        if (
            schedule.totalAmount != 0
                && (schedule.start != start || schedule.duration != duration)
        ) {
            revert ConflictingSchedule();
        }

        uint256 available = ukiToken.balanceOf(address(this)) + totalReleased - totalAllocated;
        if (amount > available) revert InsufficientUnallocatedBalance();

        if (schedule.totalAmount == 0) {
            schedule.start = start;
            schedule.duration = duration;
        }
        schedule.totalAmount += uint128(amount);
        totalAllocated += amount;

        emit VestingCreated(beneficiary, amount, start, duration);
    }

    function releasable(address beneficiary) public view returns (uint256) {
        VestingSchedule memory schedule = _schedules[beneficiary];
        return vestedAmount(beneficiary, uint64(block.timestamp)) - schedule.releasedAmount;
    }

    function release() external returns (uint256 amount) {
        amount = releasable(msg.sender);
        if (amount == 0) revert NothingToRelease();

        VestingSchedule storage schedule = _schedules[msg.sender];
        schedule.releasedAmount += uint128(amount);
        totalReleased += amount;

        ukiToken.safeTransfer(msg.sender, amount);
        emit TokensReleased(msg.sender, amount);
    }

    function vestedAmount(address beneficiary, uint64 timestamp) public view returns (uint256) {
        VestingSchedule memory schedule = _schedules[beneficiary];
        if (schedule.totalAmount == 0 || timestamp < schedule.start) {
            return 0;
        }

        uint256 elapsed = timestamp - schedule.start;
        if (elapsed >= schedule.duration) {
            return schedule.totalAmount;
        }

        return (uint256(schedule.totalAmount) * elapsed) / schedule.duration;
    }

    function scheduleOf(address beneficiary) external view returns (VestingSchedule memory) {
        return _schedules[beneficiary];
    }
}
