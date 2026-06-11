// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @title VestingVault
/// @notice Custodies UKI and releases linear vesting schedules created by authorized managers.
contract VestingVault is AccessControl {
    using SafeERC20 for IERC20;

    bytes32 public constant PRESALE_VESTING_ROLE = keccak256("PRESALE_VESTING_ROLE");
    bytes32 public constant ALLOCATION_MANAGER_ROLE = keccak256("ALLOCATION_MANAGER_ROLE");
    bytes32 public constant PRESALE_SCHEDULE_ID = keccak256("PRESALE");

    IERC20 public immutable ukiToken;
    uint64 public presaleVestingStart;
    uint64 public presaleVestingDuration;
    uint64 public immutable unallocatedWithdrawalUnlockTime;
    bool public presaleVestingConfigFrozen;

    struct VestingSchedule {
        uint128 totalAmount;
        uint128 releasedAmount;
        uint64 start;
        uint64 cliff;
        uint64 duration;
    }

    mapping(address beneficiary => mapping(bytes32 scheduleId => VestingSchedule)) private _schedules;
    mapping(address beneficiary => bytes32[] scheduleIds) private _scheduleIds;
    mapping(bytes32 role => address[] members) private _roleMembers;
    mapping(bytes32 role => mapping(address account => uint256 indexPlusOne)) private _roleMemberIndex;
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
    event PresaleVestingConfigUpdated(uint64 start, uint64 duration);
    event PresaleVestingConfigFrozen(uint64 start, uint64 duration);

    error InvalidToken();
    error InvalidBeneficiary();
    error InvalidAmount();
    error InvalidSchedule();
    error InvalidRecipient();
    error ConflictingSchedule();
    error NothingToRelease();
    error InsufficientUnallocatedBalance();
    error PresaleVestingConfigLocked();
    error UnallocatedWithdrawalLocked();
    error InvalidWithdrawalUnlockTime();

    constructor(
        IERC20 ukiToken_,
        address admin,
        uint64 presaleVestingStart_,
        uint64 presaleVestingDuration_,
        uint64 unallocatedWithdrawalUnlockTime_
    ) {
        if (address(ukiToken_) == address(0)) revert InvalidToken();
        if (admin == address(0)) revert InvalidBeneficiary();
        _validatePresaleVestingConfig(presaleVestingStart_, presaleVestingDuration_);
        if (unallocatedWithdrawalUnlockTime_ == 0) revert InvalidWithdrawalUnlockTime();

        ukiToken = ukiToken_;
        presaleVestingStart = presaleVestingStart_;
        presaleVestingDuration = presaleVestingDuration_;
        unallocatedWithdrawalUnlockTime = unallocatedWithdrawalUnlockTime_;
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
    }

    function createVesting(address beneficiary, uint256 amount) external onlyRole(PRESALE_VESTING_ROLE) {
        _createVesting(
            beneficiary,
            PRESALE_SCHEDULE_ID,
            amount,
            presaleVestingStart,
            presaleVestingStart,
            presaleVestingDuration
        );
    }

    function createVestingWithCliff(
        address beneficiary,
        bytes32 scheduleId,
        uint256 amount,
        uint64 start,
        uint64 cliff,
        uint64 duration
    ) external onlyRole(ALLOCATION_MANAGER_ROLE) {
        if (scheduleId == PRESALE_SCHEDULE_ID) revert InvalidSchedule();
        _createVesting(beneficiary, scheduleId, amount, start, cliff, duration);
    }

    function getRoleMemberCount(bytes32 role) public view returns (uint256) {
        return _roleMembers[role].length;
    }

    function getRoleMember(bytes32 role, uint256 index) public view returns (address) {
        return _roleMembers[role][index];
    }

    function releasable(address beneficiary) public view returns (uint256) {
        return releasable(beneficiary, PRESALE_SCHEDULE_ID);
    }

    function releasable(address beneficiary, bytes32 scheduleId) public view returns (uint256) {
        VestingSchedule memory schedule = _effectiveSchedule(beneficiary, scheduleId);
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
        VestingSchedule memory schedule = _effectiveSchedule(beneficiary, scheduleId);
        if (schedule.totalAmount == 0 || timestamp < schedule.start || timestamp < schedule.cliff) {
            return 0;
        }

        if (schedule.duration == 0) {
            return schedule.totalAmount;
        }

        uint256 elapsed = timestamp - schedule.cliff;
        if (elapsed >= schedule.duration) {
            return schedule.totalAmount;
        }

        return (uint256(schedule.totalAmount) * elapsed) / schedule.duration;
    }

    function scheduleOf(address beneficiary) external view returns (VestingSchedule memory) {
        return _effectiveSchedule(beneficiary, PRESALE_SCHEDULE_ID);
    }

    function scheduleOf(address beneficiary, bytes32 scheduleId) external view returns (VestingSchedule memory) {
        return _effectiveSchedule(beneficiary, scheduleId);
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
        if (block.timestamp <= unallocatedWithdrawalUnlockTime) revert UnallocatedWithdrawalLocked();
        if (amount > unallocatedBalance()) revert InsufficientUnallocatedBalance();

        ukiToken.safeTransfer(to, amount);
        emit UnallocatedWithdrawn(to, amount);
    }

    function setPresaleVestingConfig(uint64 nextStart, uint64 nextDuration) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (presaleVestingConfigFrozen) revert PresaleVestingConfigLocked();
        _validatePresaleVestingConfig(nextStart, nextDuration);

        presaleVestingStart = nextStart;
        presaleVestingDuration = nextDuration;
        emit PresaleVestingConfigUpdated(nextStart, nextDuration);
    }

    function freezePresaleVestingConfig() external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (presaleVestingConfigFrozen) revert PresaleVestingConfigLocked();
        presaleVestingConfigFrozen = true;
        emit PresaleVestingConfigFrozen(presaleVestingStart, presaleVestingDuration);
    }

    function _grantRole(bytes32 role, address account) internal override returns (bool) {
        bool granted = super._grantRole(role, account);
        if (granted) {
            _roleMembers[role].push(account);
            _roleMemberIndex[role][account] = _roleMembers[role].length;
        }
        return granted;
    }

    function _revokeRole(bytes32 role, address account) internal override returns (bool) {
        bool revoked = super._revokeRole(role, account);
        if (revoked) {
            uint256 accountIndexPlusOne = _roleMemberIndex[role][account];
            uint256 accountIndex = accountIndexPlusOne - 1;
            uint256 lastIndex = _roleMembers[role].length - 1;

            if (accountIndex != lastIndex) {
                address lastAccount = _roleMembers[role][lastIndex];
                _roleMembers[role][accountIndex] = lastAccount;
                _roleMemberIndex[role][lastAccount] = accountIndexPlusOne;
            }

            _roleMembers[role].pop();
            delete _roleMemberIndex[role][account];
        }
        return revoked;
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
        if (start == 0 || cliff < start || duration > type(uint64).max - cliff) {
            revert InvalidSchedule();
        }
        VestingSchedule storage schedule = _schedules[beneficiary][scheduleId];

        if (amount > unallocatedBalance()) revert InsufficientUnallocatedBalance();
        if (uint256(schedule.totalAmount) + amount > type(uint128).max) revert InvalidAmount();

        if (schedule.totalAmount == 0) {
            _scheduleIds[beneficiary].push(scheduleId);
        } else if (
            scheduleId != PRESALE_SCHEDULE_ID
                && (schedule.start != start || schedule.cliff != cliff || schedule.duration != duration)
        ) {
            revert ConflictingSchedule();
        }

        schedule.start = start;
        schedule.cliff = cliff;
        schedule.duration = duration;
        schedule.totalAmount += uint128(amount);
        totalAllocated += amount;

        emit VestingCreated(beneficiary, scheduleId, amount, start, cliff, duration);
    }

    function _effectiveSchedule(address beneficiary, bytes32 scheduleId)
        private
        view
        returns (VestingSchedule memory schedule)
    {
        schedule = _schedules[beneficiary][scheduleId];
        if (scheduleId == PRESALE_SCHEDULE_ID && schedule.totalAmount != 0) {
            if (!presaleVestingConfigFrozen) {
                schedule.start = type(uint64).max;
                schedule.cliff = type(uint64).max;
            } else {
                schedule.start = presaleVestingStart;
                schedule.cliff = presaleVestingStart;
            }
            schedule.duration = presaleVestingDuration;
        }
    }

    function _validatePresaleVestingConfig(uint64 start, uint64 duration) private pure {
        if (start == 0 || duration == 0 || duration > type(uint64).max - start) revert InvalidSchedule();
    }
}
