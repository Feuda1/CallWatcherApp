const { app, BrowserWindow, Tray, Menu, ipcMain, session, screen } = require('electron');
const path = require('path');
const fs = require('fs');


let mainWindow = null;
let notificationWindow = null;
let tray = null;


let isPolling = false;
let pollingInterval = null;
let latestCallData = null;
let notifiedCallId = null;
let callHistory = [];
let shownCallIds = new Set();
let isCallLocked = false;
let lockedCallId = null;
let isLoggedIn = false;
let lastCallId = null;
let isFirstPoll = true;

const POLL_INTERVAL_MS = 10000;
const PHONE_CALLS_URL = 'https://clients.denvic.ru/PhoneCalls?onlyMy=true';


let HISTORY_FILE_PATH = null;

function getHistoryFilePath() {
    if (!HISTORY_FILE_PATH) {
        HISTORY_FILE_PATH = path.join(app.getPath('userData'), 'call_history.json');
    }
    return HISTORY_FILE_PATH;
}

function loadHistory() {
    try {
        const filePath = getHistoryFilePath();
        if (fs.existsSync(filePath)) {
            const data = fs.readFileSync(filePath, 'utf8');
            const parsed = JSON.parse(data);
            callHistory = Array.isArray(parsed.history) ? parsed.history : [];

            callHistory.forEach(c => {
                if (c.status === 'created' || c.status === 'skipped') {
                    shownCallIds.add(c.id);
                }
            });
            console.log('[CallWatcher] Загружено', callHistory.length, 'звонков. Показано:', shownCallIds.size);
        }
    } catch (e) {
        console.error('[CallWatcher] Ошибка загрузки истории:', e);
    }
}

let saveTimeout = null;
function saveHistory() {
    clearTimeout(saveTimeout);
    saveTimeout = setTimeout(() => {
        try {
            const filePath = getHistoryFilePath();
            const data = JSON.stringify({
                version: 1,
                savedAt: new Date().toISOString(),
                history: callHistory
            }, null, 2);
            fs.writeFileSync(filePath, data, 'utf8');
            console.log('[CallWatcher] История сохранена:', callHistory.length, 'звонков');
        } catch (e) {
            console.error('[CallWatcher] Ошибка сохранения истории:', e);
        }
    }, 1000);
}

let clientAssociations = {};
let ASSOCIATIONS_FILE_PATH = null;

function getAssociationsFilePath() {
    if (!ASSOCIATIONS_FILE_PATH) {
        ASSOCIATIONS_FILE_PATH = path.join(app.getPath('userData'), 'client_associations.json');
    }
    return ASSOCIATIONS_FILE_PATH;
}

function loadAssociations() {
    try {
        const filePath = getAssociationsFilePath();
        if (fs.existsSync(filePath)) {
            const data = fs.readFileSync(filePath, 'utf8');
            clientAssociations = JSON.parse(data);
            console.log('[CallWatcher] Загружено ассоциаций для', Object.keys(clientAssociations).length, 'телефонов');
        }
    } catch (e) {
        console.error('[CallWatcher] Ошибка загрузки ассоциаций:', e);
    }
}

function saveAssociations() {
    try {
        const filePath = getAssociationsFilePath();
        fs.writeFileSync(filePath, JSON.stringify(clientAssociations, null, 2), 'utf8');
    } catch (e) {
        console.error('[CallWatcher] Ошибка сохранения ассоциаций:', e);
    }
}

function createMainWindow() {
    mainWindow = new BrowserWindow({
        width: 960,
        height: 700,
        minWidth: 600,
        minHeight: 500,
        frame: true,
        autoHideMenuBar: true,
        resizable: true,
        show: false,
        icon: path.join(__dirname, 'assets', 'icon.png'),
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.js'),
            webSecurity: false
        }
    });

    mainWindow.loadFile('src/index.html');
    mainWindow.setMenu(null);

    mainWindow.on('ready-to-show', () => {
        mainWindow.show();
    });

    mainWindow.on('close', (event) => {
        if (!app.isQuitting) {
            event.preventDefault();
            mainWindow.hide();
        }
    });
}

