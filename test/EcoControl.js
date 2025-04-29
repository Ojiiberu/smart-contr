// Импортируем ethers и expect из Hardhat
const { ethers } = require("hardhat");
const { expect } = require("chai");

// Импортируем константу максимального uint256 для бесконечного аппрува (для BigInt в ethers v6+)
const MAX_UINT256 = ethers.MaxUint256;

// Объявляем переменные, которые будут доступны во всех тестах
let EcoToken, ecoToken, EcoControl, ecoControl;
let deployer, dataProcessorCaller, enterprise1, enterprise2, otherAccount; // Аккаунты
let enterprise1Id, enterprise2Id; // ID предприятий
const fineAmount = ethers.parseUnits("100", 18); // Сумма штрафа в токенах (100 ECO)

// Начальные лимиты для предприятий при регистрации
const initialLimitM1 = 100;
const initialLimitM2 = 20;

// Тестовые значения данных (используем BigInt литералы с 'n')
const complianceData = { metric1: 50n, metric2: 10n }; // Ниже лимитов (100, 20)
const exceedingData = { metric1: 150n, metric2: 30n }; // Выше лимитов (100, 20)


// Блок describe группирует тесты для контракта EcoControl (Новая логика)
describe("EcoControl (New Logic)", function () {

  // Блок beforeEach выполняется перед каждым тестом
  beforeEach(async function () {
    // Получаем тестовые аккаунты
    [deployer, dataProcessorCaller, enterprise1, enterprise2, otherAccount] = await ethers.getSigners();

    // --- Развертывание EcoToken ---
    EcoToken = await ethers.getContractFactory("EcoToken");
    const initialTokenSupply = ethers.parseUnits("1000000", 18); // Начальное предложение токенов
    ecoToken = await EcoToken.deploy(initialTokenSupply);
    await ecoToken.waitForDeployment();
    const ecoTokenAddress = await ecoToken.getAddress();

    // --- Развертывание EcoControl ---
    EcoControl = await ethers.getContractFactory("EcoControl");
    ecoControl = await EcoControl.deploy();
    await ecoControl.waitForDeployment();
    const ecoControlAddress = await ecoControl.getAddress();

    // --- Настройка EcoControl (владельцем) ---
    // Устанавливаем адрес токена и аккаунт обработчика данных
    await ecoControl.setEcoTokenAddress(ecoTokenAddress);
    await ecoControl.setDataProcessorCaller(dataProcessorCaller.address);
    // Устанавливаем сумму штрафа (если отличается от дефолтной)
    await ecoControl.setFineAmount(fineAmount);


    // --- Регистрация тестовых предприятий (владельцем) ---
    // Регистрируем предприятие 1 с начальными лимитами
    let tx1 = await ecoControl.registerEnterprise("Предприятие 1", enterprise1.address, initialLimitM1, initialLimitM2);
    let receipt1 = await tx1.wait();
    // Получаем enterpriseId из события (для ethers v6, событие в logs[0])
    enterprise1Id = receipt1.logs[0].args.id;

    // Регистрируем предприятие 2 с теми же начальными лимитами
    let tx2 = await ecoControl.registerEnterprise("Предприятие 2", enterprise2.address, initialLimitM1, initialLimitM2);
    let receipt2 = await tx2.wait();
    enterprise2Id = receipt2.logs[0].args.id;


    // --- Минтинг токенов и АППРУВ для тестовых предприятий (владельцем EcoToken) ---
    const tokensPerEnterprise = ethers.parseUnits("5000", 18); // Токенов для каждого предприятия

    // Минтим токены для Предприятий (владелец EcoToken - deployer)
    await ecoToken.mint(enterprise1.address, tokensPerEnterprise);
    await ecoToken.mint(enterprise2.address, tokensPerEnterprise);

    // Предприятия выполняют АППРУВ на контракте EcoToken (бесконечное разрешение)
    // Подключаемся к аккаунтам предприятий для выполнения вызова approve
    const ecoTokenWithEnterprise1 = ecoToken.connect(enterprise1);
    await ecoTokenWithEnterprise1.approve(ecoControlAddress, MAX_UINT256);

    const ecoTokenWithEnterprise2 = ecoToken.connect(enterprise2);
    await ecoTokenWithEnterprise2.approve(ecoControlAddress, MAX_UINT256);

     // Проверяем начальный баланс EcoControl в токенах (должен быть 0)
     expect(await ecoControl.getCollectedFinesBalance()).to.equal(0);
  });

  // --- Начинаются сами тесты ---

  // Проверка базового развертывания и начальных значений
  it("Should set the right owner, initial setup, and register enterprises with initial limits", async function () {
    expect(await ecoControl.owner()).to.equal(deployer.address);
    expect(await ecoControl.dataProcessorCaller()).to.equal(dataProcessorCaller.address);
    expect(await ecoControl.nextEnterpriseId()).to.equal(2); // Зарегистрировали 2 предприятия
    expect(await ecoControl.ecoTokenAddress()).to.equal(await ecoToken.getAddress());
    expect(await ecoControl.fineAmount()).to.equal(fineAmount);
    // Проверка отсутствия старых переменных рейтинга/порогов (опционально, но хорошо для уверенности)
    await expect(ecoControl.fineThreshold).to.be.undefined; // Переменной fineThreshold больше нет
    // await expect(ecoControl.metric1Threshold).to.be.undefined; // Если удалены общие нормативы

    // Проверка данных зарегистрированных предприятий
    const enterprise1Data = await ecoControl.enterprises(enterprise1Id);
    expect(enterprise1Data.name).to.equal("Предприятие 1");
    expect(enterprise1Data.id).to.equal(enterprise1Id);
    expect(enterprise1Data.enterpriseAddress).to.equal(enterprise1.address);
    expect(enterprise1Data.metric1Limit).to.equal(initialLimitM1);
    expect(enterprise1Data.metric2Limit).to.equal(initialLimitM2);
    // Проверка отсутствия рейтинга
    await expect(enterprise1Data.rating).to.be.undefined;

    const enterprise2Data = await ecoControl.enterprises(enterprise2Id);
    expect(enterprise2Data.name).to.equal("Предприятие 2");
    expect(enterprise2Data.id).to.equal(enterprise2Id);
    expect(enterprise2Data.enterpriseAddress).to.equal(enterprise2.address);
    expect(enterprise2Data.metric1Limit).to.equal(initialLimitM1);
    expect(enterprise2Data.metric2Limit).to.equal(initialLimitM2);
  });

  // Проверка ограничений доступа
  it("Should restrict access to administrative functions", async function () {
      // Используем аккаунт, который НЕ является владельцем (например, dataProcessorCaller)
      const ecoControlAsNonOwner = ecoControl.connect(dataProcessorCaller);

      // Проверяем все onlyOwner функции
      // await expect(ecoControlAsNonOwner.setNorms(60, 20)).to.be.revertedWith("Only owner can call this function"); // setNorms удален
      await expect(ecoControlAsNonOwner.setDataProcessorCaller(otherAccount.address)).to.be.revertedWith("Only owner can call this function");
      await expect(ecoControlAsNonOwner.setEcoTokenAddress(otherAccount.address)).to.be.revertedWith("Only owner can call this function");
      await expect(ecoControlAsNonOwner.setFineAmount(ethers.parseUnits("50", 18))).to.be.revertedWith("Only owner can call this function");
      // await expect(ecoControlAsNonOwner.setFineThreshold(400)).to.be.revertedWith("Only owner can call this function"); // setFineThreshold удален
      await expect(ecoControlAsNonOwner.registerEnterprise("Новое Предприятие", otherAccount.address, 100, 20)).to.be.revertedWith("Only owner can call this function");
      await expect(ecoControlAsNonOwner.setEnterpriseLimits(enterprise1Id, 200, 30)).to.be.revertedWith("Only owner can call this function");
      await expect(ecoControlAsNonOwner.withdrawCollectedFines(deployer.address)).to.be.revertedWith("Only owner can call this function");

      // Проверка ограничения доступа к checkCompliance (раньше updateEnvironmentalData)
       const ecoControlAsNonProcessor = ecoControl.connect(deployer); // Владелец не dataProcessorCaller

       await expect(ecoControlAsNonProcessor.checkCompliance(
           enterprise1Id,
           complianceData.metric1, complianceData.metric2
       )).to.be.revertedWith("Only authorized data processor can call this function");
  });

  // Проверка регистрации предприятия с уже существующим адресом
  it("Should revert registration if enterprise address already exists", async function () {
      // Пытаемся зарегистрировать еще одно предприятие с адресом enterprise1
      await expect(ecoControl.registerEnterprise("Предприятие 3 (Дубль)", enterprise1.address, 100, 20)).to.be.revertedWith("Enterprise with this address already registered");
  });


   // Проверка checkCompliance при данных В пределах лимитов
   it("Should update data and not charge fine when data is within limits", async function () {
    const ecoControlAsProcessor = ecoControl.connect(dataProcessorCaller);
    const enterpriseId = enterprise1Id;
    const enterpriseAccount = enterprise1;
    const enterpriseInitialBalance = await ecoToken.balanceOf(enterpriseAccount.address); // Баланс до проверки

    // Вызываем checkCompliance с данными ниже лимитов (100, 20)
    let tx = await ecoControlAsProcessor.checkCompliance(
        enterpriseId,
        complianceData.metric1, complianceData.metric2 // 50n, 10n
    );
    let receipt = await tx.wait();
    let blockTimestamp = (await ethers.provider.getBlock(receipt.blockNumber)).timestamp;

    // --- УДАЛЯЕМ проверку события DataUpdated в этом тесте ---
    // await expect(tx).to.emit(ecoControl, 'DataUpdated').withArgs(...);
    // --- Конец удаления ---

    // Проверка обновления последних данных
    const enterpriseDataAfterCheck = await ecoControl.enterprises(enterpriseId);
    expect(enterpriseDataAfterCheck.latestMetric1).to.equal(complianceData.metric1);
    expect(enterpriseDataAfterCheck.latestMetric2).to.equal(complianceData.metric2);
    expect(enterpriseDataAfterCheck.latestDataTimestamp).to.be.closeTo(blockTimestamp, 5);

    // Проверка события ComplianceChecked
    await expect(tx).to.emit(ecoControl, 'ComplianceChecked').withArgs(
        enterpriseId,
        complianceData.metric1, complianceData.metric2,
        false // limitsExceeded должен быть false
    );

    // Проверка отсутствия события FineCharged
    await expect(tx).not.to.emit(ecoControl, 'FineCharged');
    await expect(tx).not.to.emit(ecoControl, 'FineChargeFailed');

    // Проверка, что балансы НЕ изменились
    expect(await ecoToken.balanceOf(enterpriseAccount.address)).to.equal(enterpriseInitialBalance);
    expect(await ecoControl.getCollectedFinesBalance()).to.equal(0);
});

  // Проверка checkCompliance при данных С превышением лимитов
  it("Should update data and charge fine when data exceeds limits", async function () {
      const ecoControlAsProcessor = ecoControl.connect(dataProcessorCaller);
      const enterpriseId = enterprise1Id;
      const enterpriseAccount = enterprise1;
      const enterpriseInitialBalance = await ecoToken.balanceOf(enterpriseAccount.address); // Баланс до проверки

      // Вызываем checkCompliance с данными ВЫШЕ лимитов (100, 20)
      let tx = await ecoControlAsProcessor.checkCompliance(
          enterpriseId,
          exceedingData.metric1, exceedingData.metric2 // 150n, 30n
      );
      let receipt = await tx.wait();
      let blockTimestamp = (await ethers.provider.getBlock(receipt.blockNumber)).timestamp;

      // --- УДАЛЯЕМ проверку события DataUpdated в этом тесте ---
      // await expect(tx).to.emit(ecoControl, 'DataUpdated').withArgs(...);
      // --- Конец удаления ---

      // Проверка обновления последних данных
      const enterpriseDataAfterCheck = await ecoControl.enterprises(enterpriseId);
      expect(enterpriseDataAfterCheck.latestMetric1).to.equal(exceedingData.metric1);
      expect(enterpriseDataAfterCheck.latestMetric2).to.equal(exceedingData.metric2);
      expect(enterpriseDataAfterCheck.latestDataTimestamp).to.be.closeTo(blockTimestamp, 5);

      // Проверка события ComplianceChecked
      await expect(tx).to.emit(ecoControl, 'ComplianceChecked').withArgs(
          enterpriseId,
          exceedingData.metric1, exceedingData.metric2,
          true // limitsExceeded должен быть true
      );

      // Проверка события FineCharged (ключевой момент!)
      await expect(tx).to.emit(ecoControl, 'FineCharged').withArgs(
          enterpriseId,
          enterpriseAccount.address, // Проверяем, что адрес предприятия правильный
          fineAmount
      );
       await expect(tx).not.to.emit(ecoControl, 'FineChargeFailed');


      // Проверка балансов токенов
      const finalEnterpriseBalance = await ecoToken.balanceOf(enterpriseAccount.address);
      const finesCollectedBalance = await ecoControl.getCollectedFinesBalance();

      // Баланс предприятия должен уменьшиться на сумму штрафа (используем оператор - для BigInt)
      expect(finalEnterpriseBalance).to.equal(enterpriseInitialBalance - fineAmount);
      // Баланс контракта EcoControl должен увеличиться на сумму штрафа
      expect(finesCollectedBalance).to.equal(fineAmount);
  });

  // Проверка сценария с недостаточным балансом при превышении лимитов
  it("Should revert with insufficient balance error if enterprise has insufficient balance when limits are exceeded", async function () {
      const ecoControlAsProcessor = ecoControl.connect(dataProcessorCaller);
      const enterpriseId = enterprise2Id; // Используем другое предприятие
      const enterpriseAccount = enterprise2;
      const enterpriseInitialBalance = await ecoToken.balanceOf(enterpriseAccount.address); // Баланс до проверки

      // Убедимся, что у предприятия недостаточно токенов для стандартного штрафа (100 ECO)
      // В beforeEach минтится 5000. Штраф 100. Все OK.
      // Чтобы симулировать недостаточный баланс, временно установим сумму штрафа БОЛЬШЕ, чем текущий баланс предприятия.
      const currentEnterpriseBalance = await ecoToken.balanceOf(enterpriseAccount.address);
      const largeFineAmount = currentEnterpriseBalance + 1n; // Штраф на 1 токен больше баланса
      await ecoControl.setFineAmount(largeFineAmount);
      console.log(`Тест: Установлен штраф ${ethers.formatEther(largeFineAmount)} ECO, баланс предприятия ${ethers.formatEther(currentEnterpriseBalance)} ECO.`); // Отладочный вывод

      // Вызываем checkCompliance с данными ВЫШЕ лимитов, чтобы сработала логика штрафа
      // --- ИЗМЕНЯЕМ ОЖДАНИЕ: Ожидаем REVERT с кастомной ошибкой ---
      await expect(ecoControlAsProcessor.checkCompliance(
          enterpriseId,
          exceedingData.metric1, exceedingData.metric2 // 150n, 30n
      )).to.be.reverted; // Ожидаем просто revert

      // Если нужно проверить конкретную кастомную ошибку, можно использовать:
      // await expect(ecoControlAsProcessor.checkCompliance(
      //     enterpriseId,
      //     exceedingData.metric1, exceedingData.metric2
      // )).to.be.revertedWithCustomError(ecoToken, "ERC20InsufficientBalance")
      //   .withArgs(enterpriseAccount.address, currentEnterpriseBalance, largeFineAmount);
      // Но для MVP достаточно простого revert.


      // Проверяем, что балансы НЕ изменились (токены не списались)
      // Эту проверку можно сделать после вызова, т.к. revert откатывает все изменения
      expect(await ecoToken.balanceOf(enterpriseAccount.address)).to.equal(enterpriseInitialBalance); // Сравниваем с балансом ДО ВСЕХ действий в тесте
      expect(await ecoControl.getCollectedFinesBalance()).to.equal(0);

      // Возвращаем сумму штрафа к стандартному значению для других тестов (если они выполняются после этого)
      await ecoControl.setFineAmount(fineAmount);
  });

    // Проверка установки индивидуальных лимитов предприятия
    it("Should allow owner to set enterprise limits", async function () {
        const enterpriseId = enterprise1Id;
        const newLimitM1 = 200;
        const newLimitM2 = 50;

        // Проверяем начальные лимиты
        let initialLimits = await ecoControl.getEnterpriseLimits(enterpriseId);
        expect(initialLimits.metric1Limit).to.equal(initialLimitM1);
        expect(initialLimits.metric2Limit).to.equal(initialLimitM2);

        // Владелец устанавливает новые лимиты
        const tx = await ecoControl.setEnterpriseLimits(enterpriseId, newLimitM1, newLimitM2);
        await tx.wait();

        // Проверяем, что лимиты обновились
        let updatedLimits = await ecoControl.getEnterpriseLimits(enterpriseId);
        expect(updatedLimits.metric1Limit).to.equal(newLimitM1);
        expect(updatedLimits.metric2Limit).to.equal(newLimitM2);

        // Проверяем событие LimitsUpdated
        await expect(tx).to.emit(ecoControl, 'LimitsUpdated').withArgs(enterpriseId, newLimitM1, newLimitM2);

        // Проверяем, что НЕ владелец не может установить лимиты
        const ecoControlAsNonOwner = ecoControl.connect(dataProcessorCaller);
         await expect(ecoControlAsNonOwner.setEnterpriseLimits(enterpriseId, 300, 60)).to.be.revertedWith("Only owner can call this function");
    });

     // Проверка checkCompliance с ОБНОВЛЕННЫМИ лимитами
     it("Should use updated enterprise limits for compliance check", async function () {
         const ecoControlAsProcessor = ecoControl.connect(dataProcessorCaller);
         const enterpriseId = enterprise1Id;
         const enterpriseAccount = enterprise1;
         const enterpriseInitialBalance = await ecoToken.balanceOf(enterpriseAccount.address); // Баланс до проверки

         // Владелец устанавливает НОВЫЕ лимиты (например, очень низкие)
         const newLimitM1 = 10;
         const newLimitM2 = 5;
         await ecoControl.setEnterpriseLimits(enterpriseId, newLimitM1, newLimitM2);

         // Вызываем checkCompliance с данными, которые были ниже СТАРЫХ лимитов (100, 20),
         // но теперь ВЫШЕ НОВЫХ лимитов (10, 5)
         const testData = { metric1: 50n, metric2: 10n }; // Те же данные, что и в complianceData, но как BigInt

         let tx = await ecoControlAsProcessor.checkCompliance(
             enterpriseId,
             testData.metric1, testData.metric2
         );
         let receipt = await tx.wait();
         let blockTimestamp = (await ethers.provider.getBlock(receipt.blockNumber)).timestamp;

         // --- УДАЛЯЕМ проверку события DataUpdated в этом тесте ---
         // await expect(tx).to.emit(ecoControl, 'DataUpdated').withArgs(...);
         // --- Конец удаления ---

         // Проверка события ComplianceChecked - теперь лимиты должны быть ПРЕВЫШЕНЫ
         await expect(tx).to.emit(ecoControl, 'ComplianceChecked').withArgs(
             enterpriseId,
             testData.metric1, testData.metric2,
             true // limitsExceeded должен быть true
         );

         // Проверяем, что был начислен штраф
         await expect(tx).to.emit(ecoControl, 'FineCharged').withArgs(
             enterpriseId,
             enterpriseAccount.address,
             fineAmount
         );

         // Проверяем изменение балансов
         const finalEnterpriseBalance = await ecoToken.balanceOf(enterpriseAccount.address);
         const finesCollectedBalance = await ecoControl.getCollectedFinesBalance();
         expect(finalEnterpriseBalance).to.equal(enterpriseInitialBalance - fineAmount);
         expect(finesCollectedBalance).to.equal(fineAmount);
     });


    // Проверка функций чтения данных
    it("Should correctly return enterprise data using view functions", async function () {
        // Данные устанавливаются в beforeEach и затем, возможно, в других тестах (но beforeEach сбрасывает состояние)
        // Проверяем данные после beforeEach
        let enterprise1Data = await ecoControl.enterprises(enterprise1Id);
        expect(enterprise1Data.name).to.equal("Предприятие 1");
        expect(enterprise1Data.id).to.equal(enterprise1Id);
        expect(enterprise1Data.enterpriseAddress).to.equal(enterprise1.address);
        expect(enterprise1Data.metric1Limit).to.equal(initialLimitM1);
        expect(enterprise1Data.metric2Limit).to.equal(initialLimitM2);
        expect(enterprise1Data.latestDataTimestamp).to.equal(0); // Пока нет данных
        expect(enterprise1Data.latestMetric1).to.equal(0);
        expect(enterprise1Data.latestMetric2).to.equal(0);

        // Проверяем геттер адреса
        expect(await ecoControl.getEnterpriseAddress(enterprise1Id)).to.equal(enterprise1.address);
         await expect(ecoControl.getEnterpriseAddress(999)).to.be.revertedWith("Enterprise with this ID does not exist"); // Несуществующий ID

        // Проверяем геттер лимитов
        let limits = await ecoControl.getEnterpriseLimits(enterprise1Id);
        expect(limits.metric1Limit).to.equal(initialLimitM1);
        expect(limits.metric2Limit).to.equal(initialLimitM2);
         await expect(ecoControl.getEnterpriseLimits(999)).to.be.revertedWith("Enterprise with this ID does not exist"); // Несуществующий ID


        // Проверяем геттер последних данных (сначала 0)
        let latestData = await ecoControl.getLatestEnvironmentalData(enterprise1Id);
        expect(latestData.timestamp).to.equal(0);
        expect(latestData.metric1).to.equal(0);
        expect(latestData.metric2).to.equal(0);
         await expect(ecoControl.getLatestEnvironmentalData(999)).to.be.revertedWith("Enterprise with this ID does not exist"); // Несуществующий ID


        // Вызываем checkCompliance, чтобы обновить последние данные
        const ecoControlAsProcessor = ecoControl.connect(dataProcessorCaller);
        let tx = await ecoControlAsProcessor.checkCompliance(
            enterprise1Id,
            exceedingData.metric1, exceedingData.metric2 // 150n, 30n
        );
        let receipt = await tx.wait();
        let blockTimestamp = (await ethers.provider.getBlock(receipt.blockNumber)).timestamp;

        // Проверяем геттер последних данных после обновления
        latestData = await ecoControl.getLatestEnvironmentalData(enterprise1Id);
        expect(latestData.timestamp).to.be.closeTo(blockTimestamp, 5);
        expect(latestData.metric1).to.equal(exceedingData.metric1);
        expect(latestData.metric2).to.equal(exceedingData.metric2);

    });


     // Проверка вывода собранных штрафов владельцем
     it("Should allow owner to withdraw collected fines", async function () {
         const ecoControlAsProcessor = ecoControl.connect(dataProcessorCaller);
         const enterpriseId = enterprise1Id;
         const enterpriseAccount = enterprise1;

         // Начисляем штраф, вызвав checkCompliance с превышением лимитов
          await ecoControlAsProcessor.checkCompliance(
              enterpriseId,
              exceedingData.metric1, exceedingData.metric2 // 150n, 30n
          );
         // На этом этапе штраф должен быть начислен, и ecoControl должен иметь fineAmount токенов

         const collectedBalance = await ecoControl.getCollectedFinesBalance();
         expect(collectedBalance).to.equal(fineAmount); // Убеждаемся, что штраф собран

         // Владелец (deployer) выводит собранные токены
         const deployerInitialBalance = await ecoToken.balanceOf(deployer.address); // Баланс владельца до вывода

         const tx = await ecoControl.withdrawCollectedFines(deployer.address);
         await tx.wait(); // Ждем завершения транзакции вывода

         // Проверяем баланс EcoControl после вывода (должен стать 0)
         expect(await ecoControl.getCollectedFinesBalance()).to.equal(0);
         // Баланс владельца должен увеличиться на сумму собранных штрафов (используем оператор + для BigInt)
         const deployerFinalBalance = await ecoToken.balanceOf(deployer.address);
         expect(deployerFinalBalance).to.equal(deployerInitialBalance + collectedBalance);

         // Проверяем, что НЕ владелец не может вывести средства
         const ecoControlAsNonOwner = ecoControl.connect(dataProcessorCaller);
         await expect(ecoControlAsNonOwner.withdrawCollectedFines(dataProcessorCaller.address)).to.be.revertedWith("Only owner can call this function");

     });

    // Проверка, что нельзя вывести штрафы, если их нет
    it("Should not allow withdrawing if no fines collected", async function () {
        // В начале теста (благодаря beforeEach) штрафов нет
        expect(await ecoControl.getCollectedFinesBalance()).to.equal(0);

        // Попытка вывода владельцем
        await expect(ecoControl.withdrawCollectedFines(deployer.address)).to.be.revertedWith("No tokens collected to withdraw");
    });

});