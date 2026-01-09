// Модуль управления темами заявок

const { app } = require('electron');
const path = require('path');
const fs = require('fs');
const state = require('./state');

function getTopicsFilePath() {
    return path.join(app.getPath('userData'), 'topics.json');
}

function loadTopics() {
    try {
        const p = getTopicsFilePath();
        if (fs.existsSync(p)) {
            const data = JSON.parse(fs.readFileSync(p, 'utf8'));
            state.setTopicsList(Array.isArray(data) ? data : []);
        }
    } catch (e) {
        console.error('[CallWatcher] Ошибка загрузки тем:', e);
    }
}

function saveTopics() {
    try {
        const topicsList = state.getTopicsList();
        fs.writeFileSync(getTopicsFilePath(), JSON.stringify(topicsList), 'utf8');
    } catch (e) {
        console.error('[CallWatcher] Ошибка сохранения тем:', e);
    }
}

function addTopic(topic) {
    if (!topic || !topic.trim()) return false;

    const cleanTopic = topic.trim();
    const topicsList = state.getTopicsList();

    if (!topicsList.includes(cleanTopic)) {
        topicsList.push(cleanTopic);
        saveTopics();
        return true;
    }
    return false;
}

function getTopics() {
    return state.getTopicsList();
}

module.exports = {
    getTopicsFilePath,
    loadTopics,
    saveTopics,
    addTopic,
    getTopics
};
