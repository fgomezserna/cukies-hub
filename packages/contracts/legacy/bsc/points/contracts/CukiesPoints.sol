pragma solidity ^0.5.4;

import "./SafeMath.sol";
import "./ICukie.sol";
import "./Ownable.sol";
import './MinterRole.sol';

contract CukiesPoints is Ownable, MinterRole {
    using SafeMath for uint256;

    mapping(address => uint256) public userPoints;
    
    uint256 public totalPoints;
    uint256 public totalPointsEmit;
    
    event Mint(
        address indexed user,
        uint256 points
    ); 

    event Burn(
        address indexed user,
        uint256 points
    );

    constructor() public {
    }

    function mint(address to, uint256 points) public onlyMinter {
        userPoints[to] = userPoints[to].add(points);
        totalPoints = totalPoints.add(points);
        totalPointsEmit = totalPointsEmit.add(points);
        emit Mint(to, points);
    }

    function burn(address to, uint256 points) public onlyMinter {
        userPoints[to] = userPoints[to].sub(points);
        totalPoints = totalPoints.sub(points);
        emit Burn(to, points);
    }

    function getPoints(address _address) public view returns(uint256) {
        return userPoints[_address];
    }

    function getTotalPoints() public view returns(uint256) {
        return totalPoints;
    }

    function getTotalPointsEmited() public view returns(uint256) {
        return totalPointsEmit;
    }

    function getTotalPointsBurned() public view returns(uint256) {
        return totalPointsEmit - totalPoints;
    }


}