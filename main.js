// Call Watcher - Точка входа приложения

const { app, BrowserWindow } = require('electron');
const { autoUpdater } = require('electron-updater');

// Настройка автообновления
autoUpdater.logger = require('electron-log');
autoUpdater.logger.transports.file.level = 'info';
autoUpdater.verifyRowSignatures = false;
autoUpdater.forceDevUpdateConfig = false;

// Импорт модулей
const windows = require('./src/main/windows');
const tray = require('./src/main/tray');
const history = require('./src/main/history');
const associations = require('./src/main/associations');
const topics = require('./src/main/topics');
const auth = require('./src/main/auth');
const calls = require('./src/main/calls');
const ipcHandlers = require('./src/main/ipc-handlers');

// Инициализация приложения
app.whenReady().then(() => {
    // Загрузка данных
    history.loadHistory();
    associations.loadAssociations();
    topics.loadTopics();
    auth.loadAuthState();

    // Создание интерфейса
    windows.createMainWindow();
    tray.createTray();

    // Настройка IPC
    ipcHandlers.setupIpcHandlers();
    ipcHandlers.setupUpdaterEvents();

    // Запуск polling
    calls.startPolling();

    // Проверка обновлений
    if (app.isPackaged) {
        autoUpdater.checkForUpdatesAndNotify();
    }
});

// Обработка закрытия всех окон
app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        // На Windows и Linux не закрываем приложение
    }
});

// Обработка активации (macOS)
app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        windows.createMainWindow();
    }
});

// Перед закрытием
app.on('before-quit', () => {
    calls.stopPolling();
});
