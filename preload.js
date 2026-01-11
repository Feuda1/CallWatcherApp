const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {

    getCallData: () => ipcRenderer.invoke('get-call-data'),
    getCallHistory: () => ipcRenderer.invoke('get-call-history'),
    searchClients: (query) => ipcRenderer.invoke('search-clients', query),
    createTicket: (data) => ipcRenderer.invoke('create-ticket', data),
    getTopics: () => ipcRenderer.invoke('get-topics'),
    saveTopic: (topic) => ipcRenderer.invoke('save-topic', topic),
    getAssociation: (phone) => ipcRenderer.invoke('get-association', phone),


    getAllCalls: (forceRefresh) => ipcRenderer.invoke('get-all-calls', forceRefresh),
    getBulkStats: () => ipcRenderer.invoke('get-bulk-stats'),
    clearHistory: () => ipcRenderer.invoke('clear-history'),


    fillTicket: () => ipcRenderer.send('fill-ticket'),
    skipCall: (id) => ipcRenderer.send('skip-call', id),
    ticketCreated: (callId, ticketUrl) => ipcRenderer.send('ticket-created', callId, ticketUrl),
    openLogin: () => ipcRenderer.send('open-login'),
    logout: () => ipcRenderer.send('logout'),


    getAudio: (url) => ipcRenderer.invoke('get-audio', url),

    lockCall: (callId) => ipcRenderer.send('lock-call', callId),
    unlockCall: () => ipcRenderer.send('unlock-call'),
    updateCallDraft: (callId, draft) => ipcRenderer.send('update-call-draft', callId, draft),


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
    openTicketInBrowser: (callData, clientId) => ipcRenderer.send('open-ticket-browser', callData, clientId),

    getTicketReasons: () => ipcRenderer.invoke('get-ticket-reasons'),
    closeTicket: (data) => ipcRenderer.invoke('close-ticket', data),

    getApiKey: (service) => ipcRenderer.invoke('get-api-key', service),
    setApiKey: (service, key) => ipcRenderer.invoke('set-api-key', service, key),
    getSetting: (key) => ipcRenderer.invoke('get-setting', key),
    setSetting: (key, value) => ipcRenderer.invoke('set-setting', key, value),
    transcribeAudio: (audioBuffer, reasons) => ipcRenderer.invoke('transcribe-audio', audioBuffer, reasons),
    downloadAudio: (url, filename) => ipcRenderer.invoke('download-audio', url, filename),
    log: (message) => ipcRenderer.send('renderer-log', message)
});
