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

    uint256 public ukiPerAsm;
    uint256 public minAsmPerPurchase;
    uint256 public totalUkiForSale;
    uint256 public totalAsmRaised;
    uint256 public totalUkiSold;
    bool public saleEnabled;

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
    event MinPurchaseUpdated(uint256 minAsmPerPurchase);
    event TotalUkiForSaleUpdated(uint256 totalUkiForSale);
    event UkiPerAsmUpdated(uint256 previousUkiPerAsm, uint256 nextUkiPerAsm);
    event SaleEnabledUpdated(bool enabled);
    error InvalidAddress();
    error InvalidSaleWindow();
    error InvalidRate();
    error InvalidLimits();
    error SaleNotEnabled();
    error SaleNotOpen();
    error PurchaseTooSmall();
    error OwnershipRenounceDisabled();
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
        uint256 totalUkiForSale;
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
        _setUkiPerAsm(config.ukiPerAsm);
        _setMinAsmPerPurchase(config.minAsmPerPurchase);
        _setTotalUkiForSale(config.totalUkiForSale);
    }

    function renounceOwnership() public view override onlyOwner {
        revert OwnershipRenounceDisabled();
    }

    function buy(uint256 asmAmount) external nonReentrant whenNotPaused returns (uint256 ukiAmount) {
        if (!saleEnabled) revert SaleNotEnabled();
        if (!isOpen()) revert SaleNotOpen();
        if (asmAmount < minAsmPerPurchase) revert PurchaseTooSmall();

        ukiAmount = quoteUki(asmAmount);
        if (ukiAmount == 0) revert InvalidRate();
        if (totalUkiSold + ukiAmount > totalUkiForSale) revert SaleCapExceeded();

        totalAsmRaised += asmAmount;
        totalUkiSold += ukiAmount;
        asmPurchased[msg.sender] += asmAmount;
        ukiPurchased[msg.sender] += ukiAmount;

        asmToken.safeTransferFrom(msg.sender, treasury, asmAmount);
        vestingVault.createVesting(msg.sender, ukiAmount);

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

    function setMinAsmPerPurchase(uint256 nextMinAsmPerPurchase) external onlyOwner {
        _setMinAsmPerPurchase(nextMinAsmPerPurchase);
        emit MinPurchaseUpdated(nextMinAsmPerPurchase);
    }

    function setTotalUkiForSale(uint256 nextTotalUkiForSale) external onlyOwner {
        _setTotalUkiForSale(nextTotalUkiForSale);
        emit TotalUkiForSaleUpdated(nextTotalUkiForSale);
    }

    function setUkiPerAsm(uint256 nextUkiPerAsm) external onlyOwner {
        uint256 previousUkiPerAsm = ukiPerAsm;
        _setUkiPerAsm(nextUkiPerAsm);
        emit UkiPerAsmUpdated(previousUkiPerAsm, nextUkiPerAsm);
    }

    function setSaleEnabled(bool enabled) external onlyOwner {
        saleEnabled = enabled;
        emit SaleEnabledUpdated(enabled);
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

    function _setUkiPerAsm(uint256 nextUkiPerAsm) private {
        if (nextUkiPerAsm == 0) revert InvalidRate();
        ukiPerAsm = nextUkiPerAsm;
    }

    function _setMinAsmPerPurchase(uint256 nextMinAsmPerPurchase) private {
        if (nextMinAsmPerPurchase == 0) revert InvalidLimits();
        minAsmPerPurchase = nextMinAsmPerPurchase;
    }

    function _setTotalUkiForSale(uint256 nextTotalUkiForSale) private {
        if (nextTotalUkiForSale == 0 || nextTotalUkiForSale > type(uint128).max) revert SaleCapExceeded();
        if (nextTotalUkiForSale < totalUkiSold) revert SaleCapExceeded();
        totalUkiForSale = nextTotalUkiForSale;
    }
}
