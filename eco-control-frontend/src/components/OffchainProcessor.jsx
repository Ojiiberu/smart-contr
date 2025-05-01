import { useState } from 'react';
import { enterprisesConfig, getWaqiData } from '../ethers-utils';

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

function OffchainProcessor({ ecoControlContract, waqiApiToken, refreshData, isDataProcessor }) {
  const [processing, setProcessing] = useState(false);
  const [logs, setLogs] = useState([]);
  const [error, setError] = useState('');

  // Функция для логирования (аналог console.log) в интерфейсе
  const log = (message) => {
    setLogs(prevLogs => [...prevLogs, message]);
  };

  // Основная функция для обработки данных 
  // (аналог processEnvironmentalData из offchain-processor.js)
  const runProcessor = async () => {
    if (!ecoControlContract || !waqiApiToken) {
      setError('Необходимо подключить кошелек и установить WAQI API токен');
      return;
    }

    setProcessing(true);
    setLogs([]);
    setError('');

    try {
      log('Запуск обработчика данных о загрязнении...');

      // Проверка прав доступа текущего пользователя
      if (!isDataProcessor) {
        log('Предупреждение: Текущий пользователь не имеет роли обработчика данных (dataProcessorCaller).');
        log('Транзакции могут быть отклонены контрактом.');
      }

      // Обработка для каждого предприятия
      for (const enterpriseConfig of enterprisesConfig) {
        log(`\nОбработка для Предприятия ID ${enterpriseConfig.enterpriseId} (Станция WAQI UID ${enterpriseConfig.waqiStationUid})...`);

        // Получение данных из API WAQI
        log(`Запрос данных из API WAQI для станции ${enterpriseConfig.waqiStationUid}...`);
        
        let metric1Value = 0;
        let metric2Value = 0;
        let dataFetchedSuccessfully = false;

        try {
          const result = await getWaqiData(enterpriseConfig.waqiStationUid, waqiApiToken);
          
          if (result.status === "ok" && result.data && result.data.iaqi) {
            const iaqiData = result.data.iaqi;
            
            // Извлекаем нужные метрики
            const metric1Param = enterpriseConfig.metricsToCollect[0];
            const metric2Param = enterpriseConfig.metricsToCollect[1];
            
            const m1Data = iaqiData[metric1Param];
            const m2Data = iaqiData[metric2Param];
            
            if (m1Data && m2Data && typeof m1Data.v !== 'undefined' && typeof m2Data.v !== 'undefined') {
              // Получаем значения и округляем
              const rawMetric1 = m1Data.v;
              const rawMetric2 = m2Data.v;
              
              metric1Value = Math.round(rawMetric1);
              metric2Value = Math.round(rawMetric2);
              
              // Проверяем на отрицательные значения
              if (metric1Value < 0) metric1Value = 0;
              if (metric2Value < 0) metric2Value = 0;
              
              dataFetchedSuccessfully = true;
              log(`Получены данные из API: ${metric1Param}=${rawMetric1} (${metric1Value} округлено), ${metric2Param}=${rawMetric2} (${metric2Value} округлено).`);
            } else {
              log(`В ответе API не найдены ожидаемые метрики (${metric1Param}, ${metric2Param}).`);
            }
          } else {
            log(`API вернуло статус "${result.status}" или не содержит данных.`);
          }
        } catch (apiError) {
          log(`Ошибка при получении данных из API WAQI: ${apiError.message}`);
        }

        if (!dataFetchedSuccessfully) {
          log(`Не удалось получить корректные данные из API для Предприятия ID ${enterpriseConfig.enterpriseId}. Пропускаем.`);
          continue;
        }

        // Вызов функции checkCompliance в смарт-контракте
        log(`Вызов checkCompliance для предприятия ID ${enterpriseConfig.enterpriseId} с данными M1=${metric1Value}, M2=${metric2Value}...`);
        
        try {
          const tx = await ecoControlContract.checkCompliance(
            enterpriseConfig.enterpriseId,
            metric1Value,
            metric2Value
          );
          
          log(`Транзакция отправлена: ${tx.hash}`);
          const receipt = await tx.wait();
          log(`Транзакция подтверждена в блоке: ${receipt.blockNumber}`);
          
          // Проверка событий
          let eventsFound = false;
          
          // Поиск события ComplianceChecked
          const complianceEvent = receipt.logs.find(log => 
            log.fragment && log.fragment.name === 'ComplianceChecked'
          );
          
          if (complianceEvent) {
            eventsFound = true;
            const args = complianceEvent.args;
            log(`Событие ComplianceChecked: ID=${args[0]}, M1=${args[1]}, M2=${args[2]}, Превышение=${args[3]}`);
          }
          
          // Поиск события FineCharged
          const fineChargedEvent = receipt.logs.find(log => 
            log.fragment && log.fragment.name === 'FineCharged'
          );
          
          if (fineChargedEvent) {
            eventsFound = true;
            const args = fineChargedEvent.args;
            log(`Событие FineCharged: ID=${args[0]}, Адрес=${args[1]}, Сумма=${args[2]}`);
          } else {
            // Поиск события FineChargeFailed
            const fineFailedEvent = receipt.logs.find(log => 
              log.fragment && log.fragment.name === 'FineChargeFailed'
            );
            
            if (fineFailedEvent) {
              eventsFound = true;
              const args = fineFailedEvent.args;
              log(`Событие FineChargeFailed: ID=${args[0]}, Адрес=${args[1]}, Сумма=${args[2]}, Причина=${args[3]}`);
            }
          }
          
          if (!eventsFound) {
            log('Событий в транзакции не найдено.');
          }
          
          log(`Обработка для Предприятия ID ${enterpriseConfig.enterpriseId} завершена.`);
        } catch (txError) {
          log(`Ошибка при вызове контракта checkCompliance для ID ${enterpriseConfig.enterpriseId}: ${txError.message}`);
        }
      }

      log('\nОбработчик данных завершил работу!');
      refreshData(); // Обновляем данные интерфейса

    } catch (error) {
      log(`Глобальная ошибка в процессе выполнения: ${error.message}`);
      setError(error.message);
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div style={processorStyle}>
      <h2>Автоматическая проверка соответствия</h2>
      
      <p>
        Этот компонент имитирует работу offchain-processor.js, который получает данные
        о загрязнении из API WAQI и вызывает функцию checkCompliance для каждого предприятия.
      </p>
      
      {!waqiApiToken && (
        <div style={{ color: 'orange', marginBottom: '10px' }}>
          Предупреждение: WAQI API токен не установлен. Установите его в настройках.
        </div>
      )}
      
      {!isDataProcessor && (
        <div style={{ color: 'orange', marginBottom: '10px' }}>
          Предупреждение: Текущий кошелек не имеет роли dataProcessorCaller.
          Транзакции могут быть отклонены контрактом.
        </div>
      )}
      
      <button
        onClick={runProcessor}
        disabled={processing || !waqiApiToken}
        style={buttonStyle}
      >
        {processing ? 'Обработка...' : 'Запустить проверку для всех предприятий'}
      </button>
      
      {logs.length > 0 && (
        <div style={resultStyle}>
          {logs.map((log, index) => (
            <div key={index}>{log}</div>
          ))}
        </div>
      )}
      
      {error && (
        <div style={{ color: 'red', marginTop: '10px' }}>
          Ошибка: {error}
        </div>
      )}
    </div>
  );
}

export default OffchainProcessor; 