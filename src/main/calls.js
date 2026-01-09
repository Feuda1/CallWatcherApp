

const { session } = require('electron');
const state = require('./state');
const history = require('./history');
const associations = require('./associations');
const auth = require('./auth');


function parseCallData(html) {
    const allLinksRegex = /href="\/Tickets\/Create\?([^"]+)"/g;
    const allLinkMatches = [...html.matchAll(allLinksRegex)];

    const callBoundaries = allLinkMatches.filter(m => {
        const urlParams = m[1];
        if (!urlParams.includes('selectedPhoneNuber')) return false;
        const params = new URLSearchParams(urlParams);
        return params.has('selectedPhoneNuber') && !params.has('id');
    });

    if (callBoundaries.length === 0) {
        return null;
    }

    const firstCallMatch = callBoundaries[0];
    const nextCallMatch = callBoundaries[1];

    const startIndex = firstCallMatch.index;
    const endIndex = nextCallMatch ? nextCallMatch.index : html.length;
    const blockHtml = html.slice(startIndex, endIndex);

    const mainParams = new URLSearchParams(firstCallMatch[1]);
    const phone = mainParams.get('selectedPhoneNuber') || '';
    const linkedId = mainParams.get('linkedId') || '';
    const date = mainParams.get('selectedPhoneDate') || '';
    const duration = mainParams.get('selectedPhoneDuration') || '';

    const suggestions = [];
    const suggestionRegex = /dropdown-item[^>]*href="\/Tickets\/Create\?id=(\d+)[^"]*"[^>]*>([\s\S]*?)<\/a>/g;

    let clientMatch;
    while ((clientMatch = suggestionRegex.exec(blockHtml)) !== null) {
        const id = clientMatch[1];
        const rawName = clientMatch[2];
        const name = rawName.replace(/<[^>]+>/g, '').trim();

        if (!suggestions.find(s => s.id === id)) {
            suggestions.push({ id, name });
        }
    }

    let audioUrl = null;
    if (linkedId) {
        audioUrl = `https://clients.denvic.ru/PhoneCalls/GetCallRecord?id=${linkedId}`;
    }

    return {
        id: linkedId,
        phone,
        date,
        duration,
        audioUrl,
        suggestions,
        rawParams: firstCallMatch[1]
    };
}


