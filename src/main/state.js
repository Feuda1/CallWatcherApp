// Централизованное хранилище состояния приложения

// Окна
let mainWindow = null;
let notificationWindow = null;
let loginWindow = null;

// Системный трей
let tray = null;

// Polling
let isPolling = false;
let pollInterval = null;
let isFirstPoll = true;

// Данные звонков
let latestCallData = null;
let notifiedCallId = null;
let callHistory = [];
let shownCallIds = new Set();
let lastCallId = null;

// Блокировка звонка
let isCallLocked = false;
let lockedCallId = null;

// Авторизация
let isLoggedIn = false;

// Ассоциации клиентов
let clientAssociations = {};

// Кэш массовой загрузки
let bulkCallsCache = [];
let bulkLastFetched = 0;
let currentFetchPromise = null;

// Темы заявок
let topicsList = [];

// Кэш причин закрытия
let cachedReasons = null;

// Константы
const POLL_INTERVAL_MS = 10000;
const PHONE_CALLS_URL = 'https://clients.denvic.ru/PhoneCalls?onlyMy=true';
const BASE_URL = 'https://clients.denvic.ru';

// Резервные причины закрытия
const FALLBACK_REASONS = [
    { value: 'iikoFront (консультации, настройка)', text: 'iikoFront (консультации, настройка)' },
    { value: 'iikoOffice (консультации, настройка)', text: 'iikoOffice (консультации, настройка)' },
    { value: 'iikoWeb', text: 'iikoWeb' },
    { value: 'iikoDelivery', text: 'iikoDelivery' },
    { value: 'iikoCard', text: 'iikoCard' },
    { value: 'Касса (фискальные регистраторы)', text: 'Касса (фискальные регистраторы)' },
    { value: 'Оборудование', text: 'Оборудование' },
    { value: 'Банк(ошибки, подключение)', text: 'Банк(ошибки, подключение)' },
    { value: '1С', text: '1С' },
    { value: 'Прочее', text: 'Прочее' }
];

// Экспорт состояния
module.exports = {
    // Getters и Setters для окон
    getMainWindow: () => mainWindow,
    setMainWindow: (win) => { mainWindow = win; },

    getNotificationWindow: () => notificationWindow,
    setNotificationWindow: (win) => { notificationWindow = win; },

    getLoginWindow: () => loginWindow,
    setLoginWindow: (win) => { loginWindow = win; },

    getTray: () => tray,
    setTray: (t) => { tray = t; },

    // Polling
    getIsPolling: () => isPolling,
    setIsPolling: (val) => { isPolling = val; },

    getPollInterval: () => pollInterval,
    setPollInterval: (interval) => { pollInterval = interval; },

    getIsFirstPoll: () => isFirstPoll,
    setIsFirstPoll: (val) => { isFirstPoll = val; },

    // Данные звонков
    getLatestCallData: () => latestCallData,
    setLatestCallData: (data) => { latestCallData = data; },

    getNotifiedCallId: () => notifiedCallId,
    setNotifiedCallId: (id) => { notifiedCallId = id; },

    getCallHistory: () => callHistory,
    setCallHistory: (history) => { callHistory = history; },

    getShownCallIds: () => shownCallIds,

    getLastCallId: () => lastCallId,
    setLastCallId: (id) => { lastCallId = id; },

    // Блокировка
    getIsCallLocked: () => isCallLocked,
    setIsCallLocked: (val) => { isCallLocked = val; },

    getLockedCallId: () => lockedCallId,
    setLockedCallId: (id) => { lockedCallId = id; },

    // Авторизация
    getIsLoggedIn: () => isLoggedIn,
    setIsLoggedIn: (val) => { isLoggedIn = val; },

    // Ассоциации
    getClientAssociations: () => clientAssociations,
    setClientAssociations: (assoc) => { clientAssociations = assoc; },

    // Кэш
    getBulkCallsCache: () => bulkCallsCache,
    setBulkCallsCache: (cache) => { bulkCallsCache = cache; },

    getBulkLastFetched: () => bulkLastFetched,
    setBulkLastFetched: (time) => { bulkLastFetched = time; },

    getCurrentFetchPromise: () => currentFetchPromise,
    setCurrentFetchPromise: (promise) => { currentFetchPromise = promise; },

    // Темы
    getTopicsList: () => topicsList,
    setTopicsList: (list) => { topicsList = list; },

    // Причины
    getCachedReasons: () => cachedReasons,
    setCachedReasons: (reasons) => { cachedReasons = reasons; },

    // Константы
    POLL_INTERVAL_MS,
    PHONE_CALLS_URL,
    BASE_URL,
    FALLBACK_REASONS
};
