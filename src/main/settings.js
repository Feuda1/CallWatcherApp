const { app } = require('electron');
const path = require('path');
const fs = require('fs');

let SETTINGS_FILE_PATH = null;
let settings = {};

function getSettingsFilePath() {
    if (!SETTINGS_FILE_PATH) {
        SETTINGS_FILE_PATH = path.join(app.getPath('userData'), 'settings.json');
    }
    return SETTINGS_FILE_PATH;
}

function loadSettings() {
    try {
        const filePath = getSettingsFilePath();
        if (fs.existsSync(filePath)) {
            const data = fs.readFileSync(filePath, 'utf8');
            settings = JSON.parse(data);
            console.log('[CallWatcher] Настройки загружены');
        }
    } catch (e) {
        console.error('[CallWatcher] Ошибка загрузки настроек:', e);
        settings = {};
    }
}

function saveSettings() {
    try {
        const filePath = getSettingsFilePath();
        fs.writeFileSync(filePath, JSON.stringify(settings, null, 2), 'utf8');
    } catch (e) {
        console.error('[CallWatcher] Ошибка сохранения настроек:', e);
    }
}

function getApiKey(service) {
    const key = `${service}_api_key`;
    return settings[key] || '';
}

function setApiKey(service, apiKey) {
    const key = `${service}_api_key`;
    settings[key] = apiKey;
    saveSettings();
}

function getSetting(key, defaultValue = null) {
    return settings[key] !== undefined ? settings[key] : defaultValue;
}

function setSetting(key, value) {
    settings[key] = value;
    saveSettings();
}

module.exports = {
    loadSettings,
    saveSettings,
    getApiKey,
    setApiKey,
    getSetting,
    setSetting
};
