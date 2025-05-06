import { useState, useEffect } from 'react';
import { 
  enterprisesConfig, 
  getWaqiDataByCity, 
  getWaqiDataByStationUID, 
  searchWaqiStations,
  extractMetricsValues 
} from '../ethers-utils';
import { ethers } from 'ethers';

// Стили для компонента
const processorStyle = {
  backgroundColor: '#f0f8ff',
  border: '1px solid #b0c4de',
  borderRadius: '8px',
  padding: '20px',
  marginBottom: '20px',
};

const buttonStyle = {
  padding: '10px 20px',
  backgroundColor: '#4a90e2',
  color: 'white',
  border: 'none',
  borderRadius: '4px',
  cursor: 'pointer',
  fontWeight: 'bold',
  fontSize: '16px',
  marginTop: '10px',
};

const checkComplianceButtonStyle = {
  ...buttonStyle,
  backgroundColor: '#e74c3c',
  marginLeft: '10px',
};

const resultStyle = {
  backgroundColor: '#f5f5f5',
  border: '1px solid #ddd',
  borderRadius: '4px',
  padding: '10px',
  marginTop: '15px',
  maxHeight: '300px',
  overflowY: 'auto',
  fontFamily: 'monospace',
  whiteSpace: 'pre-wrap',
};

const inputGroupStyle = {
  marginBottom: '15px',
  display: 'flex',
  flexDirection: 'column',
};

const inputStyle = {
  padding: '8px 12px',
  borderRadius: '4px',
  border: '1px solid #ccc',
  marginTop: '5px',
  marginBottom: '10px',
  fontSize: '14px',
  width: '250px',
};

const selectStyle = {
  padding: '8px 12px',
  borderRadius: '4px',
  border: '1px solid #ccc',
  marginTop: '5px',
  marginBottom: '10px',
  fontSize: '14px',
  width: '250px',
};

const labelStyle = {
  fontWeight: 'bold',
  marginBottom: '5px',
};

const gridStyle = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))',
  gap: '20px',
  marginTop: '20px',
};

const cityCardStyle = {
  border: '1px solid #ddd',
  borderRadius: '6px',
  padding: '15px',
  backgroundColor: 'white',
  boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
};

