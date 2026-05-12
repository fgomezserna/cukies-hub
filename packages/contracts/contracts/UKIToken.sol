// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Burnable} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";

/// @title UKIToken
/// @notice Fixed-supply ERC-20/BEP-20 compatible token for the Cukies UKI economy.
contract UKIToken is ERC20, ERC20Burnable, Ownable, Pausable {
    constructor(address initialOwner, address initialSupplyReceiver, uint256 initialSupply)
        ERC20("Cukies UKI", "UKI")
        Ownable(initialOwner)
    {
        if (initialOwner == address(0)) revert InvalidOwner();
        if (initialSupplyReceiver == address(0)) revert InvalidSupplyReceiver();
        _mint(initialSupplyReceiver, initialSupply);
    }

    error InvalidOwner();
    error InvalidSupplyReceiver();

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    function _update(address from, address to, uint256 value) internal override whenNotPaused {
        super._update(from, to, value);
    }
}
