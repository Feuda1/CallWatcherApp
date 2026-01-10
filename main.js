const { app, BrowserWindow } = require('electron');
const { autoUpdater } = require('electron-updater');

autoUpdater.logger = require('electron-log');
autoUpdater.logger.transports.file.level = 'info';
autoUpdater.verifyRowSignatures = false;
autoUpdater.forceDevUpdateConfig = false;

const windows = require('./src/main/windows');
const tray = require('./src/main/tray');
const history = require('./src/main/history');
const associations = require('./src/main/associations');
const topics = require('./src/main/topics');
const auth = require('./src/main/auth');
const calls = require('./src/main/calls');
const ipcHandlers = require('./src/main/ipc-handlers');

app.whenReady().then(() => {
    history.loadHistory();
    associations.loadAssociations();
    topics.loadTopics();
    auth.loadAuthState();

    windows.createMainWindow();
    tray.createTray();

    ipcHandlers.setupIpcHandlers();
    ipcHandlers.setupUpdaterEvents();

    calls.startPolling();

    if (app.isPackaged) {
        autoUpdater.checkForUpdatesAndNotify();
    }
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        windows.createMainWindow();
    }
});

app.on('before-quit', () => {
    calls.stopPolling();
});
