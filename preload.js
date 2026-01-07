const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {

    getCallData: () => ipcRenderer.invoke('get-call-data'),
    getCallHistory: () => ipcRenderer.invoke('get-call-history'),
    searchClients: (query) => ipcRenderer.invoke('search-clients', query),
    createTicket: (data) => ipcRenderer.invoke('create-ticket', data),
    getTopics: () => ipcRenderer.invoke('get-topics'),
    saveTopic: (topic) => ipcRenderer.invoke('save-topic', topic),


    getAllCalls: (forceRefresh) => ipcRenderer.invoke('get-all-calls', forceRefresh),
    getBulkStats: () => ipcRenderer.invoke('get-bulk-stats'),
    clearHistory: () => ipcRenderer.invoke('clear-history'),


    fillTicket: () => ipcRenderer.send('fill-ticket'),
    skipCall: (id) => ipcRenderer.send('skip-call', id),
    ticketCreated: (callId) => ipcRenderer.send('ticket-created', callId),
    openLogin: () => ipcRenderer.send('open-login'),
    logout: () => ipcRenderer.send('logout'),


    getAudio: (url) => ipcRenderer.invoke('get-audio', url),

    lockCall: (callId) => ipcRenderer.send('lock-call', callId),
    unlockCall: () => ipcRenderer.send('unlock-call'),
    updateCallDraft: (callId, draft) => ipcRenderer.send('update-call-draft', callId, draft),
    testNotification: () => ipcRenderer.send('test-notification'),


    onCallData: (callback) => ipcRenderer.on('call-data', (event, data) => callback(data)),
    onCallHistory: (callback) => ipcRenderer.on('call-history', (event, data) => callback(data)),
    onLoginStatus: (callback) => ipcRenderer.on('login-status', (event, status) => callback(status)),

    getAppVersion: () => ipcRenderer.invoke('get-app-version'),
    onUpdateAvailable: (callback) => ipcRenderer.on('update-available', (event, info) => callback(info)),
    onUpdateDownloaded: (callback) => ipcRenderer.on('update-downloaded', (event, info) => callback(info)),
    onUpdateError: (callback) => ipcRenderer.on('update-error', (event, err) => callback(err)),
    onBulkProgress: (callback) => ipcRenderer.on('bulk-progress', (event, count) => callback(count)),
    restartApp: () => ipcRenderer.send('restart_app'),

    minimizeWindow: () => ipcRenderer.send('window-minimize'),
    maximizeWindow: () => ipcRenderer.send('window-maximize'),
    closeWindow: () => ipcRenderer.send('window-close'),
    openTicketInBrowser: (callData, clientId) => ipcRenderer.send('open-ticket-browser', callData, clientId)
});
