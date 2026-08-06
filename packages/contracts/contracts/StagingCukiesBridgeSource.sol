// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title StagingCukiesBridgeSource
 * @notice BSC Testnet-only event source matching the historical bridge ABI.
 * @dev It deliberately does not bridge or custody assets. Only the staging operator can emit fixtures.
 */
contract StagingCukiesBridgeSource is Ownable {
    event JumpInBridge(
        uint256 tokenId,
        address originOwner,
        address destOwner,
        uint8 network,
        uint256 createdAt
    );
    event JumpOutBridge(uint256 tokenId, address destOwner, uint256 createdAt);

    constructor(address initialOwner) Ownable(initialOwner) {}

    function emitJumpInBridge(
        uint256 tokenId,
        address originOwner,
        address destOwner,
        uint8 network,
        uint256 createdAt
    ) external onlyOwner {
        emit JumpInBridge(tokenId, originOwner, destOwner, network, createdAt);
    }

    function emitJumpOutBridge(uint256 tokenId, address destOwner, uint256 createdAt)
        external
        onlyOwner
    {
        emit JumpOutBridge(tokenId, destOwner, createdAt);
    }
}
