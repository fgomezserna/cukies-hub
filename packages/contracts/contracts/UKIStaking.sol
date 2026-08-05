// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title UKIStaking
/// @notice Custodies UKI deposited by each wallet without fees, rewards or time locks.
contract UKIStaking is Ownable2Step, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    IERC20 public immutable ukiToken;

    mapping(address account => uint256 amount) public stakedBalance;
    uint256 public totalStaked;

    event Staked(address indexed account, uint256 amount, uint256 accountBalance, uint256 totalStaked);
    event Unstaked(address indexed account, uint256 amount, uint256 accountBalance, uint256 totalStaked);

    error InvalidToken();
    error InvalidAmount();
    error InsufficientStakedBalance();
    error OwnershipRenounceDisabled();

    constructor(IERC20 ukiToken_, address initialOwner) Ownable(initialOwner) {
        if (address(ukiToken_) == address(0)) revert InvalidToken();
        ukiToken = ukiToken_;
    }

    function stake(uint256 amount) external nonReentrant whenNotPaused {
        if (amount == 0) revert InvalidAmount();

        ukiToken.safeTransferFrom(msg.sender, address(this), amount);
        stakedBalance[msg.sender] += amount;
        totalStaked += amount;

        emit Staked(msg.sender, amount, stakedBalance[msg.sender], totalStaked);
    }

    function unstake(uint256 amount) external nonReentrant {
        if (amount == 0) revert InvalidAmount();

        uint256 accountBalance = stakedBalance[msg.sender];
        if (amount > accountBalance) revert InsufficientStakedBalance();

        accountBalance -= amount;
        stakedBalance[msg.sender] = accountBalance;
        totalStaked -= amount;

        ukiToken.safeTransfer(msg.sender, amount);
        emit Unstaked(msg.sender, amount, accountBalance, totalStaked);
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