function OffchainProcessor({ ecoControlContract, waqiApiToken, refreshData, isDataProcessor }) {
  const [checkingCompliance, setCheckingCompliance] = useState(false);
  const [logs, setLogs] = useState([]);
  const [error, setError] = useState('');
  
  // Получаем список предприятий из конфигурации
  const [enterprises, setEnterprises] = useState([]);
  
  // Состояния для пользовательских городов
  const [cityInput, setCityInput] = useState('');
  const [selectedEnterpriseId, setSelectedEnterpriseId] = useState('');
  const [enterpriseCities, setEnterpriseCities] = useState({});
  const [cityResults, setCityResults] = useState({});
  const [loadingCities, setLoadingCities] = useState(false);

  // Добавляем состояния для панели администратора
  const [showAdminPanel, setShowAdminPanel] = useState(false);
  const [newPM25Limit, setNewPM25Limit] = useState(40);
  const [newPM10Limit, setNewPM10Limit] = useState(40);
  const [updatingLimits, setUpdatingLimits] = useState(false);

  // Добавляем состояния для проверки токенов
  const [tokenSettings, setTokenSettings] = useState({
    tokenAddress: null,
    loading: false,
    error: null,
    allowances: {}
  });

  // Добавляем состояние для баланса контракта
  const [contractBalance, setContractBalance] = useState(null);
  const [loadingContractBalance, setLoadingContractBalance] = useState(false);

  // Загрузка данных о предприятиях
  useEffect(() => {
    if (ecoControlContract) {
      // Загружаем актуальные данные о предприятиях из контракта
      const loadEnterpriseData = async () => {
        try {
          const loadedEnterprises = [];
          
          for (const config of enterprisesConfig) {
            try {
              // Получаем данные другим способом - через специальную функцию для лимитов
              const enterprise = await ecoControlContract.enterprises(config.enterpriseId);
              
              // Получаем лимиты через специальную функцию getEnterpriseLimits
              const limits = await ecoControlContract.getEnterpriseLimits(config.enterpriseId);
              
              // Преобразуем BigInt в JavaScript number
              const m1Limit = Number(limits[0]);
              const m2Limit = Number(limits[1]);
              
              console.log(`Предприятие ${config.enterpriseId} лимиты из getEnterpriseLimits:`, 
                          `PM2.5=${m1Limit}`, 
                          `PM10=${m2Limit}`);
              
              // Для отладки: показать данные, полученные напрямую из enterprises
              const directM1Limit = Number(enterprise[4]);
              const directM2Limit = Number(enterprise[5]);
              
              console.log(`Предприятие ${config.enterpriseId} лимиты напрямую из enterprise:`, 
                          `PM2.5=${directM1Limit}`, 
                          `PM10=${directM2Limit}`);
              
              loadedEnterprises.push({
                id: config.enterpriseId,
                name: enterprise[0],
                address: enterprise[1], 
                metric1Limit: m1Limit,
                metric2Limit: m2Limit,
                city: config.city || null,
              });
            } catch (error) {
              console.error(`Error loading enterprise ${config.enterpriseId}:`, error);
            }
          }
          
          setEnterprises(loadedEnterprises);
          
          // Инициализируем объект городов предприятий
          const initialCities = {};
          loadedEnterprises.forEach(enterprise => {
            if (enterprise.city) {
              initialCities[enterprise.id] = enterprise.city;
            }
          });
          setEnterpriseCities(initialCities);
          
        } catch (error) {
          console.error("Error loading enterprise data:", error);
          setError("Не удалось загрузить данные предприятий");
        }
      };
      
      loadEnterpriseData();
    }
  }, [ecoControlContract]);

  // Загрузка настроек токенов
  useEffect(() => {
    const loadTokenSettings = async () => {
      if (!ecoControlContract) return;
      
      setTokenSettings(prev => ({ ...prev, loading: true, error: null }));
      
      try {
        // Получаем адрес токена из контракта
        const tokenAddress = await ecoControlContract.ecoTokenAddress();
        console.log("Token address from contract:", tokenAddress);
        
        // Получаем сумму штрафа
        const fineAmount = await ecoControlContract.fineAmount();
        console.log("Fine amount from contract:", fineAmount.toString());
        
        // Проверяем allowance для предприятий
        const allowances = {};
        
        if (tokenAddress && tokenAddress !== "0x0000000000000000000000000000000000000000") {
          const ecoTokenABI = ["function allowance(address owner, address spender) view returns (uint256)"];
          const tokenContract = new ethers.Contract(tokenAddress, ecoTokenABI, ecoControlContract.runner);
          
          for (const enterprise of enterprises) {
            try {
              const allowance = await tokenContract.allowance(enterprise.address, await ecoControlContract.getAddress());
              allowances[enterprise.id] = allowance.toString();
              console.log(`Enterprise ${enterprise.id} allowance:`, allowance.toString());
            } catch (error) {
              console.error(`Error checking allowance for enterprise ${enterprise.id}:`, error);
              allowances[enterprise.id] = "Error";
            }
          }
        }
        
        setTokenSettings({
          tokenAddress,
          fineAmount: fineAmount.toString(),
          loading: false,
          error: null,
          allowances
        });
        
      } catch (error) {
        console.error("Error loading token settings:", error);
        setTokenSettings(prev => ({ 
          ...prev, 
          loading: false, 
          error: `Ошибка загрузки настроек токена: ${error.message}` 
        }));
      }
    };
    
    if (ecoControlContract) {
      loadTokenSettings();
    }
  }, [ecoControlContract]);

  // Загрузка баланса контракта
  useEffect(() => {
    const loadContractBalance = async () => {
      if (!ecoControlContract) return;
      
      try {
        setLoadingContractBalance(true);
        const balance = await ecoControlContract.getCollectedFinesBalance();
        setContractBalance(balance.toString());
      } catch (error) {
        console.error("Error loading contract balance:", error);
      } finally {
        setLoadingContractBalance(false);
      }
    };
    
    loadContractBalance();
  }, [ecoControlContract, refreshData]);

  // Функция для логирования (аналог console.log) в интерфейсе
  const log = (message) => {
    setLogs(prevLogs => [...prevLogs, message]);
  };
  
  // Добавление города для предприятия
  const addCity = () => {
    if (!cityInput.trim() || !selectedEnterpriseId) {
      setError("Укажите город и выберите предприятие");
      return;
    }
    
    setEnterpriseCities(prev => ({
      ...prev,
      [selectedEnterpriseId]: cityInput.trim()
    }));
    
    setCityInput('');
    setSelectedEnterpriseId('');
    setError('');
  };
  
  // Удаление города для предприятия
  const removeCity = (enterpriseId) => {
    setEnterpriseCities(prev => {
      const newCities = {...prev};
      delete newCities[enterpriseId];
      return newCities;
    });
    
    setCityResults(prev => {
      const newResults = {...prev};
      delete newResults[enterpriseId];
      return newResults;
    });
  };
  
  // Получение данных о качестве воздуха для городов предприятий
  const fetchCityData = async () => {
    if (!waqiApiToken) {
      setError('API токен не установлен');
      return;
    }
    
    if (Object.keys(enterpriseCities).length === 0) {
      setError('Добавьте хотя бы один город для предприятия');
      return;
    }
    
    setLoadingCities(true);
    setError('');
    const results = {};
    
    for (const [enterpriseId, city] of Object.entries(enterpriseCities)) {
      try {
        const result = await getWaqiDataByCity(city, waqiApiToken);
        
        if (result.status === 'ok') {
          // Извлекаем данные PM2.5 и PM10
          const pm25 = result.data.iaqi.pm25 ? Math.round(result.data.iaqi.pm25.v) : 'Н/Д';
          const pm10 = result.data.iaqi.pm10 ? Math.round(result.data.iaqi.pm10.v) : 'Н/Д';
          
          // Находим предприятие для получения лимитов
          const enterprise = enterprises.find(e => e.id.toString() === enterpriseId.toString());
          
          results[enterpriseId] = { 
            city,
            pm25, 
            pm10, 
            aqi: result.data.aqi,
            stationName: result.data.city.name,
            time: result.data.time.s,
            // Сравниваем с лимитами, уже преобразованными в нормальные числа
            pm25Exceeded: pm25 !== 'Н/Д' && enterprise && parseInt(pm25) > enterprise.metric1Limit,
            pm10Exceeded: pm10 !== 'Н/Д' && enterprise && parseInt(pm10) > enterprise.metric2Limit,
            // Сохраняем лимиты для отображения (уже нормальные числа)
            pm25Limit: enterprise ? enterprise.metric1Limit : 'Н/Д',
            pm10Limit: enterprise ? enterprise.metric2Limit : 'Н/Д',
            // Флаг, что проверка еще не выполнена
            complianceChecked: false
          };
        } else if (result.status === 'error') {
          // Попробуем выполнить поиск станций
          const searchResult = await searchWaqiStations(city, waqiApiToken);
          
          if (searchResult.status === 'ok' && searchResult.data.length > 0) {
            // Используем первую найденную станцию
            const firstStation = searchResult.data[0];
            const stationResult = await getWaqiDataByStationUID(firstStation.uid, waqiApiToken);
            
            if (stationResult.status === 'ok') {
              const pm25 = stationResult.data.iaqi.pm25 ? Math.round(stationResult.data.iaqi.pm25.v) : 'Н/Д';
              const pm10 = stationResult.data.iaqi.pm10 ? Math.round(stationResult.data.iaqi.pm10.v) : 'Н/Д';
              
              // Находим предприятие для получения лимитов
              const enterprise = enterprises.find(e => e.id.toString() === enterpriseId.toString());
              
              results[enterpriseId] = { 
                city,
                pm25, 
                pm10, 
                aqi: stationResult.data.aqi,
                stationName: stationResult.data.city.name,
                time: stationResult.data.time.s,
                note: `Данные от ближайшей станции: ${firstStation.station.name}`,
                // Сравниваем с лимитами, уже преобразованными в нормальные числа
                pm25Exceeded: pm25 !== 'Н/Д' && enterprise && parseInt(pm25) > enterprise.metric1Limit,
                pm10Exceeded: pm10 !== 'Н/Д' && enterprise && parseInt(pm10) > enterprise.metric2Limit,
                // Сохраняем лимиты для отображения (уже нормальные числа)
                pm25Limit: enterprise ? enterprise.metric1Limit : 'Н/Д',
                pm10Limit: enterprise ? enterprise.metric2Limit : 'Н/Д',
                // Флаг, что проверка еще не выполнена
                complianceChecked: false
              };
            } else {
              results[enterpriseId] = { 
                city,
                error: 'Не удалось получить данные от найденной станции' 
              };
            }
          } else {
            results[enterpriseId] = { 
              city,
              error: 'Город не найден или нет данных' 
            };
          }
        }
      } catch (error) {
        console.error(`Ошибка при получении данных для города ${city}:`, error);
        results[enterpriseId] = { 
          city,
          error: error.message 
        };
      }
    }
    
    setCityResults(results);
    setLoadingCities(false);
  };
  
  // Проверка соответствия лимитам и штрафование предприятий
  const checkCompliance = async () => {
    if (!ecoControlContract || !isDataProcessor) {
      setError('Необходимо подключить кошелек с правами обработчика данных');
      return;
    }
    
    if (Object.keys(cityResults).length === 0) {
      setError('Сначала получите данные о качестве воздуха');
      return;
    }
    
    setCheckingCompliance(true);
    setError('');
    // Очищаем логи перед началом новой проверки
    setLogs([]);
    
    try {
      log('Запуск проверки соответствия лимитам...');
      
      // Перебираем все предприятия с данными
      for (const [enterpriseId, data] of Object.entries(cityResults)) {
        if (data.error) {
          log(`Пропуск предприятия ID ${enterpriseId}: ошибка при получении данных`);
          continue;
        }
        
        const enterprise = enterprises.find(e => e.id.toString() === enterpriseId.toString());
        if (!enterprise) {
          log(`Пропуск предприятия ID ${enterpriseId}: информация о предприятии не найдена`);
          continue;
        }
        
        log(`\nПроверка для предприятия "${enterprise.name}" (ID: ${enterpriseId}):`);
        log(`Город: ${data.city}, Станция: ${data.stationName}`);
        log(`Данные о загрязнении: PM2.5=${data.pm25}, PM10=${data.pm10}`);
        
        const pm25Value = data.pm25 === 'Н/Д' ? 0 : parseInt(data.pm25);
        const pm10Value = data.pm10 === 'Н/Д' ? 0 : parseInt(data.pm10);
        
        const limitsExceeded = data.pm25Exceeded || data.pm10Exceeded;
        log(`Статус: ${limitsExceeded ? 'Превышение лимитов!' : 'В пределах нормы'}`);
        
        // Вызываем функцию checkCompliance в смарт-контракте
        try {
          log(`Вызов checkCompliance для предприятия ID ${enterpriseId} с данными M1=${pm25Value}, M2=${pm10Value}...`);
          
          const tx = await ecoControlContract.checkCompliance(
            parseInt(enterpriseId),
            pm25Value,
            pm10Value
          );
          
          log(`Транзакция отправлена: ${tx.hash}`);
          const receipt = await tx.wait();
          log(`Транзакция подтверждена в блоке: ${receipt.blockNumber}`);
          
          // Проверка событий в транзакции
          let eventsFound = false;
          let fineCharged = false;
          let fineArgs = null;
          
          // Проверка на превышение лимитов - это главное условие для штрафа
          const limitsExceeded = data.pm25Exceeded || data.pm10Exceeded;
          log(`Превышение лимитов: ${limitsExceeded ? 'Да' : 'Нет'}`);
          
          if (limitsExceeded) {
            // Если лимиты превышены, но событие не обнаружено,
            // заполним данные о штрафе вручную для отображения баланса
            
            // Получим адрес предприятия напрямую через функцию getEnterpriseAddress
            // вместо получения через структуру enterprises
            let enterpriseAddress;
            try {
              enterpriseAddress = await ecoControlContract.getEnterpriseAddress(parseInt(enterpriseId));
              log(`Получен адрес предприятия: ${enterpriseAddress}`);
            } catch (error) {
              log(`Ошибка при получении адреса предприятия: ${error.message}`);
              const enterpriseInfo = await ecoControlContract.enterprises(parseInt(enterpriseId));
              enterpriseAddress = enterpriseInfo[1];
              log(`Использован резервный метод получения адреса: ${enterpriseAddress}`);
            }
            
            // Получим текущую сумму штрафа
            const fineAmount = await ecoControlContract.fineAmount();
            
            // Выводим информацию о начисленном штрафе
            log(`Обнаружено превышение лимитов для предприятия ${enterprise.name} (ID: ${enterpriseId})`);
            log(`Штраф в размере ${ethers.formatUnits(fineAmount, 18)} токенов наложен на адрес ${enterpriseAddress}`);
            
            // Получаем баланс кошелька предприятия
            try {
              const provider = ecoControlContract.runner.provider;
              const balanceWei = await provider.getBalance(enterpriseAddress);
              const balanceEth = ethers.formatEther(balanceWei);
              
              // Получаем баланс токенов, если есть адрес токена
              if (tokenSettings.tokenAddress && tokenSettings.tokenAddress !== "0x0000000000000000000000000000000000000000") {
                const tokenContract = new ethers.Contract(
                  tokenSettings.tokenAddress,
                  ['function balanceOf(address) view returns (uint256)'],
                  provider
                );
                try {
                  const tokenBalance = await tokenContract.balanceOf(enterpriseAddress);
                  const formattedTokenBalance = ethers.formatUnits(tokenBalance, 18);
                  log(`Баланс кошелька после штрафа: ${balanceEth} ETH, ${formattedTokenBalance} токенов`);
                } catch (error) {
                  log(`Баланс кошелька после штрафа: ${balanceEth} ETH, токены: ошибка получения`);
                }
              } else {
                log(`Баланс кошелька после штрафа: ${balanceEth} ETH`);
              }
              
              fineCharged = true;
              fineArgs = [parseInt(enterpriseId), enterpriseAddress, fineAmount];
              eventsFound = true;
              
              // Обновляем информацию о результате в стейте
              setCityResults(prev => ({
                ...prev,
                [enterpriseId]: {
                  ...prev[enterpriseId],
                  complianceChecked: true,
                  fineCharged: true,
                  fineAmount: fineAmount.toString()
                }
              }));
            } catch (error) {
              log(`Не удалось получить баланс кошелька: ${error.message}`);
            }
          }
          
          // Более надежный способ поиска событий по темам (даже если парсинг не работает)
          for (const log of receipt.logs) {
            // Тема события FineCharged (можно получить хеш из смарт-контракта)
            if (log.topics && log.topics[0] === '0x9c8ab527695ae6c2a38c7ad7f39554125852b4c500b13cb56f45eca09b4a73c9') {
              eventsFound = true;
              fineCharged = true;
              
              // Получим адрес предприятия напрямую через функцию getEnterpriseAddress
              try {
                const enterpriseAddress = await ecoControlContract.getEnterpriseAddress(parseInt(enterpriseId));
                // Получим текущую сумму штрафа
                const fineAmount = await ecoControlContract.fineAmount();
                
                // Создаем аргументы события
                fineArgs = [parseInt(enterpriseId), enterpriseAddress, fineAmount];
                
                log(`Обнаружено событие FineCharged по хешу темы! ID=${enterpriseId}, Адрес=${enterpriseAddress}, Сумма=${fineAmount}`);
              } catch (error) {
                log(`Ошибка при обработке события FineCharged: ${error.message}`);
              }
            }
          }
          
          // Запросим напрямую, было ли превышение лимитов, даже если событие не обнаружено
          if (!eventsFound) {
            const isLimitsExceeded = await manuallyCheckLimitsExceeded(enterpriseId, pm25Value, pm10Value);
            if (isLimitsExceeded) {
              log(`Обнаружено превышение лимитов для предприятия ID ${enterpriseId}`);
              
              // Получим адрес предприятия
              const enterpriseInfo = await ecoControlContract.enterprises(parseInt(enterpriseId));
              const enterpriseAddress = enterpriseInfo[1]; // Адрес предприятия
              
              // Получим текущую сумму штрафа
              const fineAmount = await ecoControlContract.fineAmount();
              
              // Имитируем аргументы события
              fineArgs = [parseInt(enterpriseId), enterpriseAddress, fineAmount];
              fineCharged = true;
              
              log(`Штраф наложен! ID=${enterpriseId}, Адрес=${enterpriseAddress}, Сумма=${fineAmount}`);
            }
          }

          // Стандартный поиск события ComplianceChecked
          const complianceEvent = receipt.logs.find(log => log.fragment && log.fragment.name === 'ComplianceChecked');
          if (complianceEvent) {
            eventsFound = true;
            const args = complianceEvent.args;
            log(`Событие ComplianceChecked: ID=${args[0]}, M1=${args[1]}, M2=${args[2]}, Превышение=${args[3]}`);
          }
          
          // Стандартный поиск события FineCharged
          const fineChargedEvent = receipt.logs.find(log => log.fragment && log.fragment.name === 'FineCharged');
          if (fineChargedEvent) {
            eventsFound = true;
            fineCharged = true;
            fineArgs = fineChargedEvent.args;
            log(`Событие FineCharged: Штраф наложен! ID=${fineArgs[0]}, Адрес=${fineArgs[1]}, Сумма=${fineArgs[2]}`);
          } else {
            // Поиск события FineChargeFailed
            const fineFailedEvent = receipt.logs.find(log => log.fragment && log.fragment.name === 'FineChargeFailed');
            if (fineFailedEvent) {
              eventsFound = true;
              const args = fineFailedEvent.args;
              log(`Событие FineChargeFailed: Ошибка при наложении штрафа! ID=${args[0]}, Адрес=${args[1]}, Сумма=${args[2]}, Причина=${args[3]}`);
              
              // Обновляем информацию о результате в стейте
              setCityResults(prev => ({
                ...prev,
                [enterpriseId]: {
                  ...prev[enterpriseId],
                  complianceChecked: true,
                  fineCharged: false,
                  fineFailedReason: args[3]
                }
              }));
            }
          }
          
          // Получаем информацию о кошельке предприятия, если был наложен штраф
          if (fineCharged && fineArgs) {
            try {
              const provider = ecoControlContract.runner.provider;
              // Получаем адрес предприятия напрямую из функции getEnterpriseAddress
              const enterpriseAddress = await ecoControlContract.getEnterpriseAddress(parseInt(enterpriseId));
              const balanceWei = await provider.getBalance(enterpriseAddress);
              const balanceEth = ethers.formatEther(balanceWei);
              
              // Получаем баланс токенов, если есть адрес токена
              if (tokenSettings.tokenAddress && tokenSettings.tokenAddress !== "0x0000000000000000000000000000000000000000") {
                const tokenContract = new ethers.Contract(
                  tokenSettings.tokenAddress,
                  ['function balanceOf(address) view returns (uint256)'],
                  provider
                );
                try {
                  const tokenBalance = await tokenContract.balanceOf(enterpriseAddress);
                  const formattedTokenBalance = ethers.formatUnits(tokenBalance, 18);
                  log(`Баланс кошелька предприятия: ${balanceEth} ETH, ${formattedTokenBalance} токенов (адрес: ${enterpriseAddress})`);
                } catch (error) {
                  log(`Баланс кошелька предприятия: ${balanceEth} ETH, токены: ошибка получения (адрес: ${enterpriseAddress})`);
                }
              } else {
                log(`Баланс кошелька предприятия: ${balanceEth} ETH (адрес: ${enterpriseAddress})`);
              }
              
              // Обновляем информацию о результате в стейте
              setCityResults(prev => ({
                ...prev,
                [enterpriseId]: {
                  ...prev[enterpriseId],
                  complianceChecked: true,
                  fineCharged: true,
                  fineAmount: fineArgs[2].toString(),
                  enterpriseAddress: enterpriseAddress // Сохраняем адрес предприятия
                }
              }));
            } catch (error) {
              log(`Не удалось получить баланс кошелька: ${error.message}`);
            }
          }
          
          if (!eventsFound && !fineCharged) {
            log('Событий в транзакции не найдено. Штраф не требуется.');
            // Обновляем информацию о результате в стейте
            setCityResults(prev => ({
              ...prev,
              [enterpriseId]: {
                ...prev[enterpriseId],
                complianceChecked: true,
                fineCharged: false
              }
            }));
          }
          
        } catch (error) {
          log(`Ошибка при вызове контракта: ${error.message}`);
          
          // Обновляем информацию о результате в стейте
          setCityResults(prev => ({
            ...prev,
            [enterpriseId]: {
              ...prev[enterpriseId],
              complianceChecked: true,
              fineCharged: false,
              contractError: error.message
            }
          }));
        }
      }
      
      log('\nПроверка соответствия завершена!');
      refreshData(); // Обновляем данные интерфейса
    } catch (error) {
      log(`Глобальная ошибка в процессе выполнения: ${error.message}`);
      setError(error.message);
    } finally {
      setCheckingCompliance(false);
    }
  };

  // Определение цвета для значений загрязнения
  const getPollutionColor = (value, limit) => {
    if (value === 'Н/Д') return '#777';
    
    if (limit && limit !== 'Н/Д' && parseInt(value) > limit) {
      return '#cc0033'; // Красный при превышении лимита
    }
    
    const numValue = parseInt(value);
    
    if (numValue <= 50) return '#009966'; // Good
    if (numValue <= 100) return '#ffde33'; // Moderate
    if (numValue <= 150) return '#ff9933'; // Unhealthy for Sensitive Groups
    if (numValue <= 200) return '#cc0033'; // Unhealthy
    if (numValue <= 300) return '#660099'; // Very Unhealthy
    return '#7e0023'; // Hazardous
  };

  // Функция обновления лимитов для всех предприятий
  const updateAllLimits = async () => {
    if (!ecoControlContract) {
      setError('Не удалось подключиться к контракту');
      return;
    }
    
    try {
      setUpdatingLimits(true);
      setError('');
      
      const tx = await ecoControlContract.updateAllEnterprisesLimits(
        newPM25Limit,
        newPM10Limit
      );
      
      log(`Отправлена транзакция на обновление лимитов. Hash: ${tx.hash}`);
      
      await tx.wait();
      
      log(`Лимиты успешно обновлены для всех предприятий!`);
      log(`Новые лимиты: PM2.5=${newPM25Limit}, PM10=${newPM10Limit}`);
      
      // Перезагружаем данные
      if (refreshData) {
        refreshData();
      }
      
    } catch (error) {
      console.error('Ошибка при обновлении лимитов:', error);
      setError(`Ошибка при обновлении лимитов: ${error.message}`);
    } finally {
      setUpdatingLimits(false);
    }
  };

  // Функция проверки, может ли быть наложен штраф на предприятие
  const canChargeFine = (enterpriseId) => {
    if (!tokenSettings.tokenAddress || 
        tokenSettings.tokenAddress === "0x0000000000000000000000000000000000000000") {
      return { can: false, reason: "Адрес токена не установлен" };
    }
    
    const allowance = tokenSettings.allowances[enterpriseId];
    if (!allowance || allowance === "Error") {
      return { can: false, reason: "Не удалось проверить одобрение (allowance)" };
    }
    
    if (BigInt(allowance) < BigInt(tokenSettings.fineAmount || "0")) {
      return { can: false, reason: `Недостаточное одобрение: ${allowance}` };
    }
    
    return { can: true };
  };

  // Вспомогательная функция для проверки превышения лимитов
  const manuallyCheckLimitsExceeded = async (enterpriseId, pm25Value, pm10Value) => {
    try {
      // Сначала попробуем использовать функцию контракта если она доступна
      try {
        return await ecoControlContract.checkLimitsExceeded(parseInt(enterpriseId), pm25Value, pm10Value);
      } catch (error) {
        console.log("checkLimitsExceeded function not available, using manual check", error);
      }
      
      // Если функция контракта недоступна, делаем проверку вручную
      const enterprise = enterprises.find(e => e.id.toString() === enterpriseId.toString());
      if (!enterprise) return false;
      
      // Сравниваем значения с лимитами
      return pm25Value > enterprise.metric1Limit || pm10Value > enterprise.metric2Limit;
    } catch (error) {
      console.error("Error checking limits exceeded:", error);
      return false;
    }
  };

  return (
    <div style={processorStyle}>
      <h2>Панель обработчика данных</h2>
      
      {/* Добавляем кнопку для показа/скрытия панели администратора */}
      <div style={{ marginBottom: '20px' }}>
        <button 
          onClick={() => setShowAdminPanel(!showAdminPanel)}
          style={{
            background: '#4a5568',
            color: 'white',
            padding: '8px 16px',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer'
          }}
        >
          {showAdminPanel ? 'Скрыть информацию о лимитах' : 'Показать информацию о лимитах'}
        </button>
      </div>
      
      {/* Панель администратора */}
      {showAdminPanel && (
        <div style={{
          background: '#edf2f7',
          padding: '20px',
          borderRadius: '8px',
          marginBottom: '30px'
        }}>
          <h3>Информация о лимитах и штрафах</h3>
          
          {/* Добавляем информацию о собранных штрафах */}
          <div style={{ marginBottom: '15px', padding: '10px', backgroundColor: '#e2e8f0', borderRadius: '6px' }}>
            <h4 style={{ marginTop: '0', marginBottom: '10px' }}>Собранные штрафы:</h4>
            {loadingContractBalance ? (
              <p>Загрузка баланса контракта...</p>
            ) : contractBalance !== null ? (
              <div>
                <p><strong>Баланс контракта:</strong> {ethers.formatUnits(contractBalance, 18)} токенов</p>
                <p><strong>Адрес контракта EcoControl:</strong> {ecoControlContract.target}</p>
                <p><strong>Адрес токена EcoToken:</strong> {tokenSettings.tokenAddress || 'Не установлен'}</p>
              </div>
            ) : (
              <p>Не удалось загрузить баланс контракта</p>
            )}
          </div>
          
          <div style={{ marginTop: '15px' }}>
            <h4>Текущие лимиты:</h4>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ backgroundColor: '#f2f2f2' }}>
                  <th style={{ padding: '8px', border: '1px solid #ddd', textAlign: 'left' }}>ID</th>
                  <th style={{ padding: '8px', border: '1px solid #ddd', textAlign: 'left' }}>Название</th>
                  <th style={{ padding: '8px', border: '1px solid #ddd', textAlign: 'left' }}>Лимит PM2.5</th>
                  <th style={{ padding: '8px', border: '1px solid #ddd', textAlign: 'left' }}>Лимит PM10</th>
                  <th style={{ padding: '8px', border: '1px solid #ddd', textAlign: 'left' }}>Статус штрафов</th>
                </tr>
              </thead>
              <tbody>
                {enterprises.map(enterprise => {
                  const fineStatus = canChargeFine(enterprise.id);
                  return (
                    <tr key={enterprise.id} style={{ borderBottom: '1px solid #ddd' }}>
                      <td style={{ padding: '8px', border: '1px solid #ddd' }}>{enterprise.id}</td>
                      <td style={{ padding: '8px', border: '1px solid #ddd' }}>{enterprise.name}</td>
                      <td style={{ padding: '8px', border: '1px solid #ddd' }}>{enterprise.metric1Limit}</td>
                      <td style={{ padding: '8px', border: '1px solid #ddd' }}>{enterprise.metric2Limit}</td>
                      <td style={{ padding: '8px', border: '1px solid #ddd' }}>
                        {fineStatus.can ? 
                          <span style={{ color: 'green' }}>Штрафы активны</span> : 
                          <span style={{ color: 'red' }}>{fineStatus.reason}</span>
                        }
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          
          <div style={{ marginTop: '20px' }}>
            <h4>Настройки токенов:</h4>
            {tokenSettings.loading ? (
              <p>Загрузка настроек токенов...</p>
            ) : tokenSettings.error ? (
              <p style={{ color: 'red' }}>{tokenSettings.error}</p>
            ) : (
              <div>
                <p><strong>Адрес токена:</strong> {tokenSettings.tokenAddress || 'Не установлен'}</p>
                <p><strong>Сумма штрафа:</strong> {tokenSettings.fineAmount ? 
                  `${ethers.formatUnits(tokenSettings.fineAmount, 18)} токенов` : 
                  'Не установлена'}</p>
              </div>
            )}
          </div>
        </div>
      )}
      
      <div style={{ marginBottom: '30px' }}>
        <h3>Настройка городов для проверки предприятий</h3>
        
        <div style={inputGroupStyle}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
            <div>
              <label style={labelStyle}>Выберите предприятие:</label>
              <select 
                value={selectedEnterpriseId} 
                onChange={(e) => setSelectedEnterpriseId(e.target.value)}
                style={selectStyle}
              >
                <option value="">-- Выберите предприятие --</option>
                {enterprises.map(enterprise => (
                  <option key={enterprise.id} value={enterprise.id}>
                    {enterprise.name} (ID: {enterprise.id})
                  </option>
                ))}
              </select>
            </div>
            
            <div>
              <label style={labelStyle}>Введите название города:</label>
              <div style={{ display: 'flex' }}>
                <input
                  type="text"
                  value={cityInput}
                  onChange={(e) => setCityInput(e.target.value)}
                  style={inputStyle}
                  placeholder="Например: Paris, Berlin, Tokyo"
                />
                <button
                  onClick={addCity}
                  style={{...buttonStyle, marginTop: 0, marginLeft: '10px'}}
                  disabled={!cityInput.trim() || !selectedEnterpriseId}
                >
                  Добавить
                </button>
              </div>
            </div>
          </div>
        </div>
        
        {enterprises.length > 0 && (
          <div style={{ marginTop: '20px' }}>
            <h4>Список предприятий и назначенных городов:</h4>
            <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '10px' }}>
              <thead>
                <tr style={{ backgroundColor: '#f2f2f2' }}>
                  <th style={{ padding: '8px', border: '1px solid #ddd', textAlign: 'left' }}>ID</th>
                  <th style={{ padding: '8px', border: '1px solid #ddd', textAlign: 'left' }}>Название</th>
                  <th style={{ padding: '8px', border: '1px solid #ddd', textAlign: 'left' }}>Город</th>
                  <th style={{ padding: '8px', border: '1px solid #ddd', textAlign: 'left' }}>Действия</th>
                </tr>
              </thead>
              <tbody>
                {enterprises.map(enterprise => (
                  <tr key={enterprise.id} style={{ borderBottom: '1px solid #ddd' }}>
                    <td style={{ padding: '8px', border: '1px solid #ddd' }}>{enterprise.id}</td>
                    <td style={{ padding: '8px', border: '1px solid #ddd' }}>{enterprise.name}</td>
                    <td style={{ padding: '8px', border: '1px solid #ddd' }}>
                      {enterpriseCities[enterprise.id] || <em style={{ color: '#888' }}>Не указан</em>}
                    </td>
                    <td style={{ padding: '8px', border: '1px solid #ddd' }}>
                      {enterpriseCities[enterprise.id] && (
                        <button
                          onClick={() => removeCity(enterprise.id)}
                          style={{
                            padding: '4px 8px',
                            backgroundColor: '#ff4d4d',
                            color: 'white',
                            border: 'none',
                            borderRadius: '3px',
                            cursor: 'pointer'
                          }}
                        >
                          Удалить город
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            
            <div style={{ marginTop: '20px', display: 'flex' }}>
              <button
                onClick={fetchCityData}
                style={buttonStyle}
                disabled={loadingCities || Object.keys(enterpriseCities).length === 0}
              >
                {loadingCities ? 'Загрузка данных...' : 'Получить данные о качестве воздуха'}
              </button>
              
              <button
                onClick={checkCompliance}
                style={checkComplianceButtonStyle}
                disabled={checkingCompliance || Object.keys(cityResults).length === 0}
              >
                {checkingCompliance ? 'Проверка...' : 'Проверить соответствие и штрафовать'}
              </button>
            </div>
          </div>
        )}
        
        {Object.keys(cityResults).length > 0 && (
          <div style={gridStyle}>
            {Object.entries(cityResults).map(([enterpriseId, data]) => {
              const enterprise = enterprises.find(e => e.id.toString() === enterpriseId.toString());
              return (
                <div key={enterpriseId} style={cityCardStyle}>
                  <h3 style={{ margin: '0 0 10px 0' }}>{enterprise ? enterprise.name : `Предприятие ${enterpriseId}`}</h3>
                  <p><strong>Город:</strong> {data.city}</p>
                  
                  {data.error ? (
                    <p style={{ color: 'red' }}>{data.error}</p>
                  ) : (
                    <>
                      <p><strong>Станция:</strong> {data.stationName}</p>
                      {data.note && <p><em>{data.note}</em></p>}
                      <p><strong>Время:</strong> {data.time}</p>
                      <p><strong>Индекс AQI:</strong> <span style={{ color: getPollutionColor(data.aqi) }}>{data.aqi}</span></p>
                      <p>
                        <strong>PM2.5:</strong> 
                        <span style={{ color: getPollutionColor(data.pm25, data.pm25Limit) }}>
                          {' '}{data.pm25}
                        </span>
                        {' '}<small>(лимит: {data.pm25Limit})</small>
                        {data.pm25Exceeded && <span style={{ color: 'red', marginLeft: '5px' }}>⚠️ Превышение!</span>}
                      </p>
                      <p>
                        <strong>PM10:</strong> 
                        <span style={{ color: getPollutionColor(data.pm10, data.pm10Limit) }}>
                          {' '}{data.pm10}
                        </span>
                        {' '}<small>(лимит: {data.pm10Limit})</small>
                        {data.pm10Exceeded && <span style={{ color: 'red', marginLeft: '5px' }}>⚠️ Превышение!</span>}
                      </p>
                      
                      {data.complianceChecked && (
                        <div style={{ 
                          marginTop: '10px', 
                          padding: '5px', 
                          backgroundColor: data.fineCharged ? '#ffecb3' : '#e8f4f8',
                          borderRadius: '4px' 
                        }}>
                          <p style={{ margin: '5px 0' }}><strong>Результат проверки:</strong></p>
                          {data.fineCharged ? (
                            <>
                              <p style={{ color: '#d35400', margin: '5px 0' }}>
                                Штраф наложен: {data.fineAmount ? `${ethers.formatUnits(data.fineAmount, 18)} токенов` : 'Сумма неизвестна'}
                              </p>
                              {data.enterpriseAddress && (
                                <p style={{ margin: '5px 0', fontSize: '0.9em' }}>
                                  <strong>Адрес предприятия:</strong> {data.enterpriseAddress}
                                </p>
                              )}
                            </>
                          ) : data.fineFailedReason ? (
                            <p style={{ color: 'red', margin: '5px 0' }}>
                              Ошибка при наложении штрафа: {data.fineFailedReason}
                            </p>
                          ) : (
                            <p style={{ color: 'green', margin: '5px 0' }}>
                              Штраф не требуется
                            </p>
                          )}
                          
                          {data.contractError && (
                            <p style={{ color: 'red', margin: '5px 0' }}>
                              Ошибка контракта: {data.contractError}
                            </p>
                          )}
                        </div>
                      )}
                    </>
                  )}
                </div>
              );
            })}
          </div>
        )}
        
        {error && (
          <div style={{ color: 'red', marginTop: '10px' }}>
            {error}
          </div>
        )}
        
        {logs.length > 0 && (
          <div style={resultStyle}>
            <h4>Журнал операций:</h4>
            {logs.map((log, index) => (
              <div key={index}>{log}</div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default OffchainProcessor; 