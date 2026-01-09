const { app, BrowserWindow, Tray, Menu, ipcMain, session, screen, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { autoUpdater } = require('electron-updater');

autoUpdater.logger = require('electron-log');
autoUpdater.logger.transports.file.level = 'info';
autoUpdater.verifyRowSignatures = false;
autoUpdater.forceDevUpdateConfig = false;


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

function getAuthStatePath() {
    return path.join(app.getPath('userData'), 'auth_state.json');
}

function loadAuthState() {
    try {
        const p = getAuthStatePath();
        if (fs.existsSync(p)) {
            const data = JSON.parse(fs.readFileSync(p, 'utf8'));
            isLoggedIn = !!data.isLoggedIn;
            console.log('[CallWatcher] Загружен статус авторизации:', isLoggedIn);
        }
    } catch (e) { console.error('Ошибка загрузки статуса:', e); }
}

function saveAuthState(status) {
    try {
        fs.writeFileSync(getAuthStatePath(), JSON.stringify({ isLoggedIn: status }));
    } catch (e) { console.error('Ошибка сохранения статуса:', e); }
}

function createMainWindow() {
    mainWindow = new BrowserWindow({
        width: 1400,
        height: 920,
        minWidth: 600,
        minHeight: 500,
        frame: false,
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
        mainWindow.webContents.send('login-status', isLoggedIn);
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

        const authCheckUrl = 'https://clients.denvic.ru/Tickets';
        const authResponse = await ses.fetch(authCheckUrl, { credentials: 'include' });
        const authHtml = await authResponse.text();

        const hasPasswordField = authHtml.includes('Password');
        const hasLoginKeyword = authHtml.includes('Войти') || authHtml.includes('login');
        console.log('[CallWatcher] Проверка: Password:', hasPasswordField, ', Login:', hasLoginKeyword);

        const isLoginPage = authHtml.includes('Password') ||
            authHtml.includes('Войти') ||
            authHtml.includes('Log in') ||
            authHtml.includes('Remember me');

        if (isLoginPage) {
            console.log('[CallWatcher] Проверка авторизации: обнаружена страница входа -> Не авторизован');
            if (isLoggedIn) {
                isLoggedIn = false;
                saveAuthState(false);
                if (mainWindow && !mainWindow.isDestroyed()) {
                    mainWindow.webContents.send('login-status', false);
                }
            } else {
                if (isFirstPoll && mainWindow && !mainWindow.isDestroyed()) {
                    mainWindow.webContents.send('login-status', false);
                }
            }

            if (!loginWindow || loginWindow.isDestroyed()) {
                openLoginWindow();
            }
            return;
        }

        const response = await ses.fetch(PHONE_CALLS_URL, {
            credentials: 'include'
        });

        if (!response.ok || response.url.includes('Login')) {
            console.log('[CallWatcher] Не авторизован');
            if (isLoggedIn) {
                isLoggedIn = false;
                if (mainWindow && !mainWindow.isDestroyed()) {
                    mainWindow.webContents.send('login-status', false);
                }
            } else {

                if (isFirstPoll && mainWindow && !mainWindow.isDestroyed()) {
                    mainWindow.webContents.send('login-status', false);
                }
            }
            return;
        }

        const html = await response.text();

        if (html.includes('id="Input_Password"') || html.includes('name="Input.Password"') || html.includes('Вход в систему')) {
            console.log('[CallWatcher] Обнаружена форма входа, считаем что не авторизован');
            if (isLoggedIn) {
                isLoggedIn = false;
                saveAuthState(false);
                if (mainWindow && !mainWindow.isDestroyed()) {
                    mainWindow.webContents.send('login-status', false);
                }
            } else {
                if (isFirstPoll && mainWindow && !mainWindow.isDestroyed()) {
                    mainWindow.webContents.send('login-status', false);
                }
            }
            return;
        }

        if (!isLoggedIn) {
            isLoggedIn = true;
            saveAuthState(true);
            console.log('[CallWatcher] Успешная авторизация');
            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('login-status', true);
            }
        }

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
                    const historyItem = callHistory.find(c => c.id === callData.id);
                    if (historyItem && historyItem.draft) {
                        callData.draft = historyItem.draft;
                    }

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
let bulkInitialLoadDone = false;

let currentFetchPromise = null;

async function fetchAllCalls(forceRefresh = false, emitProgress = true) {

    if (!forceRefresh && bulkCallsCache.length > 0) {
        return bulkCallsCache;
    }

    if (currentFetchPromise) {
        console.log('[CallWatcher] Bulk: Joining existing fetch operation...');
        return currentFetchPromise;
    }

    currentFetchPromise = (async () => {
        const ses = session.defaultSession;
        const allCalls = [];
        let page = 1;
        const MAX_PAGES = 20;
        let hasMore = true;

        try {
            while (hasMore && page <= MAX_PAGES) {
                const url = `https://clients.denvic.ru/PhoneCalls?onlyMy=true&page=${page}`;
                console.log(`[CallWatcher] Bulk: Fetching page ${page}...`);

                const response = await ses.fetch(url, { credentials: 'include' });

                if (!response.ok || response.url.includes('Login')) {
                    console.log('[CallWatcher] Bulk: Not logged in or error');
                    if (page === 1) return [];
                    break;
                }

                const html = await response.text();
                const pageCalls = parseAllCallsFromPage(html);

                if (pageCalls.length === 0) {
                    console.log(`[CallWatcher] Bulk: Page ${page} is empty, stopping.`);
                    hasMore = false;
                } else {

                    const newCalls = pageCalls.filter(nc => !allCalls.find(ac => ac.id === nc.id));
                    allCalls.push(...newCalls);
                    console.log(`[CallWatcher] Bulk: Added ${newCalls.length} calls from page ${page}`);

                    if (mainWindow && !mainWindow.isDestroyed() && emitProgress) {
                        mainWindow.webContents.send('bulk-progress', allCalls.length);
                    }

                    page++;
                }
            }

            console.log(`[CallWatcher] Bulk: Loaded ${allCalls.length} total calls`);

            bulkCallsCache = allCalls;
            bulkLastFetched = Date.now();
            return allCalls;

        } catch (error) {
            console.error('[CallWatcher] Bulk fetch error:', error);
            return [];
        } finally {
            currentFetchPromise = null;
        }
    })();

    return currentFetchPromise;
}

function parseAllCallsFromPage(html) {
    const calls = [];
    const foundIds = new Set();

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


        const rowStart = html.lastIndexOf('<tr', startIndex);
        if (rowStart !== -1) {
            const rowHtml = html.slice(rowStart, endIndex);
            const tdMatches = [...rowHtml.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)];
            if (tdMatches.length >= 2) {
                const sourceTd = tdMatches[1][1];
                const sourceText = sourceTd.replace(/<[^>]+>/g, '').trim();

                if (/^\d{2,4}$/.test(sourceText)) {
                    continue;
                }
            }
        }

        const params = new URLSearchParams(match[1]);
        const phone = params.get('selectedPhoneNuber') || '';
        const linkedId = params.get('linkedId') || '';
        const date = params.get('selectedPhoneDate') || '';
        const duration = params.get('selectedPhoneDuration') || '';

        if (linkedId) foundIds.add(linkedId);

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

    const audioLinkRegex = /GetCallRecord\?id=([^"&\s]+)/g;
    const audioMatches = [...html.matchAll(audioLinkRegex)];

    for (const audioMatch of audioMatches) {
        const linkedId = audioMatch[1];

        if (foundIds.has(linkedId)) continue;
        foundIds.add(linkedId);

        const pos = audioMatch.index;

        let rowStart = html.lastIndexOf('<tr', pos);
        if (rowStart === -1) rowStart = Math.max(0, pos - 2000);

        let rowEnd = html.indexOf('</tr>', pos);
        if (rowEnd === -1) rowEnd = Math.min(html.length, pos + 2000);
        else rowEnd += 5;

        const rowHtml = html.slice(rowStart, rowEnd);

        const tdMatches = [...rowHtml.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)];
        if (tdMatches.length >= 2) {
            const sourceTd = tdMatches[1][1];
            const sourceText = sourceTd.replace(/<[^>]+>/g, '').trim();

            if (/^\d{2,4}$/.test(sourceText)) {
                continue;
            }
        }

        let phone = '';
        const phonePatterns = [
            /&#x2B;7\s*\((\d{3})\)\s*(\d{3})-(\d{2})-(\d{2})/,
            /\+7\s*\((\d{3})\)\s*(\d{3})-(\d{2})-(\d{2})/,
            />7(\d{10})</,
            />\+?7\s*(\d{3})\s*(\d{3})\s*(\d{2})\s*(\d{2})</
        ];

        for (const pattern of phonePatterns) {
            const phoneMatch = rowHtml.match(pattern);
            if (phoneMatch) {
                if (phoneMatch.length === 5) {
                    phone = '7' + phoneMatch[1] + phoneMatch[2] + phoneMatch[3] + phoneMatch[4];
                } else if (phoneMatch.length === 2) {
                    phone = '7' + phoneMatch[1];
                }
                break;
            }
        }

        const dateMatch = rowHtml.match(/>(\d{2}\.\d{2}\.\d{4}\s+\d{2}:\d{2}:\d{2})</);
        const date = dateMatch ? dateMatch[1] : '';

        let duration = '';
        const durationPatterns = [
            />(\d+)\s*мин\s*(\d+)\s*сек/i,
            />(\d+)\s*сек/i,
            />(\d+)\s*мин/i,
        ];

        for (const pattern of durationPatterns) {
            const durMatch = rowHtml.match(pattern);
            if (durMatch) {
                if (durMatch.length === 3) {
                    duration = String(parseInt(durMatch[1]) * 60 + parseInt(durMatch[2]));
                } else if (pattern.source.includes('мин') && !pattern.source.includes('сек')) {
                    duration = String(parseInt(durMatch[1]) * 60);
                } else {
                    duration = durMatch[1];
                }
                break;
            }
        }

        const hasTicket = rowHtml.includes('/Tickets/Details/') || rowHtml.includes('btn-success');

        if (phone || date || linkedId) {
            const audioUrl = `https://clients.denvic.ru/PhoneCalls/GetCallRecord?id=${linkedId}`;

            calls.push({
                id: linkedId,
                phone,
                date,
                duration,
                audioUrl,
                suggestions: [],
                hasTicket,
                rawParams: '',
                isLegacy: true
            });
        }
    }

    return calls;
}

async function restoreHistoryFromServer() {
    console.log('[CallWatcher] Начало восстановления истории с сервера...');
    try {
        const serverCalls = await fetchAllCalls(true, false);
        let addedCount = 0;


        for (const call of serverCalls) {
            const exists = callHistory.find(c => c.id === call.id);

            if (!exists) {
                let status = 'unprocessed';
                if (call.hasTicket) status = 'created';

                callHistory.push({
                    ...call,
                    status: status,
                    addedAt: new Date().toLocaleString('ru-RU')
                });
                addedCount++;
            }
        }

        if (addedCount > 0) {
            const uniqueMap = new Map();
            callHistory.forEach(c => uniqueMap.set(c.id, c));

            callHistory = Array.from(uniqueMap.values());

            callHistory.sort((a, b) => {
                const parseDate = (d) => {
                    if (!d) return 0;
                    const [datePart, timePart] = d.split(' ');
                    const [day, month, year] = datePart.split('.');
                    return new Date(`${year}-${month}-${day}T${timePart}`).getTime();
                };
                return parseDate(b.date) - parseDate(a.date);
            });

            if (callHistory.length > 100) callHistory = callHistory.slice(0, 100);

            console.log(`[CallWatcher] Восстановлено ${addedCount} звонков. Всего в истории: ${callHistory.length}`);
            saveHistory();

            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('call-history', callHistory);
            }
        } else {
            console.log('[CallWatcher] Новых звонков для восстановления не найдено.');
        }

        callHistory.forEach(c => {
            if (c.id) shownCallIds.add(c.id);
        });
        console.log('[CallWatcher] Обновлен список показанных звонков:', shownCallIds.size);

    } catch (e) {
        console.error('[CallWatcher] Ошибка восстановления истории:', e);
    }
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
        if (url.includes('/Tickets')) {
            console.log('[CallWatcher] Обнаружен успешный вход (переход на Tickets)');
            isLoggedIn = true;
            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('login-status', true);
            }
            if (loginWindow && !loginWindow.isDestroyed()) {
                loginWindow.close();
            }

            restoreHistoryFromServer();
        }
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

ipcMain.handle('get-app-version', () => {
    return app.getVersion();
});

autoUpdater.on('checking-for-update', () => {
    console.log('[Updater] Проверка обновлений...');
});

autoUpdater.on('update-not-available', (info) => {
    console.log('[Updater] Обновления не найдены. Текущая версия актуальна:', info);
});

autoUpdater.on('download-progress', (progressObj) => {
    let log_message = '[Updater] Скорость: ' + progressObj.bytesPerSecond;
    log_message = log_message + ' - Загружено ' + progressObj.percent + '%';
    log_message = log_message + ' (' + progressObj.transferred + '/' + progressObj.total + ')';
    console.log(log_message);
});

autoUpdater.on('working-directory', (info) => {
    console.log('[Updater] Working directory:', info);
});

autoUpdater.on('update-available', (info) => {
    console.log('[Updater] Доступно обновление:', info);
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('update-available', info);
    }
});

autoUpdater.on('update-downloaded', (info) => {
    console.log('[Updater] Обновление загружено, перезапуск...');
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('update-downloaded', info);
    }
    autoUpdater.quitAndInstall(true, true);
});

