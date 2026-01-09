// Модуль управления авторизацией

const { app } = require('electron');
const path = require('path');
const fs = require('fs');
const state = require('./state');

function getAuthStatePath() {
    return path.join(app.getPath('userData'), 'auth_state.json');
}

function loadAuthState() {
    try {
        const p = getAuthStatePath();
        if (fs.existsSync(p)) {
            const data = JSON.parse(fs.readFileSync(p, 'utf8'));
            state.setIsLoggedIn(!!data.isLoggedIn);
            console.log('[CallWatcher] Загружен статус авторизации:', state.getIsLoggedIn());
        }
    } catch (e) {
        console.error('Ошибка загрузки статуса:', e);
    }
}

function saveAuthState(status) {
    try {
        fs.writeFileSync(getAuthStatePath(), JSON.stringify({ isLoggedIn: status }));
        state.setIsLoggedIn(status);
    } catch (e) {
        console.error('Ошибка сохранения статуса:', e);
    }
}

module.exports = {
    getAuthStatePath,
    loadAuthState,
    saveAuthState
};
