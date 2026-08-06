// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title StagingCukiesNft
 * @notice BSC Testnet-only NFT source used to validate the Cukie Master pipeline.
 * @dev Rarity values are stable: 1 common, 2 uncommon, 3 rare, 4 epic,
 *      5 legendary and 6 goat. Generation 1 is original and 2 is second generation.
 */
contract StagingCukiesNft is Ownable {
    struct CukieMetadata {
        uint8 rarity;
        uint8 generation;
    }

    mapping(uint256 tokenId => CukieMetadata metadata) private _cukieMetadata;
    mapping(uint256 tokenId => address tokenOwner) private _owners;
    mapping(address tokenOwner => uint256 balance) private _balances;

    string public constant name = "Staging Cukies";
    string public constant symbol = "stCUKI";

    event Transfer(address indexed from, address indexed to, uint256 indexed tokenId);

    event CukieMetadataConfigured(
        uint256 indexed tokenId,
        uint8 rarity,
        uint8 generation
    );

    constructor(address initialOwner) Ownable(initialOwner) {}

    function mint(
        address to,
        uint256 tokenId,
        uint8 rarity,
        uint8 generation
    ) external onlyOwner {
        require(to != address(0), "StagingCukiesNft: zero recipient");
        require(rarity >= 1 && rarity <= 6, "StagingCukiesNft: invalid rarity");
        require(generation == 1 || generation == 2, "StagingCukiesNft: invalid generation");

        require(_owners[tokenId] == address(0), "StagingCukiesNft: token exists");
        _owners[tokenId] = to;
        _balances[to] += 1;
        _cukieMetadata[tokenId] = CukieMetadata({rarity: rarity, generation: generation});
        emit Transfer(address(0), to, tokenId);
        emit CukieMetadataConfigured(tokenId, rarity, generation);
    }

    function ownerOf(uint256 tokenId) public view returns (address) {
        address tokenOwner = _owners[tokenId];
        require(tokenOwner != address(0), "StagingCukiesNft: unknown token");
        return tokenOwner;
    }

    function balanceOf(address tokenOwner) external view returns (uint256) {
        require(tokenOwner != address(0), "StagingCukiesNft: zero owner");
        return _balances[tokenOwner];
    }

    function transferFrom(address from, address to, uint256 tokenId) external {
        require(msg.sender == from, "StagingCukiesNft: caller is not owner");
        require(ownerOf(tokenId) == from, "StagingCukiesNft: incorrect owner");
        require(to != address(0), "StagingCukiesNft: zero recipient");
        _owners[tokenId] = to;
        _balances[from] -= 1;
        _balances[to] += 1;
        emit Transfer(from, to, tokenId);
    }

    function cukieMetadata(uint256 tokenId) external view returns (uint8 rarity, uint8 generation) {
        ownerOf(tokenId);
        CukieMetadata memory metadata = _cukieMetadata[tokenId];
        return (metadata.rarity, metadata.generation);
    }
}
