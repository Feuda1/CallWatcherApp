

const { app, Tray, Menu } = require('electron');
const path = require('path');
const state = require('./state');

function createTray() {
    const tray = new Tray(path.join(__dirname, '../../assets', 'icon.ico'));

    const contextMenu = Menu.buildFromTemplate([
        {
            label: 'Открыть',
            click: () => {
                const mainWindow = state.getMainWindow();
                if (mainWindow) {
                    mainWindow.show();
                    mainWindow.focus();
                }
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
        const mainWindow = state.getMainWindow();
        if (mainWindow) {
            mainWindow.show();
            mainWindow.focus();
        }
    });

    state.setTray(tray);
    return tray;
}

module.exports = {
    createTray
};
