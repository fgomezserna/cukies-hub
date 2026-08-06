// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title StagingCukiesMarketplaceSource
 * @notice BSC Testnet-only event source matching the historical marketplace ABI.
 * @dev It deliberately does not custody assets or value. Only the staging operator can emit fixtures.
 */
contract StagingCukiesMarketplaceSource is Ownable {
    event TokenOnSale(
        uint256 tokenId,
        address owner,
        uint256 price,
        uint256 fee,
        uint256 createdAt
    );
    event TokenBought(uint256 tokenId, address newOwner, uint256 boughtAt);
    event MarketTokenSaleCancelled(uint256 tokenId);
    event MarketTokenPriceChanged(uint256 tokenId, uint256 newPrice, uint256 newFee);

    constructor(address initialOwner) Ownable(initialOwner) {}

    function emitTokenOnSale(
        uint256 tokenId,
        address owner,
        uint256 price,
        uint256 fee,
        uint256 createdAt
    ) external onlyOwner {
        emit TokenOnSale(tokenId, owner, price, fee, createdAt);
    }

    function emitTokenBought(uint256 tokenId, address newOwner, uint256 boughtAt)
        external
        onlyOwner
    {
        emit TokenBought(tokenId, newOwner, boughtAt);
    }

    function emitMarketTokenSaleCancelled(uint256 tokenId) external onlyOwner {
        emit MarketTokenSaleCancelled(tokenId);
    }

    function emitMarketTokenPriceChanged(uint256 tokenId, uint256 newPrice, uint256 newFee)
        external
        onlyOwner
    {
        emit MarketTokenPriceChanged(tokenId, newPrice, newFee);
    }
}