function parseAllCallsFromPage(html) {
    const calls = [];
    const foundIds = new Set();

    const allLinksRegex = /href="\/Tickets\/Create\?([^"]+)"/g;
    const allLinkMatches = [...html.matchAll(allLinksRegex)];

    const callBoundaries = allLinkMatches.filter(m => {
        const urlParams = m[1];
        if (!urlParams.includes('selectedPhoneNuber')) return false;
        const params = new URLSearchParams(urlParams);
        return params.has('selectedPhoneNuber') && !params.has('id');
    });

    for (let i = 0; i < callBoundaries.length; i++) {
        const match = callBoundaries[i];
        const nextMatch = callBoundaries[i + 1];

        const startIndex = match.index;
        const endIndex = nextMatch ? nextMatch.index : html.length;
        const blockHtml = html.slice(startIndex, endIndex);

        const rowStart = html.lastIndexOf('<tr', startIndex);
        if (rowStart !== -1) {
            const rowHtml = html.slice(rowStart, endIndex);
            const tdMatches = [...rowHtml.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)];
            if (tdMatches.length >= 2) {
                const sourceTd = tdMatches[1][1];
                const sourceText = sourceTd.replace(/<[^>]+>/g, '').trim();

                if (/^\d{2,4}$/.test(sourceText)) {
                    continue;
                }
            }
        }

        const params = new URLSearchParams(match[1]);
        const phone = params.get('selectedPhoneNuber') || '';
        const linkedId = params.get('linkedId') || '';
        const date = params.get('selectedPhoneDate') || '';
        const duration = params.get('selectedPhoneDuration') || '';

        if (linkedId) foundIds.add(linkedId);

        const suggestions = [];
        const suggestionRegex = /dropdown-item[^>]*href="\/Tickets\/Create\?id=(\d+)[^"]*"[^>]*>([\s\S]*?)<\/a>/g;
        let clientMatch;
        while ((clientMatch = suggestionRegex.exec(blockHtml)) !== null) {
            const id = clientMatch[1];
            const rawName = clientMatch[2];
            const name = rawName.replace(/<[^>]+>/g, '').trim();
            if (!suggestions.find(s => s.id === id)) {
                suggestions.push({ id, name });
            }
        }

        const hasTicket = blockHtml.includes('/Tickets/Details/') || blockHtml.includes('btn-success');
        const audioUrl = linkedId ? `https://clients.denvic.ru/PhoneCalls/GetCallRecord?id=${linkedId}` : null;

        calls.push({
            id: linkedId,
            phone,
            date,
            duration,
            audioUrl,
            suggestions,
            hasTicket,
            rawParams: match[1]
        });
    }


    const audioLinkRegex = /GetCallRecord\?id=([^"&\s]+)/g;
    const audioMatches = [...html.matchAll(audioLinkRegex)];

    for (const audioMatch of audioMatches) {
        const linkedId = audioMatch[1];

        if (foundIds.has(linkedId)) continue;
        foundIds.add(linkedId);

        const pos = audioMatch.index;

        let rowStart = html.lastIndexOf('<tr', pos);
        if (rowStart === -1) rowStart = Math.max(0, pos - 2000);

        let rowEnd = html.indexOf('</tr>', pos);
        if (rowEnd === -1) rowEnd = Math.min(html.length, pos + 2000);
        else rowEnd += 5;

        const rowHtml = html.slice(rowStart, rowEnd);

        const tdMatches = [...rowHtml.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)];
        if (tdMatches.length >= 2) {
            const sourceTd = tdMatches[1][1];
            const sourceText = sourceTd.replace(/<[^>]+>/g, '').trim();

            if (/^\d{2,4}$/.test(sourceText)) {
                continue;
            }
        }

        let phone = '';
        const phonePatterns = [
            /&#x2B;7\s*\((\d{3})\)\s*(\d{3})-(\d{2})-(\d{2})/,
            /\+7\s*\((\d{3})\)\s*(\d{3})-(\d{2})-(\d{2})/,
            />7(\d{10})</,
            />\+?7\s*(\d{3})\s*(\d{3})\s*(\d{2})\s*(\d{2})</
        ];

        for (const pattern of phonePatterns) {
            const phoneMatch = rowHtml.match(pattern);
            if (phoneMatch) {
                if (phoneMatch.length === 5) {
                    phone = '7' + phoneMatch[1] + phoneMatch[2] + phoneMatch[3] + phoneMatch[4];
                } else if (phoneMatch.length === 2) {
                    phone = '7' + phoneMatch[1];
                }
                break;
            }
        }

        const dateMatch = rowHtml.match(/>(\d{2}\.\d{2}\.\d{4}\s+\d{2}:\d{2}:\d{2})</);
        const date = dateMatch ? dateMatch[1] : '';

        let duration = '';
        const durationPatterns = [
            />(\d+)\s*мин\s*(\d+)\s*сек/i,
            />(\d+)\s*сек/i,
            />(\d+)\s*мин/i,
        ];

        for (const pattern of durationPatterns) {
            const durMatch = rowHtml.match(pattern);
            if (durMatch) {
                if (durMatch.length === 3) {
                    duration = String(parseInt(durMatch[1]) * 60 + parseInt(durMatch[2]));
                } else if (pattern.source.includes('мин') && !pattern.source.includes('сек')) {
                    duration = String(parseInt(durMatch[1]) * 60);
                } else {
                    duration = durMatch[1];
                }
                break;
            }
        }

        const hasTicket = rowHtml.includes('/Tickets/Details/') || rowHtml.includes('btn-success');

        if (phone || date || linkedId) {
            const audioUrl = `https://clients.denvic.ru/PhoneCalls/GetCallRecord?id=${linkedId}`;

            calls.push({
                id: linkedId,
                phone,
                date,
                duration,
                audioUrl,
                suggestions: [],
                hasTicket,
                rawParams: '',
                isLegacy: true
            });
        }
    }

    return calls;
}


