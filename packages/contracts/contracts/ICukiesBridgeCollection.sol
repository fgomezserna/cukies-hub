// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

struct CukieBridgeMetadata {
    uint256 typeId;
    uint256 generation;
    uint256[6] skills;
    uint256 energy;
    uint256 health;
}

interface ICukiesBridgeCollection {
    function bridgeMetadata(uint256 tokenId)
        external
        view
        returns (CukieBridgeMetadata memory metadata);

    function mintBridge(
        address to,
        uint256 tokenId,
        CukieBridgeMetadata calldata metadata
    ) external;
}
