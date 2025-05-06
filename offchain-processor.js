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

// Парсинг аргументов командной строки для определения городов
// Если указаны аргументы командной строки, они перезаписывают города в конфиге
const args = process.argv.slice(2);
let customCities = [];

if (args.length > 0) {
    console.log("Обнаружены пользовательские аргументы для городов:");
    args.forEach(city => {
        console.log(`  - ${city}`);
        customCities.push(city);
    });
}

// Конфигурация предприятий по умолчанию
// Теперь вместо UID станции используем объект для гибкой настройки:
// - либо указываем city напрямую (город, в котором находится предприятие)
// - либо указываем stations для автопоиска ближайших станций к предприятию
const defaultConfig = [
    {
        enterpriseId: 0, // ID первого предприятия (Предприятие 1 из скрипта deploy)
        enterpriseAddress: "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC", 
        city: "London", // Город для первого предприятия
        metricsToCollect: ["pm25", "pm10"] // Метрики для сбора
    },
    {
        enterpriseId: 1, // ID второго предприятия (Предприятие 2)
        enterpriseAddress: "0x90F79bf6EB2c4f870365E785982E1f101E93b906",
        city: "New York", // Город для второго предприятия
        metricsToCollect: ["pm25", "pm10"] // Метрики для сбора
    }
    // Можно добавить больше предприятий при необходимости
];

// Если указаны пользовательские города, обновляем конфигурацию
const enterprisesConfig = customCities.length > 0
    ? customCities.map((city, index) => ({
        enterpriseId: index,
        enterpriseAddress: defaultConfig[index % defaultConfig.length].enterpriseAddress,
        city: city,
        metricsToCollect: ["pm25", "pm10"]
    }))
    : defaultConfig;

if (customCities.length > 0) {
    console.log("Используем следующую конфигурацию предприятий:");
    console.log(JSON.stringify(enterprisesConfig, null, 2));
}

/**
 * Получает данные о качестве воздуха для указанного города
 * @param {string} city - Название города
 * @param {string} token - API токен WAQI
 * @returns {Promise<Object>} - Объект с данными о качестве воздуха
 */
async function getAirQualityByCity(city, token) {
    console.log(`   Запрос данных о качестве воздуха для города: ${city}`);
    
    // Используем city endpoint напрямую
    const apiUrl = `https://api.waqi.info/feed/${encodeURIComponent(city)}/?token=${token}`;
    console.log(`   API URL: ${apiUrl}`);
    
    try {
        const response = await fetch(apiUrl);
        
        if (!response.ok) {
            throw new Error(`Ошибка HTTP: ${response.status} - ${response.statusText}`);
        }
        
        const data = await response.json();
        
        if (data.status === 'ok') {
            console.log(`   Успешно получены данные о качестве воздуха для города: ${city}`);
            return data.data;
        } else {
            console.error(`   Ошибка API: ${data.status}`);
            if (data.data) console.error(`   Сообщение: ${data.data}`);
            return null;
        }
    } catch (error) {
        console.error(`   Ошибка при получении данных о качестве воздуха: ${error.message}`);
        return null;
    }
}

/**
 * Поиск станций мониторинга по ключевому слову (городу)
 * @param {string} keyword - Ключевое слово для поиска (город, регион и т.д.)
 * @param {string} token - API токен WAQI
 * @returns {Promise<Array>} - Массив найденных станций
 */
async function searchStations(keyword, token) {
    console.log(`   Поиск станций мониторинга по ключевому слову: ${keyword}`);
    
    const searchUrl = `https://api.waqi.info/search/?keyword=${encodeURIComponent(keyword)}&token=${token}`;
    console.log(`   Search API URL: ${searchUrl}`);
    
    try {
        const response = await fetch(searchUrl);
        
        if (!response.ok) {
            throw new Error(`Ошибка HTTP: ${response.status} - ${response.statusText}`);
        }
        
        const data = await response.json();
        
        if (data.status === 'ok') {
            console.log(`   Найдено ${data.data.length} станций для "${keyword}"`);
            return data.data;
        } else {
            console.error(`   Ошибка API при поиске: ${data.status}`);
            if (data.data) console.error(`   Сообщение: ${data.data}`);
            return [];
        }
    } catch (error) {
        console.error(`   Ошибка при поиске станций: ${error.message}`);
        return [];
    }
}

/**
 * Получает данные о качестве воздуха по UID станции
 * @param {number} uid - UID станции мониторинга
 * @param {string} token - API токен WAQI
 * @returns {Promise<Object>} - Объект с данными о качестве воздуха
 */
