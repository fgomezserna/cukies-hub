// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {IERC721Receiver} from "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";

interface ICukieMasterNftVault {
    function deposit(address collection, uint256 tokenId) external;

    function withdraw(address collection, uint256 tokenId) external;

    function requestExit(address collection, uint256 tokenId) external;

    function beneficialOwnerOf(address collection, uint256 tokenId) external view returns (address);
}

contract NonReceiverNftOwner {
    ICukieMasterNftVault public immutable vault;
    IERC721 public immutable collection;

    constructor(ICukieMasterNftVault vault_, IERC721 collection_) {
        vault = vault_;
        collection = collection_;
    }

    function deposit(uint256 tokenId) external {
        collection.approve(address(vault), tokenId);
        vault.deposit(address(collection), tokenId);
    }

    function withdraw(uint256 tokenId) external {
        vault.withdraw(address(collection), tokenId);
    }

    function requestExit(uint256 tokenId) external {
        vault.requestExit(address(collection), tokenId);
    }
}

/// @dev Minimal standards-compatible ERC721 used only by the contract test suite.
contract MockERC721 is IERC721 {
    string public name;
    string public symbol;

    mapping(uint256 tokenId => address owner) private _owners;
    mapping(address owner => uint256 balance) private _balances;
    mapping(uint256 tokenId => address approved) private _tokenApprovals;
    mapping(address owner => mapping(address operator => bool approved)) private _operatorApprovals;

    error ERC721NonexistentToken(uint256 tokenId);
    error ERC721InvalidOwner(address owner);
    error ERC721InvalidReceiver(address receiver);
    error ERC721InsufficientApproval(address operator, uint256 tokenId);
    error ERC721IncorrectOwner(address sender, uint256 tokenId, address owner);
    error ERC721InvalidApprover(address approver);
    error ERC721InvalidOperator(address operator);

    constructor(string memory name_, string memory symbol_) {
        name = name_;
        symbol = symbol_;
    }

    function supportsInterface(bytes4 interfaceId) external pure override returns (bool) {
        return interfaceId == type(IERC165).interfaceId || interfaceId == type(IERC721).interfaceId;
    }

    function balanceOf(address owner) external view override returns (uint256) {
        if (owner == address(0)) revert ERC721InvalidOwner(owner);
        return _balances[owner];
    }

    function ownerOf(uint256 tokenId) public view override returns (address) {
        address owner = _owners[tokenId];
        if (owner == address(0)) revert ERC721NonexistentToken(tokenId);
        return owner;
    }

    function approve(address to, uint256 tokenId) external override {
        address owner = ownerOf(tokenId);
        if (msg.sender != owner && !_operatorApprovals[owner][msg.sender]) {
            revert ERC721InvalidApprover(msg.sender);
        }
        _tokenApprovals[tokenId] = to;
        emit Approval(owner, to, tokenId);
    }

    function getApproved(uint256 tokenId) external view override returns (address) {
        ownerOf(tokenId);
        return _tokenApprovals[tokenId];
    }

    function setApprovalForAll(address operator, bool approved) external override {
        if (operator == address(0)) revert ERC721InvalidOperator(operator);
        _operatorApprovals[msg.sender][operator] = approved;
        emit ApprovalForAll(msg.sender, operator, approved);
    }

    function isApprovedForAll(address owner, address operator) external view override returns (bool) {
        return _operatorApprovals[owner][operator];
    }

    function transferFrom(address from, address to, uint256 tokenId) public virtual override {
        address owner = ownerOf(tokenId);
        if (owner != from) revert ERC721IncorrectOwner(from, tokenId, owner);
        if (
            msg.sender != owner && _tokenApprovals[tokenId] != msg.sender
                && !_operatorApprovals[owner][msg.sender]
        ) {
            revert ERC721InsufficientApproval(msg.sender, tokenId);
        }
        if (to == address(0)) revert ERC721InvalidReceiver(to);

        delete _tokenApprovals[tokenId];
        _owners[tokenId] = to;
        _balances[from] -= 1;
        _balances[to] += 1;
        emit Transfer(from, to, tokenId);
    }

    function safeTransferFrom(address from, address to, uint256 tokenId) public virtual override {
        safeTransferFrom(from, to, tokenId, "");
    }

    function safeTransferFrom(address from, address to, uint256 tokenId, bytes memory data)
        public
        virtual
        override
    {
        transferFrom(from, to, tokenId);
        _checkOnERC721Received(msg.sender, from, to, tokenId, data);
    }

    function mint(address to, uint256 tokenId) external {
        if (to == address(0)) revert ERC721InvalidReceiver(to);
        if (_owners[tokenId] != address(0)) revert ERC721InvalidReceiver(to);

        _owners[tokenId] = to;
        _balances[to] += 1;
        emit Transfer(address(0), to, tokenId);
        _checkOnERC721Received(msg.sender, address(0), to, tokenId, "");
    }

    function _checkOnERC721Received(
        address operator,
        address from,
        address to,
        uint256 tokenId,
        bytes memory data
    ) private {
        if (to.code.length == 0) return;

        try IERC721Receiver(to).onERC721Received(operator, from, tokenId, data) returns (bytes4 value) {
            if (value != IERC721Receiver.onERC721Received.selector) {
                revert ERC721InvalidReceiver(to);
            }
        } catch (bytes memory reason) {
            if (reason.length == 0) revert ERC721InvalidReceiver(to);
            assembly ("memory-safe") {
                revert(add(reason, 0x20), mload(reason))
            }
        }
    }
}

