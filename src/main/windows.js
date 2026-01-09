// Модуль управления окнами приложения

const { BrowserWindow, screen } = require('electron');
const path = require('path');
const state = require('./state');

function createMainWindow() {
    const mainWindow = new BrowserWindow({
        width: 1400,
        height: 920,
        minWidth: 600,
        minHeight: 500,
        frame: false,
        autoHideMenuBar: true,
        resizable: true,
        show: false,
        icon: path.join(__dirname, '../../assets', 'icon.png'),
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, '../../preload.js'),
            webSecurity: false
        }
    });

    mainWindow.loadFile(path.join(__dirname, '../index.html'));
    mainWindow.setMenu(null);

    mainWindow.on('ready-to-show', () => {
        mainWindow.show();
        mainWindow.webContents.send('login-status', state.getIsLoggedIn());
    });

    mainWindow.on('close', (event) => {
        const { app } = require('electron');
        if (!app.isQuitting) {
            event.preventDefault();
            mainWindow.hide();
        }
    });

    state.setMainWindow(mainWindow);
    return mainWindow;
}

function createNotificationWindow() {
    const { width, height } = screen.getPrimaryDisplay().workAreaSize;

    const winWidth = 320;
    const winHeight = 240;

    const notificationWindow = new BrowserWindow({
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
            preload: path.join(__dirname, '../../preload.js')
        }
    });

    notificationWindow.loadFile(path.join(__dirname, '../notification.html'));
    notificationWindow.setAlwaysOnTop(true, 'screen-saver');

    notificationWindow.on('closed', () => {
        state.setNotificationWindow(null);
        const latestCallData = state.getLatestCallData();
        if (latestCallData) {
            const history = require('./history');
            history.addToHistory(latestCallData, 'skipped');
            state.setLatestCallData(null);
        }
    });

    state.setNotificationWindow(notificationWindow);
    return notificationWindow;
}

function showNotification(callData) {
    console.log('[CallWatcher] Показ уведомления для:', callData?.phone);

    let notificationWindow = state.getNotificationWindow();

    if (!notificationWindow || notificationWindow.isDestroyed()) {
        notificationWindow = createNotificationWindow();
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
    const notificationWindow = state.getNotificationWindow();
    if (notificationWindow && !notificationWindow.isDestroyed()) {
        notificationWindow.hide();
    }
}

function openLoginWindow(onSuccess) {
    console.log('[CallWatcher] Открытие окна входа...');

    let loginWindow = state.getLoginWindow();

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
            const auth = require('./auth');
            auth.saveAuthState(true);

            const mainWindow = state.getMainWindow();
            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('login-status', true);
            }
            if (loginWindow && !loginWindow.isDestroyed()) {
                loginWindow.close();
            }

            if (onSuccess) onSuccess();
        }
    });

    loginWindow.on('closed', () => {
        console.log('[CallWatcher] Окно входа закрыто');
        state.setLoginWindow(null);
    });

    state.setLoginWindow(loginWindow);
    return loginWindow;
}

module.exports = {
    createMainWindow,
    createNotificationWindow,
    showNotification,
    hideNotification,
    openLoginWindow
};
