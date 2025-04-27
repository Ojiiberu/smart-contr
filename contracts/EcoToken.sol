// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

import "@openzeppelin/contracts/access/Ownable.sol";

contract EcoToken is ERC20, Ownable {
    
    constructor(uint256 initialSupply) ERC20("EcoToken", "ECO") Ownable(msg.sender) {
    _mint(msg.sender, initialSupply);

    // initialSupply - это количество токенов, которое будет создано при развертывании
    }

    function mint (address to, uint256 amount) public onlyOwner {
        _mint(to, amount);

    }

}
