import { useState, useEffect } from 'react';
import { formatTokenBalance } from '../ethers-utils';
import { ethers } from 'ethers';

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
  contract, // Переименовали из ecoControlContract для краткости
  waqiData, 
  refreshData 
}) {
  const [metric1Limit, setMetric1Limit] = useState('');
  const [metric2Limit, setMetric2Limit] = useState('');
  const [isUpdatingLimits, setIsUpdatingLimits] = useState(false);
  const [isCheckingCompliance, setIsCheckingCompliance] = useState(false);
  const [error, setError] = useState('');
  
  // Загрузка текущих лимитов
  useEffect(() => {
    async function loadLimits() {
      if (contract && enterprise.enterpriseId !== undefined) {
        try {
          const limits = await contract.getEnterpriseLimits(enterprise.enterpriseId);
          setMetric1Limit(limits[0].toString());
          setMetric2Limit(limits[1].toString());
        } catch (error) {
          console.error("Failed to load limits:", error);
          setError("Не удалось загрузить лимиты");
        }
      }
    }
    
    loadLimits();
  }, [contract, enterprise.enterpriseId]);
  
  // Обновление лимитов
  const updateLimits = async () => {
    if (!contract) {
      setError("Подключите кошелек для выполнения этой операции");
      return;
    }
    
    setIsUpdatingLimits(true);
    setError('');
    
    try {
      const tx = await contract.setEnterpriseLimits(
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
    if (!contract) {
      setError("Подключите кошелек для выполнения этой операции");
      return;
    }
    
    if (!waqiData || !waqiData.data || !waqiData.data.iaqi) {
      setError("Нет данных о загрязнении для проверки");
      return;
    }
    
    // Получаем названия метрик из конфигурации предприятия
    const metric1Name = enterprise.metricsToCollect ? enterprise.metricsToCollect[0] : 'pm25';
    const metric2Name = enterprise.metricsToCollect ? enterprise.metricsToCollect[1] : 'pm10';
    
    const metric1Data = waqiData.data.iaqi[metric1Name];
    const metric2Data = waqiData.data.iaqi[metric2Name];
    
    if (!metric1Data || !metric2Data) {
      setError(`Не хватает данных о загрязнении (${metric1Name} или ${metric2Name})`);
      return;
    }
    
    const metric1Value = Math.round(metric1Data.v);
    const metric2Value = Math.round(metric2Data.v);
    
    setIsCheckingCompliance(true);
    setError('');
    
    try {
      const tx = await contract.checkCompliance(
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
      return { metric1: 'Н/Д', metric2: 'Н/Д' };
    }
    
    // Используем названия метрик из конфигурации предприятия
    const metric1Name = enterprise.metricsToCollect ? enterprise.metricsToCollect[0] : 'pm25';
    const metric2Name = enterprise.metricsToCollect ? enterprise.metricsToCollect[1] : 'pm10';
    
    const metric1 = waqiData.data.iaqi[metric1Name] ? Math.round(waqiData.data.iaqi[metric1Name].v) : 'Н/Д';
    const metric2 = waqiData.data.iaqi[metric2Name] ? Math.round(waqiData.data.iaqi[metric2Name].v) : 'Н/Д';
    
    return { metric1, metric2 };
  };
  
  const { metric1, metric2 } = getCurrentPollutionValues();
  
  // Получение названия метрик из конфигурации предприятия
  const metric1Name = enterprise.metricsToCollect ? enterprise.metricsToCollect[0].toUpperCase() : 'PM2.5';
  const metric2Name = enterprise.metricsToCollect ? enterprise.metricsToCollect[1].toUpperCase() : 'PM10';
  
  // Получение информации о станции
  const getStationInfo = () => {
    if (!waqiData || !waqiData.data) return 'Нет данных';
    
    // Название станции и город
    const stationName = waqiData.data.city && waqiData.data.city.name 
      ? waqiData.data.city.name 
      : 'Неизвестная станция';
    
    // Время обновления
    const time = waqiData.data.time && waqiData.data.time.s 
      ? `(обновлено: ${waqiData.data.time.s})` 
      : '';
    
    return `${stationName} ${time}`;
  };
  
  return (
    <div style={cardStyle}>
      <h2>{enterprise.name}</h2>
      
      <div style={sectionStyle}>
        <h3>Информация о предприятии</h3>
        <p><strong>ID:</strong> {enterprise.enterpriseId}</p>
        <p><strong>Адрес контракта:</strong> {enterprise.enterpriseAddress}</p>
        <p><strong>Город:</strong> {enterprise.city || 'Не указан'}</p>
        <p><strong>Станция мониторинга:</strong> {enterprise.waqiStationUid || 'Автоматический выбор'}</p>
        <p><strong>Метрики:</strong> {enterprise.metricsToCollect?.join(', ') || 'Не указаны'}</p>
      </div>
      
      <div style={sectionStyle}>
        <h3>Данные о загрязнении</h3>
        
        {waqiData ? (
          <>
            <p><strong>Источник данных:</strong> {getStationInfo()}</p>
            <p>
              <strong>{metric1Name}:</strong> 
              <span style={{ color: getPollutionColor(metric1, metric1Limit) }}>
                {' '}{metric1} (лимит: {metric1Limit})
              </span>
            </p>
            <p>
              <strong>{metric2Name}:</strong> 
              <span style={{ color: getPollutionColor(metric2, metric2Limit) }}>
                {' '}{metric2} (лимит: {metric2Limit})
              </span>
            </p>
          </>
        ) : (
          <p>Загрузка данных о загрязнении...</p>
        )}
      </div>
      
      <div style={sectionStyle}>
        <h3>Последние данные в смарт-контракте</h3>
        <p><strong>Время обновления:</strong> {formatDate(enterprise.latestDataTimestamp)}</p>
        <p>
          <strong>{metric1Name}:</strong> 
          <span style={{ color: getPollutionColor(enterprise.latestMetric1, metric1Limit) }}>
            {' '}{enterprise.latestMetric1} (лимит: {metric1Limit})
          </span>
        </p>
        <p>
          <strong>{metric2Name}:</strong> 
          <span style={{ color: getPollutionColor(enterprise.latestMetric2, metric2Limit) }}>
            {' '}{enterprise.latestMetric2} (лимит: {metric2Limit})
          </span>
        </p>
      </div>
      
      <div style={sectionStyle}>
        <h3>Управление лимитами</h3>
        <div>
          <label>
            Лимит {metric1Name}:
            <input
              type="number"
              value={metric1Limit}
              onChange={e => setMetric1Limit(e.target.value)}
              style={inputStyle}
            />
          </label>
          <label>
            Лимит {metric2Name}:
            <input
              type="number"
              value={metric2Limit}
              onChange={e => setMetric2Limit(e.target.value)}
              style={inputStyle}
            />
          </label>
          <button
            onClick={updateLimits}
            disabled={isUpdatingLimits}
            style={buttonStyle}
          >
            {isUpdatingLimits ? 'Обновление...' : 'Обновить лимиты'}
          </button>
        </div>
      </div>
      
      <div style={sectionStyle}>
        <h3>Проверка соответствия</h3>
        <button
          onClick={checkCompliance}
          disabled={isCheckingCompliance || !waqiData}
          style={buttonStyle}
        >
          {isCheckingCompliance ? 'Проверка...' : 'Проверить соответствие'}
        </button>
        
        {waqiData && metric1 !== 'Н/Д' && metric2 !== 'Н/Д' && (
          <p>
            Текущие данные: {metric1Name}={metric1}, {metric2Name}={metric2}
            {parseInt(metric1) > parseInt(metric1Limit) || parseInt(metric2) > parseInt(metric2Limit) ? (
              <span style={warningStyle}> (Превышение лимитов!)</span>
            ) : (
              <span style={{ color: 'green' }}> (В пределах нормы)</span>
            )}
          </p>
        )}
      </div>
      
      {error && <div style={errorStyle}>{error}</div>}
    </div>
  );
}

export default EnterpriseCard; 