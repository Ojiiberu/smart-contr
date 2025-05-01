// Загружаем переменные окружения из .env
require('dotenv').config();
const { ethers } = require("ethers");
const fs = require('fs');
const fetch = require('node-fetch');

// --- Конфигурация ---
// URL RPC узла (для Hardhat Network)
const rpcUrl = "http://127.0.0.1:8545";
// Приватный ключ аккаунта, который будет вызывать checkCompliance (dataProcessorCaller)
// Читаем из .env
const dataProcessorPrivateKey = process.env.DATA_PROCESSOR_PRIVATE_KEY;
// Путь к файлу с развернутыми адресами контрактов
const deployedAddressesPath = './deployed-addresses.json';

// Токен API waqi.info
// Читаем из .env
const waqiApiToken = process.env.WAQI_API_TOKEN;
if (!waqiApiToken || waqiApiToken === 'YOUR_WAQI_TOKEN') { // Оставляем проверку
    console.error("Ошибка: Не установлен токен WAQI_API_TOKEN в файле .env");
    process.exit(1);
}

// Конфигурация предприятий и соответствующих станций мониторинга
// ID предприятия (в контракте) <-> UID станции WAQI <-> Какие метрики собираем
const enterprisesConfig = [
    {
        enterpriseId: 0, // ID первого предприятия (Предприятие 1 из скрипта deploy)
        enterpriseAddress: "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC", // Адрес enterprise1 (убедись, что совпадает с твоим выводом npx hardhat node)
        waqiStationUid: 12899, // Твой UID станции 1
        metricsToCollect: ["pm25", "pm10"] // Твои метрики
    },
    {
        enterpriseId: 1, // ID второго предприятия (Предприятие 2)
        enterpriseAddress: "0x90F79bf6EB2c4f870365E785982E1f101E93b906", // Адрес enterprise2 (убедись, что совпадает с твоим выводом npx hardhat node)
        waqiStationUid:  12725, // Твой UID станции 2
        metricsToCollect: ["pm25", "pm10"] // Твои метрики
    }
    // Если нужно добавить больше предприятий, зарегистрированных в deploy.js, добавь их сюда
];

// Убедимся, что в контракте EcoControl Metric 1 соответствует PM25, а Metric 2 соответствует PM10
// Сейчас в EcoControl Metric 1Threshold=50, Metric 2Threshold=10 по умолчанию.
// Ты можешь установить их через функцию setEnterpriseLimits после регистрации в скрипте deploy.js
// или вручную вызвать setEnterpriseLimits для каждого предприятия через hardhat console или фронтенд.
// Для этого скрипта просто важно, какие API метрики мы берем.

