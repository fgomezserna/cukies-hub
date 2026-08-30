// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {IERC721Receiver} from "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {
    CukieBridgeMetadata,
    ICukiesBridgeCollection
} from "./ICukiesBridgeCollection.sol";

/**
 * @title CukiesBridgeEndpoint
 * @notice Lock/mint/release endpoint used to rehearse the Cukies bridge on testnets.
 * @dev A trusted relayer submits confirmed requests from the opposite endpoint.
 *      Every cross-chain transfer id is single-use and every NFT remains either
 *      in endpoint custody or in one user wallet, so a round trip never releases
 *      both representations at the same time.
 */
contract CukiesBridgeEndpoint is
    Ownable,
    Pausable,
    ReentrancyGuard,
    IERC721Receiver
{
    uint8 public constant TRON_NETWORK = 0;
    uint8 public constant BSC_NETWORK = 1;

    struct BridgeRequest {
        uint256 tokenId;
        address sourceOwner;
        bytes20 destinationOwner;
        uint8 destinationNetwork;
        uint256 feePaid;
        uint256 createdAt;
        bytes32 metadataHash;
    }

    IERC721 public immutable collection;
    ICukiesBridgeCollection public immutable bridgeCollection;
    uint8 public immutable localNetwork;

    address payable public feeRecipient;
    uint256 public bridgePrice;
    uint256 public nextNonce;

    mapping(address relayer => bool allowed) public relayers;
    mapping(bytes32 transferId => bool processed) public processedTransfers;
    mapping(bytes32 transferId => BridgeRequest request) public bridgeRequests;
    mapping(uint256 tokenId => bytes32 transferId) public lockedTransferByToken;

    mapping(uint256 tokenId => CukieBridgeMetadata metadata) private _tokenMetadata;
    mapping(uint256 tokenId => bytes32 metadataHash) public tokenMetadataHash;

    bool private _expectingCollectionTransfer;
    address private _expectedCollectionOwner;
    uint256 private _expectedCollectionTokenId;

    event JumpInBridge(
        uint256 tokenId,
        address originOwner,
        address destOwner,
        uint8 network,
        uint256 createdAt
    );
    event JumpOutBridge(uint256 tokenId, address destOwner, uint256 createdAt);

    event BridgeRequested(
        bytes32 indexed transferId,
        uint256 indexed tokenId,
        address indexed sourceOwner,
        bytes20 destinationOwner,
        uint8 sourceNetwork,
        uint8 destinationNetwork,
        uint256 nonce,
        uint256 feePaid,
        bytes32 metadataHash,
        uint256 createdAt
    );
    event BridgeCompleted(
        bytes32 indexed transferId,
        uint256 indexed tokenId,
        address indexed destinationOwner,
        uint8 sourceNetwork,
        uint8 destinationNetwork,
        bool minted,
        bytes32 metadataHash,
        uint256 createdAt
    );
    event RelayerUpdated(address indexed relayer, bool allowed);
    event BridgePriceUpdated(uint256 previousPrice, uint256 newPrice);
    event FeeRecipientUpdated(address indexed previousRecipient, address indexed newRecipient);
    event UntrackedERC721Recovered(
        address indexed collectionAddress,
        uint256 indexed tokenId,
        address indexed recipient
    );

    error InvalidCollection();
    error InvalidNetwork(uint8 network);
    error InvalidDestinationNetwork(uint8 network);
    error InvalidRecipient();
    error InvalidRelayer();
    error UnauthorizedRelayer(address account);
    error IncorrectBridgeFee(uint256 expected, uint256 received);
    error IncorrectTokenOwner(address expected, address actual);
    error TokenAlreadyLocked(uint256 tokenId, bytes32 transferId);
    error UnexpectedERC721Transfer();
    error CustodyTransferFailed(uint256 tokenId);
    error InvalidTransferId();
    error TransferAlreadyProcessed(bytes32 transferId);
    error DestinationTokenNotInCustody(uint256 tokenId, address owner);
    error DestinationTokenNotTracked(uint256 tokenId);
    error InvalidCukieType(uint256 typeId);
    error InvalidCukieGeneration(uint256 generation);
    error MetadataHashMismatch(bytes32 expected, bytes32 actual);
    error FeeTransferFailed();
    error TrackedTokenRecoveryForbidden(uint256 tokenId, bytes32 transferId);
    error OwnershipRenounceDisabled();

    modifier onlyRelayer() {
        if (!relayers[msg.sender]) revert UnauthorizedRelayer(msg.sender);
        _;
    }

    constructor(
        address initialOwner,
        address collectionAddress,
        uint8 network,
        address payable initialFeeRecipient,
        uint256 initialBridgePrice
    ) Ownable(initialOwner) {
        if (collectionAddress == address(0)) revert InvalidCollection();
        if (network != TRON_NETWORK && network != BSC_NETWORK) {
            revert InvalidNetwork(network);
        }
        if (initialFeeRecipient == address(0)) revert InvalidRecipient();

        collection = IERC721(collectionAddress);
        bridgeCollection = ICukiesBridgeCollection(collectionAddress);
        localNetwork = network;
        feeRecipient = initialFeeRecipient;
        bridgePrice = initialBridgePrice;
    }

    function requestBridge(
        uint256 tokenId,
        bytes20 destinationOwner,
        uint8 destinationNetwork
    ) external payable nonReentrant whenNotPaused returns (bytes32 transferId) {
        if (destinationOwner == bytes20(0)) revert InvalidRecipient();
        if (
            destinationNetwork != TRON_NETWORK
                && destinationNetwork != BSC_NETWORK
        ) {
            revert InvalidDestinationNetwork(destinationNetwork);
        }
        if (destinationNetwork == localNetwork) {
            revert InvalidDestinationNetwork(destinationNetwork);
        }
        if (msg.value != bridgePrice) {
            revert IncorrectBridgeFee(bridgePrice, msg.value);
        }

        bytes32 activeTransfer = lockedTransferByToken[tokenId];
        if (activeTransfer != bytes32(0)) {
            revert TokenAlreadyLocked(tokenId, activeTransfer);
        }

        address currentOwner = collection.ownerOf(tokenId);
        if (currentOwner != msg.sender) {
            revert IncorrectTokenOwner(msg.sender, currentOwner);
        }

        uint256 nonce = nextNonce;
        nextNonce = nonce + 1;
        transferId = keccak256(
            abi.encode(
                block.chainid,
                address(this),
                localNetwork,
                nonce,
                tokenId,
                msg.sender,
                destinationOwner,
                destinationNetwork
            )
        );

        CukieBridgeMetadata memory metadata = bridgeCollection.bridgeMetadata(tokenId);
        _validateMetadata(metadata);
        bytes32 metadataHash = hashMetadata(metadata);
        uint256 createdAt = block.timestamp * 1_000;
        _tokenMetadata[tokenId] = metadata;
        tokenMetadataHash[tokenId] = metadataHash;
        lockedTransferByToken[tokenId] = transferId;
        bridgeRequests[transferId] = BridgeRequest({
            tokenId: tokenId,
            sourceOwner: msg.sender,
            destinationOwner: destinationOwner,
            destinationNetwork: destinationNetwork,
            feePaid: msg.value,
            createdAt: createdAt,
            metadataHash: metadataHash
        });

        _expectingCollectionTransfer = true;
        _expectedCollectionOwner = msg.sender;
        _expectedCollectionTokenId = tokenId;
        collection.safeTransferFrom(msg.sender, address(this), tokenId);

        if (
            _expectingCollectionTransfer
                || collection.ownerOf(tokenId) != address(this)
        ) {
            revert CustodyTransferFailed(tokenId);
        }

        emit JumpInBridge(
            tokenId,
            msg.sender,
            address(destinationOwner),
            destinationNetwork,
            createdAt
        );
        emit BridgeRequested(
            transferId,
            tokenId,
            msg.sender,
            destinationOwner,
            localNetwork,
            destinationNetwork,
            nonce,
            msg.value,
            metadataHash,
            createdAt
        );

        if (msg.value != 0) {
            (bool transferred,) = feeRecipient.call{value: msg.value}("");
            if (!transferred) revert FeeTransferFailed();
        }
    }

    function completeBridge(
        bytes32 transferId,
        uint256 tokenId,
        address destinationOwner,
        uint8 sourceNetwork,
        bytes32 sourceMetadataHash,
        CukieBridgeMetadata calldata metadata
    ) external nonReentrant whenNotPaused onlyRelayer {
        _validateCompletion(
            transferId,
            destinationOwner,
            sourceNetwork,
            sourceMetadataHash,
            metadata
        );

        bytes32 metadataHash = hashMetadata(metadata);
        processedTransfers[transferId] = true;
        _tokenMetadata[tokenId] = metadata;
        tokenMetadataHash[tokenId] = metadataHash;

        bool minted = _deliverToken(tokenId, destinationOwner);

        uint256 createdAt = block.timestamp * 1_000;
        emit JumpOutBridge(tokenId, destinationOwner, createdAt);
        emit BridgeCompleted(
            transferId,
            tokenId,
            destinationOwner,
            sourceNetwork,
            localNetwork,
            minted,
            metadataHash,
            createdAt
        );
    }

    function _validateCompletion(
        bytes32 transferId,
        address destinationOwner,
        uint8 sourceNetwork,
        bytes32 sourceMetadataHash,
        CukieBridgeMetadata calldata metadata
    ) private view {
        if (transferId == bytes32(0)) revert InvalidTransferId();
        if (processedTransfers[transferId]) {
            revert TransferAlreadyProcessed(transferId);
        }
        if (destinationOwner == address(0)) revert InvalidRecipient();
        if (
            sourceNetwork != TRON_NETWORK && sourceNetwork != BSC_NETWORK
        ) {
            revert InvalidNetwork(sourceNetwork);
        }
        if (sourceNetwork == localNetwork) {
            revert InvalidNetwork(sourceNetwork);
        }
        _validateMetadata(metadata);
        bytes32 actualMetadataHash = hashMetadata(metadata);
        if (sourceMetadataHash != actualMetadataHash) {
            revert MetadataHashMismatch(sourceMetadataHash, actualMetadataHash);
        }
    }

    function _deliverToken(uint256 tokenId, address destinationOwner)
        private
        returns (bool minted)
    {
        try collection.ownerOf(tokenId) returns (address currentOwner) {
            if (currentOwner != address(this)) {
                revert DestinationTokenNotInCustody(tokenId, currentOwner);
            }

            if (lockedTransferByToken[tokenId] == bytes32(0)) {
                revert DestinationTokenNotTracked(tokenId);
            }
            delete lockedTransferByToken[tokenId];
            collection.safeTransferFrom(address(this), destinationOwner, tokenId);
        } catch {
            minted = true;
            bridgeCollection.mintBridge(
                destinationOwner,
                tokenId,
                _tokenMetadata[tokenId]
            );
        }
    }

    function tokenMetadata(uint256 tokenId)
        external
        view
        returns (CukieBridgeMetadata memory metadata, bytes32 metadataHash)
    {
        return (_tokenMetadata[tokenId], tokenMetadataHash[tokenId]);
    }

    function hashMetadata(CukieBridgeMetadata memory metadata)
        public
        pure
        returns (bytes32)
    {
        return keccak256(abi.encode(metadata));
    }

    function _validateMetadata(CukieBridgeMetadata memory metadata) private pure {
        if (metadata.typeId < 1 || metadata.typeId > 6) {
            revert InvalidCukieType(metadata.typeId);
        }
        if (metadata.generation < 1 || metadata.generation > 2) {
            revert InvalidCukieGeneration(metadata.generation);
        }
    }

    function setRelayer(address relayer, bool allowed) external onlyOwner {
        if (relayer == address(0)) revert InvalidRelayer();
        relayers[relayer] = allowed;
        emit RelayerUpdated(relayer, allowed);
    }

    function setBridgePrice(uint256 newPrice) external onlyOwner {
        uint256 previousPrice = bridgePrice;
        bridgePrice = newPrice;
        emit BridgePriceUpdated(previousPrice, newPrice);
    }

    function setFeeRecipient(address payable newRecipient) external onlyOwner {
        if (newRecipient == address(0)) revert InvalidRecipient();
        address previousRecipient = feeRecipient;
        feeRecipient = newRecipient;
        emit FeeRecipientUpdated(previousRecipient, newRecipient);
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    function recoverUntrackedERC721(
        address collectionAddress,
        uint256 tokenId,
        address recipient
    ) external onlyOwner whenPaused nonReentrant {
        if (recipient == address(0)) revert InvalidRecipient();
        if (collectionAddress == address(collection)) {
            bytes32 transferId = lockedTransferByToken[tokenId];
            if (transferId != bytes32(0)) {
                revert TrackedTokenRecoveryForbidden(tokenId, transferId);
            }
        }

        IERC721(collectionAddress).transferFrom(
            address(this),
            recipient,
            tokenId
        );
        emit UntrackedERC721Recovered(collectionAddress, tokenId, recipient);
    }

    function renounceOwnership() public pure override {
        revert OwnershipRenounceDisabled();
    }

    function onERC721Received(
        address,
        address from,
        uint256 tokenId,
        bytes calldata
    ) external override returns (bytes4) {
        if (
            msg.sender != address(collection) || !_expectingCollectionTransfer
                || from != _expectedCollectionOwner
                || tokenId != _expectedCollectionTokenId
        ) {
            revert UnexpectedERC721Transfer();
        }

        _expectingCollectionTransfer = false;
        _expectedCollectionOwner = address(0);
        _expectedCollectionTokenId = 0;

        return IERC721Receiver.onERC721Received.selector;
    }
}
