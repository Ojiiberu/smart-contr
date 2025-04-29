// Импортируем ethers из hardhat
const { ethers } = require("hardhat");

// Импортируем константу максимального uint256 для бесконечного аппрува
const MAX_UINT256 = ethers.MaxUint256; // Правильное свойство в ethers v6+

async function main() {
  // Получаем тестовые аккаунты из Hardhat Network
  // Первый аккаунт обычно используется как deployer (владелец)
  // Остальные можно использовать дляDataSourceCaller и предприятий
  const [deployer, dataSourceCallerAccount, enterprise1Account, enterprise2Account, ...otherAccounts] = await ethers.getSigners();

  console.log("Развертывание контрактов с аккаунта:", deployer.address);
  console.log("Баланс аккаунта развертывания:", ethers.formatEther(await ethers.provider.getBalance(deployer.address))); // ethers v6+

  // --- Развертывание EcoToken ---
  console.log("\nРазвертывание EcoToken...");
  const EcoToken = await ethers.getContractFactory("EcoToken");
  // При развертывании EcoToken, передаем начальное количество токенов для минтинга
  // Например, 1,000,000 токенов с 18 десятичными знаками
  const initialTokenSupply = ethers.parseUnits("1000000", 18); // ethers v6+
  const ecoToken = await EcoToken.deploy(initialTokenSupply);
  await ecoToken.waitForDeployment(); // Ожидаем завершения развертывания

  const ecoTokenAddress = await ecoToken.getAddress(); // Получаем адрес развернутого контракта
  console.log("EcoToken развернут по адресу:", ecoTokenAddress);

  // --- Развертывание EcoControl ---
  console.log("\nРазвертывание EcoControl...");
  const EcoControl = await ethers.getContractFactory("EcoControl");
  // EcoControl не требует аргументов в конструкторе
  const ecoControl = await EcoControl.deploy();
  await ecoControl.waitForDeployment(); // Ожидаем завершения развертывания

  const ecoControlAddress = await ecoControl.getAddress(); // Получаем адрес развернутого контракта
  console.log("EcoControl развернут по адресу:", ecoControlAddress);

  // --- Настройка EcoControl ---
  console.log("\nНастройка EcoControl...");
  // Устанавливаем адрес контракта EcoToken в EcoControl
  await ecoControl.setEcoTokenAddress(ecoTokenAddress);
  console.log(`Адрес EcoToken (${ecoTokenAddress}) установлен в EcoControl.`);

  // Устанавливаем аккаунт источника данных в EcoControl
  await ecoControl.setDataSourceCaller(dataSourceCallerAccount.address);
  console.log(`Аккаунт источника данных установлен в EcoControl: ${dataSourceCallerAccount.address}`);

  // --- Настройка тестовых предприятий ---
  console.log("\nНастройка тестовых предприятий...");
  const enterpriseAccounts = [enterprise1Account, enterprise2Account]; // Используем аккаунты 3 и 4

  // Количество токенов для минтинга каждому предприятию
  const tokensPerEnterprise = ethers.parseUnits("1000", 18); // Например, 1000 ECO

  for (let i = 0; i < enterpriseAccounts.length; i++) {
    const enterprise = enterpriseAccounts[i];
    const enterpriseName = `Предприятие ${i + 1}`;

    console.log(`\nНастройка ${enterpriseName} (${enterprise.address})...`);

    // 1. Регистрация предприятия в EcoControl (вызывается владельцем EcoControl)
    await ecoControl.registerEnterprise(enterpriseName, enterprise.address);
    console.log(`- ${enterpriseName} зарегистрировано в EcoControl.`);

    // 2. Минтинг токенов ECO для предприятия (вызывается владельцем EcoToken)
    // Владелец EcoToken - это аккаунт deployer
    await ecoToken.mint(enterprise.address, tokensPerEnterprise);
    console.log(`- ${tokensPerEnterprise.toString()} токенов ECO сминтировано для ${enterpriseName}.`);

    // Проверяем баланс предприятия (опционально)
    // const enterpriseEcoBalance = await ecoToken.balanceOf(enterprise.address);
    // console.log(`  Баланс токенов ECO у ${enterpriseName}: ${ethers.formatEther(enterpriseEcoBalance)}`);

    // 3. Выполнение АППРУВА предприятием на контракте EcoToken
    // Предприятие разрешает контракту EcoControl тратить его токены (бесконечное разрешение)
    // Для этого нужно выполнить вызов функции approve от имени аккаунта предприятия
    // Создаем экземпляр контракта EcoToken, подключенный к аккаунту предприятия
    const ecoTokenWithEnterprise = ecoToken.connect(enterprise);
    // Вызываем approve: контракту EcoControl разрешено тратить с аккаунта enterprise
    await ecoTokenWithEnterprise.approve(ecoControlAddress, MAX_UINT256); // Бесконечный аппрув
    console.log(`- ${enterpriseName} дал бесконечное разрешение EcoControl тратить токены ECO.`);

    // Проверяем установленное разрешение (allowance) (опционально)
    // const allowance = await ecoToken.allowance(enterprise.address, ecoControlAddress);
    // console.log(`  Разрешение (allowance) от ${enterpriseName} для EcoControl: ${allowance.toString()}`);
  }

  console.log("\nСкрипт развертывания и настройки завершен!");
  console.log("Адрес EcoControl для взаимодействия:", ecoControlAddress);
  console.log("Адрес EcoToken для взаимодействия:", ecoTokenAddress);
  console.log("Аккаунт владельца:", deployer.address);
  console.log("Аккаунт источника данных:", dataSourceCallerAccount.address);
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