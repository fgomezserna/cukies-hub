pragma solidity ^0.5.4;

import "./ICukie.sol";
import "./Pausable.sol";
import "./Ownable.sol";
import "./Context.sol";


contract CukiesNFTBridge is Context, Pausable, Ownable {

    /*** EVENTS ***/
    event JumpInBridge(uint256 tokenId, address originOwner, address destOwner, uint8 network, uint256 createdAt);
    event JumpOutBridge(uint256 tokenId, address destOwner, uint256 createdAt);

    /*** CONFIGURATION ***/
    ICukie private tokenContract;
    uint256 public bridgePrice;
    address payable beneficiary;

    /*** CONSTRUCTOR ***/
    constructor(address tokenAddress, uint256 _bridgePrice) public {
        tokenContract = ICukie(tokenAddress);
        bridgePrice = _bridgePrice;
        beneficiary = _msgSender();
    }

    /*** SECURITY ***/
    function pause() public onlyOwner whenNotPaused {
        _pause();
    }

    function unpause() public onlyOwner whenPaused {
        _unpause();
    }

    function changeTokenContract(address newTokenContractAddress) public onlyOwner {
        tokenContract = ICukie(newTokenContractAddress);
    }

    function changeBridgePrice(uint256 _bridgePrice) public onlyOwner {
        bridgePrice = _bridgePrice;
    }

    function changeBeneficiary(address payable _beneficiary) public onlyOwner {
        beneficiary =  _beneficiary;
    }

    /*** LOGIC ***/
    function jumpInBridge(uint256 tokenId, address destOwner, uint8 chainPrefix) public payable whenNotPaused {
        require(_msgSender() == tokenContract.ownerOf(tokenId), "Transfer caller is not owner nor approved");
        require(msg.value == bridgePrice, "Please submit the asking bridgePrice");
        tokenContract.burn(tokenId);
        beneficiary.transfer(msg.value);
        emit JumpInBridge(tokenId, _msgSender(), destOwner, chainPrefix, block.timestamp);
    }
    
    function jumpOutBridge(address destOwner, uint256 typeId, uint256 generation, uint8[6] memory skills, uint8 energy, uint8 health, uint256 tokenId) public onlyOwner {
        tokenContract.mintWithTokenURI(destOwner, typeId, generation, skills, energy, health, tokenId);
        emit JumpOutBridge(tokenId, destOwner, block.timestamp);
    }
}
