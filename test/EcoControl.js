// Импортируем ethers и expect из Hardhat
const { ethers } = require("hardhat");
const { expect } = require("chai");

// Импортируем константу максимального uint256 для бесконечного аппрува (для BigInt в ethers v6+)
const MAX_UINT256 = ethers.MaxUint256;

// Объявляем переменные, которые будут доступны во всех тестах
let EcoToken, ecoToken, EcoControl, ecoControl;
let deployer, dataSourceCaller, enterprise1, enterprise2; // Аккаунты
let enterprise1Id, enterprise2Id; // ID предприятий
const fineAmount = ethers.parseUnits("100", 18); // Сумма штрафа в токенах (100 ECO)
const fineThreshold = 300; // Порог рейтинга для штрафа
const ratingDecrease = 10; // Насколько падает рейтинг при превышении нормы

// Блок describe группирует тесты для контракта EcoControl
describe("EcoControl", function () {

  // Блок beforeEach выполняется перед каждым тестом
  beforeEach(async function () {
    // Получаем тестовые аккаунты
    [deployer, dataSourceCaller, enterprise1, enterprise2] = await ethers.getSigners();

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

    // --- Настройка EcoControl ---
    // Устанавливаем адрес токена, источник данных, сумму штрафа и порог
    await ecoControl.setEcoTokenAddress(ecoTokenAddress);
    await ecoControl.setDataSourceCaller(dataSourceCaller.address);
    await ecoControl.setFineAmount(fineAmount);
    await ecoControl.setFineThreshold(fineThreshold);

    // --- Регистрация тестовых предприятий ---
    // Регистрируем предприятие 1
    let tx1 = await ecoControl.registerEnterprise("Предприятие 1", enterprise1.address);
    let receipt1 = await tx1.wait();
    // Ищем событие EnterpriseRegistered, чтобы получить enterpriseId
    // Hardhat Network мгновенно завершает транзакции, так что receipt будет доступен
    // Используем logs[0] для простоты, т.к. это первое событие в транзакции регистрации
    enterprise1Id = receipt1.logs[0].args.id;

    // Регистрируем предприятие 2
    let tx2 = await ecoControl.registerEnterprise("Предприятие 2", enterprise2.address);
    let receipt2 = await tx2.wait();
     enterprise2Id = receipt2.logs[0].args.id;


    // --- Минтинг токенов и АППРУВ для тестовых предприятий ---
    const tokensPerEnterprise = ethers.parseUnits("5000", 18); // Токенов для каждого предприятия

    // Минтим токены для Предприятия 1 (владелец EcoToken - deployer)
    await ecoToken.mint(enterprise1.address, tokensPerEnterprise);
    // Минтим токены для Предприятия 2
    await ecoToken.mint(enterprise2.address, tokensPerEnterprise);

    // Предприятие 1 выполняет АППРУВ на контракте EcoToken
    // Подключаемся к аккаунту предприятия 1 для выполнения вызова
    const ecoTokenWithEnterprise1 = ecoToken.connect(enterprise1);
    // Разрешаем контракту EcoControl тратить токены enterprise1 (бесконечное разрешение)
    await ecoTokenWithEnterprise1.approve(ecoControlAddress, MAX_UINT256);

    // Предприятие 2 выполняет АППРУВ на контракте EcoToken
     const ecoTokenWithEnterprise2 = ecoToken.connect(enterprise2);
     await ecoTokenWithEnterprise2.approve(ecoControlAddress, MAX_UINT256);

     // Проверяем начальный баланс EcoControl в токенах (должен быть 0)
     expect(await ecoControl.getCollectedFinesBalance()).to.equal(0);
  });

  // --- Начинаются сами тесты ---

  // Проверка базового развертывания и начальных значений
  it("Should set the right owner and initial values", async function () {
    expect(await ecoControl.owner()).to.equal(deployer.address);
    expect(await ecoControl.dataSourceCaller()).to.equal(dataSourceCaller.address);
    expect(await ecoControl.metric1Threshold()).to.equal(50);
    expect(await ecoControl.metric2Threshold()).to.equal(10);
    expect(await ecoControl.nextEnterpriseId()).to.equal(2); // Зарегистрировали 2 предприятия
    expect(await ecoControl.ecoTokenAddress()).to.equal(await ecoToken.getAddress());
    expect(await ecoControl.fineAmount()).to.equal(fineAmount);
    expect(await ecoControl.fineThreshold()).to.equal(fineThreshold);

    // Проверка начального рейтинга предприятий
    const enterprise1Data = await ecoControl.enterprises(enterprise1Id);
    expect(enterprise1Data.name).to.equal("Предприятие 1");
    expect(enterprise1Data.rating).to.equal(500);

     const enterprise2Data = await ecoControl.enterprises(enterprise2Id);
    expect(enterprise2Data.name).to.equal("Предприятие 2");
    expect(enterprise2Data.rating).to.equal(500);
  });

  // Проверка ограничений доступа
  it("Should restrict access to administrative functions", async function () {
      // Используем аккаунт, который НЕ является владельцем (например, dataSourceCaller)
      const ecoControlAsNonOwner = ecoControl.connect(dataSourceCaller);

      // Проверяем все onlyOwner функции
      await expect(ecoControlAsNonOwner.setNorms(60, 20)).to.be.revertedWith("Only owner can call this function");
      await expect(ecoControlAsNonOwner.setDataSourceCaller(otherAccounts[0].address)).to.be.revertedWith("Only owner can call this function");
      await expect(ecoControlAsNonOwner.setEcoTokenAddress(otherAccounts[0].address)).to.be.revertedWith("Only owner can call this function");
      await expect(ecoControlAsNonOwner.setFineAmount(ethers.parseUnits("50", 18))).to.be.revertedWith("Only owner can call this function");
      await expect(ecoControlAsNonOwner.setFineThreshold(400)).to.be.revertedWith("Only owner can call this function");
      // Проверка registerEnterprise requires enterprise address
      await expect(ecoControlAsNonOwner.registerEnterprise("Новое Предприятие", otherAccounts[0].address)).to.be.revertedWith("Only owner can call this function");
      await expect(ecoControlAsNonOwner.withdrawCollectedFines(deployer.address)).to.be.revertedWith("Only owner can call this function");

      // Проверка ограничения доступа к updateEnvironmentalData
       const ecoControlAsNonDataSource = ecoControl.connect(deployer); // Владелец не dataSourceCaller

       await expect(ecoControlAsNonDataSource.updateEnvironmentalData(
           enterprise1Id,
           enterprise1.address,
           40, 5
       )).to.be.revertedWith("Only authorized data source can call this function");
  });

  // Проверка обновления данных и изменения рейтинга
  it("Should update data and adjust rating correctly (compliance and simple decrease/increase)", async function () {
      const ecoControlAsDataSource = ecoControl.connect(dataSourceCaller);
      const enterpriseId = enterprise1Id;
      const enterpriseAddress = enterprise1.address;
      const initialRating = 500;

      // 1. Данные В пределах нормы (Metric1=40 < 50, Metric2=5 < 10)
      let tx1 = await ecoControlAsDataSource.updateEnvironmentalData(
          enterpriseId,
          enterpriseAddress,
          40, 5
      );
      let receipt1 = await tx1.wait();
      let blockTimestamp1 = (await ethers.provider.getBlock(receipt1.blockNumber)).timestamp;

      // Проверка обновления данных
      let enterpriseDataAfterCompliance = await ecoControl.enterprises(enterpriseId);
      expect(enterpriseDataAfterCompliance.latestMetric1).to.equal(40);
      expect(enterpriseDataAfterCompliance.latestMetric2).to.equal(5);
      expect(enterpriseDataAfterCompliance.latestDataTimestamp).to.be.closeTo(blockTimestamp1, 5);

      // Проверка изменения рейтинга (должен увеличиться на 5)
      expect(enterpriseDataAfterCompliance.rating).to.equal(initialRating + 5);
      // Проверка события RatingChanged
      expect(tx1).to.emit(ecoControl, 'RatingChanged').withArgs(enterpriseId, initialRating, initialRating + 5);
      // Проверка события DataUpdated
      expect(tx1).to.emit(ecoControl, 'DataUpdated').withArgs(enterpriseId, 40, 5, blockTimestamp1);
      // Проверка отсутствия события FineCharged
      await expect(tx1).not.to.emit(ecoControl, 'FineCharged');

      // 2. Данные С превышением нормы (Metric1=60 > 50, Metric2=15 > 10), но рейтинг НЕ ниже порога штрафа (505 -> 495)
      let tx2 = await ecoControlAsDataSource.updateEnvironmentalData(
        enterpriseId,
        enterpriseAddress,
        60, 15
      );
      let receipt2 = await tx2.wait();
      let blockTimestamp2 = (await ethers.provider.getBlock(receipt2.blockNumber)).timestamp;

      // Проверка обновления данных
      let enterpriseDataAfterExceed = await ecoControl.enterprises(enterpriseId);
      expect(enterpriseDataAfterExceed.latestMetric1).to.equal(60);
      expect(enterpriseDataAfterExceed.latestMetric2).to.equal(15);
      expect(enterpriseDataAfterExceed.latestDataTimestamp).to.be.closeTo(blockTimestamp2, 5);

      // Проверка изменения рейтинга (должен уменьшиться на 10)
      expect(enterpriseDataAfterExceed.rating).to.equal(initialRating + 5 - 10); // 495
      // Проверка события RatingChanged
      expect(tx2).to.emit(ecoControl, 'RatingChanged').withArgs(enterpriseId, initialRating + 5, initialRating + 5 - 10);
      // Проверка события DataUpdated
      expect(tx2).to.emit(ecoControl, 'DataUpdated').withArgs(enterpriseId, 60, 15, blockTimestamp2);
      // Проверка отсутствия события FineCharged
      await expect(tx2).not.to.emit(ecoControl, 'FineCharged');

      // 3. Обновление данных снова в пределах нормы (495 -> 500)
      let tx3 = await ecoControlAsDataSource.updateEnvironmentalData(
          enterpriseId,
          enterpriseAddress,
          40, 5
      );
      let receipt3 = await tx3.wait();
      let enterpriseDataAfterCompliance2 = await ecoControl.enterprises(enterpriseId);
       expect(enterpriseDataAfterCompliance2.rating).to.equal(495 + 5); // 500
        expect(tx3).to.emit(ecoControl, 'RatingChanged').withArgs(enterpriseId, 495, 500);
         await expect(tx3).not.to.emit(ecoControl, 'FineCharged');

  });

    // Проверка понижения рейтинга и начисления штрафа при пересечении порога
    it("Should decrease rating and charge fine when norms exceeded and threshold crossed downwards", async function () {
        const ecoControlAsDataSource = ecoControl.connect(dataSourceCaller);
        const enterpriseId = enterprise1Id;
        const enterpriseAccount = enterprise1;
        const initialRating = 500; // Начальный рейтинг
        const enterpriseInitialBalance = await ecoToken.balanceOf(enterpriseAccount.address); // Начальный баланс предприятия

        // Цель: заставить рейтинг упасть с >= fineThreshold (300) до < fineThreshold (300)
        // Начальный рейтинг 500. Порог 300. Нужно снизить на 201 балл или больше.
        // Каждое превышение нормы снижает рейтинг на 10. Нужно минимум 21 превышение.
        // Выполним 20 превышений - рейтинг станет 300.
        for (let i = 0; i < 20; i++) {
             await ecoControlAsDataSource.updateEnvironmentalData(
                 enterpriseId,
                 enterpriseAccount.address,
                 100, // > нормы 50
                 100  // > нормы 10
             );
              // После каждого вызова рейтинг падает на 10. Штраф еще не начисляется.
        }
        let enterpriseDataAfter20Violations = await ecoControl.enterprises(enterpriseId);
        expect(enterpriseDataAfter20Violations.rating).to.equal(initialRating - (20 * ratingDecrease)); // 500 - 200 = 300
        // Убедимся, что штраф не был начислен (можно было бы проверить последнее событие)
        // Для простоты, полагаемся на проверку на следующем шаге

        // Выполняем 21-е превышение - рейтинг упадет с 300 до 290.
        // Это должно триггернуть штраф.
        const ratingBeforeCrossing = enterpriseDataAfter20Violations.rating; // Должно быть 300
        let txCrossing = await ecoControlAsDataSource.updateEnvironmentalData(
             enterpriseId,
             enterpriseAccount.address,
             101, // > нормы 50
             101  // > нормы 10
        );
        let receiptCrossing = await txCrossing.wait();
        let ratingAfterCrossing = await ecoControl.enterprises(enterpriseId);
        expect(ratingAfterCrossing.rating).to.equal(ratingBeforeCrossing - ratingDecrease); // 300 - 10 = 290

        // Проверяем событие RatingChanged при пересечении
        await expect(txCrossing).to.emit(ecoControl, 'RatingChanged').withArgs(enterpriseId, ratingBeforeCrossing, ratingAfterCrossing.rating);

        // Проверка события FineCharged (ключевой момент!)
        await expect(txCrossing).to.emit(ecoControl, 'FineCharged').withArgs(enterpriseId, enterpriseAccount.address, fineAmount);

        // Проверка балансов токенов после штрафа
        const finalEnterpriseBalance = await ecoToken.balanceOf(enterpriseAccount.address);
        const finesCollectedBalance = await ecoControl.getCollectedFinesBalance();

        // Баланс предприятия должен уменьшиться на сумму штрафа (используем оператор - для BigInt)
        expect(finalEnterpriseBalance).to.equal(enterpriseInitialBalance - fineAmount);
        // Баланс контракта EcoControl должен увеличиться на сумму штрафа
        expect(finesCollectedBalance).to.equal(fineAmount);
    });

    // Проверка, что штраф НЕ начисляется, если рейтинг УЖЕ ниже порога
    it("Should not charge fine if rating is already below threshold", async function () {
        const ecoControlAsDataSource = ecoControl.connect(dataSourceCaller);
        const enterpriseId = enterprise2Id; // Используем другое предприятие
        const enterpriseAccount = enterprise2;
        const initialRating = 500;

         // Цель: заставить рейтинг упасть НИЖЕ порога (300), но не проверять штраф на этом шаге
         // Выполним 21 превышение, чтобы рейтинг упал с 500 до 290
         for (let i = 0; i < 21; i++) {
              await ecoControlAsDataSource.updateEnvironmentalData(
                  enterpriseId,
                  enterpriseAccount.address,
                  200, // > нормы
                  200  // > нормы
              );
         }
        let enterpriseDataAfter21Violations = await ecoControl.enterprises(enterpriseId);
        const ratingAfter21Violations = enterpriseDataAfter21Violations.rating;
        expect(ratingAfter21Violations).to.equal(initialRating - (21 * ratingDecrease)); // 500 - 210 = 290
        expect(ratingAfter21Violations).to.be.lt(fineThreshold); // Убеждаемся, что он ниже порога

        // Теперь выполняем еще одно обновление данных с превышением нормы
        // Рейтинг упадет дальше (290 -> 280), но штраф НЕ должен начисляться,
        // потому что рейтинг УЖЕ ниже порога (oldRating = 290, newRating = 280, fineThreshold = 300.
        // Условие newRating < fineThreshold && oldRating >= fineThreshold => 280 < 300 && 290 >= 300 => true && false => false)
        let txAfterThreshold = await ecoControlAsDataSource.updateEnvironmentalData(
             enterpriseId,
             enterpriseAccount.address,
             201, // > нормы
             201  // > нормы
         );
        let receiptAfterThreshold = await txAfterThreshold.wait();

        let enterpriseDataAfter22Violations = await ecoControl.enterprises(enterpriseId);
        expect(enterpriseDataAfter22Violations.rating).to.equal(ratingAfter21Violations - ratingDecrease); // 290 - 10 = 280

         // Проверяем, что событие FineCharged НЕ начислено при этом обновлении
         await expect(txAfterThreshold).not.to.emit(ecoControl, 'FineCharged');

         // Можно также проверить, что событие FineChargeFailed тоже не начислено
         await expect(txAfterThreshold).not.to.emit(ecoControl, 'FineChargeFailed');
    });


    // Проверка сценария с недостаточным балансом (важный негативный тест)
    it("Should emit FineChargeFailed if enterprise has insufficient balance when fine is due", async function () {
        const ecoControlAsDataSource = ecoControl.connect(dataSourceCaller);
        const enterpriseId = enterprise1Id;
        const enterpriseAccount = enterprise1;
        const initialRating = 500;
        const enterpriseInitialBalance = await ecoToken.balanceOf(enterpriseAccount.address); // Баланс предприятия до любых действий в этом тесте

        // Убедимся, что у предприятия недостаточно токенов для стандартного штрафа (100 ECO)
        // В beforeEach минтится 5000 ECO. Штраф 100 ECO.
        // Чтобы симулировать недостаточный баланс, временно установим сумму штрафа БОЛЬШЕ, чем текущий баланс предприятия.
        const currentEnterpriseBalance = await ecoToken.balanceOf(enterpriseAccount.address);
        const largeFineAmount = currentEnterpriseBalance + 1n; // Штраф на 1 токен больше баланса
        await ecoControl.setFineAmount(largeFineAmount);
        // console.log(`Тест: Установлен штраф ${largeFineAmount} больше баланса предприятия ${currentEnterpriseBalance}.`); // Отладочный вывод

        // Цель: заставить рейтинг упасть с >= fineThreshold (300) до < fineThreshold (300)
        // Выполним 21 превышение, чтобы рейтинг упал с 500 до 290
        // При этом будет попытка списать большой штраф.
         for (let i = 0; i < 21; i++) {
              await ecoControlAsDataSource.updateEnvironmentalData(
                  enterpriseId,
                  enterpriseAccount.address,
                  300, // > нормы
                  300  // > нормы
              );
              // В каждом вызове rating падает на 10.
              // На 21-м вызове рейтинг упадет до 290.
              // В этот момент (на 21-м вызове) контракт попытается списать штраф.
              // Поскольку баланс недостаточен для largeFineAmount, transferFrom вернет false.
              // Контракт должен эмитить FineChargeFailed.
              // Мы можем проверить это на последней транзакции цикла.
              if (i === 20) { // Проверяем 21-ю (i=20) транзакцию
                  let tx = await ecoControlAsDataSource.updateEnvironmentalData( // Выполняем последний вызов отдельно для получения tx
                      enterpriseId,
                      enterpriseAccount.address,
                      301,
                      301
                  );
                   let receipt = await tx.wait();

                  // Проверяем, что событие FineCharged НЕ эмитировано
                  await expect(tx).not.to.emit(ecoControl, 'FineCharged');

                  // Проверяем, что событие FineChargeFailed эмитировано с правильной причиной
                  await expect(tx).to.emit(ecoControl, 'FineChargeFailed').withArgs(
                      enterpriseId,
                      enterpriseAccount.address,
                      largeFineAmount, // Ожидаем сумму, которую пытались списать
                      "transferFrom failed" // Ожидаем указанную причину ошибки из контракта
                  );
                   // Завершаем цикл после проверки последней транзакции
                   break;
              }
         }


        // Проверяем, что балансы НЕ изменились (токены не списались)
        expect(await ecoToken.balanceOf(enterpriseAccount.address)).to.equal(enterpriseInitialBalance);
        expect(await ecoControl.getCollectedFinesBalance()).to.equal(0);

        // Возвращаем сумму штрафа к стандартному значению для других тестов (если они выполняются после этого)
        await ecoControl.setFineAmount(fineAmount);
    });

     // Проверка вывода собранных штрафов владельцем
     it("Should allow owner to withdraw collected fines", async function () {
         const ecoControlAsDataSource = ecoControl.connect(dataSourceCaller);
         const enterpriseId = enterprise1Id;
         const enterpriseAccount = enterprise1;

         // Цель: заставить рейтинг упасть с >= fineThreshold (300) до < fineThreshold (300)
         // Выполним 21 превышение, чтобы рейтинг упал с 500 до 290
         // При этом должен быть начислен штраф.
          for (let i = 0; i < 21; i++) {
               await ecoControlAsDataSource.updateEnvironmentalData(
                   enterpriseId,
                   enterpriseAccount.address,
                   400, // > нормы
                   400  // > нормы
               );
          }
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
         const ecoControlAsNonOwner = ecoControl.connect(dataSourceCaller);
         await expect(ecoControlAsNonOwner.withdrawCollectedFines(dataSourceCaller.address)).to.be.revertedWith("Only owner can call this function");

     });

    // Проверка, что нельзя вывести штрафы, если их нет
    it("Should not allow withdrawing if no fines collected", async function () {
        // В начале теста (благодаря beforeEach) штрафов нет
        expect(await ecoControl.getCollectedFinesBalance()).to.equal(0);

        // Попытка вывода владельцем
        await expect(ecoControl.withdrawCollectedFines(deployer.address)).to.be.revertedWith("No tokens collected to withdraw");
    });


});