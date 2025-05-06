import { ethers } from 'ethers';

// ABI для контрактов (упрощенные версии, содержащие только нужные нам методы)
export const EcoControlABI = [
  // Методы для получения информации о предприятиях
  "function enterprises(uint256) view returns (string name, address enterpriseAddress, uint256 metric1Limit, uint256 metric2Limit, uint256 latestMetric1, uint256 latestMetric2, uint256 latestDataTimestamp)",
  "function nextEnterpriseId() view returns (uint256)",
  "function getEnterpriseAddress(uint256 _enterpriseId) view returns (address)",
  "function getEnterpriseLimits(uint256 _enterpriseId) view returns (uint256 metric1Limit, uint256 metric2Limit)",
  "function getLatestEnvironmentalData(uint256 _enterpriseId) view returns (uint256 timestamp, uint256 metric1, uint256 metric2)",
  "function enterpriseAddressToId(address) view returns (uint256)",
  "function isEnterpriseRegistered(address) view returns (bool)",
  
  // Методы для управления параметрами
  "function setEnterpriseLimits(uint256 _enterpriseId, uint256 _metric1Limit, uint256 _metric2Limit)",
  "function checkCompliance(uint256 _enterpriseId, uint256 _metric1Value, uint256 _metric2Value)",
  
  // Административные методы
  "function owner() view returns (address)",
  "function dataProcessorCaller() view returns (address)",
  "function ecoTokenAddress() view returns (address)",
  "function fineAmount() view returns (uint256)",
  "function setDataProcessorCaller(address _caller)",
  "function setEcoTokenAddress(address _tokenAddress)",
  "function setFineAmount(uint256 _amount)",
  "function registerEnterprise(string memory _name, address _enterpriseAddress, uint256 _initialMetric1Limit, uint256 _initialMetric2Limit)",
  
  // Функции управления штрафами
  "function getCollectedFinesBalance() view returns (uint256)",
  "function withdrawCollectedFines(address _recipient)"
];

export const ERC20ABI = [
  "function balanceOf(address owner) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function transfer(address to, uint256 amount) returns (bool)",
  "function name() view returns (string)"
];

// Адреса контрактов из deployed-addresses.json
export const contractAddresses = {
  ecoControl: "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512",
  ecoToken: "0x5FbDB2315678afecb367f032d93F642f64180aa3"
};

// Функция для подключения к MetaMask с возможностью выбора аккаунта
export async function connectWallet() {
  if (window.ethereum) {
    try {
      // Используем wallet_requestPermissions для форсирования показа selector-a аккаунтов
      // Это даст пользователю выбрать аккаунт при каждом подключении
      try {
        await window.ethereum.request({
          method: 'wallet_requestPermissions',
          params: [{ eth_accounts: {} }]
        });
      } catch (permissionError) {
        console.log("Permission request failed, falling back to standard connect", permissionError);
      }
      
      // Стандартный запрос аккаунтов
      const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const network = await provider.getNetwork();
      
      return { provider, signer, network, address: await signer.getAddress() };
    } catch (error) {
      console.error("User denied account access", error);
      throw error;
    }
  } else {
    throw new Error("Ethereum provider not found. Install MetaMask!");
  }
}

// Функция для отключения от MetaMask
export function disconnectWallet() {
  if (window.ethereum) {
    // Не существует официального метода для "отключения" в MetaMask
    // Но мы можем попытаться сбросить соединение через wallet_requestPermissions
    try {
      // В некоторых нестандартных провайдерах есть disconnect
      if (typeof window.ethereum.disconnect === 'function') {
        window.ethereum.disconnect();
      }
    } catch (error) {
      console.log("No disconnect method available", error);
    }
  }
  
  // В LocalStorage можно сохранить флаг, что пользователь отключился
  localStorage.setItem('wallet_disconnected', 'true');
  
  console.log("Disconnected from wallet");
  return true;
}

// Функция для получения экземпляров контрактов
export function getContracts(signer) {
  const ecoControlContract = new ethers.Contract(
    contractAddresses.ecoControl,
    EcoControlABI,
    signer
  );

  const ecoTokenContract = new ethers.Contract(
    contractAddresses.ecoToken,
    ERC20ABI,
    signer
  );

  return { ecoControlContract, ecoTokenContract };
}

// Получить данные API WAQI для станции по UID
export async function getWaqiDataByStationUID(stationId, apiToken) {
  try {
    const response = await fetch(`https://api.waqi.info/feed/@${stationId}/?token=${apiToken}`);
    if (!response.ok) {
      throw new Error(`HTTP error: ${response.status}`);
    }
    const data = await response.json();
    return data;
  } catch (error) {
    console.error("Failed to fetch WAQI data by UID:", error);
    throw error;
  }
}

// Получить данные API WAQI для города 
export async function getWaqiDataByCity(city, apiToken) {
  try {
    const response = await fetch(`https://api.waqi.info/feed/${encodeURIComponent(city)}/?token=${apiToken}`);
    if (!response.ok) {
      throw new Error(`HTTP error: ${response.status}`);
    }
    const data = await response.json();
    return data;
  } catch (error) {
    console.error("Failed to fetch WAQI data by city:", error);
    throw error;
  }
}

// Поиск станций мониторинга по ключевому слову (городу)
export async function searchWaqiStations(keyword, apiToken) {
  try {
    const response = await fetch(`https://api.waqi.info/search/?keyword=${encodeURIComponent(keyword)}&token=${apiToken}`);
    if (!response.ok) {
      throw new Error(`HTTP error: ${response.status}`);
    }
    const data = await response.json();
    return data;
  } catch (error) {
    console.error("Failed to search WAQI stations:", error);
    throw error;
  }
}

// Сохраняем старую функцию для обратной совместимости
export async function getWaqiData(stationId, apiToken) {
  return getWaqiDataByStationUID(stationId, apiToken);
}

// Извлечь значения метрик из данных о качестве воздуха
export function extractMetricsValues(airData, metrics) {
  const result = {};
  
  if (!airData || !airData.iaqi) {
    console.error("Air quality data is missing or does not contain metrics information");
    return null;
  }
  
  const iaqi = airData.iaqi;
  
  for (const metric of metrics) {
    if (iaqi[metric] && typeof iaqi[metric].v !== 'undefined') {
      // Округляем до целого числа и проверяем, что значение не отрицательное
      result[metric] = Math.max(0, Math.round(iaqi[metric].v));
    } else {
      console.warn(`Metric "${metric}" is missing from data`);
      result[metric] = 0; // Значение по умолчанию
    }
  }
  
  return result;
}

// Форматирование баланса с учетом decimals
export function formatTokenBalance(balance, decimals = 18) {
  return ethers.formatUnits(balance, decimals);
}

// Конфигурация предприятий (такая же как в offchain-processor.js)
export const enterprisesConfig = [
  {
    enterpriseId: 0,
    enterpriseAddress: "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC",
    city: "London",
    metricsToCollect: ["pm25", "pm10"]
  },
  {
    enterpriseId: 1,
    enterpriseAddress: "0x90F79bf6EB2c4f870365E785982E1f101E93b906",
    city: "New York",
    metricsToCollect: ["pm25", "pm10"]
  }
]; 