autoUpdater.on('error', (err) => {
    console.error('[Updater] Ошибка:', err);
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('update-error', err.message);
    }
});

ipcMain.on('restart_app', () => {
    autoUpdater.quitAndInstall();
});

ipcMain.on('window-minimize', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.minimize();
    }
});

ipcMain.on('window-maximize', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
        if (mainWindow.isMaximized()) {
            mainWindow.unmaximize();
        } else {
            mainWindow.maximize();
        }
    }
});

ipcMain.on('window-close', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.close();
    }
});

ipcMain.on('open-login', () => {
    openLoginWindow();
});

ipcMain.on('logout', async () => {
    console.log('[CallWatcher] Выход из системы...');
    isLoggedIn = false;
    try {
        await session.defaultSession.clearStorageData({ storages: ['cookies', 'localstorage'] });
        console.log('[CallWatcher] Данные сессии очищены');
    } catch (e) {
        console.error('[CallWatcher] Ошибка очистки данных:', e);
    }

    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('login-status', false);
    }

    setTimeout(checkCalls, 1000);
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
        const ses = session.defaultSession;
        const response = await ses.fetch(url, {
            credentials: 'include'
        });

        if (!response.ok) {
            if (response.status !== 500) {
                console.error(`[CallWatcher] Ошибка получения аудио: HTTP ${response.status}`);
            }
            return { error: `HTTP ${response.status}: ${response.statusText}`, status: response.status };
        }

        const buffer = await response.arrayBuffer();
        console.log(`[CallWatcher] Аудио получено: ${buffer.byteLength} байт`);
        return Buffer.from(buffer);
    } catch (e) {
        console.error('[CallWatcher] Ошибка аудио:', e.message);
        return { error: e.message };
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

        let urlParams = callData.rawParams;
        if (!urlParams) {
            const params = new URLSearchParams();
            if (callData.phone) params.append('selectedPhoneNuber', callData.phone);
            if (callData.id) params.append('linkedId', callData.id);
            if (callData.date) params.append('selectedPhoneDate', callData.date);
            if (callData.duration) params.append('selectedPhoneDuration', callData.duration);
            urlParams = params.toString();
            console.log('[CallWatcher] Сгенерированы параметры URL:', urlParams);
        }

        const pageUrl = `https://clients.denvic.ru/Tickets/Create?${urlParams}`;
        console.log('[CallWatcher] Загрузка страницы:', pageUrl);
        const pageResponse = await ses.fetch(pageUrl);

        if (!pageResponse.ok) {
            throw new Error(`Ошибка загрузки страницы: ${pageResponse.status}`);
        }

        const pageHtml = await pageResponse.text();

        if (pageHtml.includes('Login') && pageHtml.includes('Password')) {
            throw new Error('Требуется авторизация. Пожалуйста, войдите в систему.');
        }

        if (pageHtml.includes('невозможно создать') || pageHtml.includes('ограничен') ||
            pageHtml.includes('недоступн') || pageHtml.includes('error')) {
            const errorMatch = pageHtml.match(/<div[^>]*class="[^"]*alert[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
            const errorText = errorMatch ? errorMatch[1].replace(/<[^>]+>/g, '').trim() : '';
            console.log('[CallWatcher] Возможная ошибка на странице:', errorText);
        }

        if (!pageHtml.includes('__RequestVerificationToken')) {
            console.warn('[CallWatcher] Не найден токен верификации, возможно форма недоступна');
        }

        const formParams = new URLSearchParams();

        const inputRegex = /<input[^>]*name="([^"]*)"[^>]*value="([^"]*)"/g;
        let inputMatch;
        while ((inputMatch = inputRegex.exec(pageHtml)) !== null) {
            const [, name, value] = inputMatch;
            if (name && !formParams.has(name)) {
                formParams.append(name, decodeHtmlEntities(value));
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
                    formParams.append(name, decodeHtmlEntities(selectedValue));
                }
            }
        }

        formParams.set('selectedClientId', clientId);
        const rawSubject = subject || 'Входящий звонок';
        const decodedSubject = decodeHtmlEntities(rawSubject);
        console.log('[CallWatcher] Subject raw:', rawSubject, 'Decoded:', decodedSubject);
        formParams.set('newCaption', decodedSubject);

        console.log('[CallWatcher] Получено описание:', description);

        const formattedDesc = (description || '').replace(/\n/g, '<br>');

        const htmlDesc = `<p>Входящий звонок: ${callData.phone || '?'}<br>Дата: ${callData.date}<br>Длительность: ${callData.duration} с.${formattedDesc ? `<br><br>${formattedDesc}` : ''}</p>`;

        formParams.set('newArticleText', htmlDesc);

        const createResponse = await ses.fetch('https://clients.denvic.ru/Tickets/Create', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: formParams.toString()
        });

        const contentType = createResponse.headers.get('content-type') || '';
        let result;

        if (contentType.includes('application/json')) {
            result = await createResponse.json();
        } else {
            const responseText = await createResponse.text();
            console.log('[CallWatcher] Сервер вернул HTML вместо JSON');

            if (responseText.includes('/Tickets/Details/')) {
                const detailsMatch = responseText.match(/\/Tickets\/Details\/(\d+)/);
                if (detailsMatch) {
                    result = { IsValid: true, Redirect: true, Address: `/Tickets/Details/${detailsMatch[1]}` };
                } else {
                    result = { IsValid: false, Error: 'Не удалось определить результат создания' };
                }
            } else {
                const errorMatch = responseText.match(/<div[^>]*class="[^"]*alert[^"]*error[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
                const errorText = errorMatch ? errorMatch[1].replace(/<[^>]+>/g, '').trim() : 'Неизвестная ошибка сервера';
                result = { IsValid: false, Error: errorText };
            }
        }

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
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('call-history', callHistory);
        }
    }
});

