

const { app, ipcMain, session } = require('electron');
const { autoUpdater } = require('electron-updater');
const state = require('./state');
const history = require('./history');
const calls = require('./calls');
const topics = require('./topics');
const tickets = require('./tickets');
const associations = require('./associations');
const windows = require('./windows');
const settings = require('./settings');
const ai = require('./ai');

function setupIpcHandlers() {
    ipcMain.on('renderer-log', (event, message) => {
        console.log(`[Renderer] ${message}`);
    });

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

    ipcMain.handle('get-association', (event, phone) => {
        return associations.getAssociation(phone);
    });


    ipcMain.handle('search-clients', async (event, query) => {
        return await tickets.searchClients(query);
    });


    ipcMain.handle('create-ticket', async (event, data) => {
        const result = await tickets.createTicket(data);
        if (result && !result.Error && result.IsValid && data.clientId && data.callData && data.callData.phone) {
            associations.setAssociation(data.callData.phone, data.clientId, data.clientName);
        }
        return result;
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
            return Buffer.from(buffer);
        } catch (e) {
            console.error('[CallWatcher] Ошибка аудио:', e.message);
            return { error: e.message };
        }
    });

    ipcMain.handle('download-audio', async (event, url, filename) => {
        try {
            const ses = session.defaultSession;
            const response = await ses.fetch(url, { credentials: 'include' });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const buffer = await response.arrayBuffer();
            const savePath = require('path').join(app.getPath('downloads'), filename || 'audio.mp3');
            require('fs').writeFileSync(savePath, Buffer.from(buffer));
            return { success: true, path: savePath };
        } catch (e) {
            console.error('Download error:', e);
            return { success: false, error: e.message };
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
        state.setIsLoggedIn(false);
        try {
            await session.defaultSession.clearStorageData({ storages: ['cookies', 'localstorage'] });
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
    });

    ipcMain.on('unlock-call', () => {
        state.setIsCallLocked(false);
        state.setLockedCallId(null);
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
                history.saveHistoryImmediate();
            } else {
                const bulkCache = state.getBulkCallsCache();
                const cachedCall = bulkCache.find(c => c.id === callId);

                if (cachedCall) {
                    history.addToHistory(cachedCall, 'skipped');
                    history.saveHistoryImmediate();
                }
            }
        }

        if (latestCallData && (!callId || latestCallData.id === callId)) {
            shownCallIds.add(latestCallData.id);

            const existing = callHistory.find(c => c.id === latestCallData.id);
            if (!existing) {
                history.addToHistory(latestCallData, 'skipped');
                history.saveHistoryImmediate();
            } else if (existing && existing.status !== 'created') {
                existing.status = 'skipped';
                history.saveHistoryImmediate();
                if (mainWindow && !mainWindow.isDestroyed()) {
                    mainWindow.webContents.send('call-history', callHistory);
                }
            }
        }

        state.setLatestCallData(null);

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
        } else {
            const bulkCache = state.getBulkCallsCache();
            const cachedCall = bulkCache.find(c => c.id === callId);

            if (cachedCall) {
                if (ticketUrl) cachedCall.ticketUrl = ticketUrl;
                history.addToHistory(cachedCall, 'created');
            }
        }

        history.saveHistoryImmediate();

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

    ipcMain.handle('get-api-key', (event, service) => {
        return settings.getApiKey(service);
    });

    ipcMain.handle('set-api-key', (event, service, apiKey) => {
        settings.setApiKey(service, apiKey);
        return true;
    });

    ipcMain.handle('transcribe-audio', async (event, audioBuffer, reasons) => {
        try {
            const apiKey = settings.getSetting('openai_api_key');
            if (!apiKey) throw new Error('OpenAI API key not found');

            return await ai.processAudioForTicket(audioBuffer, reasons);
        } catch (error) {
            console.error('Transcription error:', error);
            throw error;
        }
    });

    ipcMain.handle('get-setting', (event, key) => {
        return settings.getSetting(key);
    });

    ipcMain.handle('set-setting', (event, key, value) => {
        settings.setSetting(key, value);
        return true;
    });
}

module.exports = {
    setupIpcHandlers,
    setupUpdaterEvents
};