function createNotificationWindow() {
    const { width, height } = screen.getPrimaryDisplay().workAreaSize;

    const winWidth = 320;
    const winHeight = 240;

    notificationWindow = new BrowserWindow({
        width: winWidth,
        height: winHeight,
        x: width - winWidth - 20,
        y: height - winHeight - 20,
        frame: false,
        resizable: false,
        alwaysOnTop: true,
        skipTaskbar: true,
        show: false,
        focusable: true,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.js')
        }
    });

    notificationWindow.loadFile('src/notification.html');

    notificationWindow.setAlwaysOnTop(true, 'screen-saver');

    notificationWindow.on('closed', () => {
        notificationWindow = null;
        if (latestCallData) {
            skipCurrentCall();
        }
    });
}

function showNotification(callData) {
    console.log('[CallWatcher] Показ уведомления для:', callData?.phone);

    if (!notificationWindow || notificationWindow.isDestroyed()) {
        createNotificationWindow();
    }

    const sendData = () => {
        if (notificationWindow && !notificationWindow.isDestroyed()) {
            console.log('[CallWatcher] Отправка данных в окно уведомлений');
            notificationWindow.webContents.send('call-data', callData);
            if (!notificationWindow.isVisible()) {
                notificationWindow.show();
            }
        }
    };

    if (notificationWindow.webContents.isLoading()) {
        notificationWindow.webContents.once('did-finish-load', sendData);
    } else {
        sendData();
    }
}

function hideNotification() {
    if (notificationWindow && !notificationWindow.isDestroyed()) {
        notificationWindow.hide();
    }
}

function createTray() {
    tray = new Tray(path.join(__dirname, 'assets', 'icon.png'));

    const contextMenu = Menu.buildFromTemplate([
        {
            label: 'Открыть',
            click: () => {
                mainWindow.show();
                mainWindow.focus();
            }
        },

        { type: 'separator' },
        {
            label: 'Выход',
            click: () => {
                app.isQuitting = true;
                app.quit();
            }
        }
    ]);

    tray.setToolTip('Call Watcher');
    tray.setContextMenu(contextMenu);

    tray.on('double-click', () => {
        mainWindow.show();
        mainWindow.focus();
    });
}

async function checkCalls() {
    try {
        const ses = session.defaultSession;
        const response = await ses.fetch(PHONE_CALLS_URL, {
            credentials: 'include'
        });

        if (!response.ok || response.url.includes('Login')) {
            console.log('[CallWatcher] Не авторизован');
            isLoggedIn = false;
            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('login-status', false);
            }
            return;
        }

        if (!isLoggedIn) {
            isLoggedIn = true;
            console.log('[CallWatcher] Успешная авторизация');
            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('login-status', true);
            }
        }

        const html = await response.text();
        const callData = parseCallData(html);

        if (callData) {

            if (callData.phone && clientAssociations[callData.phone]) {
                callData.associatedClient = clientAssociations[callData.phone];
            }

            console.log('[CallWatcher] Найден звонок:', callData.phone);

            if (!callHistory.find(c => c.id === callData.id)) {
                addToHistory(callData, 'unprocessed');
            }

            const existingHistory = callHistory.find(c => c.id === callData.id);
            const isSkipped = existingHistory && existingHistory.status === 'skipped';

            if (!isSkipped) {
                if (!isCallLocked || lockedCallId === callData.id) {
                    latestCallData = callData;

                    if (mainWindow && !mainWindow.isDestroyed()) {
                        if (isCallLocked && lockedCallId === callData.id) {
                            mainWindow.webContents.send('call-data', callData);
                        }
                    }
                    saveAssociations();
                }

                if (isFirstPoll) {
                    console.log('[CallWatcher] Запуск: игнорируем существующий звонок:', callData.id);
                    shownCallIds.add(callData.id);
                }

                if (!shownCallIds.has(callData.id) && !isSkipped && !isFirstPoll) {
                    latestCallData = callData;

                    console.log('[CallWatcher] Новый звонок, показываем уведомление. Всего показано:', shownCallIds.size + 1);
                    showNotification(callData);
                    shownCallIds.add(callData.id);
                }
            } else {
                console.log('[CallWatcher] Звонок пропущен, игнорируем:', callData.id);
            }
        } else {

            if (!isCallLocked) {
                latestCallData = null;
                if (mainWindow && !mainWindow.isDestroyed()) {
                    mainWindow.webContents.send('call-data', null);
                }
            }
        }

        if (isFirstPoll) {
            isFirstPoll = false;
            console.log('[CallWatcher] Проверки запуска завершены. Будущие звонки вызовут уведомления.');
        }

        saveHistory();
    } catch (error) {
        console.error('[CallWatcher] Ошибка проверки звонков:', error);
    }
}

