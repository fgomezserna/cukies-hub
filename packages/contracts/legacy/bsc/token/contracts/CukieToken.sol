pragma solidity ^0.5.4;

import './Roles.sol';

import './MinterRole.sol';
import './Ownable.sol';

import './ITRC721.sol';

import './TRC721.sol';
import './TRC721Metadata.sol';
import './TRC721MetadataMintable.sol';
import './TRC721Mintable.sol';
import './TRC721Enumerable.sol';




contract CukieToken is Ownable, TRC721, TRC721Enumerable, TRC721MetadataMintable {

    struct Type {
        uint256 id;  
        uint256 probability; 
        uint256 tokenId; 
        uint256 num;
    }

    Type[] public types;

    uint256 public chainPrefix;

    uint256 public _totalMinted;

    mapping(uint256 => uint256[]) private _typeToTokenId;
    

    struct Cukie {
        uint256 generation;
        uint8 skill1;
        uint8 skill2;
        uint8 skill3;
        uint8 skill4;
        uint8 skill5;
        uint8 skill6;
        uint8 energy;
        uint8 health;
    }

    
    mapping(uint256 => Cukie) private Cukies;


    constructor(uint8 _chainPrefix) public TRC721Metadata("CukiToken", "Cukies") {
        chainPrefix = _chainPrefix;
    }

    function changeChainPrefix(uint8 _chainPrefix) public onlyMinter {
        chainPrefix = _chainPrefix;
    }

    function setUriBase(string memory uriBase) public onlyOwner {
        super._setBaseURI(uriBase);
    }

    function addType(uint256 probability, uint256 tokenId) public onlyMinter {
        
        types.push(Type({
            id: types.length + 1,
            probability: probability,
            tokenId: tokenId,
            num: 0
        }));

    }    
    function getCukie(uint256 index) view public returns (uint256, uint8, uint8, uint8, uint8, uint8, uint8, uint8, uint8) {
        Cukie memory _cukie = Cukies[index];
        return (_cukie.generation , _cukie.skill1, _cukie.skill2, _cukie.skill3, _cukie.skill4, _cukie.skill5 , _cukie.skill6, _cukie.energy, _cukie.health );
    }
    
    function getType(uint256 _index) view public returns (uint256 ,  // if true, that person already voted
                                                    uint256 , // weight is accumulated by delegation
                                                    uint256 , // person delegated to
                                                    uint256 ) 
    {
        return (types[_index].id, types[_index].probability, types[_index].tokenId, types[_index].num);
    }

    function getNumTypes() view public returns (uint256) {
        return types.length;
    }
    
    function setSkills(uint256 index, uint256 generation, uint8[6] memory skills, uint8 energy, uint8 health) public onlyMinter {
        Cukie memory _cukie = Cukie({
                                        generation: generation,
                                        skill1: skills[0],
                                        skill2: skills[1],
                                        skill3: skills[2],
                                        skill4: skills[3],
                                        skill5: skills[4],
                                        skill6: skills[5],
                                        energy: energy,
                                        health: health
                                    });
        Cukies[index] = _cukie;
    }

    function burn(uint256 nftId) public onlyMinter {
        _burn(nftId);
        delete Cukies[nftId];
    }

    function mintWithTokenURI(address to, uint256 typeId, uint256 generation, uint8[6] memory skills, uint8 energy, uint8 health) public returns (bool) {
        uint256 _nextTokenId = chainPrefix.mul(1e14).add(_getNextTokeinId(typeId));


        super.mintWithTokenURI(to, _nextTokenId, "");
        // _typeToTokenId[typeId].push(_nextTokenId);
        // idToCukie.push(_nextTokenId);
        types[typeId-1].num = types[typeId-1].num.add(1);

        Cukies[_nextTokenId] = Cukie({
                                        generation: generation,
                                        skill1: skills[0],
                                        skill2: skills[1],
                                        skill3: skills[2],
                                        skill4: skills[3],
                                        skill5: skills[4],
                                        skill6: skills[5],
                                        energy: energy,
                                        health: health
                                    });
        _totalMinted = _totalMinted.add(1);

    }

    function mintWithTokenURI(address to, uint256 typeId, uint256 generation, uint8[6] memory skills, uint8 energy, uint8 health, uint256 tokenId) public returns (bool) {
        uint256 id = tokenId;
        super.mintWithTokenURI(to, id, "");
        // _typeToTokenId[id].push(id);
        // idToCukie.push(id);
        types[typeId-1].num = types[typeId-1].num.add(1);

        Cukies[id] = Cukie({
                                        generation: generation,
                                        skill1: skills[0],
                                        skill2: skills[1],
                                        skill3: skills[2],
                                        skill4: skills[3],
                                        skill5: skills[4],
                                        skill6: skills[5],
                                        energy: energy,
                                        health: health
                                    });

        _totalMinted = _totalMinted.add(1);
    }

    function _getNextTokeinId(uint256 typeId) view private returns(uint256) {
        return typeId.mul(1e12).add(_totalMinted);
    }
}