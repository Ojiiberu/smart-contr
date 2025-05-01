import { useState, useEffect } from 'react';

// Стили для компонента
const panelStyle = {
  backgroundColor: '#f8f9fa',
  border: '1px solid #ddd',
  borderRadius: '8px',
  padding: '20px',
  marginBottom: '20px',
};

const formGroupStyle = {
  marginBottom: '15px',
};

const inputStyle = {
  padding: '8px',
  margin: '8px 0',
  borderRadius: '4px',
  border: '1px solid #ccc',
  width: '350px',
};

const buttonStyle = {
  padding: '8px 16px',
  backgroundColor: '#007bff',
  color: 'white',
  border: 'none',
  borderRadius: '4px',
  cursor: 'pointer',
  marginRight: '8px',
};

const errorStyle = {
  color: 'red',
  fontWeight: 'bold',
  marginTop: '10px',
};

const successStyle = {
  color: 'green',
  fontWeight: 'bold',
  marginTop: '10px',
};

function AdminPanel({ ecoControlContract, walletAddress, refreshData }) {
  const [isOwner, setIsOwner] = useState(false);
  const [processorCallerAddress, setProcessorCallerAddress] = useState('');
  const [newProcessorCallerAddress, setNewProcessorCallerAddress] = useState('');
  const [fineAmount, setFineAmount] = useState('');
  const [newFineAmount, setNewFineAmount] = useState('');
  const [ecoTokenAddress, setEcoTokenAddress] = useState('');
  const [newEcoTokenAddress, setNewEcoTokenAddress] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // Проверка, является ли текущий пользователь владельцем контракта
  useEffect(() => {
    const checkOwnership = async () => {
      if (!ecoControlContract || !walletAddress) return;
      
      try {
        const owner = await ecoControlContract.owner();
        setIsOwner(owner.toLowerCase() === walletAddress.toLowerCase());
        
        // Загрузка текущих значений из контракта
        const currentProcessorCaller = await ecoControlContract.dataProcessorCaller();
        setProcessorCallerAddress(currentProcessorCaller);
        
        const currentFineAmount = await ecoControlContract.fineAmount();
        setFineAmount(currentFineAmount.toString());
        
        const currentTokenAddress = await ecoControlContract.ecoTokenAddress();
        setEcoTokenAddress(currentTokenAddress);
      } catch (error) {
        console.error("Error checking owner:", error);
      }
    };
    
    checkOwnership();
  }, [ecoControlContract, walletAddress]);

  // Функция для обновления адреса обработчика данных
  const updateDataProcessorCaller = async () => {
    if (!isOwner || !ecoControlContract) return;
    
    try {
      setIsLoading(true);
      setError('');
      setSuccess('');
      
      const tx = await ecoControlContract.setDataProcessorCaller(newProcessorCallerAddress);
      await tx.wait();
      
      setProcessorCallerAddress(newProcessorCallerAddress);
      setNewProcessorCallerAddress('');
      setSuccess("Адрес обработчика данных успешно обновлен!");
      refreshData();
    } catch (error) {
      console.error("Error updating data processor caller:", error);
      setError(`Ошибка обновления адреса обработчика: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  // Функция для обновления суммы штрафа
  const updateFineAmount = async () => {
    if (!isOwner || !ecoControlContract) return;
    
    try {
      setIsLoading(true);
      setError('');
      setSuccess('');
      
      const tx = await ecoControlContract.setFineAmount(newFineAmount);
      await tx.wait();
      
      setFineAmount(newFineAmount);
      setNewFineAmount('');
      setSuccess("Сумма штрафа успешно обновлена!");
      refreshData();
    } catch (error) {
      console.error("Error updating fine amount:", error);
      setError(`Ошибка обновления суммы штрафа: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  // Функция для обновления адреса токена
  const updateEcoTokenAddress = async () => {
    if (!isOwner || !ecoControlContract) return;
    
    try {
      setIsLoading(true);
      setError('');
      setSuccess('');
      
      const tx = await ecoControlContract.setEcoTokenAddress(newEcoTokenAddress);
      await tx.wait();
      
      setEcoTokenAddress(newEcoTokenAddress);
      setNewEcoTokenAddress('');
      setSuccess("Адрес токена успешно обновлен!");
      refreshData();
    } catch (error) {
      console.error("Error updating token address:", error);
      setError(`Ошибка обновления адреса токена: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  // Если пользователь не владелец, скрываем панель или показываем уведомление
  if (!isOwner) {
    return <div style={panelStyle}>
      <h2>Административная панель</h2>
      <p>Доступ только для владельца контракта.</p>
    </div>;
  }

  return (
    <div style={panelStyle}>
      <h2>Административная панель</h2>
      
      <div style={formGroupStyle}>
        <h3>Текущие настройки</h3>
        <p><strong>Адрес обработчика данных:</strong> {processorCallerAddress}</p>
        <p><strong>Сумма штрафа:</strong> {fineAmount} токенов</p>
        <p><strong>Адрес EcoToken:</strong> {ecoTokenAddress}</p>
      </div>
      
      <div style={formGroupStyle}>
        <h3>Обновить адрес обработчика данных</h3>
        <input
          type="text"
          value={newProcessorCallerAddress}
          onChange={(e) => setNewProcessorCallerAddress(e.target.value)}
          placeholder="Введите новый адрес обработчика данных"
          style={inputStyle}
        />
        <button
          onClick={updateDataProcessorCaller}
          disabled={isLoading || !newProcessorCallerAddress}
          style={buttonStyle}
        >
          {isLoading ? 'Обновление...' : 'Обновить'}
        </button>
      </div>
      
      <div style={formGroupStyle}>
        <h3>Обновить сумму штрафа</h3>
        <input
          type="number"
          value={newFineAmount}
          onChange={(e) => setNewFineAmount(e.target.value)}
          placeholder="Введите новую сумму штрафа (в токенах)"
          style={inputStyle}
        />
        <button
          onClick={updateFineAmount}
          disabled={isLoading || !newFineAmount}
          style={buttonStyle}
        >
          {isLoading ? 'Обновление...' : 'Обновить'}
        </button>
      </div>
      
      <div style={formGroupStyle}>
        <h3>Обновить адрес EcoToken</h3>
        <input
          type="text"
          value={newEcoTokenAddress}
          onChange={(e) => setNewEcoTokenAddress(e.target.value)}
          placeholder="Введите новый адрес EcoToken"
          style={inputStyle}
        />
        <button
          onClick={updateEcoTokenAddress}
          disabled={isLoading || !newEcoTokenAddress}
          style={buttonStyle}
        >
          {isLoading ? 'Обновление...' : 'Обновить'}
        </button>
      </div>
      
      {error && <div style={errorStyle}>{error}</div>}
      {success && <div style={successStyle}>{success}</div>}
    </div>
  );
}

export default AdminPanel; 