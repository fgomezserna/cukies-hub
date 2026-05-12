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
    bytes32 public constant PRESALE_SCHEDULE_ID = keccak256("PRESALE");

    IERC20 public immutable ukiToken;

    struct VestingSchedule {
        uint128 totalAmount;
        uint128 releasedAmount;
        uint64 start;
        uint64 cliff;
        uint64 duration;
    }

    mapping(address beneficiary => mapping(bytes32 scheduleId => VestingSchedule)) private _schedules;
    mapping(address beneficiary => bytes32[] scheduleIds) private _scheduleIds;
    uint256 public totalAllocated;
    uint256 public totalReleased;

    event VestingCreated(
        address indexed beneficiary,
        bytes32 indexed scheduleId,
        uint256 amount,
        uint64 start,
        uint64 cliff,
        uint64 duration
    );
    event TokensReleased(address indexed beneficiary, bytes32 indexed scheduleId, uint256 amount);
    event UnallocatedWithdrawn(address indexed to, uint256 amount);

    error InvalidToken();
    error InvalidBeneficiary();
    error InvalidAmount();
    error InvalidSchedule();
    error InvalidRecipient();
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
        _createVesting(beneficiary, PRESALE_SCHEDULE_ID, amount, start, start, duration);
    }

    function createVestingWithCliff(
        address beneficiary,
        bytes32 scheduleId,
        uint256 amount,
        uint64 start,
        uint64 cliff,
        uint64 duration
    ) external onlyRole(VESTING_MANAGER_ROLE) {
        _createVesting(beneficiary, scheduleId, amount, start, cliff, duration);
    }

    function releasable(address beneficiary) public view returns (uint256) {
        return releasable(beneficiary, PRESALE_SCHEDULE_ID);
    }

    function releasable(address beneficiary, bytes32 scheduleId) public view returns (uint256) {
        VestingSchedule memory schedule = _schedules[beneficiary][scheduleId];
        return vestedAmount(beneficiary, scheduleId, uint64(block.timestamp)) - schedule.releasedAmount;
    }

    function release() external returns (uint256 amount) {
        return release(PRESALE_SCHEDULE_ID);
    }

    function release(bytes32 scheduleId) public returns (uint256 amount) {
        amount = releasable(msg.sender, scheduleId);
        if (amount == 0) revert NothingToRelease();

        VestingSchedule storage schedule = _schedules[msg.sender][scheduleId];
        schedule.releasedAmount += uint128(amount);
        totalReleased += amount;

        ukiToken.safeTransfer(msg.sender, amount);
        emit TokensReleased(msg.sender, scheduleId, amount);
    }

    function releaseAll() external returns (uint256 totalAmount) {
        bytes32[] memory ids = _scheduleIds[msg.sender];
        for (uint256 index = 0; index < ids.length; index++) {
            uint256 amount = releasable(msg.sender, ids[index]);
            if (amount == 0) continue;

            VestingSchedule storage schedule = _schedules[msg.sender][ids[index]];
            schedule.releasedAmount += uint128(amount);
            totalReleased += amount;
            totalAmount += amount;
            emit TokensReleased(msg.sender, ids[index], amount);
        }

        if (totalAmount == 0) revert NothingToRelease();
        ukiToken.safeTransfer(msg.sender, totalAmount);
    }

    function vestedAmount(address beneficiary, uint64 timestamp) public view returns (uint256) {
        return vestedAmount(beneficiary, PRESALE_SCHEDULE_ID, timestamp);
    }

    function vestedAmount(address beneficiary, bytes32 scheduleId, uint64 timestamp) public view returns (uint256) {
        VestingSchedule memory schedule = _schedules[beneficiary][scheduleId];
        if (schedule.totalAmount == 0 || timestamp < schedule.start || timestamp < schedule.cliff) {
            return 0;
        }

        uint256 elapsed = timestamp - schedule.start;
        if (elapsed >= schedule.duration) {
            return schedule.totalAmount;
        }

        return (uint256(schedule.totalAmount) * elapsed) / schedule.duration;
    }

    function scheduleOf(address beneficiary) external view returns (VestingSchedule memory) {
        return _schedules[beneficiary][PRESALE_SCHEDULE_ID];
    }

    function scheduleOf(address beneficiary, bytes32 scheduleId) external view returns (VestingSchedule memory) {
        return _schedules[beneficiary][scheduleId];
    }

    function scheduleIdsOf(address beneficiary) external view returns (bytes32[] memory) {
        return _scheduleIds[beneficiary];
    }

    function unallocatedBalance() public view returns (uint256) {
        return ukiToken.balanceOf(address(this)) + totalReleased - totalAllocated;
    }

    function withdrawUnallocated(address to, uint256 amount) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (to == address(0)) revert InvalidRecipient();
        if (amount == 0) revert InvalidAmount();
        if (amount > unallocatedBalance()) revert InsufficientUnallocatedBalance();

        ukiToken.safeTransfer(to, amount);
        emit UnallocatedWithdrawn(to, amount);
    }

    function _createVesting(
        address beneficiary,
        bytes32 scheduleId,
        uint256 amount,
        uint64 start,
        uint64 cliff,
        uint64 duration
    ) private {
        if (beneficiary == address(0)) revert InvalidBeneficiary();
        if (scheduleId == bytes32(0)) revert InvalidSchedule();
        if (amount == 0 || amount > type(uint128).max) revert InvalidAmount();
        if (start == 0 || cliff < start || duration == 0 || cliff > start + duration) revert InvalidSchedule();
        VestingSchedule storage schedule = _schedules[beneficiary][scheduleId];
        if (
            schedule.totalAmount != 0
                && (schedule.start != start || schedule.cliff != cliff || schedule.duration != duration)
        ) {
            revert ConflictingSchedule();
        }

        if (amount > unallocatedBalance()) revert InsufficientUnallocatedBalance();

        if (schedule.totalAmount == 0) {
            schedule.start = start;
            schedule.cliff = cliff;
            schedule.duration = duration;
            _scheduleIds[beneficiary].push(scheduleId);
        }
        schedule.totalAmount += uint128(amount);
        totalAllocated += amount;

        emit VestingCreated(beneficiary, scheduleId, amount, start, cliff, duration);
    }
}