async function getAirQualityByStationUID(uid, token) {
    console.log(`   Запрос данных о качестве воздуха для станции UID: ${uid}`);
    
    const apiUrl = `https://api.waqi.info/feed/@${uid}/?token=${token}`;
    console.log(`   API URL: ${apiUrl}`);
    
    try {
        const response = await fetch(apiUrl);
        
        if (!response.ok) {
            throw new Error(`Ошибка HTTP: ${response.status} - ${response.statusText}`);
        }
        
        const data = await response.json();
        
        if (data.status === 'ok') {
            console.log(`   Успешно получены данные о качестве воздуха для станции UID: ${uid}`);
            return data.data;
        } else {
            console.error(`   Ошибка API: ${data.status}`);
            if (data.data) console.error(`   Сообщение: ${data.data}`);
            return null;
        }
    } catch (error) {
        console.error(`   Ошибка при получении данных о качестве воздуха: ${error.message}`);
        return null;
    }
}

/**
 * Извлекает значения метрик из данных о качестве воздуха
 * @param {Object} airData - Данные о качестве воздуха
 * @param {Array<string>} metrics - Массив названий метрик для извлечения
 * @returns {Object} - Объект с извлеченными значениями метрик
 */
function extractMetricsValues(airData, metrics) {
    const result = {};
    
    if (!airData || !airData.iaqi) {
        console.error("   Данные о качестве воздуха отсутствуют или не содержат информацию о метриках");
        return null;
    }
    
    const iaqi = airData.iaqi;
    
    for (const metric of metrics) {
        if (iaqi[metric] && typeof iaqi[metric].v !== 'undefined') {
            // Округляем до целого числа и проверяем, что значение не отрицательное
            result[metric] = Math.max(0, Math.round(iaqi[metric].v));
        } else {
            console.warn(`   Метрика "${metric}" отсутствует в данных`);
            result[metric] = 0; // Значение по умолчанию
        }
    }
    
    return result;
}

/**
 * Сохраняет результаты измерений в JSON-файл
 * @param {Object} results - Объект с результатами измерений
 * @param {string} filename - Имя файла для сохранения
 */
