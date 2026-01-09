

const { app, ipcMain, session } = require('electron');
const { autoUpdater } = require('electron-updater');
const state = require('./state');
const history = require('./history');
const calls = require('./calls');
const topics = require('./topics');
const tickets = require('./tickets');
const windows = require('./windows');

function setupIpcHandlers() {

    ipcMain.handle('get-call-data', () => state.getLatestCallData());
    ipcMain.handle('get-call-history', () => state.getCallHistory());

    ipcMain.handle('get-all-calls', async (event, forceRefresh) => {
        return await calls.fetchAllCalls(forceRefresh);
    });

    ipcMain.handle('get-bulk-stats', async () => {
        const allCalls = await calls.fetchAllCalls();
        const total = allCalls.length;
        const filled = allCalls.filter(c => c.hasTicket).length;
        const unfilled = total - filled;
        return { total, filled, unfilled };
    });

    ipcMain.handle('get-app-version', () => {
        return app.getVersion();
    });

    ipcMain.handle('clear-history', () => {
        history.clearHistory();
        return true;
    });


    ipcMain.handle('get-topics', () => topics.getTopics());
    ipcMain.handle('save-topic', (event, topic) => topics.addTopic(topic));


    ipcMain.handle('search-clients', async (event, query) => {
        return await tickets.searchClients(query);
    });


    ipcMain.handle('create-ticket', async (event, data) => {
        return await tickets.createTicket(data);
    });


    ipcMain.handle('get-ticket-reasons', async () => {
        return await tickets.getTicketReasons();
    });


    ipcMain.handle('close-ticket', async (event, params) => {
        return await tickets.closeTicket(params);
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


    ipcMain.on('window-minimize', () => {
        const mainWindow = state.getMainWindow();
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.minimize();
        }
    });

    ipcMain.on('window-maximize', () => {
        const mainWindow = state.getMainWindow();
        if (mainWindow && !mainWindow.isDestroyed()) {
            if (mainWindow.isMaximized()) {
                mainWindow.unmaximize();
            } else {
                mainWindow.maximize();
            }
        }
    });

    ipcMain.on('window-close', () => {
        const mainWindow = state.getMainWindow();
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.close();
        }
    });


    ipcMain.on('open-login', () => {
        windows.openLoginWindow(() => calls.restoreHistoryFromServer());
    });

    ipcMain.on('logout', async () => {
        console.log('[CallWatcher] Выход из системы...');
        state.setIsLoggedIn(false);
        try {
            await session.defaultSession.clearStorageData({ storages: ['cookies', 'localstorage'] });
            console.log('[CallWatcher] Данные сессии очищены');
        } catch (e) {
            console.error('[CallWatcher] Ошибка очистки данных:', e);
        }

        const mainWindow = state.getMainWindow();
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('login-status', false);
        }

        setTimeout(() => calls.checkCalls(), 1000);
    });


    ipcMain.on('lock-call', (event, callId) => {
        state.setIsCallLocked(true);
        state.setLockedCallId(callId);
        console.log('[CallWatcher] Звонок заблокирован:', callId);
    });

    ipcMain.on('unlock-call', () => {
        state.setIsCallLocked(false);
        state.setLockedCallId(null);
        console.log('[CallWatcher] Звонок разблокирован');
    });


    ipcMain.on('skip-call', (event, callId) => {
        windows.hideNotification();

        const callHistory = state.getCallHistory();
        const mainWindow = state.getMainWindow();
        const shownCallIds = state.getShownCallIds();
        const latestCallData = state.getLatestCallData();

        if (callId) {
            const historyItem = callHistory.find(c => c.id === callId);
            if (historyItem) {
                historyItem.status = 'skipped';
                historyItem.updatedAt = new Date().toLocaleString('ru-RU');
                if (mainWindow && !mainWindow.isDestroyed()) {
                    mainWindow.webContents.send('call-history', callHistory);
                }
                history.saveHistory();
            }
        }

        if (latestCallData && (!callId || latestCallData.id === callId)) {
            shownCallIds.add(latestCallData.id);

            const existing = callHistory.find(c => c.id === latestCallData.id);
            if (!existing) {
                history.addToHistory(latestCallData, 'skipped');
            } else if (existing && existing.status !== 'created') {
                existing.status = 'skipped';
                history.saveHistory();
                if (mainWindow && !mainWindow.isDestroyed()) {
                    mainWindow.webContents.send('call-history', callHistory);
                }
            }

            state.setLatestCallData(null);
        }

        state.setNotifiedCallId(null);
        state.setIsCallLocked(false);
        state.setLockedCallId(null);
    });


    ipcMain.on('ticket-created', (event, callId, ticketUrl) => {
        const callHistory = state.getCallHistory();
        const historyItem = callHistory.find(c => c.id === callId);
        const latestCallData = state.getLatestCallData();

        if (historyItem) {
            historyItem.status = 'created';
            historyItem.ticketUrl = ticketUrl;
            historyItem.updatedAt = new Date().toLocaleString('ru-RU');
        } else if (latestCallData && latestCallData.id === callId) {
            if (ticketUrl) latestCallData.ticketUrl = ticketUrl;
            history.addToHistory(latestCallData, 'created');
        }

        history.saveHistory();

        state.getShownCallIds().add(callId);

        if (state.getLockedCallId() === callId) {
            state.setIsCallLocked(false);
            state.setLockedCallId(null);
            state.setLatestCallData(null);
        }

        state.setNotifiedCallId(null);

        const mainWindow = state.getMainWindow();
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('call-history', callHistory);
        }

        calls.checkCalls();
    });


    ipcMain.on('fill-ticket', () => {
        windows.hideNotification();
        const latestCallData = state.getLatestCallData();
        const mainWindow = state.getMainWindow();

        if (latestCallData) {
            state.setIsCallLocked(true);
            state.setLockedCallId(latestCallData.id);
        }
        mainWindow.show();
        mainWindow.focus();

        if (mainWindow && !mainWindow.isDestroyed() && latestCallData) {
            mainWindow.webContents.send('call-data', latestCallData);
        }
    });


    ipcMain.on('update-call-draft', (event, callId, draft) => {
        const callHistory = state.getCallHistory();
        const item = callHistory.find(c => c.id === callId);
        if (item) {
            item.draft = draft;
            history.saveHistory();
            const mainWindow = state.getMainWindow();
            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('call-history', callHistory);
            }
        }
    });


    ipcMain.on('open-ticket-browser', (event, callData, clientId) => {
        tickets.openTicketInBrowser(callData, clientId);
    });


    ipcMain.on('test-notification', () => {
        const testData = {
            id: 'test-' + Date.now(),
            phone: '79991234567',
            date: new Date().toLocaleString('ru-RU'),
            duration: '30',
            suggestions: [{ id: '1', name: 'Тестовый клиент' }]
        };
        windows.showNotification(testData);
    });


    ipcMain.on('restart_app', () => {
        autoUpdater.quitAndInstall();
    });
}

function setupUpdaterEvents() {
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
        const mainWindow = state.getMainWindow();
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('update-available', info);
        }
    });

    autoUpdater.on('update-downloaded', (info) => {
        console.log('[Updater] Обновление загружено, перезапуск...');
        const mainWindow = state.getMainWindow();
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('update-downloaded', info);
        }
        autoUpdater.quitAndInstall(true, true);
    });

    autoUpdater.on('error', (err) => {
        console.error('[Updater] Ошибка:', err);
        const mainWindow = state.getMainWindow();
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('update-error', err.message);
        }
    });
}

module.exports = {
    setupIpcHandlers,
    setupUpdaterEvents
};
