// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.20;

import "hardhat/console.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract EcoControl {

    address public owner;

    // адрес, который отправляет данные о загрязнении
    address public dataSourceCaller;

    // нормативы для метрик загрязнения
    uint256 public metric1Threshold;
    uint256 public metric2Threshold;

    uint256 public nextEnterpriseId = 0;

    // Переменные для токена
    address public ecoTokenAddress; 
    uint256 public fineAmount = 100 *(10**18);

    uint256 public fineThreshold = 300; // порог рейтинга для начисления штрафа

    //структура для хранения информации о предприятии

    struct Enterprise {
        string name;
        uint256 id;
        uint256 rating;
        uint256 latestDataTimestamp;
        uint256 latestMetric1;
        uint256 latestMetric2;
    }
    // Отображение ID предприятия на его данные
    mapping(uint256 => Enterprise) public enterprises;

    modifier onlyOwner () {
        require(msg.sender == owner, "onlyowner can call this function" );
        _; // Выполнить остальную часть функции
    }

    modifier onlyDataSourceCaller() {
        require(msg.sender == dataSourceCaller, "Only authorized data can call this function" );
        _;
    }

    // События для уведомлений
    event EnterpriseRegistered(uint256 id, string name);
    event NormsUpdated(uint256 metric1Threshold, uint256 metric2Threshold);
    event DataUpdated(uint256 enterpriseId, uint256 metric1, uint256 metric2, uint256 timestamp);
    event RatingChanged(uint256 enterpriseId, uint256 oldRating, uint256 newRating);

    event FineCharged(uint256 enterpriseId, address indexed enterpriseAddress, uint256 amount);
    event FineChargeFailed(uint256 enterpriseId, address indexed enterpriseAddress, uint256 amount, string reason);

    constructor() {
        owner = msg.sender;
        dataSourceCaller = msg.sender;
        // разрешаем владельцу отправлять данные.

        metric1Threshold = 50;
        metric2Threshold = 10;
         console.log("EcoControl contract deployed");
    }

    function registerEnterprise(string memory _name, address _enterpriseAddress) public onlyOwner {
        require(bytes(_name).length > 0, "Enterprise name cannot be empty");
        
        require(_enterpriseAddress != address(0), "Enterprise address cannot be zero");

        uint256 enterpriseId = nextEnterpriseId;

        // Создаем новую запись о предприятии
        enterprises[enterpriseId] = Enterprise({
            name: _name,
            id: enterpriseId,
            rating: 500,
            latestDataTimestamp: 0,
            latestMetric1: 0,
            latestMetric2: 0
        });

        nextEnterpriseId++;

        emit EnterpriseRegistered(enterpriseId, _name);
        console.log("Enterprise registered"); 
        console.log(enterpriseId); 
        console.log(_name); 
        
    }

    // Установка/обновление нормативов загрязнения
    function setNorms(uint256 _metric1Threshold, uint256 _metric2Threshold) public onlyOwner {

        metric1Threshold = _metric1Threshold;
        metric2Threshold = _metric2Threshold;

        emit NormsUpdated(_metric1Threshold, _metric2Threshold);
        console.log("Norms updated"); 
        console.log(_metric1Threshold); 
        console.log(_metric2Threshold); 
    }
    // Установка адреса, который имеет право отправлять данные
    function setDataSourceCaller(address _caller) public onlyOwner {
        require(_caller != address(0), "Caller address cannot be zero");
        dataSourceCaller = _caller;
        console.log("Data source caller updated"); 
        console.log(_caller); 
    }

    function setEcoTokenAddress(address _tokenAddress) public onlyOwner {
        require(_tokenAddress != address(0), "Token address cannot be zero");
        ecoTokenAddress = _tokenAddress;

        console.log("EcoToken address set"); 
        console.log(_tokenAddress); 
    }

    function setFineAmount(uint256 _amount) public onlyOwner {
        require(_amount > 0, "Fine amount must be greater than 0");
        fineAmount = _amount;
        console.log("Fine amount set"); 
        console.log(_amount); 
    }

    function setFineThreshold(uint256 _threshold) public onlyOwner {
        fineThreshold = _threshold;
        console.log("Fine threshold set"); 
        console.log(_threshold);
    }

    function updateEnvironmentalData(
        uint256 _enterpriseId,
        address _enterpriseAddress,
        uint256 _metric1Value,
        uint256 _metric2Value
    ) public onlyDataSourceCaller {

        require(_enterpriseId < nextEnterpriseId, "Enterprise with this ID does not exist");
        require(_enterpriseAddress != address(0), "Enterprise address cannot be zero");

        Enterprise storage enterprise = enterprises[_enterpriseId];

        uint256 oldRating = enterprise.rating;

        enterprise.latestMetric1 = _metric1Value;
        enterprise.latestMetric2 = _metric2Value;
        enterprise.latestDataTimestamp = block.timestamp;

        
        console.log("Data updated for enterprise ID:");
        console.log(_enterpriseId);
        console.log("Enterprise address:"); 
        console.log(_enterpriseAddress);
        console.log("Metric1 value:"); 
        console.log(_metric1Value);
        console.log("Metric2 value:"); 
        console.log(_metric2Value);

        

        _evaluateAndAdjustRating(_enterpriseId, _enterpriseAddress, _metric1Value, _metric2Value);

        emit DataUpdated(_enterpriseId, _metric1Value, _metric2Value, block.timestamp);
    }

    function _evaluateAndAdjustRating(
        uint256 _enterpriseId,
        address _enterpriseAddress,
        uint256 _metric1Value,
        uint256 _metric2Value
    ) internal {
        Enterprise storage enterprise = enterprises[_enterpriseId];
        uint256 oldRating = enterprise.rating;

        bool exceededNorms = (_metric1Value > metric1Threshold || _metric2Value > metric2Threshold);


        if (exceededNorms) {

            if (enterprise.rating >= 10){
                enterprise.rating -= 10;
                console.log("Rating decreased for ID:"); 
                console.log(_enterpriseId);
                console.log("From:");
                console.log(oldRating);
                console.log("To:");
                console.log(enterprise.rating);
            } else {
                enterprise.rating = 0;
                console.log("Rating hit minimum (0) for ID:"); 
                console.log(_enterpriseId);
                console.log("Was:");
                console.log(oldRating);
            }

        } else {
            if (enterprise.rating <= 995) { // Максимальный рейтинг 1000
                enterprise.rating += 5;
                console.log("Rating increased for ID:"); 
                console.log(_enterpriseId);
                console.log("From:");
                console.log(oldRating);
                console.log("To:");
                console.log(enterprise.rating);
            } else {
                enterprise.rating = 1000; 
                console.log("Rating hit maximum (1000) for ID:"); 
                console.log(_enterpriseId);
                console.log("Was:");
                console.log(oldRating);
            }
        }
        emit RatingChanged(_enterpriseId, oldRating, enterprise.rating);
        console.log("Final rating for ID:"); 
        console.log(_enterpriseId);
        console.log("is:");
        console.log(enterprise.rating);


        // логика штрафа ERC-20
        // Штраф начисляется, если:
        // 1. Были превышены нормы (exceededNorms == true)
        // 2. Новый рейтинг опустился НИЖЕ fineThreshold
        // 3. Старый рейтинг был ВЫШЕ ИЛИ РАВЕН fineThreshold (чтобы штраф начислялся только при пересечении порога вниз)
        if (exceededNorms && enterprise.rating < fineThreshold && oldRating >= fineThreshold) {
            // Проверяем, установлен ли адрес контракта токена
            if (ecoTokenAddress == address(0)) {
                console.log("EcoToken address not set, cannot charge fine for ID:"); 
                console.log(_enterpriseId);
                emit FineChargeFailed(_enterpriseId, _enterpriseAddress, fineAmount, "Token address not set");
                return; 
            }

            
            IERC20 ecoToken = IERC20(ecoTokenAddress);
            //списание штрафа с адреса предприятия

            bool success = ecoToken.transferFrom(_enterpriseAddress, address(this), fineAmount);

            if(success) {
                emit FineCharged(_enterpriseId, _enterpriseAddress, fineAmount);
                console.log("Successfully charged fine of:"); 
                console.log(fineAmount);
                console.log("tokens from:");
                console.log(_enterpriseAddress);
                console.log("for ID:");
                console.log(_enterpriseId);
            }
            else {
                // Ошибка может быть из-за недостатка баланса или недостаточного одобрения (allowance)
                console.log("Failed to charge fine of:"); // Упрощаем console.log
                console.log(fineAmount);
                console.log("tokens from:");
                console.log(_enterpriseAddress);
                console.log("for ID:");
                console.log(_enterpriseId);
                // Уточняем причину ошибки в событии
                string memory reason = "transferFrom failed (check balance/allowance)";
                emit FineChargeFailed(_enterpriseId, _enterpriseAddress, fineAmount, reason);
            }
        }
    }

    // Функция для получения только рейтинга предприятия (мб понадобится)
     function getEnterpriseRating(uint256 _enterpriseId) public view returns (uint256) {
         require(_enterpriseId < nextEnterpriseId, "Enterprise with this ID does not exist");
         return enterprises[_enterpriseId].rating;
     }

     // Функция для получения последних данных о загрязнении
     function getLatestEnvironmentalData(uint256 _enterpriseId) public view returns (uint256 timestamp, uint256 metric1, uint256 metric2) {
        require(_enterpriseId < nextEnterpriseId, "Enterprise with this ID does not exist");
        Enterprise storage enterprise = enterprises[_enterpriseId];
        return (enterprise.latestDataTimestamp, enterprise.latestMetric1, enterprise.latestMetric2);
     }

     // Функция для получения баланса собранных штрафов (токенов ECO) на контракте EcoControl
     function getCollectedFinesBalance() public view returns (uint256) {
        
        if (ecoTokenAddress == address(0)) {
            return 0;
        }
        IERC20 ecoToken = IERC20(ecoTokenAddress);
        return ecoToken.balanceOf(address(this));
     }

     // Функция для владельца, чтобы вывести собранные токены ECO с контракта EcoControl
     function withdrawCollectedFines(address _recipient) public onlyOwner {
        require(ecoTokenAddress != address(0), "Token address not set" );
        require(_recipient != address(0), "Recipient address cannot be zero");

        IERC20 ecoToken = IERC20(ecoTokenAddress);
        uint256 balance = ecoToken.balanceOf(address(this));
        require(balance > 0, "No tokens collected to withdraw");

        // Используем transfer(), чтобы перевести токены С баланса этого контракта
        bool success = ecoToken.transfer(_recipient, balance);
        require(success, "Failed to withdraw tokens");

        console.log("Withdrew:"); 
        console.log(balance);
        console.log("tokens to:");
        console.log(_recipient);
     }

}