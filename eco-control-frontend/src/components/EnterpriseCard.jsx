import { useState, useEffect } from 'react';
import { formatTokenBalance } from '../ethers-utils';

// Стили для компонента
const cardStyle = {
  border: '1px solid #ccc',
  borderRadius: '8px',
  padding: '16px',
  margin: '16px 0',
  boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
};

const sectionStyle = {
  marginBottom: '16px',
};

const inputStyle = {
  padding: '8px',
  margin: '8px 0',
  borderRadius: '4px',
  border: '1px solid #ccc',
  width: '100px',
  marginRight: '8px',
};

const buttonStyle = {
  padding: '8px 16px',
  backgroundColor: '#4CAF50',
  color: 'white',
  border: 'none',
  borderRadius: '4px',
  cursor: 'pointer',
  marginRight: '8px',
};

const warningStyle = {
  color: 'orange',
  fontWeight: 'bold',
};

const errorStyle = {
  color: 'red',
  fontWeight: 'bold',
};

function EnterpriseCard({ 
  enterprise, 
  ecoTokenContract, 
  ecoControlContract, 
  waqiData, 
  refreshData,
  walletConnected
}) {
  const [metric1Limit, setMetric1Limit] = useState('');
  const [metric2Limit, setMetric2Limit] = useState('');
  const [tokenBalance, setTokenBalance] = useState('0');
  const [tokenSymbol, setTokenSymbol] = useState('ECO');
  const [isUpdatingLimits, setIsUpdatingLimits] = useState(false);
  const [isCheckingCompliance, setIsCheckingCompliance] = useState(false);
  const [error, setError] = useState('');
  
  // Загрузка баланса токенов предприятия
  useEffect(() => {
    async function loadTokenData() {
      if (ecoTokenContract && enterprise.enterpriseAddress) {
        try {
          const balance = await ecoTokenContract.balanceOf(enterprise.enterpriseAddress);
          const decimals = await ecoTokenContract.decimals();
          const symbol = await ecoTokenContract.symbol();
          
          setTokenBalance(formatTokenBalance(balance, decimals));
          setTokenSymbol(symbol);
        } catch (error) {
          console.error("Failed to load token data:", error);
          setError("Не удалось загрузить данные токена");
        }
      }
    }
    
    loadTokenData();
  }, [ecoTokenContract, enterprise.enterpriseAddress]);
  
  // Загрузка текущих лимитов
  useEffect(() => {
    async function loadLimits() {
      if (ecoControlContract && enterprise.enterpriseId !== undefined) {
        try {
          const limits = await ecoControlContract.getEnterpriseLimits(enterprise.enterpriseId);
          setMetric1Limit(limits[0].toString());
          setMetric2Limit(limits[1].toString());
        } catch (error) {
          console.error("Failed to load limits:", error);
          setError("Не удалось загрузить лимиты");
        }
      }
    }
    
    loadLimits();
  }, [ecoControlContract, enterprise.enterpriseId]);
  
  // Обновление лимитов
  const updateLimits = async () => {
    if (!walletConnected) {
      setError("Подключите кошелек для выполнения этой операции");
      return;
    }
    
    setIsUpdatingLimits(true);
    setError('');
    
    try {
      const tx = await ecoControlContract.setEnterpriseLimits(
        enterprise.enterpriseId,
        metric1Limit,
        metric2Limit
      );
      
      await tx.wait();
      alert(`Лимиты обновлены для предприятия ${enterprise.name}`);
      refreshData();
    } catch (error) {
      console.error("Failed to update limits:", error);
      setError("Не удалось обновить лимиты. Проверьте права доступа.");
    } finally {
      setIsUpdatingLimits(false);
    }
  };
  
  // Проверка соответствия
  const checkCompliance = async () => {
    if (!walletConnected) {
      setError("Подключите кошелек для выполнения этой операции");
      return;
    }
    
    if (!waqiData || !waqiData.data || !waqiData.data.iaqi) {
      setError("Нет данных о загрязнении для проверки");
      return;
    }
    
    const pm25Data = waqiData.data.iaqi.pm25;
    const pm10Data = waqiData.data.iaqi.pm10;
    
    if (!pm25Data || !pm10Data) {
      setError("Не хватает данных о загрязнении (PM2.5 или PM10)");
      return;
    }
    
    const metric1Value = Math.round(pm25Data.v);
    const metric2Value = Math.round(pm10Data.v);
    
    setIsCheckingCompliance(true);
    setError('');
    
    try {
      const tx = await ecoControlContract.checkCompliance(
        enterprise.enterpriseId,
        metric1Value,
        metric2Value
      );
      
      await tx.wait();
      alert(`Проверка соответствия выполнена для предприятия ${enterprise.name}`);
      refreshData();
    } catch (error) {
      console.error("Failed to check compliance:", error);
      setError("Не удалось выполнить проверку соответствия. Проверьте права доступа.");
    } finally {
      setIsCheckingCompliance(false);
    }
  };
  
  // Определение цвета для значений загрязнения
  const getPollutionColor = (value, limit) => {
    if (!value || !limit) return 'black';
    return parseInt(value) > parseInt(limit) ? 'red' : 'green';
  };
  
  // Форматирование даты из timestamp
  const formatDate = (timestamp) => {
    if (!timestamp || timestamp === '0') return 'Нет данных';
    return new Date(parseInt(timestamp) * 1000).toLocaleString();
  };
  
  // Получение текущих значений загрязнений из API waqi
  const getCurrentPollutionValues = () => {
    if (!waqiData || !waqiData.data || !waqiData.data.iaqi) {
      return { pm25: 'Н/Д', pm10: 'Н/Д' };
    }
    
    const pm25 = waqiData.data.iaqi.pm25 ? Math.round(waqiData.data.iaqi.pm25.v) : 'Н/Д';
    const pm10 = waqiData.data.iaqi.pm10 ? Math.round(waqiData.data.iaqi.pm10.v) : 'Н/Д';
    
    return { pm25, pm10 };
  };
  
  const { pm25, pm10 } = getCurrentPollutionValues();
  
  return (
    <div style={cardStyle}>
      <h2>{enterprise.name || `Предприятие ${enterprise.enterpriseId}`}</h2>
      <p>Адрес: {enterprise.enterpriseAddress}</p>
      
      <div style={sectionStyle}>
        <h3>Баланс токенов</h3>
        <p>{tokenBalance} {tokenSymbol}</p>
      </div>
      
      <div style={sectionStyle}>
        <h3>Лимиты загрязнения</h3>
        <div>
          <label>PM2.5 (мкг/м³): </label>
          <input 
            type="number" 
            value={metric1Limit} 
            onChange={(e) => setMetric1Limit(e.target.value)}
            style={inputStyle}
          />
        </div>
        <div>
          <label>PM10 (мкг/м³): </label>
          <input 
            type="number" 
            value={metric2Limit} 
            onChange={(e) => setMetric2Limit(e.target.value)}
            style={inputStyle}
          />
        </div>
        <button 
          onClick={updateLimits} 
          disabled={isUpdatingLimits || !walletConnected}
          style={buttonStyle}
        >
          {isUpdatingLimits ? 'Обновление...' : 'Обновить лимиты'}
        </button>
      </div>
      
      <div style={sectionStyle}>
        <h3>Текущие показатели загрязнения (API)</h3>
        <p>
          PM2.5: <span style={{ color: getPollutionColor(pm25, metric1Limit) }}>{pm25} мкг/м³</span>
          {pm25 !== 'Н/Д' && metric1Limit && parseInt(pm25) > parseInt(metric1Limit) && 
            <span style={warningStyle}> (Превышение!)</span>}
        </p>
        <p>
          PM10: <span style={{ color: getPollutionColor(pm10, metric2Limit) }}>{pm10} мкг/м³</span>
          {pm10 !== 'Н/Д' && metric2Limit && parseInt(pm10) > parseInt(metric2Limit) && 
            <span style={warningStyle}> (Превышение!)</span>}
        </p>
      </div>
      
      <div style={sectionStyle}>
        <h3>Последние проверенные данные (Блокчейн)</h3>
        <p>PM2.5: {enterprise.latestMetric1 || 'Нет данных'} мкг/м³</p>
        <p>PM10: {enterprise.latestMetric2 || 'Нет данных'} мкг/м³</p>
        <p>Дата проверки: {formatDate(enterprise.latestDataTimestamp)}</p>
      </div>
      
      <button 
        onClick={checkCompliance} 
        disabled={isCheckingCompliance || !walletConnected}
        style={buttonStyle}
      >
        {isCheckingCompliance ? 'Проверка...' : 'Запустить проверку соответствия'}
      </button>
      
      {error && <p style={errorStyle}>{error}</p>}
    </div>
  );
}

export default EnterpriseCard; 