ipcMain.on('open-ticket-browser', (event, callData, clientId) => {
    if (!callData) {
        console.error('[CallWatcher] Нет данных звонка для открытия в браузере');
        return;
    }

    const params = new URLSearchParams();

    if (clientId) {
        params.append('id', clientId);
    }

    if (callData.phone) {
        params.append('selectedPhoneNuber', callData.phone);
    }

    if (callData.id) {
        params.append('linkedId', callData.id);
    }

    if (callData.date) {
        params.append('selectedPhoneDate', callData.date);
    }

    if (callData.duration) {
        params.append('selectedPhoneDuration', callData.duration);
    }

    const url = `https://clients.denvic.ru/Tickets/Create?${params.toString()}`;
    console.log('[CallWatcher] Открытие в браузере:', url);

    shell.openExternal(url);
});

const FALLBACK_REASONS = [
    { value: 'iikoFront (консультации, настройка)', text: 'iikoFront (консультации, настройка)' },
    { value: 'iikoOffice (консультации, настройка)', text: 'iikoOffice (консультации, настройка)' },
    { value: 'Сервер iiko', text: 'Сервер iiko' },
    { value: 'ЕГАИС (консультация)', text: 'ЕГАИС (консультация)' },
    { value: 'ЕГАИС (что-то не работает)', text: 'ЕГАИС (что-то не работает)' },
    { value: 'Честный знак, ОФД, Меркурий', text: 'Честный знак, ОФД, Меркурий' },
    { value: 'Обучение', text: 'Обучение' },
    { value: 'Лицензии', text: 'Лицензии' },
    { value: 'iikoWeb', text: 'iikoWeb' },
    { value: 'Лояльность (работа, отчёты, настройки)', text: 'Лояльность (работа, отчёты, настройки)' },
    { value: 'Банк(ошибки, подключение)', text: 'Банк(ошибки, подключение)' },
    { value: '1С', text: '1С' },
    { value: 'Прочее', text: 'Прочее' }
];

