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
    
    if (enterprises.length > 0) {
      loadTokenSettings();
    }
  }, [ecoControlContract, enterprises]);

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
          
          // Поиск события ComplianceChecked
          const complianceEvent = receipt.logs.find(log => log.fragment && log.fragment.name === 'ComplianceChecked');
          if (complianceEvent) {
            eventsFound = true;
            const args = complianceEvent.args;
            log(`Событие ComplianceChecked: ID=${args[0]}, M1=${args[1]}, M2=${args[2]}, Превышение=${args[3]}`);
          }
          
          // Поиск события FineCharged
          const fineChargedEvent = receipt.logs.find(log => log.fragment && log.fragment.name === 'FineCharged');
          if (fineChargedEvent) {
            eventsFound = true;
            const args = fineChargedEvent.args;
            log(`Событие FineCharged: Штраф наложен! ID=${args[0]}, Адрес=${args[1]}, Сумма=${args[2]}`);
            
            // Обновляем информацию о результате в стейте
            setCityResults(prev => ({
              ...prev,
              [enterpriseId]: {
                ...prev[enterpriseId],
                complianceChecked: true,
                fineCharged: true,
                fineAmount: args[2].toString()
              }
            }));
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
          
          if (!eventsFound) {
            log('Событий в транзакции не найдено.');
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
          {showAdminPanel ? 'Скрыть панель администратора' : 'Показать панель администратора'}
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
          <h3>Панель администратора</h3>
          <p>Здесь вы можете установить новые лимиты для всех предприятий.</p>
          
          <div style={{ display: 'flex', gap: '20px', marginBottom: '20px' }}>
            <div>
              <label style={labelStyle}>
                Лимит PM2.5:
                <input
                  type="number"
                  value={newPM25Limit}
                  onChange={(e) => setNewPM25Limit(parseInt(e.target.value))}
                  style={inputStyle}
                  min="0"
                />
              </label>
            </div>
            <div>
              <label style={labelStyle}>
                Лимит PM10:
                <input
                  type="number"
                  value={newPM10Limit}
                  onChange={(e) => setNewPM10Limit(parseInt(e.target.value))}
                  style={inputStyle}
                  min="0"
                />
              </label>
            </div>
          </div>
          
          <button
            onClick={updateAllLimits}
            disabled={updatingLimits}
            style={{
              background: '#48bb78',
              color: 'white',
              padding: '10px 20px',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontWeight: 'bold'
            }}
          >
            {updatingLimits ? 'Обновление...' : 'Обновить лимиты для всех предприятий'}
          </button>
          
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
                            <p style={{ color: '#d35400', margin: '5px 0' }}>
                              Штраф наложен: {data.fineAmount ? `${data.fineAmount} токенов` : 'Сумма неизвестна'}
                            </p>
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