function parseCallData(html) {
    const allLinksRegex = /href="\/Tickets\/Create\?([^"]+)"/g;
    const allLinkMatches = [...html.matchAll(allLinksRegex)];

    const callBoundaries = allLinkMatches.filter(m => {
        const urlParams = m[1];

        if (!urlParams.includes('selectedPhoneNuber')) return false;

        const params = new URLSearchParams(urlParams);
        return params.has('selectedPhoneNuber') && !params.has('id');
    });

    if (callBoundaries.length === 0) {
        console.log('[CallWatcher] No active call rows found.');
        return null;
    }

    const firstCallMatch = callBoundaries[0];
    const nextCallMatch = callBoundaries[1];

    const startIndex = firstCallMatch.index;
    const endIndex = nextCallMatch ? nextCallMatch.index : html.length;


    const blockHtml = html.slice(startIndex, endIndex);


    const mainParams = new URLSearchParams(firstCallMatch[1]);
    const phone = mainParams.get('selectedPhoneNuber') || '';
    const linkedId = mainParams.get('linkedId') || '';
    const date = mainParams.get('selectedPhoneDate') || '';
    const duration = mainParams.get('selectedPhoneDuration') || '';


    const suggestions = [];

    const suggestionRegex = /dropdown-item[^>]*href="\/Tickets\/Create\?id=(\d+)[^"]*"[^>]*>([\s\S]*?)<\/a>/g;

    let clientMatch;
    while ((clientMatch = suggestionRegex.exec(blockHtml)) !== null) {
        const id = clientMatch[1];
        const rawName = clientMatch[2];
        const name = rawName.replace(/<[^>]+>/g, '').trim();

        if (!suggestions.find(s => s.id === id)) {
            suggestions.push({ id, name });
        }
    }

    let audioUrl = null;
    if (linkedId) {
        audioUrl = `https://clients.denvic.ru/PhoneCalls/GetCallRecord?id=${linkedId}`;
    }

    return {
        id: linkedId,
        phone,
        date,
        duration,
        audioUrl,
        suggestions,
        rawParams: firstCallMatch[1]
    };
}

let bulkCallsCache = [];
let bulkLastFetched = 0;
const BULK_CACHE_TTL = 60000;

async function fetchAllCalls(forceRefresh = false) {

    if (!forceRefresh && bulkCallsCache.length > 0 && Date.now() - bulkLastFetched < BULK_CACHE_TTL) {
        return bulkCallsCache;
    }

    const ses = session.defaultSession;
    const allCalls = [];
    let currentPage = 1;
    let maxPages = 1;

    try {

        const firstUrl = `https://clients.denvic.ru/PhoneCalls?onlyMy=true&page=1`;
        const firstResponse = await ses.fetch(firstUrl, { credentials: 'include' });

        if (!firstResponse.ok || firstResponse.url.includes('Login')) {
            console.log('[CallWatcher] Bulk: Not logged in');
            return [];
        }

        const firstHtml = await firstResponse.text();

        const pageRegex = /page=(\d+)/g;
        let pageMatch;
        while ((pageMatch = pageRegex.exec(firstHtml)) !== null) {
            const pageNum = parseInt(pageMatch[1], 10);
            if (pageNum > maxPages) maxPages = pageNum;
        }

        console.log(`[CallWatcher] Bulk: Found ${maxPages} pages`);

        const firstPageCalls = parseAllCallsFromPage(firstHtml);
        allCalls.push(...firstPageCalls);

        for (let page = 2; page <= maxPages; page++) {
            const url = `https://clients.denvic.ru/PhoneCalls?onlyMy=true&page=${page}`;
            const response = await ses.fetch(url, { credentials: 'include' });
            if (response.ok) {
                const html = await response.text();
                const pageCalls = parseAllCallsFromPage(html);
                allCalls.push(...pageCalls);
            }
        }

        console.log(`[CallWatcher] Bulk: Loaded ${allCalls.length} total calls`);

        bulkCallsCache = allCalls;
        bulkLastFetched = Date.now();
        return allCalls;

    } catch (error) {
        console.error('[CallWatcher] Bulk fetch error:', error);
        return [];
    }
}