async function fetchAllCalls(forceRefresh = false, emitProgress = true) {
    const bulkCallsCache = state.getBulkCallsCache();

    if (!forceRefresh && bulkCallsCache.length > 0) {
        return bulkCallsCache;
    }

    const currentPromise = state.getCurrentFetchPromise();
    if (currentPromise) {
        return currentPromise;
    }

    const fetchPromise = (async () => {
        const ses = session.defaultSession;
        const allCalls = [];
        let page = 1;
        const MAX_PAGES = 20;
        let hasMore = true;

        try {
            const BATCH_SIZE = 5;

            for (let batchStart = 1; batchStart <= MAX_PAGES; batchStart += BATCH_SIZE) {
                const promises = [];
                for (let i = 0; i < BATCH_SIZE; i++) {
                    const pageNum = batchStart + i;
                    if (pageNum > MAX_PAGES) break;

                    const p = (async () => {
                        try {
                            const url = `https://clients.denvic.ru/PhoneCalls?onlyMy=true&page=${pageNum}`;
                            const response = await ses.fetch(url, { credentials: 'include' });

                            if (!response.ok || response.url.includes('Login')) {
                                return { page: pageNum, calls: [], error: true };
                            }

                            const html = await response.text();
                            const pageCalls = parseAllCallsFromPage(html);
                            return { page: pageNum, calls: pageCalls, error: false };
                        } catch (e) {
                            console.error(`Ошибка загрузки страницы ${pageNum}:`, e);
                            return { page: pageNum, calls: [], error: true };
                        }
                    })();
                    promises.push(p);
                }

                const results = await Promise.all(promises);


                results.sort((a, b) => a.page - b.page);

                let stopLoading = false;
                for (const res of results) {
                    if (res.error) {

                        if (res.page === 1) stopLoading = true;
                    }

                    if (res.calls.length === 0) {

                        stopLoading = true;
                    } else {
                        const newCalls = res.calls.filter(nc => !allCalls.find(ac => ac.id === nc.id));
                        allCalls.push(...newCalls);
                    }
                }

                const mainWindow = state.getMainWindow();
                if (mainWindow && !mainWindow.isDestroyed() && emitProgress) {
                    mainWindow.webContents.send('bulk-progress', allCalls.length);
                }

                if (stopLoading) break;
            }



            state.setBulkCallsCache(allCalls);
            state.setBulkLastFetched(Date.now());
            return allCalls;

        } catch (error) {
            console.error('[CallWatcher] Ошибка загрузки звонков:', error);
            return [];
        } finally {
            state.setCurrentFetchPromise(null);
        }
    })();

    state.setCurrentFetchPromise(fetchPromise);
    return fetchPromise;
}


async function restoreHistoryFromServer() {
    try {
        const serverCalls = await fetchAllCalls(true, false);
        const callHistory = state.getCallHistory();
        let addedCount = 0;

        for (const call of serverCalls) {
            const exists = callHistory.find(c => c.id === call.id);

            if (!exists) {
                let status = 'unprocessed';
                if (call.hasTicket) status = 'created';

                callHistory.push({
                    ...call,
                    status: status,
                    addedAt: new Date().toLocaleString('ru-RU')
                });
                addedCount++;
            }
        }

        if (addedCount > 0) {
            const uniqueMap = new Map();
            callHistory.forEach(c => uniqueMap.set(c.id, c));

            const uniqueHistory = Array.from(uniqueMap.values());

            uniqueHistory.sort((a, b) => {
                const parseDate = (d) => {
                    if (!d) return 0;
                    const [datePart, timePart] = d.split(' ');
                    const [day, month, year] = datePart.split('.');
                    return new Date(`${year}-${month}-${day}T${timePart}`).getTime();
                };
                return parseDate(b.date) - parseDate(a.date);
            });

            state.setCallHistory(uniqueHistory.length > 250 ? uniqueHistory.slice(0, 250) : uniqueHistory);

            console.log(`[CallWatcher] Восстановлено ${addedCount} звонков. Всего в истории: ${state.getCallHistory().length}`);
            history.saveHistory();

            const mainWindow = state.getMainWindow();
            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('call-history', state.getCallHistory());
            }
        } else {
        }

        state.getCallHistory().forEach(c => {
            if (c.id) shownCallIds.add(c.id);
        });

    } catch (e) {
        console.error('[CallWatcher] Ошибка восстановления истории:', e);
    }
}