async function processEnvironmentalData() {
    console.log("DEBUG: process.env.DATA_PROCESSOR_PRIVATE_KEY:", process.env.DATA_PROCESSOR_PRIVATE_KEY);
console.log("DEBUG: process.env.WAQI_API_TOKEN:", process.env.WAQI_API_TOKEN);
    console.log("Запуск оффчейн процессора...");

    // 1. Подключение к блокчейну
    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const wallet = new ethers.Wallet(dataProcessorPrivateKey, provider);
    console.log(`Подключен к узлу ${rpcUrl} с аккаунтом: ${wallet.address}`);

    const balance = await provider.getBalance(wallet.address);
    console.log(`Баланс аккаунта обработчика данных: ${ethers.formatEther(balance)} ETH`);
    if (balance < ethers.parseEther("0.001")) { // Проверяем, что баланс достаточен хотя бы для нескольких транзакций
        console.error("Ошибка: У аккаунта обработчика данных слишком низкий баланс ETH для оплаты газа!");
        process.exit(1);
    }

    // 2. Загрузка адресов контрактов
    let addresses;
    try {
        const data = fs.readFileSync(deployedAddressesPath, 'utf8');
        addresses = JSON.parse(data);
        console.log("Загружены адреса контрактов:", addresses);
    } catch (error) {
        console.error(`Ошибка при чтении файла deployed-addresses.json: ${error.message}`);
        console.error("Пожалуйста, запустите скрипт развертывания (npx hardhat run scripts/deploy.js --network localhost) перед запуском этого скрипта.");
        process.exit(1);
    }

    // 3. Получение экземпляра контракта EcoControl
    const EcoControlArtifact = require('./artifacts/contracts/EcoControl.sol/EcoControl.json');
    const ecoControlContract = new ethers.Contract(addresses.ecoControl, EcoControlArtifact.abi, wallet);
    console.log(`Получен экземпляр контракта EcoControl по адресу ${ecoControlContract.address}`);

    // --- Процесс для каждого предприятия ---
    for (const enterpriseConfig of enterprisesConfig) {
        console.log(`\nОбработка для Предприятия ID ${enterpriseConfig.enterpriseId} (Станция WAQI UID ${enterpriseConfig.waqiStationUid})...`);

        // 4. Получение данных о загрязнении из API WAQI (РЕАЛЬНЫЙ ВЫЗОВ)
        let metric1Value = 0; // Используем 0 как значение по умолчанию/при ошибке
        let metric2Value = 0;
        let dataFetchedSuccessfully = false;

        const waqiApiUrl = `https://api.waqi.info/feed/@${enterpriseConfig.waqiStationUid}/?token=${waqiApiToken}`;
        console.log(`   Запрос данных из API: ${waqiApiUrl}`);

        try {
            const apiResponse = await fetch(waqiApiUrl);

            if (!apiResponse.ok) {
                // Если ответ не 2xx, бросаем ошибку
                throw new Error(`Ошибка HTTP: ${apiResponse.status} - ${apiResponse.statusText}`);
            }

            const result = await apiResponse.json();

            if (result.status === "ok" && result.data && result.data.iaqi) {
                const iaqiData = result.data.iaqi;

                // Извлекаем нужные метрики по их названиям
                const metric1Param = enterpriseConfig.metricsToCollect[0];
                const metric2Param = enterpriseConfig.metricsToCollect[1];

                const m1Data = iaqiData[metric1Param];
                const m2Data = iaqiData[metric2Param];

                if (m1Data && m2Data && typeof m1Data.v !== 'undefined' && typeof m2Data.v !== 'undefined') {
                    // Получаем значения
                    const rawMetric1 = m1Data.v;
                    const rawMetric2 = m2Data.v;

                    // Округляем до ближайшего целого для uint256
                    metric1Value = Math.round(rawMetric1);
                    metric2Value = Math.round(rawMetric2);

                    // Проверяем, что округленные значения не отрицательны
                    if (metric1Value < 0) metric1Value = 0;
                    if (metric2Value < 0) metric2Value = 0;


                    dataFetchedSuccessfully = true;
                    console.log(`   Получены данные из API: ${metric1Param}=${rawMetric1} (${metric1Value} округлено), ${metric2Param}=${rawMetric2} (${metric2Value} округлено).`);
                } else {
                    console.warn(`   В ответе API для станции ${enterpriseConfig.waqiStationUid} не найдены ожидаемые метрики (${metric1Param}, ${metric2Param}).`);
                }
            } else {
                 console.warn(`   API вернуло статус "${result.status}" или не содержит данных для станции ${enterpriseConfig.waqiStationUid}.`);
                 if (result.data) console.warn(`   API сообщение: ${result.data}`);
            }

        } catch (error) {
            console.error(`   Ошибка при получении данных из API WAQI: ${error.message}`);
        }

        if (!dataFetchedSuccessfully) {
            console.error(`   Не удалось получить корректные данные из API для Предприятия ID ${enterpriseConfig.enterpriseId}. Пропускаем.`);
            // В реальном приложении здесь можно добавить логику уведомлений или пропустить это предприятие
            continue; // Переходим к следующему предприятию в цикле
        }


        // 5. Вызов функции checkCompliance в смарт-контракте
        console.log(`   Вызов checkCompliance для предприятия ID ${enterpriseConfig.enterpriseId} (${enterpriseConfig.enterpriseAddress}) с данными M1=${metric1Value}, M2=${metric2Value}...`);

        try {
            const tx = await ecoControlContract.checkCompliance(
                enterpriseConfig.enterpriseId,       // ID предприятия
                metric1Value,                      // Значение Метрики 1 (уже округлено)
                metric2Value                       // Значение Метрики 2 (уже округлено)
            );

            console.log(`   Транзакция отправлена: ${tx.hash}`);
            const receipt = await tx.wait();
            console.log(`   Транзакция подтверждена в блоке: ${receipt.blockNumber}`);

            // Опционально: Проверка событий в receipt (для отладки)
             const complianceEvent = receipt.logs.find(log => log.fragment && log.fragment.name === 'ComplianceChecked');
             if (complianceEvent) {
                  console.log("   Событие ComplianceChecked:", complianceEvent.args);
             }
             const fineChargedEvent = receipt.logs.find(log => log.fragment && log.fragment.name === 'FineCharged');
             if (fineChargedEvent) {
                  console.log("   Событие FineCharged:", fineChargedEvent.args);
             } else {
                  const fineFailedEvent = receipt.logs.find(log => log.fragment && log.fragment.name === 'FineChargeFailed');
                  if (fineFailedEvent) {
                      console.log("   Событие FineChargeFailed:", fineFailedEvent.args);
                  }
             }


            console.log(`   Обработка для Предприятия ID ${enterpriseConfig.enterpriseId} завершена.`);

        } catch (error) {
            console.error(`\n   Ошибка при вызове контракта checkCompliance для ID ${enterpriseConfig.enterpriseId}: ${error.message}`);
            // При ошибке вызова контракта (например, revert из require), здесь будет подробное сообщение
            // В реальном приложении нужно логировать или уведомлять
        }
    } // Конец цикла по предприятиям


    console.log("\nОффчейн процессор завершил работу!");

}

// Запуск основной функции
processEnvironmentalData();