function decodeHtmlEntities(text) {
    if (!text) return text;
    return text.replace(/&#x([0-9A-F]+);/gi, (match, hex) => String.fromCharCode(parseInt(hex, 16)))
        .replace(/&#(\d+);/g, (match, dec) => String.fromCharCode(parseInt(dec, 10)))
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'");
}

let cachedReasons = null;

ipcMain.handle('get-ticket-reasons', async () => {
    if (cachedReasons && cachedReasons.length > 0) {
        return cachedReasons;
    }

    try {
        console.log('[CallWatcher] Попытка загрузки причин с сервера...');
        const ses = session.defaultSession;

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000);

        const response = await ses.fetch('https://clients.denvic.ru/Tickets/Details/583867', {
            signal: controller.signal
        });
        clearTimeout(timeout);

        if (!response.ok) {
            throw new Error(`HTTP ошибка: ${response.status}`);
        }

        const html = await response.text();
        const reasons = [];

        const selectMatch = html.match(/<select[^>]*id="ticket_reason_select"[^>]*>([\s\S]*?)<\/select>/i) ||
            html.match(/<select[^>]*name="ticket\.TicketReason"[^>]*>([\s\S]*?)<\/select>/i) ||
            html.match(/<select[^>]*name="ticket\.ReasonId"[^>]*>([\s\S]*?)<\/select>/i);

        if (selectMatch) {
            const optionRegex = /<option[^>]*value="([^"]*)"[^>]*>([^<]*)<\/option>/g;
            let match;
            while ((match = optionRegex.exec(selectMatch[1])) !== null) {
                const [, value, text] = match;
                if (value && value.trim()) {
                    const cleanValue = value.trim();
                    const rawText = text ? text.trim() : cleanValue;
                    reasons.push({ value: decodeHtmlEntities(cleanValue), text: decodeHtmlEntities(rawText) });
                }
            }
        } else {
        }

        if (reasons.length > 0) {
            console.log(`[CallWatcher] Успешно загружено ${reasons.length} причин`);
            cachedReasons = reasons;
            return reasons;
        } else {
            throw new Error('Не удалось спарсить причины из HTML');
        }

    } catch (error) {
        console.warn(`[CallWatcher] Ошибка загрузки причин (${error.message}). Используем резервный список.`);
        cachedReasons = FALLBACK_REASONS;
        return FALLBACK_REASONS;
    }
});

