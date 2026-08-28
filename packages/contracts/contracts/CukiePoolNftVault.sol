// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {IERC721Receiver} from "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title CukiePoolNftVault
/// @notice Custodies lendable Cukies and guarantees exits at versioned daily cutoffs.
/// @dev Generation, rarity, game quotas and rewards intentionally remain off-chain.
contract CukiePoolNftVault is Ownable2Step, Pausable, ReentrancyGuard, IERC721Receiver {
    uint256 public constant PERIOD_DURATION = 1 days;
    uint64 public constant INITIAL_PERIOD_START = 14 hours;

    enum Lifecycle {
        NONE,
        PENDING_ACTIVATION,
        ACTIVE,
        EXIT_REQUESTED,
        WITHDRAWABLE
    }

    struct CalendarVersion {
        uint64 effectiveAt;
        uint64 firstCutoffAt;
        uint64 firstPeriodId;
    }

    struct Period {
        uint64 periodId;
        uint64 startsAt;
        uint64 endsAt;
        uint32 calendarVersion;
    }

    struct Position {
        address beneficialOwner;
        uint64 depositEpoch;
        uint64 depositedAt;
        uint64 activationAt;
        uint64 exitRequestedAt;
        uint64 withdrawableAt;
        uint64 exitPeriodId;
        uint32 depositCalendarVersion;
        uint32 exitCalendarVersion;
    }

    struct PendingDeposit {
        address collection;
        address beneficiary;
        uint256 tokenId;
        bool active;
        bool received;
    }

    mapping(address collection => bool allowed) public collectionAllowed;
    mapping(address collection => mapping(uint256 tokenId => Position position)) private _positions;
    mapping(address collection => mapping(uint256 tokenId => uint64 epoch)) private _totalDepositEpochs;
    mapping(uint32 version => CalendarVersion calendar) private _calendarVersions;

    uint32 public calendarVersionCount;
    PendingDeposit private _pendingDeposit;

    event CollectionAllowedUpdated(address indexed collection, bool allowed);
    event CalendarVersionScheduled(
        uint32 indexed version,
        uint64 effectiveAt,
        uint64 firstCutoffAt,
        uint64 firstPeriodId,
        uint32 periodAnchorSeconds
    );
    event Deposited(
        address indexed collection,
        uint256 indexed tokenId,
        address indexed beneficiary,
        uint64 depositEpoch,
        uint64 depositedAt,
        uint64 depositPeriodId,
        uint64 activationAt,
        uint64 activationPeriodId,
        uint32 calendarVersion
    );
    event ExitRequested(
        address indexed collection,
        uint256 indexed tokenId,
        address indexed beneficiary,
        uint64 depositEpoch,
        uint64 requestedAt,
        uint64 exitPeriodId,
        uint64 withdrawableAt,
        uint32 calendarVersion
    );
    event WithdrawableAtAdvanced(
        address indexed collection,
        uint256 indexed tokenId,
        address indexed beneficiary,
        uint64 depositEpoch,
        uint64 previousWithdrawableAt,
        uint64 newWithdrawableAt
    );
    event Withdrawn(
        address indexed collection,
        uint256 indexed tokenId,
        address indexed beneficiary,
        uint64 depositEpoch,
        uint64 withdrawnAt
    );
    event UntrackedERC721Recovered(
        address indexed collection,
        uint256 indexed tokenId,
        address indexed recipient,
        uint64 recoveredAt
    );

    error InvalidCollection();
    error InvalidRecipient();
    error CollectionNotAllowed();
    error PositionAlreadyExists();
    error PositionNotFound();
    error RegisteredPosition();
    error NotTokenOwner(address caller, address tokenOwner);
    error NotBeneficialOwner(address caller, address beneficialOwner);
    error ExitAlreadyRequested();
    error ExitNotRequested();
    error WithdrawalNotReady(uint64 withdrawableAt);
    error InvalidCalendarVersion();
    error InvalidCalendarEffectiveAt();
    error InvalidCalendarBoundary();
    error InvalidFirstCutoff();
    error InvalidWithdrawableAtAdvance();
    error TimestampBeforeCalendar();
    error ValueOverflow();
    error UnexpectedERC721Transfer();
    error CustodyNotReceived();
    error CustodyNotReleased();
    error UntrackedAssetNotCustodied();
    error OwnershipRenounceDisabled();

    constructor(address initialOwner) Ownable(initialOwner) {
        calendarVersionCount = 1;
        _calendarVersions[1] = CalendarVersion({
            effectiveAt: INITIAL_PERIOD_START,
            firstCutoffAt: INITIAL_PERIOD_START + uint64(PERIOD_DURATION),
            firstPeriodId: 0
        });

        emit CalendarVersionScheduled(
            1,
            INITIAL_PERIOD_START,
            INITIAL_PERIOD_START + uint64(PERIOD_DURATION),
            0,
            uint32(INITIAL_PERIOD_START)
        );
    }

    function setCollectionAllowed(address collection, bool allowed) external onlyOwner {
        if (
            collection == address(0)
                || (collection.code.length == 0 && (allowed || !collectionAllowed[collection]))
        ) {
            revert InvalidCollection();
        }

        collectionAllowed[collection] = allowed;
        emit CollectionAllowedUpdated(collection, allowed);
    }

    function scheduleCalendarVersion(uint64 effectiveAt, uint64 firstCutoffAt)
        external
        onlyOwner
        returns (uint32 version)
    {
        uint64 currentTimestamp = _blockTimestamp();
        if (effectiveAt <= currentTimestamp) revert InvalidCalendarEffectiveAt();

        uint32 previousVersion = calendarVersionCount;
        CalendarVersion memory previous = _calendarVersions[previousVersion];
        if (effectiveAt <= previous.effectiveAt) revert InvalidCalendarEffectiveAt();

        Period memory previousPeriod = _periodAtUsingVersion(previous, previousVersion, effectiveAt);
        if (previousPeriod.startsAt != effectiveAt) revert InvalidCalendarBoundary();

        uint256 latestAllowedCutoff = uint256(effectiveAt) + PERIOD_DURATION;
        if (
            firstCutoffAt <= effectiveAt || uint256(firstCutoffAt) > latestAllowedCutoff
        ) {
            revert InvalidFirstCutoff();
        }
        if (previousVersion == type(uint32).max) revert ValueOverflow();

        version = previousVersion + 1;
        calendarVersionCount = version;
        _calendarVersions[version] = CalendarVersion({
            effectiveAt: effectiveAt,
            firstCutoffAt: firstCutoffAt,
            firstPeriodId: previousPeriod.periodId
        });

        emit CalendarVersionScheduled(
            version,
            effectiveAt,
            firstCutoffAt,
            previousPeriod.periodId,
            uint32(uint256(firstCutoffAt) % PERIOD_DURATION)
        );
    }

    function deposit(address collection, uint256 tokenId) external nonReentrant whenNotPaused {
        if (!collectionAllowed[collection]) revert CollectionNotAllowed();
        if (_positions[collection][tokenId].beneficialOwner != address(0)) revert PositionAlreadyExists();

        address tokenOwner = IERC721(collection).ownerOf(tokenId);
        if (tokenOwner != msg.sender) revert NotTokenOwner(msg.sender, tokenOwner);

        uint64 depositedAt = _blockTimestamp();
        Period memory depositPeriod = _periodAt(depositedAt);
        uint64 depositEpoch = _nextEpoch(collection, tokenId);
        uint64 activationPeriodId = _addUint64(depositPeriod.periodId, 1);

        _pendingDeposit = PendingDeposit({
            collection: collection,
            beneficiary: msg.sender,
            tokenId: tokenId,
            active: true,
            received: false
        });

        IERC721(collection).safeTransferFrom(msg.sender, address(this), tokenId);

        if (!_pendingDeposit.received) revert UnexpectedERC721Transfer();
        if (IERC721(collection).ownerOf(tokenId) != address(this)) revert CustodyNotReceived();
        delete _pendingDeposit;

        _totalDepositEpochs[collection][tokenId] = depositEpoch;
        _positions[collection][tokenId] = Position({
            beneficialOwner: msg.sender,
            depositEpoch: depositEpoch,
            depositedAt: depositedAt,
            activationAt: depositPeriod.endsAt,
            exitRequestedAt: 0,
            withdrawableAt: 0,
            exitPeriodId: 0,
            depositCalendarVersion: depositPeriod.calendarVersion,
            exitCalendarVersion: 0
        });

        emit Deposited(
            collection,
            tokenId,
            msg.sender,
            depositEpoch,
            depositedAt,
            depositPeriod.periodId,
            depositPeriod.endsAt,
            activationPeriodId,
            depositPeriod.calendarVersion
        );
    }

    function requestExit(address collection, uint256 tokenId) external {
        Position storage position = _positions[collection][tokenId];
        if (position.beneficialOwner == address(0)) revert PositionNotFound();
        if (position.beneficialOwner != msg.sender) {
            revert NotBeneficialOwner(msg.sender, position.beneficialOwner);
        }
        if (position.withdrawableAt != 0) revert ExitAlreadyRequested();

        uint64 requestedAt = _blockTimestamp();
        Period memory exitPeriod = _periodAt(requestedAt);
        position.exitRequestedAt = requestedAt;
        position.withdrawableAt = exitPeriod.endsAt;
        position.exitPeriodId = exitPeriod.periodId;
        position.exitCalendarVersion = exitPeriod.calendarVersion;

        emit ExitRequested(
            collection,
            tokenId,
            msg.sender,
            position.depositEpoch,
            requestedAt,
            exitPeriod.periodId,
            exitPeriod.endsAt,
            exitPeriod.calendarVersion
        );
    }

    function advanceWithdrawableAt(address collection, uint256 tokenId, uint64 earlierWithdrawableAt)
        external
        onlyOwner
    {
        Position storage position = _positions[collection][tokenId];
        if (position.beneficialOwner == address(0)) revert PositionNotFound();
        uint64 previousWithdrawableAt = position.withdrawableAt;
        if (previousWithdrawableAt == 0) revert ExitNotRequested();
        if (earlierWithdrawableAt == 0 || earlierWithdrawableAt >= previousWithdrawableAt) {
            revert InvalidWithdrawableAtAdvance();
        }

        position.withdrawableAt = earlierWithdrawableAt;
        emit WithdrawableAtAdvanced(
            collection,
            tokenId,
            position.beneficialOwner,
            position.depositEpoch,
            previousWithdrawableAt,
            earlierWithdrawableAt
        );
    }

    function withdraw(address collection, uint256 tokenId) external nonReentrant {
        Position memory position = _positions[collection][tokenId];
        if (position.beneficialOwner == address(0)) revert PositionNotFound();
        if (position.beneficialOwner != msg.sender) {
            revert NotBeneficialOwner(msg.sender, position.beneficialOwner);
        }
        if (position.withdrawableAt == 0) revert ExitNotRequested();

        uint64 withdrawnAt = _blockTimestamp();
        if (withdrawnAt < position.withdrawableAt) {
            revert WithdrawalNotReady(position.withdrawableAt);
        }

        delete _positions[collection][tokenId];
        IERC721(collection).transferFrom(address(this), msg.sender, tokenId);
        if (IERC721(collection).ownerOf(tokenId) != msg.sender) revert CustodyNotReleased();

        emit Withdrawn(collection, tokenId, msg.sender, position.depositEpoch, withdrawnAt);
    }

    function recoverUntrackedERC721(address collection, uint256 tokenId, address recipient)
        external
        onlyOwner
        nonReentrant
    {
        if (collection == address(0) || collection.code.length == 0) revert InvalidCollection();
        if (recipient == address(0)) revert InvalidRecipient();
        if (_positions[collection][tokenId].beneficialOwner != address(0)) revert RegisteredPosition();
        if (IERC721(collection).ownerOf(tokenId) != address(this)) revert UntrackedAssetNotCustodied();

        IERC721(collection).transferFrom(address(this), recipient, tokenId);
        if (IERC721(collection).ownerOf(tokenId) != recipient) revert CustodyNotReleased();

        emit UntrackedERC721Recovered(collection, tokenId, recipient, _blockTimestamp());
    }

    function calendarVersion(uint32 version) external view returns (CalendarVersion memory) {
        if (version == 0 || version > calendarVersionCount) revert InvalidCalendarVersion();
        return _calendarVersions[version];
    }

    function calendarVersionAt(uint64 timestamp) public view returns (uint32) {
        if (timestamp < INITIAL_PERIOD_START) revert TimestampBeforeCalendar();

        uint256 low = 1;
        uint256 high = uint256(calendarVersionCount) + 1;
        while (low < high) {
            uint256 middle = (low + high) / 2;
            if (_calendarVersions[uint32(middle)].effectiveAt <= timestamp) {
                low = middle + 1;
            } else {
                high = middle;
            }
        }
        return uint32(low - 1);
    }

    function periodAt(uint64 timestamp) public view returns (Period memory) {
        return _periodAt(timestamp);
    }

    function currentPeriod() external view returns (Period memory) {
        return _periodAt(_blockTimestamp());
    }

    function positionOf(address collection, uint256 tokenId) external view returns (Position memory) {
        return _positions[collection][tokenId];
    }

    function beneficialOwnerOf(address collection, uint256 tokenId) public view returns (address) {
        return _positions[collection][tokenId].beneficialOwner;
    }

    function depositEpochOf(address collection, uint256 tokenId) external view returns (uint64) {
        return _positions[collection][tokenId].depositEpoch;
    }

    function totalDepositEpochs(address collection, uint256 tokenId) external view returns (uint64) {
        return _totalDepositEpochs[collection][tokenId];
    }

    function lifecycleOf(address collection, uint256 tokenId) public view returns (Lifecycle) {
        Position memory position = _positions[collection][tokenId];
        if (position.beneficialOwner == address(0)) return Lifecycle.NONE;

        uint64 timestamp = _blockTimestamp();
        if (position.withdrawableAt != 0) {
            return timestamp >= position.withdrawableAt
                ? Lifecycle.WITHDRAWABLE
                : Lifecycle.EXIT_REQUESTED;
        }
        return timestamp >= position.activationAt ? Lifecycle.ACTIVE : Lifecycle.PENDING_ACTIVATION;
    }

    function isLendable(address collection, uint256 tokenId) external view returns (bool) {
        Position memory position = _positions[collection][tokenId];
        if (position.beneficialOwner == address(0)) return false;

        uint64 timestamp = _blockTimestamp();
        return timestamp >= position.activationAt
            && (position.withdrawableAt == 0 || timestamp < position.withdrawableAt);
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    function renounceOwnership() public view override onlyOwner {
        revert OwnershipRenounceDisabled();
    }

    function onERC721Received(address operator, address from, uint256 tokenId, bytes calldata data)
        external
        override
        returns (bytes4)
    {
        PendingDeposit storage pending = _pendingDeposit;
        if (
            !pending.active || pending.received || msg.sender != pending.collection || operator != address(this)
                || from != pending.beneficiary || tokenId != pending.tokenId || data.length != 0
        ) {
            revert UnexpectedERC721Transfer();
        }

        pending.received = true;
        return IERC721Receiver.onERC721Received.selector;
    }

    function _periodAt(uint64 timestamp) private view returns (Period memory) {
        uint32 version = calendarVersionAt(timestamp);
        return _periodAtUsingVersion(_calendarVersions[version], version, timestamp);
    }

    function _periodAtUsingVersion(CalendarVersion memory calendar, uint32 version, uint64 timestamp)
        private
        pure
        returns (Period memory)
    {
        if (timestamp < calendar.effectiveAt) revert TimestampBeforeCalendar();
        if (timestamp < calendar.firstCutoffAt) {
            return Period({
                periodId: calendar.firstPeriodId,
                startsAt: calendar.effectiveAt,
                endsAt: calendar.firstCutoffAt,
                calendarVersion: version
            });
        }

        uint256 completedPeriods = (uint256(timestamp) - calendar.firstCutoffAt) / PERIOD_DURATION;
        uint256 startsAt = uint256(calendar.firstCutoffAt) + completedPeriods * PERIOD_DURATION;
        uint256 periodId = uint256(calendar.firstPeriodId) + completedPeriods + 1;
        return Period({
            periodId: _toUint64(periodId),
            startsAt: _toUint64(startsAt),
            endsAt: _toUint64(startsAt + PERIOD_DURATION),
            calendarVersion: version
        });
    }

    function _nextEpoch(address collection, uint256 tokenId) private view returns (uint64) {
        uint64 currentEpoch = _totalDepositEpochs[collection][tokenId];
        if (currentEpoch == type(uint64).max) revert ValueOverflow();
        return currentEpoch + 1;
    }

    function _blockTimestamp() private view returns (uint64) {
        return _toUint64(block.timestamp);
    }

    function _addUint64(uint64 value, uint64 increment) private pure returns (uint64) {
        return _toUint64(uint256(value) + increment);
    }

    function _toUint64(uint256 value) private pure returns (uint64) {
        if (value > type(uint64).max) revert ValueOverflow();
        return uint64(value);
    }
}