function saveResultsToFile(results, filename = 'air-quality-results.json') {
    try {
        fs.writeFileSync(filename, JSON.stringify(results, null, 2));
        console.log(`Результаты сохранены в файл: ${filename}`);
    } catch (error) {
        console.error(`Ошибка при сохранении результатов в файл: ${error.message}`);
    }
}

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

    // Объект для хранения результатов
    const results = {};

    // --- Процесс для каждого предприятия ---
    for (const enterprise of enterprisesConfig) {
        console.log(`\nОбработка для Предприятия ID ${enterprise.enterpriseId} (Город: ${enterprise.city})...`);
        
        // Переменные для хранения значений метрик
        let metric1Value = 0;
        let metric2Value = 0;
        let dataFetchedSuccessfully = false;
        let airQualityData = null;
        
        try {
            // Получаем данные о качестве воздуха
            
            // Сначала пробуем получить данные по городу (это проще и быстрее)
            if (enterprise.city) {
                airQualityData = await getAirQualityByCity(enterprise.city, waqiApiToken);
            }
            
            // Если не удалось получить данные по городу и у нас есть waqiStationUid
            if (!airQualityData && enterprise.waqiStationUid) {
                console.log(`   Не удалось получить данные по городу, пробуем получить по UID станции: ${enterprise.waqiStationUid}`);
                airQualityData = await getAirQualityByStationUID(enterprise.waqiStationUid, waqiApiToken);
            }
            
            // Если ни один из предыдущих методов не сработал, пробуем найти станции и использовать первую
            if (!airQualityData && enterprise.city) {
                console.log(`   Попытка автоматического поиска станций для города: ${enterprise.city}`);
                const stations = await searchStations(enterprise.city, waqiApiToken);
                
                if (stations.length > 0) {
                    // Используем первую найденную станцию
                    const firstStation = stations[0];
                    console.log(`   Найдена станция: ${firstStation.station.name} (UID: ${firstStation.uid})`);
                    
                    // Сохраняем UID для будущих запусков (опционально)
                    enterprise.waqiStationUid = firstStation.uid;
                    
                    // Получаем данные по найденной станции
                    airQualityData = await getAirQualityByStationUID(firstStation.uid, waqiApiToken);
                }
            }
            
            // Проверяем, удалось ли получить данные
            if (airQualityData) {
                // Сохраняем результаты для текущего города
                results[enterprise.city] = {
                    stationName: airQualityData.city ? airQualityData.city.name : 'Неизвестно',
                    time: airQualityData.time ? airQualityData.time.s : 'Неизвестно',
                    aqi: airQualityData.aqi,
                    pm25: airQualityData.iaqi.pm25 ? Math.round(airQualityData.iaqi.pm25.v) : 'Н/Д',
                    pm10: airQualityData.iaqi.pm10 ? Math.round(airQualityData.iaqi.pm10.v) : 'Н/Д'
                };
                
                if (customCities.length > 0) {
                    console.log(`   Результаты для ${enterprise.city}:`);
                    console.log(`     Станция: ${results[enterprise.city].stationName}`);
                    console.log(`     AQI: ${results[enterprise.city].aqi}`);
                    console.log(`     PM2.5: ${results[enterprise.city].pm25}`);
                    console.log(`     PM10: ${results[enterprise.city].pm10}`);
                }
                
                // Извлекаем значения метрик
                const metricsValues = extractMetricsValues(airQualityData, enterprise.metricsToCollect);
                
                if (metricsValues) {
                    metric1Value = metricsValues[enterprise.metricsToCollect[0]];
                    metric2Value = metricsValues[enterprise.metricsToCollect[1]];
                    
                    dataFetchedSuccessfully = true;
                    console.log(`   Получены данные о качестве воздуха: ${enterprise.metricsToCollect[0]}=${metric1Value}, ${enterprise.metricsToCollect[1]}=${metric2Value}`);
                }
            }
        } catch (error) {
            console.error(`   Ошибка при получении данных о качестве воздуха: ${error.message}`);
            results[enterprise.city] = { error: error.message };
        }
        
        if (!dataFetchedSuccessfully) {
            console.error(`   Не удалось получить данные о качестве воздуха для Предприятия ID ${enterprise.enterpriseId}. Пропускаем.`);
            continue;
        }

        // 5. Вызов функции checkCompliance в смарт-контракте
        console.log(`   Вызов checkCompliance для предприятия ID ${enterprise.enterpriseId} (${enterprise.enterpriseAddress}) с данными M1=${metric1Value}, M2=${metric2Value}...`);

        try {
            const tx = await ecoControlContract.checkCompliance(
                enterprise.enterpriseId,       // ID предприятия
                metric1Value,                  // Значение Метрики 1 (уже округлено)
                metric2Value                   // Значение Метрики 2 (уже округлено)
            );

            console.log(`   Транзакция отправлена: ${tx.hash}`);
            const receipt = await tx.wait();
            console.log(`   Транзакция подтверждена в блоке: ${receipt.blockNumber}`);

            // Опционально: Проверка событий в receipt (для отладки)
            const complianceEvent = receipt.logs.find(log => log.fragment && log.fragment.name === 'ComplianceChecked');
            if (complianceEvent) {
                console.log("   Событие ComplianceChecked:", complianceEvent.args);
                // Добавляем информацию о соответствии в результаты
                results[enterprise.city].compliant = !complianceEvent.args[3]; // Инвертируем limitsExceeded
            }
            const fineChargedEvent = receipt.logs.find(log => log.fragment && log.fragment.name === 'FineCharged');
            if (fineChargedEvent) {
                console.log("   Событие FineCharged:", fineChargedEvent.args);
                // Добавляем информацию о штрафе в результаты
                results[enterprise.city].fined = true;
                results[enterprise.city].fineAmount = fineChargedEvent.args[2].toString();
            } else {
                const fineFailedEvent = receipt.logs.find(log => log.fragment && log.fragment.name === 'FineChargeFailed');
                if (fineFailedEvent) {
                    console.log("   Событие FineChargeFailed:", fineFailedEvent.args);
                    // Добавляем информацию о неудачной попытке штрафа в результаты
                    results[enterprise.city].fined = false;
                    results[enterprise.city].fineFailedReason = fineFailedEvent.args[3];
                }
            }

            console.log(`   Обработка для Предприятия ID ${enterprise.enterpriseId} завершена.`);

        } catch (error) {
            console.error(`\n   Ошибка при вызове контракта checkCompliance для ID ${enterprise.enterpriseId}: ${error.message}`);
            results[enterprise.city].contractError = error.message;
        }
    } // Конец цикла по предприятиям

    // Сохраняем результаты в файл
    if (Object.keys(results).length > 0) {
        saveResultsToFile(results);
    }

    console.log("\nОффчейн процессор завершил работу!");
    return results;
}

// Запуск основной функции
processEnvironmentalData()
    .then(results => {
        console.log("Обработка завершена успешно.");
        process.exit(0);
    })
    .catch(error => {
        console.error("Произошла ошибка:", error);
        process.exit(1);
    });