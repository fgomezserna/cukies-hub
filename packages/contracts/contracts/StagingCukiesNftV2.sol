// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {IERC721Metadata} from "@openzeppelin/contracts/token/ERC721/extensions/IERC721Metadata.sol";
import {IERC721Receiver} from "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";
import {
    CukieBridgeMetadata,
    ICukiesBridgeCollection
} from "./ICukiesBridgeCollection.sol";

/**
 * @title StagingCukiesNftV2
 * @notice Standards-compatible Cukies fixture for BSC Testnet integrations.
 * @dev Rarity values are stable: 1 common, 2 uncommon, 3 rare, 4 epic,
 *      5 legendary and 6 goat. Generation 1 is original and 2 is second generation.
 *      This fixture deliberately has no burn path.
 */
contract StagingCukiesNftV2 is Ownable, IERC721Metadata, ICukiesBridgeCollection {
    struct CukieMetadata {
        uint8 rarity;
        uint8 generation;
    }

    string public constant override name = "Staging Cukies V2";
    string public constant override symbol = "stCUKI2";

    mapping(uint256 tokenId => CukieMetadata metadata) private _cukieMetadata;
    mapping(uint256 tokenId => CukieBridgeMetadata metadata) private _bridgeMetadata;
    mapping(uint256 tokenId => address owner) private _owners;
    mapping(address owner => uint256 balance) private _balances;
    mapping(uint256 tokenId => address approved) private _tokenApprovals;
    mapping(address owner => mapping(address operator => bool approved)) private _operatorApprovals;

    event CukieMetadataConfigured(uint256 indexed tokenId, uint8 rarity, uint8 generation);

    error ERC721NonexistentToken(uint256 tokenId);
    error ERC721InvalidOwner(address owner);
    error ERC721InvalidReceiver(address receiver);
    error ERC721InsufficientApproval(address operator, uint256 tokenId);
    error ERC721IncorrectOwner(address sender, uint256 tokenId, address owner);
    error ERC721InvalidApprover(address approver);
    error ERC721InvalidOperator(address operator);
    error ERC721TokenAlreadyMinted(uint256 tokenId);
    error InvalidRarity(uint8 rarity);
    error InvalidGeneration(uint8 generation);
    error InvalidBridgeAttribute(uint256 value);

    constructor(address initialOwner) Ownable(initialOwner) {}

    /// @inheritdoc IERC165
    function supportsInterface(bytes4 interfaceId) external pure override returns (bool) {
        return interfaceId == type(IERC165).interfaceId
            || interfaceId == type(IERC721).interfaceId
            || interfaceId == type(IERC721Metadata).interfaceId;
    }

    /// @inheritdoc IERC721
    function balanceOf(address owner) external view override returns (uint256) {
        if (owner == address(0)) revert ERC721InvalidOwner(owner);
        return _balances[owner];
    }

    /// @inheritdoc IERC721
    function ownerOf(uint256 tokenId) public view override returns (address) {
        address owner = _owners[tokenId];
        if (owner == address(0)) revert ERC721NonexistentToken(tokenId);
        return owner;
    }

    /// @inheritdoc IERC721Metadata
    function tokenURI(uint256 tokenId) external view override returns (string memory) {
        ownerOf(tokenId);
        return string(abi.encodePacked("staging://cukies/", _toDecimalString(tokenId)));
    }

    /// @inheritdoc IERC721
    function approve(address to, uint256 tokenId) external override {
        address owner = ownerOf(tokenId);
        if (msg.sender != owner && !_operatorApprovals[owner][msg.sender]) {
            revert ERC721InvalidApprover(msg.sender);
        }

        _tokenApprovals[tokenId] = to;
        emit Approval(owner, to, tokenId);
    }

    /// @inheritdoc IERC721
    function getApproved(uint256 tokenId) external view override returns (address) {
        ownerOf(tokenId);
        return _tokenApprovals[tokenId];
    }

    /// @inheritdoc IERC721
    function setApprovalForAll(address operator, bool approved) external override {
        if (operator == address(0) || operator == msg.sender) {
            revert ERC721InvalidOperator(operator);
        }

        _operatorApprovals[msg.sender][operator] = approved;
        emit ApprovalForAll(msg.sender, operator, approved);
    }

    /// @inheritdoc IERC721
    function isApprovedForAll(address owner, address operator) external view override returns (bool) {
        return _operatorApprovals[owner][operator];
    }

    /// @inheritdoc IERC721
    function transferFrom(address from, address to, uint256 tokenId) public override {
        _transfer(msg.sender, from, to, tokenId);
    }

    /// @inheritdoc IERC721
    function safeTransferFrom(address from, address to, uint256 tokenId) external override {
        _safeTransfer(msg.sender, from, to, tokenId, "");
    }

    /// @inheritdoc IERC721
    function safeTransferFrom(address from, address to, uint256 tokenId, bytes calldata data)
        external
        override
    {
        _safeTransfer(msg.sender, from, to, tokenId, data);
    }

    /// @notice Safely mints one staging Cukie with immutable rarity and generation metadata.
    function mint(address to, uint256 tokenId, uint8 rarity, uint8 generation) external onlyOwner {
        CukieBridgeMetadata memory metadata = CukieBridgeMetadata({
            typeId: rarity,
            generation: generation,
            skills: [uint256(0), 0, 0, 0, 0, 0],
            energy: 0,
            health: 0
        });
        _mintBridge(to, tokenId, metadata);
    }

    function mintBridge(
        address to,
        uint256 tokenId,
        CukieBridgeMetadata calldata metadata
    ) external override onlyOwner {
        _mintBridge(to, tokenId, metadata);
    }

    function _mintBridge(
        address to,
        uint256 tokenId,
        CukieBridgeMetadata memory metadata
    ) private {
        if (to == address(0)) revert ERC721InvalidReceiver(to);
        if (_owners[tokenId] != address(0)) revert ERC721TokenAlreadyMinted(tokenId);
        if (metadata.typeId < 1 || metadata.typeId > 6) {
            revert InvalidRarity(uint8(metadata.typeId));
        }
        if (metadata.generation < 1 || metadata.generation > 2) {
            revert InvalidGeneration(uint8(metadata.generation));
        }
        for (uint256 index = 0; index < metadata.skills.length; index += 1) {
            if (metadata.skills[index] > type(uint8).max) {
                revert InvalidBridgeAttribute(metadata.skills[index]);
            }
        }
        if (metadata.energy > type(uint8).max) {
            revert InvalidBridgeAttribute(metadata.energy);
        }
        if (metadata.health > type(uint8).max) {
            revert InvalidBridgeAttribute(metadata.health);
        }

        _owners[tokenId] = to;
        _balances[to] += 1;
        _cukieMetadata[tokenId] = CukieMetadata({
            rarity: uint8(metadata.typeId),
            generation: uint8(metadata.generation)
        });
        _bridgeMetadata[tokenId] = metadata;

        emit Transfer(address(0), to, tokenId);
        emit CukieMetadataConfigured(
            tokenId,
            uint8(metadata.typeId),
            uint8(metadata.generation)
        );
        _checkOnERC721Received(msg.sender, address(0), to, tokenId, "");
    }

    function cukieMetadata(uint256 tokenId) external view returns (uint8 rarity, uint8 generation) {
        ownerOf(tokenId);
        CukieMetadata memory metadata = _cukieMetadata[tokenId];
        return (metadata.rarity, metadata.generation);
    }

    function bridgeMetadata(uint256 tokenId)
        external
        view
        override
        returns (CukieBridgeMetadata memory metadata)
    {
        ownerOf(tokenId);
        return _bridgeMetadata[tokenId];
    }

    function _safeTransfer(
        address operator,
        address from,
        address to,
        uint256 tokenId,
        bytes memory data
    ) private {
        _transfer(operator, from, to, tokenId);
        _checkOnERC721Received(operator, from, to, tokenId, data);
    }

    function _transfer(address operator, address from, address to, uint256 tokenId) private {
        address owner = ownerOf(tokenId);
        if (owner != from) revert ERC721IncorrectOwner(from, tokenId, owner);
        if (!_isAuthorized(owner, operator, tokenId)) {
            revert ERC721InsufficientApproval(operator, tokenId);
        }
        if (to == address(0)) revert ERC721InvalidReceiver(to);

        delete _tokenApprovals[tokenId];
        _owners[tokenId] = to;
        _balances[from] -= 1;
        _balances[to] += 1;

        emit Transfer(from, to, tokenId);
    }

    function _isAuthorized(address owner, address operator, uint256 tokenId)
        private
        view
        returns (bool)
    {
        return operator == owner || _tokenApprovals[tokenId] == operator
            || _operatorApprovals[owner][operator];
    }

    function _checkOnERC721Received(
        address operator,
        address from,
        address to,
        uint256 tokenId,
        bytes memory data
    ) private {
        if (to.code.length == 0) return;

        try IERC721Receiver(to).onERC721Received(operator, from, tokenId, data) returns (bytes4 value) {
            if (value != IERC721Receiver.onERC721Received.selector) {
                revert ERC721InvalidReceiver(to);
            }
        } catch (bytes memory reason) {
            if (reason.length == 0) revert ERC721InvalidReceiver(to);
            assembly ("memory-safe") {
                revert(add(reason, 0x20), mload(reason))
            }
        }
    }

    function _toDecimalString(uint256 value) private pure returns (string memory) {
        if (value == 0) return "0";

        uint256 digits = 0;
        uint256 remaining = value;
        while (remaining != 0) {
            digits += 1;
            remaining /= 10;
        }

        bytes memory buffer = new bytes(digits);
        while (value != 0) {
            digits -= 1;
            buffer[digits] = bytes1(uint8(48 + value % 10));
            value /= 10;
        }
        return string(buffer);
    }
}