ipcMain.handle('close-ticket', async (event, params) => {
    try {
        let { ticketId, reasonId, reasonIds, comment, timeSpent } = params;
        console.log('[CallWatcher] Закрытие заявки:', ticketId);

        if (reasonIds && Array.isArray(reasonIds) && reasonIds.length > 0) {
            if (reasonIds.length === 1) {
                reasonId = reasonIds[0];
            } else {
                const reasonsList = cachedReasons || FALLBACK_REASONS;
                const selectedTexts = [];

                reasonIds.forEach(id => {
                    const r = reasonsList.find(x => x.value == id);
                    if (r) selectedTexts.push(typeof r.text === 'string' ? r.text : id);
                    else selectedTexts.push(id);
                });

                const namesStr = selectedTexts.join(', ');
                if (namesStr) {
                    const prefix = `[Причины: ${namesStr}]`;
                    comment = comment ? `${prefix}\n${comment}` : prefix;
                }
                reasonId = reasonIds[0];
            }
        }

        console.log('[CallWatcher] Параметры закрытия (processed):', { reasonId, comment, timeSpent });
        const ses = session.defaultSession;

        const pageUrl = `https://clients.denvic.ru/Tickets/Details/${ticketId}`;
        console.log('[CallWatcher] Загрузка страницы заявки:', pageUrl);
        const pageResponse = await ses.fetch(pageUrl);

        if (!pageResponse.ok) {
            throw new Error(`Ошибка загрузки страницы заявки: ${pageResponse.status}`);
        }

        const pageHtml = await pageResponse.text();
        console.log('[CallWatcher] Страница заявки загружена, размер:', pageHtml.length);

        try {
            const debugPath = path.join(app.getAppPath(), 'last_ticket_page.html');
            fs.writeFileSync(debugPath, pageHtml);
            console.log('[CallWatcher] DEBUG: Saved page HTML to', debugPath);
        } catch (e) {
            console.error('[CallWatcher] DEBUG: Failed to save HTML:', e);
        }

        let token = null;
        const tokenTagMatch = pageHtml.match(/<input[^>]*__RequestVerificationToken[^>]*>/i);
        if (tokenTagMatch) {
            const valMatch = tokenTagMatch[0].match(/value="([^"]*)"/i);
            if (valMatch) token = valMatch[1];
        }

        if (!token) {
            throw new Error('Не найден токен верификации (__RequestVerificationToken)');
        }
        console.log('[CallWatcher] Токен верификации найден');

        const formParams = new URLSearchParams();
        formParams.append('__RequestVerificationToken', token);
        formParams.append('ticket.StateId', '4');

        let reasonParamName = 'ticket.TicketReason';
        if (pageHtml.match(/name="ticket\.ReasonId"/)) {
            reasonParamName = 'ticket.ReasonId';
        }

        if (reasonIds && Array.isArray(reasonIds) && reasonIds.length > 0) {
            reasonIds.forEach(id => {
                formParams.append(reasonParamName, decodeHtmlEntities(id || ''));
            });
        } else {
            formParams.append(reasonParamName, decodeHtmlEntities(reasonId || ''));
        }

        formParams.append('newArticle.Body', `<p>${comment || 'Вопрос решён'}</p>`);
        formParams.append('newArticleTimeUnit', (timeSpent || 5).toString());
        formParams.append('newArticle.Internal', 'false');

        const inputGlobalRegex = /<input([^>]*)>/gi;
        let inputTagMatch;
        while ((inputTagMatch = inputGlobalRegex.exec(pageHtml)) !== null) {
            const tagContent = inputTagMatch[1];
            const nameMatch = tagContent.match(/name="([^"]*)"/i);
            const valMatch = tagContent.match(/value="([^"]*)"/i);

            if (nameMatch) {
                const name = nameMatch[1];
                const value = valMatch ? valMatch[1] : '';

                if (name && !formParams.has(name) && !name.includes('__RequestVerification')) {
                    formParams.append(name, decodeHtmlEntities(value));
                }
            }
        }

        const selectRegex = /<select[^>]*name="([^"]*)"[^>]*>([\s\S]*?)<\/select>/g;
        let selectMatch;
        while ((selectMatch = selectRegex.exec(pageHtml)) !== null) {
            const [, name, content] = selectMatch;

            if (name === 'ticket.TicketReason' || name === 'ticket.ReasonId') {
                console.log(`[CallWatcher] На странице найден селект ${name}. Содержимое (первые 100 символов):`, content.substring(0, 100));
            }

            if (name && !formParams.has(name) && name !== 'ticket.TicketReason') {
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
                    formParams.append(name, decodeHtmlEntities(selectedValue));
                }
            }
        }

        console.log('[CallWatcher] Отправка формы закрытия...');
        const saveResponse = await ses.fetch(`https://clients.denvic.ru/Tickets/Details/${ticketId}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: formParams.toString()
        });

        const saveHtml = await saveResponse.text();
        console.log('[CallWatcher] Ответ сервера:', saveHtml);

        try {
            if (saveHtml.startsWith('{') && saveHtml.endsWith('}')) {
                const json = JSON.parse(saveHtml);
                if (typeof json.IsValid !== 'undefined' && !json.IsValid) {
                    console.error('[CallWatcher] Сервер вернул ошибку валидации:', json);
                    throw new Error(json.Error || 'Ошибка валидации (сервер не принял данные)');
                }
            }
        } catch (e) {
            if (e.message.includes('Ошибка валидации')) throw e;
        }

        if (saveHtml.includes('newArticleTimeUnit') || saveHtml.includes('Учет времени')) {
            console.log('[CallWatcher] Появилось окно ввода времени');

            const timeTokenMatch = saveHtml.match(/name="__RequestVerificationToken"[^>]*value="([^"]*)"/);
            const timeToken = timeTokenMatch ? timeTokenMatch[1] : token;

            const timeParams = new URLSearchParams();
            timeParams.append('__RequestVerificationToken', timeToken);
            timeParams.append('newArticleTimeUnit', String(timeSpent || 5));
            timeParams.append('ticketId', String(ticketId));

            const timeResponse = await ses.fetch(`https://clients.denvic.ru/Tickets/SaveTime/${ticketId}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: timeParams.toString()
            });

            console.log('[CallWatcher] Ответ сохранения времени:', timeResponse.status);
        }

        console.log('[CallWatcher] Заявка закрыта успешно');
        return { success: true };
    } catch (error) {
        console.error('[CallWatcher] Ошибка закрытия заявки:', error);
        return { success: false, error: error.message };
    }
});


app.whenReady().then(() => {
    loadHistory();
    loadAssociations();
    loadTopics();
    loadAuthState();
    createMainWindow();
    createTray();
    startPolling();

    if (app.isPackaged) {
        autoUpdater.checkForUpdatesAndNotify();
    }
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
