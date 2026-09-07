pragma solidity ^0.5.4;


interface ICukiesPoints {

    function mint(address to, uint256 points) external;

    function burn(address to, uint256 points) external;

    function getPoints(address _address) external view returns(uint256);

    function getTotalPointsEmited() external view returns(uint256);
    
    function getTotalPoints() external view returns(uint256);

}