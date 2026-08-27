// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {IERC721Receiver} from "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title CukieMasterNftVault
/// @notice Custodies allowlisted ERC721 assets for their depositing beneficial owners.
/// @dev Eligibility, rarity, points, slots, credits and rewards are intentionally off-chain concerns.
contract CukieMasterNftVault is Ownable2Step, Pausable, ReentrancyGuard, IERC721Receiver {
    struct Position {
        address beneficialOwner;
        uint256 depositEpoch;
        uint256 depositedAt;
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
    mapping(address collection => mapping(uint256 tokenId => uint256 epoch)) private _totalDepositEpochs;

    PendingDeposit private _pendingDeposit;

    event CollectionAllowedUpdated(address indexed collection, bool allowed);
    event Deposited(
        address indexed collection,
        uint256 indexed tokenId,
        address indexed beneficiary,
        uint256 depositEpoch,
        uint256 depositedAt
    );
    event Withdrawn(
        address indexed collection,
        uint256 indexed tokenId,
        address indexed beneficiary,
        uint256 depositEpoch,
        uint256 withdrawnAt
    );
    event UntrackedERC721Recovered(
        address indexed collection,
        uint256 indexed tokenId,
        address indexed recipient,
        uint256 recoveredAt
    );

    error InvalidCollection();
    error CollectionNotAllowed();
    error PositionAlreadyExists();
    error PositionNotFound();
    error RegisteredPosition();
    error InvalidRecipient();
    error UntrackedAssetNotCustodied();
    error NotTokenOwner(address caller, address tokenOwner);
    error NotBeneficialOwner(address caller, address beneficialOwner);
    error UnexpectedERC721Transfer();
    error CustodyNotReceived();
    error CustodyNotReleased();
    error OwnershipRenounceDisabled();

    constructor(address initialOwner) Ownable(initialOwner) {}

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

    /// @notice Deposits an allowlisted NFT owned by the caller and opens a new asset epoch.
    /// @dev The vault itself must be approved before this call. Approved operators cannot deposit for an owner.
    function deposit(address collection, uint256 tokenId) external nonReentrant whenNotPaused {
        if (!collectionAllowed[collection]) revert CollectionNotAllowed();
        if (_positions[collection][tokenId].beneficialOwner != address(0)) revert PositionAlreadyExists();

        address tokenOwner = IERC721(collection).ownerOf(tokenId);
        if (tokenOwner != msg.sender) revert NotTokenOwner(msg.sender, tokenOwner);

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

        uint256 depositEpoch = _totalDepositEpochs[collection][tokenId] + 1;
        uint256 depositedAt = block.timestamp;
        _totalDepositEpochs[collection][tokenId] = depositEpoch;
        _positions[collection][tokenId] = Position({
            beneficialOwner: msg.sender,
            depositEpoch: depositEpoch,
            depositedAt: depositedAt
        });

        emit Deposited(collection, tokenId, msg.sender, depositEpoch, depositedAt);
    }

    /// @notice Returns a deposited NFT immediately to its beneficial owner.
    function unstake(address collection, uint256 tokenId) external nonReentrant {
        _withdraw(collection, tokenId);
    }

    /// @notice Alias for integrations that name the immediate exit `withdraw`.
    function withdraw(address collection, uint256 tokenId) external nonReentrant {
        _withdraw(collection, tokenId);
    }

    function positionOf(address collection, uint256 tokenId) external view returns (Position memory) {
        return _positions[collection][tokenId];
    }

    function beneficialOwnerOf(address collection, uint256 tokenId) public view returns (address) {
        return _positions[collection][tokenId].beneficialOwner;
    }

    function depositEpochOf(address collection, uint256 tokenId) public view returns (uint256) {
        return _positions[collection][tokenId].depositEpoch;
    }

    function totalDepositEpochs(address collection, uint256 tokenId) public view returns (uint256) {
        return _totalDepositEpochs[collection][tokenId];
    }

    /// @notice Recovers an ERC721 sent with unsafe `transferFrom`, which bypasses receiver callbacks.
    /// @dev The owner can never use this path for a registered beneficiary position.
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

        emit UntrackedERC721Recovered(collection, tokenId, recipient, block.timestamp);
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

    /// @inheritdoc IERC721Receiver
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

    function _withdraw(address collection, uint256 tokenId) private {
        Position memory position = _positions[collection][tokenId];
        if (position.beneficialOwner == address(0)) revert PositionNotFound();
        if (position.beneficialOwner != msg.sender) {
            revert NotBeneficialOwner(msg.sender, position.beneficialOwner);
        }

        delete _positions[collection][tokenId];

        // The beneficiary already owned this NFT before depositing it. Using transferFrom
        // guarantees exit even when that beneficiary is a contract without IERC721Receiver.
        IERC721(collection).transferFrom(address(this), msg.sender, tokenId);
        if (IERC721(collection).ownerOf(tokenId) != msg.sender) revert CustodyNotReleased();

        emit Withdrawn(collection, tokenId, msg.sender, position.depositEpoch, block.timestamp);
    }
}