function parseAllCallsFromPage(html) {
    const calls = [];

    const allLinksRegex = /href="\/Tickets\/Create\?([^"]+)"/g;
    const allLinkMatches = [...html.matchAll(allLinksRegex)];

    const callBoundaries = allLinkMatches.filter(m => {
        const urlParams = m[1];
        if (!urlParams.includes('selectedPhoneNuber')) return false;
        const params = new URLSearchParams(urlParams);
        return params.has('selectedPhoneNuber') && !params.has('id');
    });

    for (let i = 0; i < callBoundaries.length; i++) {
        const match = callBoundaries[i];
        const nextMatch = callBoundaries[i + 1];

        const startIndex = match.index;
        const endIndex = nextMatch ? nextMatch.index : html.length;
        const blockHtml = html.slice(startIndex, endIndex);

        const params = new URLSearchParams(match[1]);
        const phone = params.get('selectedPhoneNuber') || '';
        const linkedId = params.get('linkedId') || '';
        const date = params.get('selectedPhoneDate') || '';
        const duration = params.get('selectedPhoneDuration') || '';

        const suggestions = [];
        const suggestionRegex = /dropdown-item[^>]*href="\/Tickets\/Create\?id=(\d+)[^"]*"[^>]*>([\s\S]*?)<\/a>/g;
        let clientMatch;
        while ((clientMatch = suggestionRegex.exec(blockHtml)) !== null) {
            const id = clientMatch[1];
            const rawName = clientMatch[2];
            const name = rawName.replace(/<[^>]+>/g, '').trim();
            if (!suggestions.find(s => s.id === id)) {
                suggestions.push({ id, name });
            }
        }

        const hasTicket = blockHtml.includes('/Tickets/Details/') || blockHtml.includes('btn-success');

        const audioUrl = linkedId ? `https://clients.denvic.ru/PhoneCalls/GetCallRecord?id=${linkedId}` : null;

        calls.push({
            id: linkedId,
            phone,
            date,
            duration,
            audioUrl,
            suggestions,
            hasTicket,
            rawParams: match[1]
        });
    }

    return calls;
}

function startPolling() {
    if (isPolling) return;
    isPolling = true;

    checkCalls();
    pollInterval = setInterval(checkCalls, POLL_INTERVAL_MS);
    console.log('[CallWatcher] Опрос начат');
}

function stopPolling() {
    if (pollInterval) {
        clearInterval(pollInterval);
        pollInterval = null;
    }
    isPolling = false;
    console.log('[CallWatcher] Опрос остановлен');
}

let loginWindow = null;

function openLoginWindow() {
    console.log('[CallWatcher] Открытие окна входа...');

    if (loginWindow && !loginWindow.isDestroyed()) {
        console.log('[CallWatcher] Окно входа уже существует, фокусируемся...');
        loginWindow.focus();
        return;
    }

    loginWindow = new BrowserWindow({
        width: 900,
        height: 700,
        show: true,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true
        }
    });

    loginWindow.loadURL('https://clients.denvic.ru/');
    console.log('[CallWatcher] Окно входа создано');

    loginWindow.webContents.on('did-navigate', (event, url) => {
        console.log('[CallWatcher] Вход переход на:', url);
    });

    loginWindow.on('closed', () => {
        console.log('[CallWatcher] Окно входа закрыто');
        loginWindow = null;
        checkCalls();
    });
}

function addToHistory(callData, status) {
    if (!callData) return;

    const existing = callHistory.find(c => c.id === callData.id);
    if (existing) {
        existing.status = status;
        existing.updatedAt = new Date().toLocaleString('ru-RU');
    } else {
        callHistory.unshift({
            ...callData,
            status: status,
            addedAt: new Date().toLocaleString('ru-RU')
        });
        if (callHistory.length > 100) callHistory.pop();
    }

    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('call-history', callHistory);
    }

    saveHistory();
}

function skipCurrentCall() {
    if (latestCallData) {
        addToHistory(latestCallData, 'skipped');
        latestCallData = null;
    }
}

ipcMain.handle('get-call-data', () => latestCallData);
ipcMain.handle('get-call-history', () => callHistory);

ipcMain.handle('get-all-calls', async (event, forceRefresh) => {
    return await fetchAllCalls(forceRefresh);
});

ipcMain.handle('get-bulk-stats', async () => {
    const allCalls = await fetchAllCalls();
    const total = allCalls.length;
    const filled = allCalls.filter(c => c.hasTicket).length;
    const unfilled = total - filled;
    return { total, filled, unfilled };
});

