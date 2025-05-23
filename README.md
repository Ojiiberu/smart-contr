# EcoControl Smart Contract System

## Описание проекта
MVP версия приложения для надзора за выбросами вблизи предприятий. Смарт-контракт прописывает условия, по которым предприятиям начисляется штраф за превышение допустимых норм загрязнения.

## Структура проекта
- `contracts/` - Смарт-контракты Solidity
  - `EcoControl.sol` - Основной контракт для контроля за выбросами
  - `EcoToken.sol` - Токен для штрафов
- `scripts/` - Скрипты для деплоя и управления контрактами
- `offchain-processor.js` - Оракул для получения данных о качестве воздуха и вызова контракта
- `eco-control-frontend/` - Фронтенд приложения

## Оракул (offchain-processor.js)

Скрипт-оракул выполняет следующие функции:
1. Получает данные о качестве воздуха из API WAQI (World Air Quality Index)
2. Обрабатывает полученные данные
3. Передает данные в смарт-контракт для проверки соответствия нормам
4. Автоматически начисляет штрафы при превышении лимитов

### Возможности оракула:
- **Гибкий сбор данных** - поддерживает несколько методов получения данных:
  - Прямой запрос по названию города
  - Запрос по названию города для мониторинга
  - Автоматический поиск ближайших станций по названию города
- **Поддержка командной строки** - возможность указать города через аргументы:
  ```
  node offchain-processor.js "Paris" "Berlin" "Tokyo"
  ```

### Настройка оракула:
1. В файле `.env` указать:
   ```
   DATA_PROCESSOR_PRIVATE_KEY=<приватный_ключ>
   WAQI_API_TOKEN=e73f3d29e99717ea5cb981aaa8748cdbc44c5e27
   ```

2. В файле `offchain-processor.js` настроить конфигурацию предприятий по умолчанию:
   ```javascript
   const defaultConfig = [
     {
       enterpriseId: 0,
       enterpriseAddress: "<адрес_предприятия>",
       city: "London", // Название города
       metricsToCollect: ["pm25", "pm10"]
     },
     // Добавить другие предприятия по необходимости
   ];
   ```

### Запуск оракула:
```bash
# Использование конфигурации по умолчанию
node offchain-processor.js

# Указание пользовательских городов через аргументы
node offchain-processor.js "Paris" "Berlin" "Tokyo"
```

## Фронтенд приложения

### Функциональные возможности:
1. Подключение кошелька MetaMask
2. Мониторинг данных о качестве воздуха для предприятий
3. Отображение лимитов загрязнения и статуса штрафов
4. Запуск проверки соответствия нормам вручную
5. Проверка качества воздуха в произвольных городах
6. Отображение балансов кошельков предприятий после наложения штрафов

### Вкладка "Автоматическая проверка":
1. Введите название города в поле ввода
2. Нажмите кнопку "Добавить"
3. При необходимости добавьте несколько городов
4. Нажмите "Получить данные о качестве воздуха"
5. Результаты отображаются на странице с информацией о PM2.5, PM10 и AQI
6. Нажмите "Проверить соответствие и штрафовать" для проверки превышения лимитов
7. В журнале операций отображается баланс кошелька предприятия после наложения штрафа

### Панель информации о штрафах и лимитах:
1. Нажмите кнопку "Показать информацию о лимитах"
2. В панели отображается:
   - Общий баланс собранных штрафов
   - Адрес контракта EcoControl
   - Адрес токена EcoToken
   - Таблица с текущими лимитами для предприятий
   - Статус возможности штрафования
   - Настройки токенов (адрес и сумма штрафа)

## Механизм штрафов

1. При превышении лимитов загрязнения (PM2.5 или PM10) предприятие получает штраф
2. Штраф списывается с адреса предприятия в виде токенов EcoToken
3. Токены поступают на баланс смарт-контракта EcoControl
4. Баланс кошелька предприятия отображается в журнале операций после наложения штрафа
5. Общая сумма собранных штрафов отображается в информационной панели

### Просмотр баланса контракта в MetaMask:
1. Откройте MetaMask
2. Выберите "Импортировать токен"
3. Введите адрес токена EcoToken (отображается в панели информации)
4. Для просмотра баланса контракта импортируйте адрес смарт-контракта EcoControl как новую учетную запись

## Установка и настройка

1. Установка зависимостей:
```bash
npm install
cd eco-control-frontend
npm install
```

2. Запуск локальной сети Hardhat:
```bash
npx hardhat node
```

3. Деплой контрактов:
```bash
npx hardhat run scripts/deploy.js --network localhost
```

4. Запуск оракула:
```bash
node offchain-processor.js
```

5. Запуск фронтенда:
```bash
cd eco-control-frontend
npm run dev
```