async function checkCalls() {
    const windows = require('./windows');

    try {
        const ses = session.defaultSession;

        const authCheckUrl = 'https://clients.denvic.ru/Tickets';
        const authResponse = await ses.fetch(authCheckUrl, { credentials: 'include' });
        const authHtml = await authResponse.text();



        const isLoginPage = authHtml.includes('Password') ||
            authHtml.includes('Войти') ||
            authHtml.includes('Log in') ||
            authHtml.includes('Remember me');

        const mainWindow = state.getMainWindow();
        const isFirstPoll = state.getIsFirstPoll();

        if (isLoginPage) {

            if (state.getIsLoggedIn()) {
                auth.saveAuthState(false);
                if (mainWindow && !mainWindow.isDestroyed()) {
                    mainWindow.webContents.send('login-status', false);
                }
            } else {
                if (isFirstPoll && mainWindow && !mainWindow.isDestroyed()) {
                    mainWindow.webContents.send('login-status', false);
                }
            }

            const loginWindow = state.getLoginWindow();
            if (!loginWindow || loginWindow.isDestroyed()) {
                windows.openLoginWindow(() => restoreHistoryFromServer());
            }
            return;
        }

        const response = await ses.fetch(state.PHONE_CALLS_URL, {
            credentials: 'include'
        });

        if (!response.ok || response.url.includes('Login')) {

            if (state.getIsLoggedIn()) {
                state.setIsLoggedIn(false);
                if (mainWindow && !mainWindow.isDestroyed()) {
                    mainWindow.webContents.send('login-status', false);
                }
            } else {
                if (isFirstPoll && mainWindow && !mainWindow.isDestroyed()) {
                    mainWindow.webContents.send('login-status', false);
                }
            }
            return;
        }

        const html = await response.text();

        if (html.includes('id="Input_Password"') || html.includes('name="Input.Password"') || html.includes('Вход в систему')) {

            if (state.getIsLoggedIn()) {
                auth.saveAuthState(false);
                if (mainWindow && !mainWindow.isDestroyed()) {
                    mainWindow.webContents.send('login-status', false);
                }
            } else {
                if (isFirstPoll && mainWindow && !mainWindow.isDestroyed()) {
                    mainWindow.webContents.send('login-status', false);
                }
            }
            return;
        }


        if (!state.getIsLoggedIn() || state.getIsFirstPoll()) {
            auth.saveAuthState(true);
            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('login-status', true);
            }
        }

        const callData = parseCallData(html);
        const callHistory = state.getCallHistory();
        const shownCallIds = state.getShownCallIds();
        const isCallLocked = state.getIsCallLocked();
        const lockedCallId = state.getLockedCallId();

        if (callData) {
            if (callData.phone) {
                const assoc = associations.getAssociation(callData.phone);
                if (assoc) {
                    callData.associatedClient = assoc;
                }
            }



            if (!callHistory.find(c => c.id === callData.id)) {
                history.addToHistory(callData, 'unprocessed');
            }

            const existingHistory = callHistory.find(c => c.id === callData.id);
            const isSkipped = existingHistory && existingHistory.status === 'skipped';

            if (!isSkipped) {
                if (!isCallLocked || lockedCallId === callData.id) {
                    const historyItem = callHistory.find(c => c.id === callData.id);
                    if (historyItem && historyItem.draft) {
                        callData.draft = historyItem.draft;
                    }

                    state.setLatestCallData(callData);

                    if (mainWindow && !mainWindow.isDestroyed()) {
                        if (isCallLocked && lockedCallId === callData.id) {
                            mainWindow.webContents.send('call-data', callData);
                        }
                    }
                    associations.saveAssociations();
                }

                if (isFirstPoll) {
                    shownCallIds.add(callData.id);
                }

                if (!shownCallIds.has(callData.id) && !isSkipped && !isFirstPoll) {
                    state.setLatestCallData(callData);
                    windows.showNotification(callData);
                    shownCallIds.add(callData.id);
                }
            } else {
            }
        } else {
            if (!isCallLocked) {
                state.setLatestCallData(null);
                if (mainWindow && !mainWindow.isDestroyed()) {
                    mainWindow.webContents.send('call-data', null);
                }
            }
        }

        if (isFirstPoll) {
            state.setIsFirstPoll(false);
        }

        history.saveHistory();
    } catch (error) {
        console.error('[CallWatcher] Ошибка проверки звонков:', error);
    }
}


function startPolling() {
    if (state.getIsPolling()) return;
    state.setIsPolling(true);

    checkCalls();
    const interval = setInterval(checkCalls, state.POLL_INTERVAL_MS);
    state.setPollInterval(interval);
    console.log('[CallWatcher] Опрос начат');
}


function stopPolling() {
    const interval = state.getPollInterval();
    if (interval) {
        clearInterval(interval);
        state.setPollInterval(null);
    }
    state.setIsPolling(false);
    console.log('[CallWatcher] Опрос остановлен');
}

module.exports = {
    parseCallData,
    parseAllCallsFromPage,
    fetchAllCalls,
    restoreHistoryFromServer,
    checkCalls,
    startPolling,
    stopPolling
};
