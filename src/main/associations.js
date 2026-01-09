const { app } = require('electron');
const path = require('path');
const fs = require('fs');
const state = require('./state');

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
            const associations = JSON.parse(data);
            state.setClientAssociations(associations);
            console.log('[CallWatcher] Загружено ассоциаций для', Object.keys(associations).length, 'телефонов');
        }
    } catch (e) {
        console.error('[CallWatcher] Ошибка загрузки ассоциаций:', e);
    }
}

function saveAssociations() {
    try {
        const filePath = getAssociationsFilePath();
        const associations = state.getClientAssociations();
        fs.writeFileSync(filePath, JSON.stringify(associations, null, 2), 'utf8');
    } catch (e) {
        console.error('[CallWatcher] Ошибка сохранения ассоциаций:', e);
    }
}

function setAssociation(phone, clientId, clientName) {
    const associations = state.getClientAssociations();
    associations[phone] = {
        clientId,
        clientName: clientName || '',
        timestamp: Date.now()
    };
    saveAssociations();
}

function getAssociation(phone) {
    const associations = state.getClientAssociations();
    return associations[phone] || null;
}

module.exports = {
    getAssociationsFilePath,
    loadAssociations,
    saveAssociations,
    setAssociation,
    getAssociation
};
