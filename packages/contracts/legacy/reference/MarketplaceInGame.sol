// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

/**
 * @title MarketplaceInGame
 * @dev A marketplace contract for in-game items using ERC1155 tokens and ERC20 for payments
 */
contract MarketplaceInGame is Ownable, ReentrancyGuard {
    IERC1155 public itemsContract;
    IERC20 public currencyContract;

    uint256 public constant PRICE_PRECISION = 10000;

    struct Item {
        uint256 basePrice;
        uint256 currentSupply;
        uint256 sensitivityCoefficient;
        uint256 minPrice;
        uint256 maxPrice;
        uint256 spreadPercentage;
        uint256 commissionPercentage;
    }

    mapping(uint256 => Item) public items;

    event Purchase(address buyer, uint256 itemId, uint256 quantity, uint256 price, uint256 commission);
    event Sale(address seller, uint256 itemId, uint256 quantity, uint256 price, uint256 commission);
    event ItemUpdate(uint256 itemId, uint256 basePrice, uint256 currentSupply, uint256 sensitivityCoefficient, uint256 minPrice, uint256 maxPrice, uint256 spreadPercentage, uint256 commissionPercentage);

    constructor(address _itemsContract, address _currencyContract) {
        itemsContract = IERC1155(_itemsContract);
        currencyContract = IERC20(_currencyContract);
    }

    function configureItem(
        uint256 _itemId,
        uint256 _basePrice,
        uint256 _sensitivityCoefficient,
        uint256 _minPrice,
        uint256 _maxPrice,
        uint256 _spreadPercentage,
        uint256 _commissionPercentage
    ) external onlyOwner {
        items[_itemId] = Item(_basePrice, 0, _sensitivityCoefficient, _minPrice, _maxPrice, _spreadPercentage, _commissionPercentage);
        emit ItemUpdate(_itemId, _basePrice, 0, _sensitivityCoefficient, _minPrice, _maxPrice, _spreadPercentage, _commissionPercentage);
    }

    function updateItemParameters(
        uint256 _itemId,
        uint256 _basePrice,
        uint256 _sensitivityCoefficient,
        uint256 _minPrice,
        uint256 _maxPrice,
        uint256 _spreadPercentage,
        uint256 _commissionPercentage
    ) external onlyOwner {
        Item storage item = items[_itemId];
        require(item.basePrice > 0, "Item not configured");

        item.basePrice = _basePrice;
        item.sensitivityCoefficient = _sensitivityCoefficient;
        item.minPrice = _minPrice;
        item.maxPrice = _maxPrice;
        item.spreadPercentage = _spreadPercentage;
        item.commissionPercentage = _commissionPercentage;

        emit ItemUpdate(_itemId, _basePrice, item.currentSupply, _sensitivityCoefficient, _minPrice, _maxPrice, _spreadPercentage, _commissionPercentage);
    }

    function calculatePrice(uint256 _itemId, uint256 _quantity, bool _isBuying) public view returns (uint256, uint256) {
        Item memory item = items[_itemId];
        require(item.basePrice > 0, "Item not configured");

        int256 supplyChange = _isBuying ? int256(_quantity) : -int256(_quantity);
        uint256 basePrice = item.basePrice * (PRICE_PRECISION + item.sensitivityCoefficient * uint256(int256(item.currentSupply) + supplyChange)) / PRICE_PRECISION;
        
        if (basePrice < item.minPrice) {
            basePrice = item.minPrice;
        } else if (item.maxPrice > 0 && basePrice > item.maxPrice) {
            basePrice = item.maxPrice;
        }

        uint256 adjustedPrice;
        if (_isBuying) {
            adjustedPrice = basePrice * (PRICE_PRECISION + item.spreadPercentage / 2) / PRICE_PRECISION;
        } else {
            adjustedPrice = basePrice * (PRICE_PRECISION - item.spreadPercentage / 2) / PRICE_PRECISION;
        }

        uint256 totalPrice = adjustedPrice * _quantity;
        uint256 commission = totalPrice * item.commissionPercentage / PRICE_PRECISION;

        return (_isBuying ? totalPrice + commission : totalPrice - commission, commission);
    }

    function purchase(uint256 _itemId, uint256 _quantity) external nonReentrant {
        (uint256 totalPrice, uint256 commission) = calculatePrice(_itemId, _quantity, true);
        Item storage item = items[_itemId];

        require(currencyContract.transferFrom(msg.sender, address(this), totalPrice), "Transfer failed");
        
        itemsContract.safeTransferFrom(address(this), msg.sender, _itemId, _quantity, "");
        
        item.currentSupply += _quantity;

        emit Purchase(msg.sender, _itemId, _quantity, totalPrice, commission);
    }

    function sell(uint256 _itemId, uint256 _quantity) external nonReentrant {
        (uint256 totalPrice, uint256 commission) = calculatePrice(_itemId, _quantity, false);
        Item storage item = items[_itemId];

        require(itemsContract.balanceOf(msg.sender, _itemId) >= _quantity, "Insufficient balance");
        require(currencyContract.balanceOf(address(this)) >= totalPrice, "Insufficient marketplace balance");

        itemsContract.safeTransferFrom(msg.sender, address(this), _itemId, _quantity, "");
        require(currencyContract.transfer(msg.sender, totalPrice), "Transfer failed");

        if (_quantity > item.currentSupply) {
            item.currentSupply = 0;
        } else {
            item.currentSupply -= _quantity;
        }

        emit Sale(msg.sender, _itemId, _quantity, totalPrice, commission);
    }

    function withdrawFunds(address _beneficiary, uint256 _amount) external onlyOwner {
        require(currencyContract.transfer(_beneficiary, _amount), "Transfer failed");
    }
}