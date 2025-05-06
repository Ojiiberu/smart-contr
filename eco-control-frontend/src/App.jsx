import { useState, useEffect } from 'react';
import './App.css';
import { 
  connectWallet, 
  getContracts, 
  getWaqiDataByCity,
  getWaqiDataByStationUID,
  searchWaqiStations,
  enterprisesConfig,
  disconnectWallet
} from './ethers-utils';
import EnterpriseCard from './components/EnterpriseCard';
import AdminPanel from './components/AdminPanel';
import OffchainProcessor from './components/OffchainProcessor';

// Адрес, которому разрешен доступ к странице мониторинга
const MONITORING_ACCESS_ACCOUNT = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";

function App() {
  const [walletConnected, setWalletConnected] = useState(false);
  const [walletAddress, setWalletAddress] = useState('');
  const [ecoControlContract, setEcoControlContract] = useState(null);
  const [ecoTokenContract, setEcoTokenContract] = useState(null);
  const [enterprises, setEnterprises] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [waqiApiToken, setWaqiApiToken] = useState('e73f3d29e99717ea5cb981aaa8748cdbc44c5e27'); // Токен API уже установлен
  const [waqiData, setWaqiData] = useState({});
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [isDataProcessor, setIsDataProcessor] = useState(false);
  const [activeTab, setActiveTab] = useState('dashboard'); // dashboard, admin, processor
  const [hasMonitoringAccess, setHasMonitoringAccess] = useState(false);

  // Подключение к кошельку
  const handleConnectWallet = async () => {
    try {
      setError('');
      const { signer, address } = await connectWallet();
      const contracts = getContracts(signer);
      
      setWalletConnected(true);
      setWalletAddress(address);
      setEcoControlContract(contracts.ecoControlContract);
      setEcoTokenContract(contracts.ecoTokenContract);
      
      // Проверяем доступ к мониторингу
      setHasMonitoringAccess(address.toLowerCase() === MONITORING_ACCESS_ACCOUNT.toLowerCase());
      
      // После подключения загружаем данные и проверяем роль
      await loadEnterpriseData(contracts.ecoControlContract);
      await checkDataProcessorRole(contracts.ecoControlContract, address);
    } catch (error) {
      console.error("Error connecting wallet:", error);
      setError(`Ошибка подключения кошелька: ${error.message}`);
    }
  };
  
  // Отключение от кошелька
  const handleDisconnectWallet = () => {
    disconnectWallet();
    setWalletConnected(false);
    setWalletAddress('');
    setEcoControlContract(null);
    setEcoTokenContract(null);
    setIsDataProcessor(false);
    setHasMonitoringAccess(false);
  };
  
  // Проверка, является ли текущий адрес обработчиком данных
  const checkDataProcessorRole = async (contract, address) => {
    if (!contract || !address) return;
    
    try {
      const processorAddress = await contract.dataProcessorCaller();
      setIsDataProcessor(processorAddress.toLowerCase() === address.toLowerCase());
    } catch (error) {
      console.error("Error checking data processor role:", error);
    }
  };
  
  // Загрузка данных предприятий
  const loadEnterpriseData = async (contract) => {
    if (!contract) return;
    
    setLoading(true);
    try {
      const loadedEnterprises = [];
      
      for (const config of enterprisesConfig) {
        try {
          // Получение данных предприятия из контракта
          const enterprise = await contract.enterprises(config.enterpriseId);
          
          // Получение последних данных о загрязнении
          const latestData = await contract.getLatestEnvironmentalData(config.enterpriseId);
          
          loadedEnterprises.push({
            enterpriseId: config.enterpriseId,
            name: enterprise[0],
            enterpriseAddress: enterprise[1],
            metric1Limit: enterprise[2].toString(),
            metric2Limit: enterprise[3].toString(),
            latestMetric1: enterprise[4].toString(),
            latestMetric2: enterprise[5].toString(),
            latestDataTimestamp: enterprise[6].toString(),
            city: config.city,
            waqiStationUid: config.waqiStationUid, // Может быть undefined
            metricsToCollect: config.metricsToCollect // Добавляем информацию о метриках
          });
        } catch (error) {
          console.error(`Error loading enterprise ${config.enterpriseId}:`, error);
        }
      }
      
      setEnterprises(loadedEnterprises);
    } catch (error) {
      console.error("Error loading enterprise data:", error);
      setError(`Ошибка загрузки данных предприятий: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };
  
  // Гибкая загрузка данных из API WAQI
  const loadWaqiData = async () => {
    if (!waqiApiToken) return;
    
    const newWaqiData = {};
    
    for (const enterprise of enterprisesConfig) {
      try {
        let data = null;
        
        // Пробуем получить данные по городу
        if (enterprise.city) {
          try {
            const cityResult = await getWaqiDataByCity(enterprise.city, waqiApiToken);
            if (cityResult.status === "ok") {
              data = cityResult;
            }
          } catch (error) {
            console.error(`Error fetching WAQI data for city ${enterprise.city}:`, error);
          }
        }
        
        // Пробуем получить данные по UID станции, если данные по городу недоступны
        if (!data && enterprise.waqiStationUid) {
          try {
            const stationResult = await getWaqiDataByStationUID(enterprise.waqiStationUid, waqiApiToken);
            if (stationResult.status === "ok") {
              data = stationResult;
            }
          } catch (error) {
            console.error(`Error fetching WAQI data for station ${enterprise.waqiStationUid}:`, error);
          }
        }
        
        // Если данные все еще не получены, пробуем найти станцию
        if (!data && enterprise.city) {
          try {
            const searchResult = await searchWaqiStations(enterprise.city, waqiApiToken);
            if (searchResult.status === "ok" && searchResult.data.length > 0) {
              const firstStation = searchResult.data[0];
              enterprise.waqiStationUid = firstStation.uid; // Сохраняем UID (в памяти)
              
              const stationResult = await getWaqiDataByStationUID(firstStation.uid, waqiApiToken);
              if (stationResult.status === "ok") {
                data = stationResult;
              }
            }
          } catch (error) {
            console.error(`Error searching WAQI stations for ${enterprise.city}:`, error);
          }
        }
        
        if (data) {
          newWaqiData[enterprise.enterpriseId] = data;
        }
      } catch (error) {
        console.error(`Error in WAQI data fetching process for enterprise ${enterprise.enterpriseId}:`, error);
      }
    }
    
    setWaqiData(newWaqiData);
  };
  
  // Обновить все данные (Refresh)
  const refreshData = () => {
    setRefreshTrigger(prev => prev + 1);
  };
  
  // Эффект для загрузки данных после подключения кошелька
  useEffect(() => {
    if (ecoControlContract) {
      loadEnterpriseData(ecoControlContract);
      checkDataProcessorRole(ecoControlContract, walletAddress);
    }
  }, [ecoControlContract, walletAddress, refreshTrigger]);
  
  // Эффект для загрузки данных из API WAQI
  useEffect(() => {
    if (waqiApiToken) {
      loadWaqiData();
    }
  }, [waqiApiToken, refreshTrigger]);

  // Автоматическая загрузка данных при открытии страницы
  useEffect(() => {
    if (waqiApiToken) {
      loadWaqiData();
    }
  }, []);
  
  return (
    <div className="app-container">
      <header className="header">
        <h1>Eco Control Dashboard</h1>
        <div className="wallet-info">
          {!walletConnected ? (
            <button 
              className="btn" 
              onClick={handleConnectWallet}
            >
              Подключить кошелек
            </button>
          ) : (
            <>
              <div className="wallet-status wallet-connected">
                {walletAddress.substring(0, 6)}...{walletAddress.substring(38)}
                {isDataProcessor && " (Обработчик данных)"}
              </div>
              <button 
                className="btn disconnect-btn" 
                onClick={handleDisconnectWallet}
              >
                Отключиться
              </button>
            </>
          )}
        </div>
      </header>

      {/* Панель навигации */}
      {walletConnected && (
        <div className="nav-tabs">
          {hasMonitoringAccess && (
            <button 
              className={`tab-btn ${activeTab === 'dashboard' ? 'active' : ''}`}
              onClick={() => setActiveTab('dashboard')}
            >
              Мониторинг предприятий
            </button>
          )}
          <button 
            className={`tab-btn ${activeTab === 'processor' ? 'active' : ''}`}
            onClick={() => setActiveTab('processor')}
          >
            Автоматическая проверка
          </button>
        </div>
      )}
      
      {error && <div style={{ color: 'red', margin: '20px 0' }}>{error}</div>}
      
      {/* Вкладка мониторинга предприятий */}
      {walletConnected && activeTab === 'dashboard' && hasMonitoringAccess && (
        <>
          <div className="monitoring-info">
            <h2>Список предприятий и их метрики</h2>
            <table className="enterprise-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Название</th>
                  <th>Адрес</th>
                  <th>Город</th>
                  <th>Станция WAQI</th>
                  <th>Отслеживаемые метрики</th>
                </tr>
              </thead>
              <tbody>
                {enterprises.map(enterprise => (
                  <tr key={enterprise.enterpriseId}>
                    <td>{enterprise.enterpriseId}</td>
                    <td>{enterprise.name}</td>
                    <td>{enterprise.enterpriseAddress.substring(0, 6)}...{enterprise.enterpriseAddress.substring(38)}</td>
                    <td>{enterprise.city || '-'}</td>
                    <td>{enterprise.waqiStationUid || 'Авто'}</td>
                    <td>{enterprise.metricsToCollect?.join(', ')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          
          <div className="action-panel">
            <button 
              onClick={refreshData} 
              className="btn refresh-btn"
              disabled={loading}
            >
              {loading ? 'Загрузка...' : 'Обновить данные'}
            </button>
          </div>
          
          <div className="enterprises-grid">
            {enterprises.map(enterprise => (
              <EnterpriseCard 
                key={enterprise.enterpriseId}
                enterprise={enterprise}
                waqiData={waqiData[enterprise.enterpriseId]}
                contract={ecoControlContract}
                refreshData={refreshData}
              />
            ))}
          </div>
        </>
      )}
      
      {/* Вкладка администрирования */}
      {walletConnected && activeTab === 'admin' && (
        <AdminPanel 
          ecoControlContract={ecoControlContract}
          ecoTokenContract={ecoTokenContract}
          walletAddress={walletAddress}
          refreshData={refreshData}
        />
      )}
      
      {/* Вкладка процессора данных */}
      {walletConnected && activeTab === 'processor' && (
        <OffchainProcessor 
          ecoControlContract={ecoControlContract}
          waqiApiToken={waqiApiToken}
          refreshData={refreshData}
          isDataProcessor={isDataProcessor}
        />
      )}
      
      {/* Стартовая страница */}
      {!walletConnected && (
        <div className="welcome-section">
          <h2>Добро пожаловать в систему экологического мониторинга</h2>
          <p>Для начала работы подключите ваш кошелек MetaMask.</p>
        </div>
      )}
      
      <footer className="footer">
        <p>EcoControl Smart Contract System | <a href="https://github.com/Ojiiberu/smart-contr" target="_blank" rel="noopener noreferrer">GitHub</a></p>
      </footer>
    </div>
  );
}

export default App;
