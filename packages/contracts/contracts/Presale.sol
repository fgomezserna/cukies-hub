// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import {VestingVault} from "./VestingVault.sol";

/// @title Presale
/// @notice ASM -> UKI presale that creates buyer vesting schedules after payment.
contract Presale is Ownable, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint256 public constant RATE_SCALE = 1e18;

    IERC20 public immutable asmToken;
    VestingVault public immutable vestingVault;
    address public treasury;

    uint64 public saleStart;
    uint64 public saleEnd;
    uint64 public vestingStart;
    uint64 public vestingDuration;

    uint256 public ukiPerAsm;
    uint256 public minAsmPerPurchase;
    uint256 public maxAsmPerPurchase;
    uint256 public walletAsmCap;
    uint256 public totalUkiForSale;
    uint256 public totalAsmRaised;
    uint256 public totalUkiSold;

    mapping(address buyer => uint256) public asmPurchased;
    mapping(address buyer => uint256) public ukiPurchased;

    event Purchased(
        address indexed buyer,
        uint256 asmAmount,
        uint256 ukiAmount,
        uint256 totalBuyerAsm,
        uint256 totalBuyerUki
    );
    event TreasuryUpdated(address indexed previousTreasury, address indexed nextTreasury);
    event SaleWindowUpdated(uint64 saleStart, uint64 saleEnd);
    event PurchaseLimitsUpdated(uint256 minAsmPerPurchase, uint256 maxAsmPerPurchase, uint256 walletAsmCap);
    event VestingConfigUpdated(uint64 vestingStart, uint64 vestingDuration);
    error InvalidAddress();
    error InvalidSaleWindow();
    error InvalidRate();
    error InvalidLimits();
    error InvalidVesting();
    error SaleNotOpen();
    error PurchaseTooSmall();
    error PurchaseTooLarge();
    error WalletCapExceeded();
    error SaleCapExceeded();

    struct PresaleConfig {
        address owner;
        IERC20 asmToken;
        VestingVault vestingVault;
        address treasury;
        uint64 saleStart;
        uint64 saleEnd;
        uint256 ukiPerAsm;
        uint256 minAsmPerPurchase;
        uint256 maxAsmPerPurchase;
        uint256 walletAsmCap;
        uint256 totalUkiForSale;
        uint64 vestingStart;
        uint64 vestingDuration;
    }

    constructor(PresaleConfig memory config) Ownable(config.owner) {
        if (
            config.owner == address(0) || address(config.asmToken) == address(0)
                || address(config.vestingVault) == address(0) || config.treasury == address(0)
        ) {
            revert InvalidAddress();
        }

        asmToken = config.asmToken;
        vestingVault = config.vestingVault;
        treasury = config.treasury;

        _setSaleWindow(config.saleStart, config.saleEnd);
        _setPurchaseConfig(
            config.ukiPerAsm,
            config.minAsmPerPurchase,
            config.maxAsmPerPurchase,
            config.walletAsmCap,
            config.totalUkiForSale
        );
        _setVestingConfig(config.vestingStart, config.vestingDuration);
    }

    function buy(uint256 asmAmount) external nonReentrant whenNotPaused returns (uint256 ukiAmount) {
        if (!isOpen()) revert SaleNotOpen();
        if (asmAmount < minAsmPerPurchase) revert PurchaseTooSmall();
        if (asmAmount > maxAsmPerPurchase) revert PurchaseTooLarge();
        if (asmPurchased[msg.sender] + asmAmount > walletAsmCap) revert WalletCapExceeded();

        ukiAmount = quoteUki(asmAmount);
        if (totalUkiSold + ukiAmount > totalUkiForSale) revert SaleCapExceeded();

        totalAsmRaised += asmAmount;
        totalUkiSold += ukiAmount;
        asmPurchased[msg.sender] += asmAmount;
        ukiPurchased[msg.sender] += ukiAmount;

        asmToken.safeTransferFrom(msg.sender, treasury, asmAmount);
        vestingVault.createVesting(msg.sender, ukiAmount, vestingStart, vestingDuration);

        emit Purchased(msg.sender, asmAmount, ukiAmount, asmPurchased[msg.sender], ukiPurchased[msg.sender]);
    }

    function quoteUki(uint256 asmAmount) public view returns (uint256) {
        return (asmAmount * ukiPerAsm) / RATE_SCALE;
    }

    function isOpen() public view returns (bool) {
        return block.timestamp >= saleStart && block.timestamp <= saleEnd;
    }

    function setTreasury(address nextTreasury) external onlyOwner {
        if (nextTreasury == address(0)) revert InvalidAddress();
        address previousTreasury = treasury;
        treasury = nextTreasury;
        emit TreasuryUpdated(previousTreasury, nextTreasury);
    }

    function setSaleWindow(uint64 nextSaleStart, uint64 nextSaleEnd) external onlyOwner {
        _setSaleWindow(nextSaleStart, nextSaleEnd);
        emit SaleWindowUpdated(nextSaleStart, nextSaleEnd);
    }

    function setPurchaseLimits(uint256 nextMinAsmPerPurchase, uint256 nextMaxAsmPerPurchase, uint256 nextWalletAsmCap)
        external
        onlyOwner
    {
        if (
            nextMinAsmPerPurchase == 0 || nextMinAsmPerPurchase > nextMaxAsmPerPurchase
                || nextMaxAsmPerPurchase > nextWalletAsmCap
        ) {
            revert InvalidLimits();
        }

        minAsmPerPurchase = nextMinAsmPerPurchase;
        maxAsmPerPurchase = nextMaxAsmPerPurchase;
        walletAsmCap = nextWalletAsmCap;
        emit PurchaseLimitsUpdated(nextMinAsmPerPurchase, nextMaxAsmPerPurchase, nextWalletAsmCap);
    }

    function setVestingConfig(uint64 nextVestingStart, uint64 nextVestingDuration) external onlyOwner {
        _setVestingConfig(nextVestingStart, nextVestingDuration);
        emit VestingConfigUpdated(nextVestingStart, nextVestingDuration);
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    function _setSaleWindow(uint64 nextSaleStart, uint64 nextSaleEnd) private {
        if (nextSaleStart == 0 || nextSaleEnd <= nextSaleStart) revert InvalidSaleWindow();
        saleStart = nextSaleStart;
        saleEnd = nextSaleEnd;
    }

    function _setPurchaseConfig(
        uint256 nextUkiPerAsm,
        uint256 nextMinAsmPerPurchase,
        uint256 nextMaxAsmPerPurchase,
        uint256 nextWalletAsmCap,
        uint256 nextTotalUkiForSale
    ) private {
        if (nextUkiPerAsm == 0) revert InvalidRate();
        if (
            nextMinAsmPerPurchase == 0 || nextMinAsmPerPurchase > nextMaxAsmPerPurchase
                || nextMaxAsmPerPurchase > nextWalletAsmCap
        ) {
            revert InvalidLimits();
        }
        if (nextTotalUkiForSale == 0) revert SaleCapExceeded();

        ukiPerAsm = nextUkiPerAsm;
        minAsmPerPurchase = nextMinAsmPerPurchase;
        maxAsmPerPurchase = nextMaxAsmPerPurchase;
        walletAsmCap = nextWalletAsmCap;
        totalUkiForSale = nextTotalUkiForSale;
    }

    function _setVestingConfig(uint64 nextVestingStart, uint64 nextVestingDuration) private {
        if (nextVestingStart == 0 || nextVestingDuration == 0) revert InvalidVesting();
        vestingStart = nextVestingStart;
        vestingDuration = nextVestingDuration;
    }
}