/// @dev Test-only receiver that tries to withdraw the same position from the transfer callback.
contract ReentrantNftReceiver is IERC721Receiver {
    ICukieMasterNftVault public immutable vault;
    IERC721 public immutable collection;

    bool public attackEnabled;
    bool public reentryAttempted;
    bool public reentrySucceeded;
    bytes4 public reentryErrorSelector;
    address public beneficialOwnerObservedDuringCallback;

    constructor(ICukieMasterNftVault vault_, IERC721 collection_) {
        vault = vault_;
        collection = collection_;
    }

    function deposit(uint256 tokenId) external {
        collection.approve(address(vault), tokenId);
        vault.deposit(address(collection), tokenId);
    }

    function withdraw(uint256 tokenId) external {
        attackEnabled = true;
        vault.withdraw(address(collection), tokenId);
        attackEnabled = false;
    }

    function requestExit(uint256 tokenId) external {
        vault.requestExit(address(collection), tokenId);
    }

    function onERC721Received(address, address, uint256 tokenId, bytes calldata)
        external
        override
        returns (bytes4)
    {
        if (attackEnabled && msg.sender == address(collection)) {
            reentryAttempted = true;
            beneficialOwnerObservedDuringCallback = vault.beneficialOwnerOf(address(collection), tokenId);

            try vault.withdraw(address(collection), tokenId) {
                reentrySucceeded = true;
            } catch (bytes memory reason) {
                if (reason.length >= 4) {
                    bytes4 selector;
                    assembly ("memory-safe") {
                        selector := mload(add(reason, 0x20))
                    }
                    reentryErrorSelector = selector;
                }
            }
        }

        return IERC721Receiver.onERC721Received.selector;
    }
}

/// @dev Test-only collection that can acknowledge callbacks without transferring custody.
contract CallbackOnlyERC721 is MockERC721 {
    bool public callbackOnly = true;

    constructor() MockERC721("Callback Only", "CBK") {}

    function setCallbackOnly(bool enabled) external {
        callbackOnly = enabled;
    }

    function safeTransferFrom(address from, address to, uint256 tokenId, bytes memory data)
        public
        override
    {
        if (callbackOnly) {
            if (to.code.length != 0) {
                IERC721Receiver(to).onERC721Received(msg.sender, from, tokenId, data);
            }
        } else {
            super.safeTransferFrom(from, to, tokenId, data);
        }
    }

    function transferFrom(address from, address to, uint256 tokenId) public override {
        if (!callbackOnly) {
            super.transferFrom(from, to, tokenId);
        }
    }
}

/// @dev Test-only collection that performs a hostile receiver callback during unsafe transferFrom.
contract ReentrantTransferERC721 is MockERC721 {
    address public callbackFrom;

    constructor() MockERC721("Reentrant Transfer", "RENT") {}

    function setCallbackFrom(address from) external {
        callbackFrom = from;
    }

    function transferFrom(address from, address to, uint256 tokenId) public override {
        super.transferFrom(from, to, tokenId);
        if (from == callbackFrom && to.code.length != 0) {
            IERC721Receiver(to).onERC721Received(msg.sender, from, tokenId, "");
        }
    }
}
