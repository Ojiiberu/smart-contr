// Импортируем ethers из hardhat
const { ethers } = require("hardhat");

// Импортируем константу максимального uint256 для бесконечного аппрува (для BigInt в ethers v6+)
const MAX_UINT256 = ethers.MaxUint256;

async function main() {
  // Получаем тестовые аккаунты из Hardhat Network
  // deployer - владелец контрактов
  // dataProcessorCallerAccount - аккаунт, который будет вызывать checkCompliance
  // enterprise1, enterprise2 - аккаунты предприятий
  const [deployer, dataProcessorCallerAccount, enterprise1, enterprise2, ...otherAccounts] = await ethers.getSigners();

  console.log("Развертывание контрактов с аккаунта:", deployer.address);
  // Используем formatEther для BigInt в ethers v6+
  console.log("Баланс аккаунта развертывания:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)));

  // --- Развертывание EcoToken ---
  console.log("\nРазвертывание EcoToken...");
  const EcoToken = await ethers.getContractFactory("EcoToken");
  // Начальное количество токенов для минтинга владельцу (deployer)
  const initialTokenSupply = ethers.parseUnits("1000000", 18); // 1,000,000 токенов ECO
  const ecoToken = await EcoToken.deploy(initialTokenSupply);
  await ecoToken.waitForDeployment();

  const ecoTokenAddress = await ecoToken.getAddress();
  console.log(`EcoToken развернут по адресу: ${ecoTokenAddress}`);

  // --- Развертывание EcoControl ---
  console.log("\nРазвертывание EcoControl...");
  const EcoControl = await ethers.getContractFactory("EcoControl");
  // EcoControl теперь не требует аргументов в конструкторе
  const ecoControl = await EcoControl.deploy();
  await ecoControl.waitForDeployment();

  const ecoControlAddress = await ecoControl.getAddress();
  console.log(`EcoControl развернут по адресу: ${ecoControlAddress}`);

  // --- Настройка EcoControl ---
  console.log("\nНастройка EcoControl...");
  // Устанавливаем адрес контракта EcoToken
  await ecoControl.setEcoTokenAddress(ecoTokenAddress);
  console.log(`Адрес EcoToken (${ecoTokenAddress}) установлен в EcoControl.`);

  // Устанавливаем аккаунт обработчика данных (ранее data source caller)
  await ecoControl.setDataProcessorCaller(dataProcessorCallerAccount.address); // Исправлено имя функции и переменной
  console.log(`Аккаунт обработчика данных установлен в EcoControl: ${dataProcessorCallerAccount.address}`);

  // Удаляем установку fineThreshold, т.к. его больше нет
  // await ecoControl.setFineThreshold(fineThreshold);

  // Устанавливаем сумму штрафа (необязательно, если используется значение по умолчанию в контракте, но явно лучше)
  // const fineAmountValue = ethers.parseUnits("100", 18); // 100 ECO
  // await ecoControl.setFineAmount(fineAmountValue);
  // console.log(`Сумма штрафа установлена в EcoControl: ${ethers.formatEther(fineAmountValue)} ECO`);


  // --- Регистрация и настройка тестовых предприятий ---
  console.log("\nРегистрация и настройка тестовых предприятий...");
  // Массив аккаунтов предприятий
  const enterpriseAccounts = [enterprise1, enterprise2];
  // Начальные лимиты для регистрируемых предприятий (пример)
  const initialMetric1Limit = 100; // Например, лимит PM2.5 в мкг/м³
  const initialMetric2Limit = 20;  // Например, лимит SO2 в ppm
  // Количество токенов для минтинга каждому предприятию
  const tokensPerEnterprise = ethers.parseUnits("5000", 18); // Например, 5000 ECO

  for (let i = 0; i < enterpriseAccounts.length; i++) {
    const enterprise = enterpriseAccounts[i];
    const enterpriseName = `Предприятие ${i + 1}`;

    console.log(`\nНастройка ${enterpriseName} (${enterprise.address})...`);

    // 1. Регистрация предприятия в EcoControl
    // Теперь registerEnterprise требует адрес и начальные лимиты
    await ecoControl.registerEnterprise(
        enterpriseName,
        enterprise.address, // Адрес предприятия
        initialMetric1Limit, // Начальный лимит Метрики 1
        initialMetric2Limit  // Начальный лимит Метрики 2
    );
    console.log(`- ${enterpriseName} зарегистрировано в EcoControl.`);
    console.log(`  Начальные лимиты: M1=${initialMetric1Limit}, M2=${initialMetric2Limit}`);


    // 2. Минтинг токенов ECO для предприятия (вызывается владельцем EcoToken)
    // Владелец EcoToken - это аккаунт deployer (который запустил этот скрипт)
    await ecoToken.mint(enterprise.address, tokensPerEnterprise);
    console.log(`- ${ethers.formatEther(tokensPerEnterprise)} токенов ECO сминтировано для ${enterpriseName}.`);

    // Проверяем баланс предприятия (опционально)
    // const enterpriseEcoBalance = await ecoToken.balanceOf(enterprise.address);
    // console.log(`  Баланс токенов ECO у ${enterpriseName}: ${ethers.formatEther(enterpriseEcoBalance)}`);

    // 3. Выполнение АППРУВА предприятием на контракте EcoToken
    // Предприятие разрешает контракту EcoControl тратить его токены (бесконечное разрешение)
    const ecoTokenWithEnterprise = ecoToken.connect(enterprise);
    await ecoTokenWithEnterprise.approve(ecoControlAddress, MAX_UINT256); // Бесконечный аппрув
    console.log(`- ${enterpriseName} дал бесконечное разрешение EcoControl тратить токены ECO.`);

    // Проверяем установленное разрешение (allowance) (опционально)
    // const allowance = await ecoToken.allowance(enterprise.address, ecoControlAddress);
    // console.log(`  Разрешение (allowance) от ${enterpriseName} для EcoControl: ${allowance.toString()}`);
  }

  console.log("\nСкрипт развертывания и настройки завершен!");
  const addresses = {
    ecoControl: ecoControlAddress,
    ecoToken: ecoTokenAddress
  };
  console.log("Развернутые адреса:", addresses);

  // --- Добавляем запись адресов в файл ---
  const fs = require('fs'); // Импортируем модуль для работы с файловой системой
  fs.writeFileSync('deployed-addresses.json', JSON.stringify(addresses, null, 2));
  console.log("Адреса контрактов сохранены в deployed-addresses.json");
  // --- Конец добавления ---


  console.log("Адрес EcoControl для взаимодействия:", ecoControlAddress);
  console.log("Адрес EcoToken для взаимодействия:", ecoTokenAddress);
  console.log("Аккаунт владельца:", deployer.address);
  console.log("Аккаунт обработчика данных:", dataProcessorCallerAccount.address); // Исправлено имя
  enterpriseAccounts.forEach((acc, index) => {
      console.log(`Аккаунт Предприятия ${index + 1}:`, acc.address);
  });

}

// Стандартный код Hardhat для запуска скрипта
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });