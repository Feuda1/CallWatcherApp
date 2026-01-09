


let mainWindow = null;
let notificationWindow = null;
let loginWindow = null;


let tray = null;


let isPolling = false;
let pollInterval = null;
let isFirstPoll = true;


let latestCallData = null;
let notifiedCallId = null;
let callHistory = [];
let shownCallIds = new Set();
let lastCallId = null;


let isCallLocked = false;
let lockedCallId = null;


let isLoggedIn = false;


let clientAssociations = {};


let bulkCallsCache = [];
let bulkLastFetched = 0;
let currentFetchPromise = null;


let topicsList = [];


let cachedReasons = null;


const POLL_INTERVAL_MS = 10000;
const PHONE_CALLS_URL = 'https://clients.denvic.ru/PhoneCalls?onlyMy=true';
const BASE_URL = 'https://clients.denvic.ru';


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


module.exports = {

    getMainWindow: () => mainWindow,
    setMainWindow: (win) => { mainWindow = win; },

    getNotificationWindow: () => notificationWindow,
    setNotificationWindow: (win) => { notificationWindow = win; },

    getLoginWindow: () => loginWindow,
    setLoginWindow: (win) => { loginWindow = win; },

    getTray: () => tray,
    setTray: (t) => { tray = t; },


    getIsPolling: () => isPolling,
    setIsPolling: (val) => { isPolling = val; },

    getPollInterval: () => pollInterval,
    setPollInterval: (interval) => { pollInterval = interval; },

    getIsFirstPoll: () => isFirstPoll,
    setIsFirstPoll: (val) => { isFirstPoll = val; },


    getLatestCallData: () => latestCallData,
    setLatestCallData: (data) => { latestCallData = data; },

    getNotifiedCallId: () => notifiedCallId,
    setNotifiedCallId: (id) => { notifiedCallId = id; },

    getCallHistory: () => callHistory,
    setCallHistory: (history) => { callHistory = history; },

    getShownCallIds: () => shownCallIds,

    getLastCallId: () => lastCallId,
    setLastCallId: (id) => { lastCallId = id; },


    getIsCallLocked: () => isCallLocked,
    setIsCallLocked: (val) => { isCallLocked = val; },

    getLockedCallId: () => lockedCallId,
    setLockedCallId: (id) => { lockedCallId = id; },


    getIsLoggedIn: () => isLoggedIn,
    setIsLoggedIn: (val) => { isLoggedIn = val; },


    getClientAssociations: () => clientAssociations,
    setClientAssociations: (assoc) => { clientAssociations = assoc; },


    getBulkCallsCache: () => bulkCallsCache,
    setBulkCallsCache: (cache) => { bulkCallsCache = cache; },

    getBulkLastFetched: () => bulkLastFetched,
    setBulkLastFetched: (time) => { bulkLastFetched = time; },

    getCurrentFetchPromise: () => currentFetchPromise,
    setCurrentFetchPromise: (promise) => { currentFetchPromise = promise; },


    getTopicsList: () => topicsList,
    setTopicsList: (list) => { topicsList = list; },


    getCachedReasons: () => cachedReasons,
    setCachedReasons: (reasons) => { cachedReasons = reasons; },


    POLL_INTERVAL_MS,
    PHONE_CALLS_URL,
    BASE_URL,
    FALLBACK_REASONS
};
