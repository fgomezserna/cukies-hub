// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {MerkleProof} from "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title RewardsDistributor
/// @notice Distributes pre-funded UKI reward batches using reproducible Merkle proofs.
contract RewardsDistributor is Ownable2Step, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    struct Batch {
        bytes32 merkleRoot;
        bytes32 inputHash;
        bytes32 metadataHash;
        uint256 totalAllocated;
        uint256 totalClaimed;
        uint64 startsAt;
        uint64 expiresAt;
        bool closed;
    }

    IERC20 public immutable ukiToken;
    uint256 public totalReserved;

    mapping(bytes32 batchId => Batch batch) public batches;
    mapping(bytes32 batchId => mapping(address account => bool)) public claimed;

    event BatchPublished(
        bytes32 indexed batchId,
        bytes32 indexed merkleRoot,
        bytes32 inputHash,
        bytes32 metadataHash,
        uint256 totalAllocated,
        uint64 startsAt,
        uint64 expiresAt
    );
    event RewardClaimed(bytes32 indexed batchId, address indexed account, uint256 amount);
    event BatchClosed(bytes32 indexed batchId, uint256 unclaimedAmount);
    event ExcessRecovered(address indexed to, uint256 amount);

    error InvalidToken();
    error InvalidBatchId();
    error InvalidMerkleRoot();
    error InvalidInputHash();
    error InvalidMetadataHash();
    error InvalidAmount();
    error InvalidBatchWindow();
    error InvalidRecipient();
    error BatchAlreadyExists();
    error BatchNotFound();
    error BatchNotStarted();
    error BatchExpired();
    error BatchNotExpired();
    error BatchAlreadyClosed();
    error BatchClosedForClaims();
    error AlreadyClaimed();
    error InvalidProof();
    error BatchAllocationExceeded();
    error InsufficientFreeBalance();
    error OwnershipRenounceDisabled();

    constructor(IERC20 ukiToken_, address initialOwner) Ownable(initialOwner) {
        if (address(ukiToken_) == address(0)) revert InvalidToken();
        ukiToken = ukiToken_;
    }

    /// @notice Publishes an immutable batch definition and reserves its full allocation.
    /// @dev Administration intentionally remains available while claims are paused.
    function publishBatch(
        bytes32 batchId,
        bytes32 merkleRoot,
        bytes32 inputHash,
        bytes32 metadataHash,
        uint256 totalAllocated,
        uint64 startsAt,
        uint64 expiresAt
    ) external onlyOwner {
        if (batchId == bytes32(0)) revert InvalidBatchId();
        if (merkleRoot == bytes32(0)) revert InvalidMerkleRoot();
        if (inputHash == bytes32(0)) revert InvalidInputHash();
        if (metadataHash == bytes32(0)) revert InvalidMetadataHash();
        if (totalAllocated == 0) revert InvalidAmount();
        if (startsAt == 0 || expiresAt <= startsAt || expiresAt <= block.timestamp) {
            revert InvalidBatchWindow();
        }
        if (batches[batchId].merkleRoot != bytes32(0)) revert BatchAlreadyExists();
        if (totalAllocated > freeBalance()) revert InsufficientFreeBalance();

        batches[batchId] = Batch({
            merkleRoot: merkleRoot,
            inputHash: inputHash,
            metadataHash: metadataHash,
            totalAllocated: totalAllocated,
            totalClaimed: 0,
            startsAt: startsAt,
            expiresAt: expiresAt,
            closed: false
        });
        totalReserved += totalAllocated;

        emit BatchPublished(batchId, merkleRoot, inputHash, metadataHash, totalAllocated, startsAt, expiresAt);
    }

    function claim(bytes32 batchId, uint256 amount, bytes32[] calldata proof)
        external
        nonReentrant
        whenNotPaused
    {
        if (amount == 0) revert InvalidAmount();

        Batch storage batch = batches[batchId];
        if (batch.merkleRoot == bytes32(0)) revert BatchNotFound();
        if (batch.closed) revert BatchClosedForClaims();
        if (block.timestamp < batch.startsAt) revert BatchNotStarted();
        if (block.timestamp > batch.expiresAt) revert BatchExpired();
        if (claimed[batchId][msg.sender]) revert AlreadyClaimed();

        bytes32 innerHash = keccak256(abi.encode(block.chainid, address(this), batchId, msg.sender, amount));
        bytes32 leaf = keccak256(bytes.concat(innerHash));
        if (!MerkleProof.verifyCalldata(proof, batch.merkleRoot, leaf)) revert InvalidProof();
        if (amount > batch.totalAllocated - batch.totalClaimed) revert BatchAllocationExceeded();

        claimed[batchId][msg.sender] = true;
        batch.totalClaimed += amount;
        totalReserved -= amount;

        ukiToken.safeTransfer(msg.sender, amount);
        emit RewardClaimed(batchId, msg.sender, amount);
    }

    /// @notice Closes an expired batch and releases only its unclaimed reservation.
    /// @dev Closing remains available while claims are paused so the Safe can reconcile expired batches.
    function closeExpiredBatch(bytes32 batchId) external onlyOwner {
        Batch storage batch = batches[batchId];
        if (batch.merkleRoot == bytes32(0)) revert BatchNotFound();
        if (batch.closed) revert BatchAlreadyClosed();
        if (block.timestamp <= batch.expiresAt) revert BatchNotExpired();

        uint256 unclaimedAmount = batch.totalAllocated - batch.totalClaimed;
        batch.closed = true;
        totalReserved -= unclaimedAmount;

        emit BatchClosed(batchId, unclaimedAmount);
    }

    /// @notice Recovers UKI that is not reserved for any open batch.
    /// @dev Recovery remains available while claims are paused and can never consume reserved funds.
    function recoverExcess(address to, uint256 amount) external onlyOwner nonReentrant {
        if (to == address(0)) revert InvalidRecipient();
        if (amount == 0) revert InvalidAmount();
        if (amount > freeBalance()) revert InsufficientFreeBalance();

        ukiToken.safeTransfer(to, amount);
        emit ExcessRecovered(to, amount);
    }

    function freeBalance() public view returns (uint256) {
        uint256 balance = ukiToken.balanceOf(address(this));
        return balance > totalReserved ? balance - totalReserved : 0;
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
}
