

const { app } = require('electron');
const path = require('path');
const fs = require('fs');
const state = require('./state');

let HISTORY_FILE_PATH = null;
let saveTimeout = null;

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
            let history = Array.isArray(parsed.history) ? parsed.history : [];


            const uniqueHistoryMap = new Map();
            history.forEach(item => {
                if (item && item.id) {
                    uniqueHistoryMap.set(item.id, item);
                }
            });
            history = Array.from(uniqueHistoryMap.values());


            if (history.length > 250) {
                history = history.slice(0, 250);
            }
            state.setCallHistory(history);

            const shownCallIds = state.getShownCallIds();
            history.forEach(c => {
                if (c.status === 'created' || c.status === 'skipped') {
                    shownCallIds.add(c.id);
                }
            });
            console.log('[CallWatcher] Загружено', history.length, 'звонков. Показано:', shownCallIds.size);
        }
    } catch (e) {
        console.error('[CallWatcher] Ошибка загрузки истории:', e);
    }
}

function saveHistory() {
    clearTimeout(saveTimeout);
    saveTimeout = setTimeout(() => {
        try {
            const filePath = getHistoryFilePath();
            const callHistory = state.getCallHistory();
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

function addToHistory(callData, status) {
    if (!callData) return;

    const callHistory = state.getCallHistory();
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
        if (callHistory.length > 250) callHistory.pop();
    }

    const mainWindow = state.getMainWindow();
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('call-history', callHistory);
    }

    saveHistory();
}

function clearHistory() {
    state.setCallHistory([]);
    state.getShownCallIds().clear();
    saveHistory();

    const mainWindow = state.getMainWindow();
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('call-history', []);
    }
}

module.exports = {
    getHistoryFilePath,
    loadHistory,
    saveHistory,
    addToHistory,
    clearHistory
};
