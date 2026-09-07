pragma solidity ^0.5.4;

import "./SafeMath.sol";
import "./ITRC721.sol";
import "./ICukie.sol";
import "./ICukiesPoints.sol";
import "./Ownable.sol";

contract CukiesStakePoints is Ownable {
    using SafeMath for uint256;


    mapping(address => uint256[]) public userTokens;
    mapping(uint256 => address) public tokenOwner;
    mapping(uint256 => uint256) public cukiesDate;

    mapping(uint256 => uint256) public pointsToType;
    
    uint256 public maxCukies;

    event Stake(
        address indexed user,
        uint256 tokenId,
        uint256 date
    ); 

    event Unstake(
        address indexed user,
        uint256 tokenId,
        uint256 date,
        uint256 points
    ); 

    ICukie public cukieToken;
    ICukiesPoints public cukiePoints;
    bool pause = false;
    uint256 pause_at;

    constructor() public {
        pause = false;
        maxCukies = 10;
    }

    function changePointsToType(uint256 _type, uint256 _value) public onlyOwner {
        pointsToType[_type] = _value.mul(1e7).div(86400);
    }
    

    function changeMaxCukies(uint256 _maxCukies) public onlyOwner {
        maxCukies = _maxCukies;
    }

    function changeToken(ICukie _cukieToken) public onlyOwner {
        cukieToken = _cukieToken;
    }

    function changePause(bool _pause) public onlyOwner {
        pause = _pause;
        if(pause) {
            pause_at = now;
        } else {
            pause_at = now + 365 days;
        }
    }

    function changePoints(ICukiesPoints _cukiePoints) public onlyOwner {
        cukiePoints = _cukiePoints;
    }

    function ownerCukie(uint256 _tokenId) view public returns(address) {
        return cukieToken.ownerOf(_tokenId);
    }
    // TODO: getTokensOwner
    function getTokensOwner(address _address) view public returns(uint256[] memory) {
        return userTokens[_address];
    }

    function recovery(uint256 _tokenId) public onlyOwner {
        cukieToken.transferFrom(address(this), tokenOwner[_tokenId], _tokenId);
    }

    function stake(uint256 _tokenId) public {
        require(pause == false);
        require(userTokens[msg.sender].length < maxCukies);
        require(cukieToken.ownerOf(_tokenId) == msg.sender);
        ( uint256 generacion1 , , , , , , , , ) = (cukieToken.getCukie(_tokenId));
        require(generacion1 == 1);

        tokenOwner[_tokenId] = msg.sender;
        userTokens[msg.sender].push(_tokenId);
        cukiesDate[_tokenId] = now;

        // Realizamos el transfer del token al contrato
        cukieToken.transferFrom(msg.sender, address(this), _tokenId);

        emit Stake(msg.sender, _tokenId, now);
    }

    function unstake(uint256 _tokenId) public {
        require(tokenOwner[_tokenId] == msg.sender);

        // Devolvemos el cukie
        cukieToken.transferFrom(address(this), tokenOwner[_tokenId], _tokenId);
        
        // asignamos los puntos que le token
        uint256 points = calcPoints(_tokenId);
        cukiePoints.mint(tokenOwner[_tokenId], points);

        delete tokenOwner[_tokenId];
        uint256[] memory newArray = remove(userTokens[msg.sender], _tokenId);
        delete(userTokens[msg.sender]);
        userTokens[msg.sender] = newArray;
        delete cukiesDate[_tokenId];
        
        emit Unstake(msg.sender, _tokenId, now, points);
    }

    function remove(uint256[] memory array, uint _tokenId) private pure returns(uint256[] memory) {
        require(array.length > 0);

        if(array.length-1 == 0) return new uint256[](0);
        
        uint256[] memory newArray = new uint256[](array.length-1);
        uint y = 0;
        for (uint i = 0; i<array.length; i++){
            if(array[i] != _tokenId) {
                newArray[y] = array[i];
                y = y + 1;
            }
        }
        return newArray;
    }

    function calcPoints(uint256 _tokenId) public view returns (uint256) {
        // TODO: poner fecha de cierre si ya se ha acabado el pool
        uint256 ago;
        if(pause) {
            ago = pause_at.sub(cukiesDate[_tokenId]);
        } else {
            ago = now.sub(cukiesDate[_tokenId]);
        }

        return ago.mul(pointsToType[getType(_tokenId)]).div(1e7);
    }

    function getType(uint256 _tokenId) public pure returns (uint256) {
        return (_tokenId/1e12) - ((_tokenId/1e14) * (2));
    }
}