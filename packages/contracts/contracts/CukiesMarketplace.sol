// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

interface IPancakeRouterV2ExactOutput {
    function WETH() external pure returns (address);

    function swapETHForExactTokens(
        uint256 amountOut,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external payable returns (uint256[] memory amounts);

    function swapTokensForExactTokens(
        uint256 amountOut,
        uint256 amountInMax,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external returns (uint256[] memory amounts);
}

/// @title CukiesMarketplace
/// @notice Non-custodial Cukies orders priced and settled to the seller in exact UKI.
/// @dev BNB/ERC20 buyers use a pinned PancakeSwap V2 router with exact-output swaps.
contract CukiesMarketplace is Ownable2Step, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint16 public constant BPS = 10_000;
    uint16 public constant MAX_FEE_BPS = 1_000;

    enum OrderState {
        None,
        Active,
        Sold,
        Cancelled,
        Expired,
        Invalid
    }

    struct Order {
        address seller;
        address collection;
        uint256 tokenId;
        uint256 ukiPrice;
        uint64 expiresAt;
        uint64 nonce;
        uint16 feeBps;
        OrderState state;
    }

    IERC20 public immutable ukiToken;
    IPancakeRouterV2ExactOutput public immutable router;
    address public immutable wrappedNative;

    address public feeRecipient;
    uint16 public feeBps;

    mapping(address collection => bool allowed) public collectionAllowed;
    mapping(address paymentToken => bool allowed) public paymentTokenAllowed;
    mapping(bytes32 orderId => Order order) public orders;
    mapping(address collection => mapping(uint256 tokenId => uint64 nonce)) public tokenNonces;
    mapping(address collection => mapping(uint256 tokenId => bytes32 orderId)) public activeOrderIds;
    mapping(address recipient => uint256 amount) public claimableNativeFees;

    event CollectionAllowedUpdated(address indexed collection, bool allowed);
    event PaymentTokenAllowedUpdated(address indexed paymentToken, bool allowed);
    event FeeConfigUpdated(address indexed recipient, uint16 feeBps);
    event OrderCreated(
        bytes32 indexed orderId,
        address indexed collection,
        uint256 indexed tokenId,
        address seller,
        uint256 ukiPrice,
        uint64 expiresAt,
        uint64 nonce,
        uint16 feeBps
    );
    event OrderCancelled(bytes32 indexed orderId, address indexed seller);
    event OrderExpired(bytes32 indexed orderId);
    event OrderInvalidated(bytes32 indexed orderId, bytes32 indexed reason);
    event TokenNonceInvalidated(
        address indexed collection,
        uint256 indexed tokenId,
        uint64 nonce,
        address indexed owner
    );
    event OrderFilled(
        bytes32 indexed orderId,
        address indexed buyer,
        address indexed paymentToken,
        uint256 paymentAmount,
        uint256 feeAmount,
        uint256 ukiPrice
    );
    event NativeFeesClaimed(address indexed recipient, uint256 amount);

    error InvalidToken();
    error InvalidRouter();
    error InvalidWrappedNative();
    error InvalidRecipient();
    error InvalidFee();
    error InvalidCollection();
    error CollectionNotAllowed();
    error PaymentTokenNotAllowed();
    error InvalidPrice();
    error InvalidExpiry();
    error InvalidPath();
    error InvalidDeadline();
    error InvalidPaymentBudget();
    error RouterAmountMismatch();
    error ActiveOrderExists(bytes32 orderId);
    error OrderNotFound();
    error OrderNotPurchasable(OrderState state);
    error NotOrderSeller(address caller, address seller);
    error NotTokenOwner(address caller, address tokenOwner);
    error MarketplaceNotApproved();
    error BuyerIsSeller();
    error NftTransferFailed();
    error NativeTransferFailed();
    error NoNativeFees();
    error OwnershipRenounceDisabled();

    constructor(
        IERC20 ukiToken_,
        IPancakeRouterV2ExactOutput router_,
        address wrappedNative_,
        address feeRecipient_,
        uint16 feeBps_,
        address initialOwner
    ) Ownable(initialOwner) {
        if (address(ukiToken_) == address(0) || address(ukiToken_).code.length == 0) {
            revert InvalidToken();
        }
        if (address(router_) == address(0) || address(router_).code.length == 0) {
            revert InvalidRouter();
        }
        if (wrappedNative_ == address(0) || wrappedNative_.code.length == 0) {
            revert InvalidWrappedNative();
        }
        if (router_.WETH() != wrappedNative_) revert InvalidWrappedNative();
        if (feeRecipient_ == address(0)) revert InvalidRecipient();
        if (feeBps_ > MAX_FEE_BPS) revert InvalidFee();

        ukiToken = ukiToken_;
        router = router_;
        wrappedNative = wrappedNative_;
        feeRecipient = feeRecipient_;
        feeBps = feeBps_;
    }

    receive() external payable {
        if (msg.sender != address(router)) revert NativeTransferFailed();
    }

    function setCollectionAllowed(address collection, bool allowed) external onlyOwner {
        if (
            collection == address(0)
                || (collection.code.length == 0 && (allowed || !collectionAllowed[collection]))
        ) {
            revert InvalidCollection();
        }
        collectionAllowed[collection] = allowed;
        emit CollectionAllowedUpdated(collection, allowed);
    }

    function setPaymentTokenAllowed(address paymentToken, bool allowed) external onlyOwner {
        if (
            paymentToken == address(0) || paymentToken == address(ukiToken)
                || (paymentToken.code.length == 0 && (allowed || !paymentTokenAllowed[paymentToken]))
        ) {
            revert InvalidToken();
        }
        paymentTokenAllowed[paymentToken] = allowed;
        emit PaymentTokenAllowedUpdated(paymentToken, allowed);
    }

    function setFeeConfig(address recipient, uint16 newFeeBps) external onlyOwner {
        if (recipient == address(0)) revert InvalidRecipient();
        if (newFeeBps > MAX_FEE_BPS) revert InvalidFee();
        feeRecipient = recipient;
        feeBps = newFeeBps;
        emit FeeConfigUpdated(recipient, newFeeBps);
    }

    function createOrder(address collection, uint256 tokenId, uint256 ukiPrice, uint64 expiresAt)
        external
        whenNotPaused
        returns (bytes32 orderId)
    {
        if (!collectionAllowed[collection]) revert CollectionNotAllowed();
        if (ukiPrice == 0) revert InvalidPrice();
        if (expiresAt <= block.timestamp) revert InvalidExpiry();

        IERC721 nft = IERC721(collection);
        address tokenOwner = nft.ownerOf(tokenId);
        if (tokenOwner != msg.sender) revert NotTokenOwner(msg.sender, tokenOwner);
        if (!_isApproved(nft, msg.sender, tokenId)) revert MarketplaceNotApproved();

        _closeStaleActiveOrder(collection, tokenId);

        uint64 nonce = tokenNonces[collection][tokenId] + 1;
        tokenNonces[collection][tokenId] = nonce;
        orderId = keccak256(
            abi.encode(block.chainid, address(this), collection, tokenId, msg.sender, nonce)
        );
        orders[orderId] = Order({
            seller: msg.sender,
            collection: collection,
            tokenId: tokenId,
            ukiPrice: ukiPrice,
            expiresAt: expiresAt,
            nonce: nonce,
            feeBps: feeBps,
            state: OrderState.Active
        });
        activeOrderIds[collection][tokenId] = orderId;

        emit OrderCreated(
            orderId,
            collection,
            tokenId,
            msg.sender,
            ukiPrice,
            expiresAt,
            nonce,
            feeBps
        );
    }

    function cancelOrder(bytes32 orderId) external {
        Order storage order = _existingOrder(orderId);
        if (order.seller != msg.sender) revert NotOrderSeller(msg.sender, order.seller);
        OrderState current = orderState(orderId);
        if (current != OrderState.Active) revert OrderNotPurchasable(current);

        order.state = OrderState.Cancelled;
        delete activeOrderIds[order.collection][order.tokenId];
        emit OrderCancelled(orderId, msg.sender);
    }

    /// @notice Lets the current NFT owner invalidate every older order generation for the token.
    function invalidateTokenOrders(address collection, uint256 tokenId) external {
        address tokenOwner = IERC721(collection).ownerOf(tokenId);
        if (tokenOwner != msg.sender) revert NotTokenOwner(msg.sender, tokenOwner);

        uint64 nonce = tokenNonces[collection][tokenId] + 1;
        tokenNonces[collection][tokenId] = nonce;
        bytes32 orderId = activeOrderIds[collection][tokenId];
        if (orderId != bytes32(0) && orders[orderId].state == OrderState.Active) {
            orders[orderId].state = OrderState.Invalid;
            emit OrderInvalidated(orderId, keccak256("TOKEN_NONCE"));
        }
        delete activeOrderIds[collection][tokenId];
        emit TokenNonceInvalidated(collection, tokenId, nonce, msg.sender);
    }

    function refreshOrder(bytes32 orderId) external returns (OrderState current) {
        Order storage order = _existingOrder(orderId);
        current = orderState(orderId);
        if (order.state != OrderState.Active || current == OrderState.Active) return current;

        order.state = current;
        if (activeOrderIds[order.collection][order.tokenId] == orderId) {
            delete activeOrderIds[order.collection][order.tokenId];
        }
        if (current == OrderState.Expired) {
            emit OrderExpired(orderId);
        } else {
            emit OrderInvalidated(orderId, keccak256("OWNER_APPROVAL_OR_NONCE"));
        }
    }

    function buyWithUki(bytes32 orderId) external nonReentrant whenNotPaused {
        Order storage order = _prepareSale(orderId);
        uint256 fee = _fee(order.ukiPrice, order.feeBps);

        ukiToken.safeTransferFrom(msg.sender, order.seller, order.ukiPrice);
        if (fee != 0) ukiToken.safeTransferFrom(msg.sender, feeRecipient, fee);
        _deliverNft(order, msg.sender);

        emit OrderFilled(orderId, msg.sender, address(ukiToken), order.ukiPrice + fee, fee, order.ukiPrice);
    }

    function buyWithToken(
        bytes32 orderId,
        address paymentToken,
        uint256 maxPayment,
        address[] calldata path,
        uint256 deadline
    ) external nonReentrant whenNotPaused {
        if (!paymentTokenAllowed[paymentToken]) revert PaymentTokenNotAllowed();
        _validatePath(path, paymentToken);
        _validateDeadline(deadline);

        Order storage order = _prepareSale(orderId);
        uint256 maxSwapInput = _maxSwapInput(maxPayment, order.feeBps);
        if (maxSwapInput == 0) revert InvalidPaymentBudget();

        IERC20 inputToken = IERC20(paymentToken);
        inputToken.safeTransferFrom(msg.sender, address(this), maxPayment);
        inputToken.forceApprove(address(router), maxSwapInput);
        uint256[] memory amounts = router.swapTokensForExactTokens(
            order.ukiPrice,
            maxSwapInput,
            path,
            order.seller,
            deadline
        );
        inputToken.forceApprove(address(router), 0);

        uint256 paymentAmount = _validatedInputAmount(amounts, path.length, order.ukiPrice);
        uint256 fee = _fee(paymentAmount, order.feeBps);
        if (paymentAmount + fee > maxPayment) revert InvalidPaymentBudget();
        uint256 refund = maxPayment - paymentAmount - fee;
        if (fee != 0) inputToken.safeTransfer(feeRecipient, fee);
        if (refund != 0) inputToken.safeTransfer(msg.sender, refund);
        _deliverNft(order, msg.sender);

        emit OrderFilled(orderId, msg.sender, paymentToken, paymentAmount + fee, fee, order.ukiPrice);
    }

    function buyWithNative(
        bytes32 orderId,
        address[] calldata path,
        uint256 deadline
    ) external payable nonReentrant whenNotPaused {
        _validatePath(path, wrappedNative);
        _validateDeadline(deadline);

        Order storage order = _prepareSale(orderId);
        uint256 maxSwapInput = _maxSwapInput(msg.value, order.feeBps);
        if (maxSwapInput == 0) revert InvalidPaymentBudget();

        uint256[] memory amounts = router.swapETHForExactTokens{value: maxSwapInput}(
            order.ukiPrice,
            path,
            order.seller,
            deadline
        );
        uint256 paymentAmount = _validatedInputAmount(amounts, path.length, order.ukiPrice);
        uint256 fee = _fee(paymentAmount, order.feeBps);
        if (paymentAmount + fee > msg.value) revert InvalidPaymentBudget();
        uint256 refund = msg.value - paymentAmount - fee;

        if (fee != 0) claimableNativeFees[feeRecipient] += fee;
        if (refund != 0) _sendNative(payable(msg.sender), refund);
        _deliverNft(order, msg.sender);

        emit OrderFilled(orderId, msg.sender, address(0), paymentAmount + fee, fee, order.ukiPrice);
    }

    function claimNativeFees(address payable recipient) external nonReentrant {
        uint256 amount = claimableNativeFees[recipient];
        if (amount == 0) revert NoNativeFees();
        claimableNativeFees[recipient] = 0;
        _sendNative(recipient, amount);
        emit NativeFeesClaimed(recipient, amount);
    }

    function orderState(bytes32 orderId) public view returns (OrderState) {
        Order storage order = orders[orderId];
        if (order.seller == address(0)) return OrderState.None;
        if (order.state != OrderState.Active) return order.state;
        if (block.timestamp >= order.expiresAt) return OrderState.Expired;
        if (!_isOrderValid(orderId, order)) return OrderState.Invalid;
        return OrderState.Active;
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

    function _existingOrder(bytes32 orderId) private view returns (Order storage order) {
        order = orders[orderId];
        if (order.seller == address(0)) revert OrderNotFound();
    }

    function _prepareSale(bytes32 orderId) private returns (Order storage order) {
        order = _existingOrder(orderId);
        OrderState current = orderState(orderId);
        if (current != OrderState.Active) revert OrderNotPurchasable(current);
        if (msg.sender == order.seller) revert BuyerIsSeller();

        order.state = OrderState.Sold;
        delete activeOrderIds[order.collection][order.tokenId];
    }

    function _closeStaleActiveOrder(address collection, uint256 tokenId) private {
        bytes32 orderId = activeOrderIds[collection][tokenId];
        if (orderId == bytes32(0)) return;

        OrderState current = orderState(orderId);
        if (current == OrderState.Active) revert ActiveOrderExists(orderId);
        Order storage order = orders[orderId];
        if (order.state == OrderState.Active) {
            order.state = current;
            if (current == OrderState.Expired) {
                emit OrderExpired(orderId);
            } else {
                emit OrderInvalidated(orderId, keccak256("OWNER_APPROVAL_OR_NONCE"));
            }
        }
        delete activeOrderIds[collection][tokenId];
    }

    function _isOrderValid(bytes32 orderId, Order storage order) private view returns (bool) {
        if (!collectionAllowed[order.collection]) return false;
        if (tokenNonces[order.collection][order.tokenId] != order.nonce) return false;
        if (activeOrderIds[order.collection][order.tokenId] != orderId) return false;

        IERC721 nft = IERC721(order.collection);
        try nft.ownerOf(order.tokenId) returns (address tokenOwner) {
            if (tokenOwner != order.seller) return false;
        } catch {
            return false;
        }
        return _isApproved(nft, order.seller, order.tokenId);
    }

    function _isApproved(IERC721 nft, address tokenOwner, uint256 tokenId)
        private
        view
        returns (bool)
    {
        try nft.getApproved(tokenId) returns (address approved) {
            if (approved == address(this)) return true;
        } catch {
            return false;
        }
        try nft.isApprovedForAll(tokenOwner, address(this)) returns (bool approvedForAll) {
            return approvedForAll;
        } catch {
            return false;
        }
    }

    function _deliverNft(Order storage order, address buyer) private {
        IERC721 nft = IERC721(order.collection);
        nft.transferFrom(order.seller, buyer, order.tokenId);
        if (nft.ownerOf(order.tokenId) != buyer) revert NftTransferFailed();
    }

    function _validatePath(address[] calldata path, address expectedInput) private view {
        if (
            path.length < 2 || path[0] != expectedInput
                || path[path.length - 1] != address(ukiToken)
        ) {
            revert InvalidPath();
        }
    }

    function _validateDeadline(uint256 deadline) private view {
        if (deadline < block.timestamp) revert InvalidDeadline();
    }

    function _validatedInputAmount(
        uint256[] memory amounts,
        uint256 expectedLength,
        uint256 expectedOutput
    ) private pure returns (uint256) {
        if (amounts.length != expectedLength || amounts[amounts.length - 1] != expectedOutput) {
            revert RouterAmountMismatch();
        }
        return amounts[0];
    }

    function _fee(uint256 amount, uint16 rateBps) private pure returns (uint256) {
        return Math.mulDiv(amount, rateBps, BPS, Math.Rounding.Ceil);
    }

    function _maxSwapInput(uint256 totalBudget, uint16 rateBps) private pure returns (uint256) {
        return Math.mulDiv(totalBudget, BPS, BPS + rateBps);
    }

    function _sendNative(address payable recipient, uint256 amount) private {
        (bool success,) = recipient.call{value: amount}("");
        if (!success) revert NativeTransferFailed();
    }
}
