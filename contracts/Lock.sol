// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.20;


import "hardhat/console.sol";

contract EcoControl {

    address public owner;

    // адрес, который отправляет данные о загрязнении
    address public dataSourceCaller;

    // нормативы для метрик загрязнения
    uint256 public metric1Threshold;
    uint256 public metric2Threshold;

    uint256 public nextEnterpriseId = 0;

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

    constructor() {
        owner = msg.sender; 
        dataSourceCaller = msg.sender;
        // разрешаем владельцу отправлять данные.

        metric1Threshold = 50;
        metric2Threshold = 10;
         console.log("EcoControl contract deployed by %s", owner);
    }

    function registerEnterprise(string memory _name) public onlyOwner {
        require(bytes(_name).length > 0, "Enterprise name cannot be empty");

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
        console.log("Enterpise registered: Id %s, Name %s", enterpriseId, _name);
    }

    // Установка/обновление нормативов загрязнения
    function setNorms(uint256 _metric1Threshold, uint256 _metric2Threshold) public onlyOwner {

        metric1Threshold = _metric1Threshold;
        metric2Threshold = _metric2Threshold;

        emit NormsUpdated(_metric1Threshold, _metric2Threshold);
        console.log("Norms updated: Metric1 %s, Metric2 %s", _metric1Threshold, _metric2Threshold);
    }
    // Установка адреса, который имеет право отправлять данные
    function setDataSourceCaller(address _caller) public onlyOwner {
        require(_caller != address(0), "Caller address cannot be zero");
        dataSourceCaller = _caller;
        console.log("Data source caller updated to %s", _caller);
    }

    function updateEnvironmentalData(
        uint256 _enterpriseId,
        uint256 _metric1Value,
        uint256 _metric2Value
    ) public onlyDataSourceCaller {

        require(_enterpriseId < nextEnterpriseId, "Enterprise with this ID does not exist");

        Enterprise storage enterprise = enterprises[_enterpriseId];

        uint256 oldRating = enterprise.rating;

        enterprise.latestMetric1 = _metric1Value;
        enterprise.latestMetric2 = _metric2Value;
        enterprise.latestDataTimestamp = block.timestamp;

        _evaluateAndAdjustRating(_enterpriseId, _metric1Value, _metric2Value);

        emit DataUpdated(_enterpriseId, _metric1Value, _metric2Value, block.timestamp);

        console.log("Data updated for Id %s: Metric1 %s, Metric2 %s.", _enterpriseId, _metric1Value, _metric2Value);

    }

    function _evaluateAndAdjustRating(
        uint256 _enterpriseId,
        uint256 _metric1Value,
        uint256 _metric2Value
    ) internal {
        Enterprise storage enterprise = enterprises[_enterpriseId];
        uint256 oldRating = enterprise.rating;

        if (_metric1Value > metric1Threshold || _metric2Value > metric2Threshold) {

            if (enterprise.rating >= 10){
                enterprise.rating -= 10;
                console.log ("Rating decreased for ID %s due to exceeding norms. From %s to %s", _enterpriseId, oldRating, enterprise.rating);
            } else {
                enterprise.rating = 0;
                console.log("rating hit minimum (0) for ID %s. Was %s", _enterpriseId, oldRating);
            }

        } else {
            if (enterprise.rating <= 995) {
                enterprise.rating += 5;
                console.log("Rating increased for ID %s due to compliance. From %s to %s", _enterpriseId, oldRating, enterprise.rating);

            }
        }
        emit RatingChanged(_enterpriseId, oldRating, enterprise.rating);
        console.log("Final rating for ID %s: %s", _enterpriseId, enterprise.rating);
    }
    // Функция для получения только рейтинга предприятия (мб понадобится)
     function getEnterpriseRating(uint256 _enterpriseId) public view returns (uint256) {
         require(_enterpriseId < nextEnterpriseId, "Enterprise with this ID does not exist");
         return enterprises[_enterpriseId].rating;
     }
     function getLatestEnvironmentalData(uint256 _enterpriseId) public view returns (uint256 timestamp, uint256 metric1, uint256 metric2) {
        require(_enterpriseId < nextEnterpriseId, "Enterprise with this ID does not exist");
        Enterprise storage enterprise = enterprises[_enterpriseId];
        return (enterprise.latestDataTimestamp, enterprise.latestMetric1, enterprise.latestMetric2);
     }


}