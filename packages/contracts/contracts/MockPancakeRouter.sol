// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

/// @dev Test-only exact-output router with configurable input/output rates.
contract MockPancakeRouter {
    using SafeERC20 for IERC20;

    address public immutable WETH;
    mapping(address inputToken => uint256 inputPerOutputWad) public rates;

    error InvalidPath();
    error InvalidRate();
    error Expired();
    error ExcessiveInput();
    error NativeRefundFailed();

    constructor(address wrappedNative) {
        WETH = wrappedNative;
    }

    receive() external payable {}

    function setRate(address inputToken, uint256 inputPerOutputWad) external {
        if (inputToken == address(0) || inputPerOutputWad == 0) revert InvalidRate();
        rates[inputToken] = inputPerOutputWad;
    }

    function swapETHForExactTokens(
        uint256 amountOut,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external payable returns (uint256[] memory amounts) {
        _validate(path, WETH, deadline);
        uint256 amountIn = _amountIn(WETH, amountOut);
        if (amountIn > msg.value) revert ExcessiveInput();
        IERC20(path[path.length - 1]).safeTransfer(to, amountOut);
        if (msg.value > amountIn) {
            (bool success,) = payable(msg.sender).call{value: msg.value - amountIn}("");
            if (!success) revert NativeRefundFailed();
        }
        return _amounts(path.length, amountIn, amountOut);
    }

    function swapTokensForExactTokens(
        uint256 amountOut,
        uint256 amountInMax,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external returns (uint256[] memory amounts) {
        _validate(path, path[0], deadline);
        uint256 amountIn = _amountIn(path[0], amountOut);
        if (amountIn > amountInMax) revert ExcessiveInput();
        IERC20(path[0]).safeTransferFrom(msg.sender, address(this), amountIn);
        IERC20(path[path.length - 1]).safeTransfer(to, amountOut);
        return _amounts(path.length, amountIn, amountOut);
    }

    function _validate(address[] calldata path, address expectedInput, uint256 deadline) private view {
        if (path.length < 2 || path[0] != expectedInput) revert InvalidPath();
        if (deadline < block.timestamp) revert Expired();
        if (rates[expectedInput] == 0) revert InvalidRate();
    }

    function _amountIn(address inputToken, uint256 amountOut) private view returns (uint256) {
        return Math.mulDiv(amountOut, rates[inputToken], 1 ether, Math.Rounding.Ceil);
    }

    function _amounts(uint256 length, uint256 amountIn, uint256 amountOut)
        private
        pure
        returns (uint256[] memory amounts)
    {
        amounts = new uint256[](length);
        amounts[0] = amountIn;
        amounts[length - 1] = amountOut;
    }
}
