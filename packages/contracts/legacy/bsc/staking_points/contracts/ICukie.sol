pragma solidity ^0.5.4;


import './ITRC721.sol';
import './ITRC721Metadata.sol';


/**
 * @title TRC721MetadataMintable
 * @dev TRC721 minting logic with metadata.
 */
contract ICukie is ITRC721, ITRC721Metadata {
    
    function mintWithTokenURI(address to, uint256 typeId, uint256 generation, uint8[6] memory skills, uint8 energy, uint8 health) public returns (bool);
    function mintWithTokenURI(address to, uint256 typeId, uint256 generation, uint8[6] memory skills, uint8 energy, uint8 health, uint256 tokenId) public returns (bool);
    function totalSupply() public view returns (uint256);
    function getType(uint256 _index)  view public returns (uint256 ,  
                                                    uint256 , 
                                                    uint256 , 
                                                    uint256 );

    function addType(uint256 probability, uint256 tokenId) public;
    function burn(uint256 nftId) public;

    function getCukie(uint256 index) view public returns (uint256, uint8, uint8, uint8, uint8, uint8, uint8, uint8, uint8);

    function tokenOfOwnerByIndex(address owner, uint256 index) public view returns (uint256 tokenId);

}
