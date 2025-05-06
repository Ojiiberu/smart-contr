// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.20;

import "hardhat/console.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract EcoControl {

    address public owner;

    // адрес, который отправляет данные о загрязнении или инициирует проверку
    address public dataProcessorCaller; // Переименовали для лучшей ясности

    // Переменные для токена
    address public ecoTokenAddress;
    uint256 public fineAmount = 100 *(10**18); // 100 токенов

    // --- Удаляем fineThreshold, он больше не нужен ---
    // uint256 public fineThreshold = 300;

    uint256 public nextEnterpriseId = 0;

    //структура для хранения информации о предприятии
    struct Enterprise {
        string name;
        uint256 id;
        address enterpriseAddress; // Добавляем адрес предприятия прямо в структуру для удобства
        // --- Удаляем rating ---
        // uint256 rating;
        uint256 latestDataTimestamp;
        uint256 latestMetric1;
        uint256 latestMetric2;
        // --- Новые поля для ИНДИВИДУАЛЬНЫХ лимитов ---
        uint256 metric1Limit;
        uint256 metric2Limit;
    }
    // Отображение ID предприятия на его данные
    mapping(uint256 => Enterprise) public enterprises;
    // Добавим маппинг адрес => ID для быстрого поиска по адресу (опционально, но полезно)
    mapping(address => uint256) public enterpriseAddressToId;
    mapping(address => bool) public isEnterpriseRegistered; // Быстрая проверка регистрации

    modifier onlyOwner () {
        require(msg.sender == owner, "Only owner can call this function" ); // Исправлено сообщение
        _; // Выполнить остальную часть функции
    }

    // Переименовали модификатор
    modifier onlyDataProcessorCaller() {
        require(msg.sender == dataProcessorCaller, "Only authorized data processor can call this function" );
        _;
    }

    // События для уведомлений
    event EnterpriseRegistered(uint256 id, string name, address indexed enterpriseAddress); // Добавляем адрес в событие
    // --- Удаляем NormsUpdated и RatingChanged ---
    // event NormsUpdated(uint256 metric1Threshold, uint256 metric2Threshold);
    // event RatingChanged(uint256 enterpriseId, uint256 oldRating, uint256 newRating);
    event DataUpdated(uint256 enterpriseId, uint256 metric1, uint256 metric2, uint256 timestamp);

    // --- Новые события, связанные с новой логикой ---
    event LimitsUpdated(uint256 enterpriseId, uint256 metric1Limit, uint256 metric2Limit);
    event ComplianceChecked(uint256 enterpriseId, uint256 metric1Value, uint256 metric2Value, bool limitsExceeded);
    event FineCharged(uint256 enterpriseId, address indexed enterpriseAddress, uint256 amount);
    event FineChargeFailed(uint256 enterpriseId, address indexed enterpriseAddress, uint256 amount, string reason);

    constructor() {
        owner = msg.sender;
        dataProcessorCaller = msg.sender; // Для MVP, разрешаем владельцу обрабатывать данные.

        // --- Удаляем установку общих нормативов ---
        // metric1Threshold = 50;
        // metric2Threshold = 10;

        console.log("EcoControl contract deployed");
    }

    // --- Административные функции ---

    // Регистрация нового предприятия
    // Теперь требует установки начальных лимитов при регистрации
    function registerEnterprise(
        string memory _name,
        address _enterpriseAddress,
        uint256 _initialMetric1Limit,
        uint256 _initialMetric2Limit
    ) public onlyOwner {
        require(bytes(_name).length > 0, "Enterprise name cannot be empty");
        require(_enterpriseAddress != address(0), "Enterprise address cannot be zero");
        // Проверяем, что адрес еще не зарегистрирован
        require(!isEnterpriseRegistered[_enterpriseAddress], "Enterprise with this address already registered");

        uint256 enterpriseId = nextEnterpriseId;

        // Создаем новую запись о предприятии
        enterprises[enterpriseId] = Enterprise({
            name: _name,
            id: enterpriseId,
            enterpriseAddress: _enterpriseAddress, // Сохраняем адрес
            // rating удален
            latestDataTimestamp: 0,
            latestMetric1: 0,
            latestMetric2: 0,
            // Устанавливаем начальные лимиты
            metric1Limit: _initialMetric1Limit,
            metric2Limit: _initialMetric2Limit
        });

        // Обновляем маппинги для быстрого поиска и проверки регистрации
        enterpriseAddressToId[_enterpriseAddress] = enterpriseId;
        isEnterpriseRegistered[_enterpriseAddress] = true;

        nextEnterpriseId++;

        emit EnterpriseRegistered(enterpriseId, _name, _enterpriseAddress);
        console.log("Enterprise registered");
        console.log(enterpriseId);
        console.log(_name);
        console.log(_enterpriseAddress);
        console.log("Initial limits: M1:");
        console.log(_initialMetric1Limit);
        console.log("M2:");
        console.log(_initialMetric2Limit);
    }

    // --- Удаляем setNorms ---
    // function setNorms(...)

    // Установка адреса, который имеет право обрабатывать данные
    function setDataProcessorCaller(address _caller) public onlyOwner { // Переименовали функцию
        require(_caller != address(0), "Caller address cannot be zero");
        dataProcessorCaller = _caller;
        console.log("Data processor caller updated"); // Обновлен текст
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

    // --- Удаляем setFineThreshold ---
    // function setFineThreshold(...)

    // --- Новая административная функция: Установка индивидуальных лимитов предприятия ---
    function setEnterpriseLimits(uint256 _enterpriseId, uint256 _metric1Limit, uint256 _metric2Limit) public onlyOwner {
        // Проверяем, существует ли предприятие с таким ID
        require(_enterpriseId < nextEnterpriseId, "Enterprise with this ID does not exist");
        // Можно добавить проверки, что лимиты >= 0

        Enterprise storage enterprise = enterprises[_enterpriseId];
        enterprise.metric1Limit = _metric1Limit;
        enterprise.metric2Limit = _metric2Limit;

        emit LimitsUpdated(_enterpriseId, _metric1Limit, _metric2Limit);
        console.log("Limits updated for ID:");
        console.log(_enterpriseId);
        console.log("M1 Limit:");
        console.log(_metric1Limit);
        console.log("M2 Limit:");
        console.log(_metric2Limit);
    }

    // --- Новая функция для обновления лимитов для всех предприятий сразу ---
    function updateAllEnterprisesLimits(uint256 _newMetric1Limit, uint256 _newMetric2Limit) public onlyOwner {
        require(nextEnterpriseId > 0, "No enterprises registered yet");
        
        for (uint256 i = 0; i < nextEnterpriseId; i++) {
            enterprises[i].metric1Limit = _newMetric1Limit;
            enterprises[i].metric2Limit = _newMetric2Limit;
            
            emit LimitsUpdated(i, _newMetric1Limit, _newMetric2Limit);
        }
        
        console.log("Updated limits for all enterprises:");
        console.log("New M1 Limit:");
        console.log(_newMetric1Limit);
        console.log("New M2 Limit:");
        console.log(_newMetric2Limit);
    }

    // --- Функция для приема данных, проверки и начисления штрафа ---
    // Переименовали и переработали updateEnvironmentalData в checkCompliance
    // Эта функция вызывается по запросу (с фронтенда или скриптом)
    // и содержит логику проверки и начисления штрафа.
    function checkCompliance(
        uint256 _enterpriseId,
        uint256 _metric1Value,
        uint256 _metric2Value
        // Можно добавить другие метрики
    ) public onlyDataProcessorCaller { // Используем новый модификатор

        // Проверяем, существует ли предприятие с таким ID
        require(_enterpriseId < nextEnterpriseId, "Enterprise with this ID does not exist");

        Enterprise storage enterprise = enterprises[_enterpriseId];
        address enterpriseAddress = enterprise.enterpriseAddress; // Получаем адрес предприятия из структуры

        // Сохраняем последние полученные данные
        enterprise.latestMetric1 = _metric1Value;
        enterprise.latestMetric2 = _metric2Value;
        enterprise.latestDataTimestamp = block.timestamp;

        console.log("Compliance check for ID:");
        console.log(_enterpriseId);
        console.log("Received data: M1:");
        console.log(_metric1Value);
        console.log("M2:");
        console.log(_metric2Value);
        console.log("Limits: M1:");
        console.log(enterprise.metric1Limit);
        console.log("M2:");
        console.log(enterprise.metric2Limit);


        // --- Логика проверки и начисления штрафа ---
        bool limitsExceeded = (_metric1Value > enterprise.metric1Limit || _metric2Value > enterprise.metric2Limit);

        emit ComplianceChecked(_enterpriseId, _metric1Value, _metric2Value, limitsExceeded);
         console.log("Limits exceeded:");
         console.log(limitsExceeded);

        // Если лимит превышен, пытаемся списать штраф
        if (limitsExceeded) {
            // Проверяем, установлен ли адрес контракта токена
            if (ecoTokenAddress == address(0)) {
                console.log("EcoToken address not set, cannot charge fine for ID:");
                console.log(_enterpriseId);
                emit FineChargeFailed(_enterpriseId, enterpriseAddress, fineAmount, "Token address not set");
                return; // Прекращаем выполнение функции
            }

            // Получаем экземпляр контракта токена по его адресу, используя интерфейс IERC20
            IERC20 ecoToken = IERC20(ecoTokenAddress);

            // Пытаемся списать штраф с адреса предприятия на адрес этого контракта (EcoControl)
            // Эта транзакция сработает только если enterpriseAddress
            // ранее вызвал ecoToken.approve(address(this), fineAmount) или больше
            bool success = ecoToken.transferFrom(enterpriseAddress, address(this), fineAmount);

            if (success) {
                emit FineCharged(_enterpriseId, enterpriseAddress, fineAmount);
                 console.log("Successfully charged fine of:");
                 console.log(fineAmount);
                 console.log("tokens from:");
                 console.log(enterpriseAddress);
                 console.log("for ID:");
                 console.log(_enterpriseId);
            } else {
                // Ошибка может быть из-за недостатка баланса или недостаточного одобрения (allowance)
                console.log("Failed to charge fine of:");
                console.log(fineAmount);
                console.log("tokens from:");
                console.log(enterpriseAddress);
                console.log("for ID:");
                console.log(_enterpriseId);
                string memory reason = "transferFrom failed (check balance/allowance)";
                emit FineChargeFailed(_enterpriseId, enterpriseAddress, fineAmount, reason);
            }
        }
        // --- Конец логики проверки и начисления штрафа ---

    }

     // --- Функции для чтения данных ---

     // Добавляем геттер для получения адреса предприятия по ID
     function getEnterpriseAddress(uint256 _enterpriseId) public view returns (address) {
         require(_enterpriseId < nextEnterpriseId, "Enterprise with this ID does not exist");
         return enterprises[_enterpriseId].enterpriseAddress;
     }

     // Добавляем геттер для получения лимитов предприятия по ID
      function getEnterpriseLimits(uint256 _enterpriseId) public view returns (uint256 metric1Limit, uint256 metric2Limit) {
          require(_enterpriseId < nextEnterpriseId, "Enterprise with this ID does not exist");
          Enterprise storage enterprise = enterprises[_enterpriseId];
          return (enterprise.metric1Limit, enterprise.metric2Limit);
      }


     // --- Удаляем getEnterpriseRating, т.к. рейтинга больше нет ---
     // function getEnterpriseRating(...)

     function getLatestEnvironmentalData(uint256 _enterpriseId) public view returns (uint256 timestamp, uint256 metric1, uint256 metric2) {
          require(_enterpriseId < nextEnterpriseId, "Enterprise with this ID does not exist");
          Enterprise storage enterprise = enterprises[_enterpriseId];
          return (enterprise.latestDataTimestamp, enterprise.latestMetric1, enterprise.latestMetric2);
     }

     // Функция для проверки превышения лимитов
     function checkLimitsExceeded(uint256 _enterpriseId, uint256 _metric1Value, uint256 _metric2Value) public view returns (bool) {
          require(_enterpriseId < nextEnterpriseId, "Enterprise with this ID does not exist");
          Enterprise storage enterprise = enterprises[_enterpriseId];
          // Возвращаем true, если хотя бы один из лимитов превышен
          return (_metric1Value > enterprise.metric1Limit || _metric2Value > enterprise.metric2Limit);
     }

     function getCollectedFinesBalance() public view returns (uint256) {
        if (ecoTokenAddress == address(0)) {
            return 0;
        }
        IERC20 ecoToken = IERC20(ecoTokenAddress);
        return ecoToken.balanceOf(address(this));
     }
     function withdrawCollectedFines(address _recipient) public onlyOwner {
        require(ecoTokenAddress != address(0), "Token address not set" );
        require(_recipient != address(0), "Recipient address cannot be zero");

        IERC20 ecoToken = IERC20(ecoTokenAddress);
        uint256 balance = ecoToken.balanceOf(address(this));
        require(balance > 0, "No tokens collected to withdraw");

        bool success = ecoToken.transfer(_recipient, balance);
        require(success, "Failed to withdraw tokens");

        console.log("Withdrew:");
        console.log(balance);
        console.log("tokens to:");
        console.log(_recipient);
     }

}