ipcMain.on('lock-call', (event, callId) => {
    isCallLocked = true;
    lockedCallId = callId;
    console.log('[CallWatcher] Звонок заблокирован:', callId);
});

ipcMain.on('unlock-call', () => {
    isCallLocked = false;
    lockedCallId = null;
    console.log('[CallWatcher] Звонок разблокирован');
});

ipcMain.on('skip-call', (event, callId) => {
    hideNotification();

    if (callId) {
        const historyItem = callHistory.find(c => c.id === callId);
        if (historyItem) {
            historyItem.status = 'skipped';
            historyItem.updatedAt = new Date().toLocaleString('ru-RU');
            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('call-history', callHistory);
            }
            saveHistory();
        }
    }

    if (latestCallData && (!callId || latestCallData.id === callId)) {
        shownCallIds.add(latestCallData.id);

        const existing = callHistory.find(c => c.id === latestCallData.id);
        if (!existing) {
            addToHistory(latestCallData, 'skipped');
        } else if (existing && existing.status !== 'created') {
            existing.status = 'skipped';
            saveHistory();
            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('call-history', callHistory);
            }
        }

        latestCallData = null;
    }

    notifiedCallId = null;
    isCallLocked = false;
    lockedCallId = null;
});

ipcMain.on('ticket-created', (event, callId) => {
    const historyItem = callHistory.find(c => c.id === callId);
    if (historyItem) {
        historyItem.status = 'created';
        historyItem.updatedAt = new Date().toLocaleString('ru-RU');
    } else if (latestCallData && latestCallData.id === callId) {
        addToHistory(latestCallData, 'created');
    }

    shownCallIds.add(callId);

    if (lockedCallId === callId) {
        isCallLocked = false;
        lockedCallId = null;
        latestCallData = null;
    }

    notifiedCallId = null;

    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('call-history', callHistory);
    }

    checkCalls();
});

ipcMain.on('fill-ticket', () => {
    hideNotification();
    if (latestCallData) {
        isCallLocked = true;
        lockedCallId = latestCallData.id;
    }
    mainWindow.show();
    mainWindow.focus();

    if (mainWindow && !mainWindow.isDestroyed() && latestCallData) {
        mainWindow.webContents.send('call-data', latestCallData);
    }
});

ipcMain.handle('get-audio', async (event, url) => {
    try {
        console.log('[CallWatcher] Проксирование аудио запроса:', url);
        const ses = session.defaultSession;
        const response = await ses.fetch(url, {
            credentials: 'include'
        });

        if (!response.ok) {
            console.error(`[CallWatcher] Ошибка получения аудио: ${response.status} ${response.statusText}`);
            throw new Error(`Ошибка получения аудио: ${response.statusText}`);
        }

        const buffer = await response.arrayBuffer();
        console.log(`[CallWatcher] Аудио успешно получено. Размер: ${buffer.byteLength} байт`);
        return Buffer.from(buffer);
    } catch (e) {
        console.error('[CallWatcher] Ошибка аудио прокси:', e);
        return null;
    }
});


let topicsList = [];
function getTopicsFilePath() {
    return path.join(app.getPath('userData'), 'topics.json');
}

function loadTopics() {
    try {
        const filePath = getTopicsFilePath();
        if (fs.existsSync(filePath)) {
            const data = fs.readFileSync(filePath, 'utf-8');
            topicsList = JSON.parse(data);
        }
    } catch (err) {
        console.error('Ошибка загрузки тем:', err);
    }
}

function saveTopics() {
    try {
        const filePath = getTopicsFilePath();
        fs.writeFileSync(filePath, JSON.stringify(topicsList, null, 2));
    } catch (err) {
        console.error('Ошибка сохранения тем:', err);
    }
}

ipcMain.handle('get-topics', () => {
    return topicsList;
});

ipcMain.handle('save-topic', (event, topic) => {
    if (!topic || !topic.trim()) return;
    const cleanTopic = topic.trim();
    if (!topicsList.includes(cleanTopic)) {
        topicsList.push(cleanTopic);
        saveTopics();
        return true;
    }
    return false;
});

