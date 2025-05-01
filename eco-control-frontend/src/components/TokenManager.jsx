import { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import { formatTokenBalance } from '../ethers-utils';

// Стили для компонента
const tokenManagerStyle = {
  backgroundColor: '#f9f9f9',
  border: '1px solid #ddd',
  borderRadius: '8px',
  padding: '20px',
  marginBottom: '20px',
};

const sectionStyle = {
  marginBottom: '15px',
};

const inputStyle = {
  padding: '8px',
  margin: '8px 0',
  borderRadius: '4px',
  border: '1px solid #ccc',
  width: '250px',
  marginRight: '8px',
};

const buttonStyle = {
  padding: '8px 16px',
  backgroundColor: '#28a745',
  color: 'white',
  border: 'none',
  borderRadius: '4px',
  cursor: 'pointer',
  marginRight: '8px',
};

const tableStyle = {
  width: '100%',
  borderCollapse: 'collapse',
  marginTop: '15px',
};

const thStyle = {
  backgroundColor: '#eee',
  padding: '8px',
  textAlign: 'left',
  border: '1px solid #ddd',
};

const tdStyle = {
  padding: '8px',
  textAlign: 'left',
  border: '1px solid #ddd',
};

function TokenManager({ ecoTokenContract, ecoControlContract, walletAddress, walletConnected }) {
  const [userBalance, setUserBalance] = useState('0');
  const [tokenSymbol, setTokenSymbol] = useState('ECO');
  const [tokenDecimals, setTokenDecimals] = useState(18);
  const [approveAmount, setApproveAmount] = useState('');
  const [ecoControlAddress, setEcoControlAddress] = useState('');
  const [currentAllowance, setCurrentAllowance] = useState('0');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [enterpriseBalances, setEnterpriseBalances] = useState([]);

  // Загрузка информации о токене
  useEffect(() => {
    const loadTokenInfo = async () => {
      if (!ecoTokenContract || !walletAddress) return;
      
      try {
        const symbol = await ecoTokenContract.symbol();
        setTokenSymbol(symbol);
        
        const decimals = await ecoTokenContract.decimals();
        setTokenDecimals(decimals);
        
        const balance = await ecoTokenContract.balanceOf(walletAddress);
        setUserBalance(formatTokenBalance(balance, decimals));
        
        // Получение адреса контракта EcoControl
        if (ecoControlContract) {
          const address = await ecoControlContract.getAddress();
          setEcoControlAddress(address);
          
          // Получение текущего разрешения
          const allowance = await ecoTokenContract.allowance(walletAddress, address);
          setCurrentAllowance(formatTokenBalance(allowance, decimals));
        }
      } catch (error) {
        console.error("Error loading token info:", error);
        setError("Не удалось загрузить информацию о токене");
      }
    };
    
    loadTokenInfo();
  }, [ecoTokenContract, ecoControlContract, walletAddress]);

  // Загрузка балансов предприятий
  useEffect(() => {
    const loadEnterpriseBalances = async () => {
      if (!ecoTokenContract || !ecoControlContract) return;
      
      try {
        const nextEnterpriseId = await ecoControlContract.nextEnterpriseId();
        const balances = [];
        
        for (let i = 0; i < nextEnterpriseId; i++) {
          try {
            const enterprise = await ecoControlContract.enterprises(i);
            const address = enterprise[1]; // enterpriseAddress
            const name = enterprise[0];  // name
            
            const balance = await ecoTokenContract.balanceOf(address);
            const allowance = await ecoTokenContract.allowance(address, ecoControlAddress);
            
            balances.push({
              id: i,
              name,
              address,
              balance: formatTokenBalance(balance, tokenDecimals),
              allowance: formatTokenBalance(allowance, tokenDecimals)
            });
          } catch (error) {
            console.error(`Error loading enterprise ${i} balance:`, error);
          }
        }
        
        setEnterpriseBalances(balances);
      } catch (error) {
        console.error("Error loading enterprise balances:", error);
      }
    };
    
    if (ecoControlAddress) {
      loadEnterpriseBalances();
    }
  }, [ecoTokenContract, ecoControlContract, ecoControlAddress, tokenDecimals]);

  // Функция для выдачи разрешения на списание токенов
  const approveTokens = async () => {
    if (!ecoTokenContract || !walletConnected || !ecoControlAddress) {
      setError("Необходимо подключить кошелек");
      return;
    }
    
    if (!approveAmount) {
      setError("Введите сумму для разрешения");
      return;
    }
    
    setIsLoading(true);
    setError('');
    setSuccess('');
    
    try {
      let amountToApprove;
      
      if (approveAmount.toLowerCase() === 'max') {
        amountToApprove = ethers.MaxUint256;
      } else {
        amountToApprove = ethers.parseUnits(approveAmount, tokenDecimals);
      }
      
      const tx = await ecoTokenContract.approve(ecoControlAddress, amountToApprove);
      await tx.wait();
      
      const newAllowance = await ecoTokenContract.allowance(walletAddress, ecoControlAddress);
      setCurrentAllowance(formatTokenBalance(newAllowance, tokenDecimals));
      
      setSuccess(`Разрешение на ${approveAmount === 'max' ? 'максимальную сумму' : `${approveAmount} ${tokenSymbol}`} выдано!`);
      setApproveAmount('');
    } catch (error) {
      console.error("Error approving tokens:", error);
      setError(`Ошибка выдачи разрешения: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div style={tokenManagerStyle}>
      <h2>Управление токенами {tokenSymbol}</h2>
      
      <div style={sectionStyle}>
        <h3>Ваш баланс</h3>
        <p>{userBalance} {tokenSymbol}</p>
      </div>
      
      <div style={sectionStyle}>
        <h3>Разрешение на списание штрафов</h3>
        <p>Контракт EcoControl: {ecoControlAddress}</p>
        <p>Текущее разрешение: {currentAllowance} {tokenSymbol}</p>
        
        <div>
          <input
            type="text"
            value={approveAmount}
            onChange={(e) => setApproveAmount(e.target.value)}
            placeholder="Введите сумму или 'max'"
            style={inputStyle}
          />
          <button
            onClick={approveTokens}
            disabled={isLoading || !walletConnected}
            style={buttonStyle}
          >
            {isLoading ? 'Отправка...' : 'Разрешить списание'}
          </button>
        </div>
        
        <p style={{ fontSize: '12px', color: '#666' }}>
          Введите 'max' для бесконечного разрешения (рекомендуется).
        </p>
      </div>
      
      {error && <div style={{ color: 'red', marginTop: '10px' }}>{error}</div>}
      {success && <div style={{ color: 'green', marginTop: '10px' }}>{success}</div>}
      
      <div style={sectionStyle}>
        <h3>Балансы предприятий</h3>
        
        {enterpriseBalances.length > 0 ? (
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>ID</th>
                <th style={thStyle}>Название</th>
                <th style={thStyle}>Адрес</th>
                <th style={thStyle}>Баланс</th>
                <th style={thStyle}>Разрешение EcoControl</th>
              </tr>
            </thead>
            <tbody>
              {enterpriseBalances.map(enterprise => (
                <tr key={enterprise.id}>
                  <td style={tdStyle}>{enterprise.id}</td>
                  <td style={tdStyle}>{enterprise.name}</td>
                  <td style={tdStyle}>
                    {enterprise.address.substring(0, 6)}...{enterprise.address.substring(38)}
                  </td>
                  <td style={tdStyle}>{enterprise.balance} {tokenSymbol}</td>
                  <td style={tdStyle}>{enterprise.allowance} {tokenSymbol}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p>Нет зарегистрированных предприятий или данные загружаются...</p>
        )}
      </div>
    </div>
  );
}

export default TokenManager; 