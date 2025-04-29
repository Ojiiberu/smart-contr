// Скрипт для отправки ETH на адрес dataProcessorCaller
const { ethers } = require("hardhat");

async function main() {
  // Адрес, на который мы хотим отправить ETH (dataProcessorCaller)
  const recipientAddress = "0xD76a7ba68CABa39a24D69196717E1E78CcB886C8";
  
  // Получаем список доступных аккаунтов
  const [deployer] = await ethers.getSigners();
  
  console.log(`Отправитель: ${deployer.address}`);
  console.log(`Баланс отправителя: ${ethers.utils.formatEther(await deployer.getBalance())} ETH`);
  
  console.log(`Получатель: ${recipientAddress}`);
  const recipientBalanceBefore = await ethers.provider.getBalance(recipientAddress);
  console.log(`Баланс получателя до: ${ethers.utils.formatEther(recipientBalanceBefore)} ETH`);
  
  // Сумма ETH для отправки (0.1 ETH)
  const amountToSend = ethers.utils.parseEther("0.1");
  
  // Отправка ETH
  const tx = await deployer.sendTransaction({
    to: recipientAddress,
    value: amountToSend
  });
  
  await tx.wait();
  
  console.log(`Отправлено: ${ethers.utils.formatEther(amountToSend)} ETH`);
  
  // Проверка баланса получателя после отправки
  const recipientBalanceAfter = await ethers.provider.getBalance(recipientAddress);
  console.log(`Баланс получателя после: ${ethers.utils.formatEther(recipientBalanceAfter)} ETH`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  }); 