ipcMain.handle('search-clients', async (event, query) => {
    try {
        console.log('[CallWatcher] Поиск:', query);
        const ses = session.defaultSession;
        const url = `https://clients.denvic.ru/Tickets/GetClientByQuery?query=${encodeURIComponent(query)}`;
        const response = await ses.fetch(url);

        if (response.url.includes('Login') || !response.ok) {
            console.log('[CallWatcher] Поиск требует входа');
            return [];
        }

        const contentType = response.headers.get('content-type');
        if (!contentType || !contentType.includes('application/json')) {
            console.log('[CallWatcher] Поиск вернул не JSON');
            return [];
        }

        const clients = await response.json();
        console.log('[CallWatcher] Поиск нашел:', clients.length, 'клиентов');
        return clients;
    } catch (error) {
        console.error('[CallWatcher] Ошибка поиска:', error);
        return [];
    }
});

ipcMain.handle('create-ticket', async (event, { callData, clientId, clientName, subject, description }) => {
    try {
        console.log('[CallWatcher] Создание заявки для:', clientId);
        const ses = session.defaultSession;

        const pageUrl = `https://clients.denvic.ru/Tickets/Create?${callData.rawParams}`;
        const pageResponse = await ses.fetch(pageUrl);

        if (!pageResponse.ok) {
            throw new Error(`Ошибка загрузки страницы: ${pageResponse.status}`);
        }

        const pageHtml = await pageResponse.text();


        const formParams = new URLSearchParams();

        const inputRegex = /<input[^>]*name="([^"]*)"[^>]*value="([^"]*)"/g;
        let inputMatch;
        while ((inputMatch = inputRegex.exec(pageHtml)) !== null) {
            const [, name, value] = inputMatch;
            if (name && !formParams.has(name)) {
                formParams.append(name, value);
            }

        }
        const selectRegex = /<select[^>]*name="([^"]*)"[^>]*>([\s\S]*?)<\/select>/g;
        let selectMatch;
        while ((selectMatch = selectRegex.exec(pageHtml)) !== null) {
            const [, name, content] = selectMatch;
            if (name && !formParams.has(name)) {

                const optionRegex = /<option([^>]*)value="([^"]*)"([^>]*)>/g;
                let optMatch;
                let selectedValue = null;
                while ((optMatch = optionRegex.exec(content)) !== null) {
                    const [, beforeValue, value, afterValue] = optMatch;
                    const fullAttrs = beforeValue + afterValue;

                    const isSelected = fullAttrs.includes('selected');
                    const isDisabled = fullAttrs.includes('disabled');
                    if (isSelected && !isDisabled && value) {
                        selectedValue = value;
                        break;
                    }
                }
                if (selectedValue) {
                    formParams.append(name, selectedValue);
                }
            }
        }

        formParams.set('selectedClientId', clientId);
        formParams.set('newCaption', subject || 'Входящий звонок');

        console.log('[CallWatcher] Получено описание:', description);

        const formattedDesc = (description || '').replace(/\n/g, '<br>');


        const htmlDesc = `<p>Входящий звонок: ${callData.phone || '?'}<br>Дата: ${callData.date}<br>Длительность: ${callData.duration} с.</p>${formattedDesc ? `<br><p>${formattedDesc}</p>` : ''}`;

        formParams.set('newArticleText', htmlDesc);


        const createResponse = await ses.fetch('https://clients.denvic.ru/Tickets/Create', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: formParams.toString()
        });

        const result = await createResponse.json();

        console.log('[CallWatcher] Результат создания заявки:', result);


        if (result.IsValid && callData.phone) {
            clientAssociations[callData.phone] = {
                clientId,
                clientName: clientName || '',
                timestamp: Date.now()
            };
            saveAssociations();

            console.log('[CallWatcher] Сохранена ассоциация для', callData.phone);
        }

        return result;
    } catch (error) {
        console.error('[CallWatcher] Ошибка создания заявки:', error);
        return { IsValid: false, Error: error.message };
    }
});


ipcMain.on('update-call-draft', (event, callId, draft) => {
    const item = callHistory.find(c => c.id === callId);
    if (item) {
        item.draft = draft;
        saveHistory();
    }
});


app.whenReady().then(() => {
    loadHistory();
    loadAssociations();
    loadTopics();
    createMainWindow();
    createTray();
    startPolling();
});

app.on('window-all-closed', () => {

    if (process.platform !== 'darwin') {

    }
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createMainWindow();
    }
});

app.on('before-quit', () => {
    stopPolling();
});
