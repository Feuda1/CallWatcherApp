
document.addEventListener('DOMContentLoaded', () => {
    const emptyState = document.getElementById('empty-state');
    const callPanel = document.getElementById('call-panel');
    const historyList = document.getElementById('history-list');
    const historyEmpty = document.getElementById('history-empty');

    const callPhone = document.getElementById('call-phone');
    const callDate = document.getElementById('call-date');
    const callDuration = document.getElementById('call-duration');
    const callStatusBadge = document.getElementById('call-status-badge');

    const ticketSubject = document.getElementById('ticket-subject');
    const ticketDesc = document.getElementById('ticket-desc');
    const btnCreate = document.getElementById('btn-create');
    const btnSkip = document.getElementById('btn-skip');
    const btnLogin = document.getElementById('btn-login');
    const btnLoginHeader = document.getElementById('btn-login-header');
    const btnLogoutHeader = document.getElementById('btn-logout-header');
    const statusIndicator = document.getElementById('status-indicator');
    const appVersionEl = document.getElementById('app-version');

    const modeTabs = document.querySelectorAll('.mode-tab');

    let currentCallData = null;
    let callHistory = [];
    let currentMode = 'incoming';
    let isCallLocked = false;
    let draftTimeout = null;
    let currentHistoryFilter = 'all';
    let historySearchQuery = '';

    window.audioModule?.init();
    window.filtersModule?.init(onFiltersChanged);
    window.datePickerModule?.init(window.filtersModule);
    window.bulkModeModule?.init(showCallData, window.filtersModule);
    window.clientsModule?.init(onClientSelected);
    window.ticketUIModule?.init(() => window.clientsModule?.getSelectedId(), onValidationChange);
    window.topicsUIModule?.init();

    function onFiltersChanged(filteredCalls) {
        window.bulkModeModule?.setCalls(filteredCalls);
        renderFilteredHistory();
    }

    function onClientSelected(clientId, clientObject) {
        window.ticketUIModule?.validate();
        saveDraft();
    }

    function onValidationChange(isValid) {
    }

    const btnMinimize = document.getElementById('btn-minimize');
    const btnMaximize = document.getElementById('btn-maximize');
    const btnClose = document.getElementById('btn-close');

    btnMinimize?.addEventListener('click', () => window.api.minimizeWindow());
    btnMaximize?.addEventListener('click', () => window.api.maximizeWindow());
    btnClose?.addEventListener('click', () => window.api.closeWindow());

    const btnOpenBrowser = document.getElementById('btn-open-browser');
    btnOpenBrowser?.addEventListener('click', () => {
        if (currentCallData) {
            window.api.openTicketInBrowser(currentCallData, window.clientsModule?.getSelectedId());
        }
    });

    const settingsModal = document.getElementById('settings-modal');
    const btnSettings = document.getElementById('btn-settings');
    const btnCloseSettings = document.getElementById('close-settings');
    const btnSaveSettings = document.getElementById('save-settings');
    const openaiKeyInput = document.getElementById('openai-api-key');
    const deepseekKeyInput = document.getElementById('deepseek-api-key');
    const proxyUrlInput = document.getElementById('proxy-url');

    const checkSubject = document.getElementById('ai-fill-subject');
    const checkDescription = document.getElementById('ai-fill-description');
    const checkReason = document.getElementById('ai-fill-reason');
    const checkComment = document.getElementById('ai-fill-comment');

    const modalOverlay = settingsModal?.querySelector('.modal-overlay');

    async function loadSettingsToModal() {
        const openaiApiKey = await window.api.getSetting('openai_api_key');
        const deepseekApiKey = await window.api.getSetting('deepseek_api_key');
        const proxyUrl = await window.api.getSetting('proxy_url');

        if (openaiKeyInput) openaiKeyInput.value = openaiApiKey || '';
        if (deepseekKeyInput) deepseekKeyInput.value = deepseekApiKey || '';

        document.getElementById('proxy-host').value = '';
        document.getElementById('proxy-port').value = '';
        document.getElementById('proxy-user').value = '';
        document.getElementById('proxy-password').value = '';

        if (proxyUrl) {
            try {
                let cleanUrl = proxyUrl.replace(/^https?:\/\//, '');

                let authPart = '';
                let hostPart = cleanUrl;

                if (cleanUrl.includes('@')) {
                    const parts = cleanUrl.split('@');
                    authPart = parts[0];
                    hostPart = parts[1];
                }

                if (hostPart) {
                    const [h, p] = hostPart.split(':');
                    document.getElementById('proxy-host').value = h || '';
                    document.getElementById('proxy-port').value = p || '';
                }

                if (authPart) {
                    const [u, pass] = authPart.split(':');
                    document.getElementById('proxy-user').value = u || '';
                    document.getElementById('proxy-password').value = pass || '';
                }

            } catch (e) {
                console.error("Error parsing proxy URL for UI:", e);
                document.getElementById('proxy-host').value = proxyUrl;
            }
        }
        const fillSubject = await window.api.getSetting('ai_fill_subject');
        const fillDescription = await window.api.getSetting('ai_fill_description');
        const fillReason = await window.api.getSetting('ai_fill_reason');
        const fillComment = await window.api.getSetting('ai_fill_comment');

        if (checkSubject) checkSubject.checked = fillSubject === true;
        if (checkDescription) checkDescription.checked = fillDescription === true;
        if (checkReason) checkReason.checked = fillReason === true;
        if (checkComment) checkComment.checked = fillComment === true;

        settingsModal?.classList.remove('hidden');
    }

    btnSettings?.addEventListener('click', async () => {
        await loadSettingsToModal();
    });

    btnCloseSettings?.addEventListener('click', () => settingsModal?.classList.add('hidden'));
    modalOverlay?.addEventListener('click', () => settingsModal?.classList.add('hidden'));

    btnSaveSettings?.addEventListener('click', async () => {
        const openaiKey = openaiKeyInput?.value?.trim() || '';
        const deepseekKey = deepseekKeyInput?.value?.trim() || '';
        const proxyHost = document.getElementById('proxy-host').value.trim();
        const proxyPort = document.getElementById('proxy-port').value.trim();
        const proxyUser = document.getElementById('proxy-user').value.trim();
        const proxyPassword = document.getElementById('proxy-password').value.trim();

        let proxyUrl = '';
        if (proxyHost && proxyPort) {
            if (proxyUser && proxyPassword) {
                proxyUrl = `${proxyUser}:${proxyPassword}@${proxyHost}:${proxyPort}`;
            } else {
                proxyUrl = `${proxyHost}:${proxyPort}`;
            }
        }

        await window.api.setApiKey('openai', openaiKey);
        await window.api.setApiKey('deepseek', deepseekKey);
        await window.api.setSetting('proxy_url', proxyUrl);

        await window.api.setSetting('ai_fill_subject', checkSubject?.checked || false);
        await window.api.setSetting('ai_fill_description', checkDescription?.checked || false);
        await window.api.setSetting('ai_fill_reason', checkReason?.checked || false);
        await window.api.setSetting('ai_fill_comment', checkComment?.checked || false);

        settingsModal?.classList.add('hidden');
        updateAiButtonVisibility();
    });

    const btnAiTranscribe = document.getElementById('btn-ai-transcribe');

    async function updateAiButtonVisibility() {
        const key = await window.api.getApiKey('openai');

        const fillSubject = await window.api.getSetting('ai_fill_subject');
        const fillDescription = await window.api.getSetting('ai_fill_description');
        const fillReason = await window.api.getSetting('ai_fill_reason');
        const fillComment = await window.api.getSetting('ai_fill_comment');

        const anyFeatureEnabled = (fillSubject === true) || (fillDescription === true) || (fillReason === true) || (fillComment === true);

        if (btnAiTranscribe) {
            btnAiTranscribe.style.display = (key && anyFeatureEnabled) ? 'inline-flex' : 'none';
        }
    }
    updateAiButtonVisibility();

    btnAiTranscribe?.addEventListener('click', async () => {
        if (!currentCallData?.audioUrl) {
            alert('Нет аудио для транскрипции');
            return;
        }

        btnAiTranscribe.disabled = true;
        btnAiTranscribe.classList.add('loading');
        btnAiTranscribe.textContent = '⏳ ...';

        try {
            const audioData = await window.api.getAudio(currentCallData.audioUrl);
            if (!audioData || !audioData.buffer) {
                throw new Error('Не удалось загрузить аудио');
            }

            let reasons = [];
            if (window.ticketUIModule) {
                if (typeof window.ticketUIModule.ensureReasonsLoaded === 'function') {
                    await window.ticketUIModule.ensureReasonsLoaded();
                }
                if (typeof window.ticketUIModule.getAvailableReasons === 'function') {
                    const allReasons = window.ticketUIModule.getAvailableReasons();
                    if (Array.isArray(allReasons)) {
                        reasons = allReasons.map(r => ({ id: r.value, name: r.text }));
                    }
                } else {
                    console.warn('[App] ticketUIModule.getAvailableReasons is not a function');
                }
            } else {
                console.error('[App] ticketUIModule not found');
            }

            const result = await window.api.transcribeAudio(audioData.buffer, reasons);

            if (result.success) {
                const fillSubject = await window.api.getSetting('ai_fill_subject');
                const fillDescription = await window.api.getSetting('ai_fill_description');
                const fillReason = await window.api.getSetting('ai_fill_reason');
                const fillComment = await window.api.getSetting('ai_fill_comment');

                if (fillSubject !== false && ticketSubject && result.subject) {
                    ticketSubject.value = result.subject;
                }
                if (fillDescription !== false && ticketDesc && result.description) {
                    ticketDesc.value = result.description;
                }
                if (fillReason !== false && window.ticketUIModule) {
                    if (result.reasonIds && Array.isArray(result.reasonIds)) {
                        window.ticketUIModule.selectReasons(result.reasonIds);
                    } else if (result.reasonId) {
                        window.ticketUIModule.selectReasons([String(result.reasonId)]);
                    }
                }

                const closeComment = document.getElementById('close-comment');
                if (fillComment !== false && closeComment && result.closeComment) {
                    closeComment.value = result.closeComment;
                }
                window.ticketUIModule?.validate();
            } else {
                alert('Ошибка: ' + (result.error || 'Неизвестная ошибка'));
            }

        } catch (e) {
            console.error('AI error:', e);
            alert('Ошибка AI: ' + e.message);
        } finally {
            btnAiTranscribe.disabled = false;
            btnAiTranscribe.classList.remove('loading');
            btnAiTranscribe.textContent = '✨ AI';
        }
    });

    modeTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const mode = tab.dataset.mode;
            if (mode === currentMode) return;

            currentMode = mode;
            modeTabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');

            if (mode === 'bulk') {
                window.bulkModeModule?.enter();
            } else {
                window.bulkModeModule?.exit();
            }
        });
    });

    function openLogin() { window.api.openLogin(); }
    btnLogin?.addEventListener('click', openLogin);
    btnLoginHeader?.addEventListener('click', openLogin);
    btnLogoutHeader?.addEventListener('click', () => {
        if (confirm('Выйти из системы?')) {
            window.api.logout();
        }
    });

    const statusText = document.querySelector('.status-text');
    window.api.onLoginStatus((isLoggedIn) => {
        if (isLoggedIn) {
            statusIndicator?.classList.remove('offline');
            statusIndicator?.classList.add('online');
            if (statusIndicator) statusIndicator.title = 'Авторизован';
            if (statusText) statusText.textContent = 'Подключено';
            if (btnLoginHeader) btnLoginHeader.style.display = 'none';
            if (btnLogoutHeader) btnLogoutHeader.style.display = 'inline-flex';
            if (btnLogin) btnLogin.style.display = 'none';
        } else {
            statusIndicator?.classList.remove('online');
            statusIndicator?.classList.add('offline');
            if (statusIndicator) statusIndicator.title = 'Не авторизован';
            if (statusText) statusText.textContent = 'Не подключено';
            if (btnLoginHeader) btnLoginHeader.style.display = 'none';
            if (btnLogoutHeader) btnLogoutHeader.style.display = 'none';
            if (btnLogin) {
                btnLogin.style.display = 'inline-flex';
                btnLogin.innerHTML = 'Войти в систему';
            }
        }
    });

    async function showCallData(data) {
        const isNewCall = !currentCallData || (data && currentCallData.id !== data.id);
        currentCallData = data;

        if (data) {
            emptyState?.classList.add('hidden');
            callPanel?.classList.remove('hidden');

            if (data.status === 'skipped' || data.status === 'created') {
                btnSkip.disabled = true;
            } else {
                const found = callHistory.find(c => c.id === data.id);
                btnSkip.disabled = found && (found.status === 'skipped' || found.status === 'created');
                if (found) {
                    data.status = found.status;
                    if (found.ticketUrl) data.ticketUrl = found.ticketUrl;
                    if (found.associatedClient) data.associatedClient = found.associatedClient;
                }
            }

            if (callPhone) callPhone.textContent = data.phone || 'Неизвестный';
            if (callDate) callDate.textContent = data.date || '';
            if (callDuration) callDuration.textContent = (data.duration || '?') + ' сек';

            if (callStatusBadge) {
                callStatusBadge.className = 'call-status-badge';
                const status = data.status || 'unprocessed';
                if (status === 'created') {
                    callStatusBadge.textContent = 'Создан';
                    callStatusBadge.classList.add('status-created');
                } else if (status === 'skipped') {
                    callStatusBadge.textContent = 'Пропущен';
                    callStatusBadge.classList.add('status-skipped');
                } else {
                    callStatusBadge.textContent = 'Ожидает';
                    callStatusBadge.classList.add('status-waiting');
                }
            }

            let audioUrl = data.audioUrl;
            if (!audioUrl && data.id) {
                audioUrl = `https://clients.denvic.ru/PhoneCalls/GetCallRecord?id=${data.id}`;
            }

            const safeDate = (data.date || '').replace(/:/g, '-').replace(/\//g, '-');
            const filename = `Call_${data.phone || 'Unknown'}_${safeDate}.mp3`;
            window.audioModule?.loadAudio(audioUrl, filename);

            let finalSuggestions = [];
            if (data.suggestions && data.suggestions.length > 0) {
                finalSuggestions = data.suggestions.map(s => ({
                    Id: s.id,
                    _originalName: s.name,
                    Organization: '',
                    FirsName: s.name,
                    LastName: '',
                    Mail: ''
                }));
            }

            const rememberedSection = document.getElementById('remembered-section');
            const rememberedList = document.getElementById('remembered-list');

            let assocData = data.associatedClient;
            if (!assocData && data.phone) {
                assocData = await window.api.getAssociation(data.phone);
                if (assocData) data.associatedClient = assocData;
            }

            if (assocData && rememberedSection && rememberedList) {
                const assoc = data.associatedClient;
                rememberedSection.classList.remove('hidden');
                rememberedList.innerHTML = '';

                const li = document.createElement('li');
                li.className = 'client-item';
                li.dataset.id = assoc.clientId;
                li.innerHTML = `
                    <div class="client-name">${assoc.clientName || 'Сохранённый клиент'}</div>
                    <div class="client-meta">Выбирали для этого номера</div>
                `;
                li.addEventListener('click', () => {
                    window.clientsModule?.setSelected(assoc.clientId, { id: assoc.clientId, Id: assoc.clientId, _displayName: assoc.clientName });
                    document.querySelectorAll('.client-item').forEach(el => el.classList.remove('selected'));
                    li.classList.add('selected');
                    window.ticketUIModule?.validate();
                    saveDraft();
                });
                rememberedList.appendChild(li);

                const existingIdx = finalSuggestions.findIndex(s => (s.Id || s.id) === assoc.clientId);
                if (existingIdx >= 0) finalSuggestions.splice(existingIdx, 1);
            } else if (rememberedSection) {
                rememberedSection.classList.add('hidden');
            }

            if (isNewCall) {
                highlightHistoryItem(data.id);

                if (data.draft && data.draft.selectedClientId && data.draft.selectedClientObject) {
                    const draftId = data.draft.selectedClientId;
                    const draftObj = data.draft.selectedClientObject;
                    if (!finalSuggestions.find(s => (s.Id || s.id) === draftId)) {
                        finalSuggestions.unshift(draftObj);
                    }
                }

                window.clientsModule?.renderSuggestions(finalSuggestions);

                if (data.draft) {
                    if (ticketSubject) ticketSubject.value = data.draft.subject || '';
                    if (ticketDesc) ticketDesc.value = data.draft.description || '';
                    if (window.clientsModule?.clientSearch) window.clientsModule.clientSearch.value = data.draft.searchQuery || '';

                    if (data.draft.selectedClientId && data.draft.selectedClientObject) {
                        window.clientsModule?.setSelected(data.draft.selectedClientId, data.draft.selectedClientObject);
                        setTimeout(() => window.clientsModule?.highlightSelected(data.draft.selectedClientId), 100);
                    }

                    window.ticketUIModule?.validate();
                    window.ticketUIModule?.setCloseData({
                        closeAfterCreate: data.draft.closeAfterCreate,
                        reasonIds: data.draft.multiCloseReasons || (data.draft.closeReason ? [data.draft.closeReason] : []),
                        comment: data.draft.closeComment,
                        timeSpent: data.draft.closeTime
                    });
                } else {
                    if (ticketSubject) ticketSubject.value = '';
                    if (ticketDesc) ticketDesc.value = '';
                    window.clientsModule?.clear();
                    window.ticketUIModule?.reset();
                    window.ticketUIModule?.validate();
                }
            } else {
                highlightHistoryItem(data.id);
                const selectedId = window.clientsModule?.getSelectedId();
                if (selectedId) window.clientsModule?.highlightSelected(selectedId);
            }
        } else {
            emptyState?.classList.remove('hidden');
            callPanel?.classList.add('hidden');
            currentCallData = null;
            highlightHistoryItem(null);
        }
    }

    function highlightHistoryItem(id) {
        if (!historyList) return;
        historyList.querySelectorAll('.history-item').forEach(el => {
            el.classList.toggle('selected', el.dataset.id == id);
        });
    }

    function findNextUnprocessedCall(currentId) {
        const currentIndex = callHistory.findIndex(c => c.id === currentId);
        for (let i = currentIndex + 1; i < callHistory.length; i++) {
            if (callHistory[i].status === 'unprocessed') return callHistory[i];
        }
        for (let i = 0; i < currentIndex; i++) {
            if (callHistory[i].status === 'unprocessed') return callHistory[i];
        }
        return null;
    }

    function updateStatsFromHistory() {
        const created = callHistory.filter(c => c.status === 'created').length;
        const skipped = callHistory.filter(c => c.status === 'skipped').length;
        const unprocessed = callHistory.filter(c => c.status === 'unprocessed').length;

        const statTotal = document.getElementById('stat-total');
        const statFilled = document.getElementById('stat-filled');
        const statUnfilled = document.getElementById('stat-unfilled');
        const statSkipped = document.getElementById('stat-skipped');

        if (statTotal) statTotal.textContent = callHistory.length;
        if (statFilled) statFilled.textContent = created;
        if (statUnfilled) statUnfilled.textContent = unprocessed;
        if (statSkipped) statSkipped.textContent = skipped;
    }

    btnCreate?.addEventListener('click', async () => {
        const selectedClientId = window.clientsModule?.getSelectedId();
        const selectedClientObject = window.clientsModule?.getSelectedObject();

        if (!currentCallData || !selectedClientId) return;
        btnCreate.disabled = true;

        const closeData = window.ticketUIModule?.getCloseData() || {};
        const shouldClose = closeData.closeAfterCreate;
        btnCreate.textContent = shouldClose ? 'Создание и закрытие...' : 'Создание...';

        try {
            const getClientName = (obj) => {
                if (!obj) return '';
                if (obj._displayName) return obj._displayName;
                const firstName = obj.FirsName || obj.firstName || '';
                const lastName = obj.LastName || obj.lastName || '';
                const fullName = [firstName, lastName].filter(Boolean).join(' ');
                return fullName || obj.Organization || obj.organization || obj._originalName || obj.name || '';
            };

            const ticketData = {
                callData: currentCallData,
                clientId: selectedClientId,
                clientName: getClientName(selectedClientObject),
                subject: ticketSubject?.value.trim() || 'Входящий звонок',
                description: ticketDesc?.value.trim() || ''
            };
            const result = await window.api.createTicket(ticketData);

            if (result.IsValid && result.Redirect) {
                const subjectValue = ticketSubject?.value.trim();
                if (subjectValue) {
                    window.topicsUIModule?.save(subjectValue);
                }

                if (shouldClose && result.Address) {
                    btnCreate.textContent = 'Закрытие заявки...';
                    const ticketIdMatch = result.Address.match(/\/Tickets\/Details\/(\d+)/);
                    if (ticketIdMatch) {
                        const closeResult = await window.api.closeTicket({
                            ticketId: ticketIdMatch[1],
                            reasonIds: closeData.reasonIds,
                            comment: closeData.comment || 'Вопрос решён',
                            timeSpent: closeData.timeSpent || 5
                        });

                        btnCreate.textContent = closeResult.success ? '✓ Создано и закрыто!' : '✓ Создано (ошибка закрытия)';
                    } else {
                        btnCreate.textContent = '✓ Создано!';
                    }
                } else {
                    btnCreate.textContent = '✓ Создано!';
                }

                btnCreate.classList.add('btn-success');

                const completedCallId = currentCallData?.id;
                const ticketUrl = result.Address || result.Redirect || result.TicketUrl;
                const historyItem = callHistory.find(c => c.id === completedCallId);
                if (historyItem) {
                    historyItem.status = 'created';
                    if (ticketUrl) historyItem.ticketUrl = ticketUrl;
                }
                if (currentCallData && ticketUrl) currentCallData.ticketUrl = ticketUrl;

                setTimeout(() => {
                    window.api.ticketCreated(completedCallId, ticketUrl);
                    btnCreate.textContent = 'Создать заявку';
                    btnCreate.classList.remove('btn-success');
                    btnCreate.disabled = true;
                    window.ticketUIModule?.validate();

                    updateStatsFromHistory();
                    renderFilteredHistory();

                    if (currentMode === 'bulk') {
                        window.bulkModeModule?.removeCall(completedCallId);
                    } else {
                        const nextCall = findNextUnprocessedCall(completedCallId);
                        if (nextCall) {
                            showCallData(nextCall);
                            window.api.lockCall(nextCall.id);
                        } else {
                            showCallData(null);
                        }
                    }
                }, 1500);
            } else {
                throw new Error(result.Error || 'Ошибка создания заявки');
            }
        } catch (e) {
            console.error(e);
            alert('Ошибка: ' + e.message);
            btnCreate.textContent = 'Создать заявку';
            btnCreate.disabled = false;
        }
    });

    btnSkip?.addEventListener('click', () => {
        if (currentCallData && (currentCallData.status === 'skipped' || currentCallData.status === 'created')) return;

        const skippedId = currentCallData?.id;

        if (currentCallData) {
            window.api.skipCall(currentCallData.id);
            const historyItem = callHistory.find(c => c.id === skippedId);
            if (historyItem) historyItem.status = 'skipped';
        }

        window.audioModule?.hide();
        updateStatsFromHistory();
        renderFilteredHistory();

        const nextCall = findNextUnprocessedCall(skippedId);
        if (nextCall) {
            showCallData(nextCall);
            window.api.lockCall(nextCall.id);
        } else {
            showCallData(null);
        }
    });

    const historySearchInput = document.getElementById('history-search');
    const filterTabs = document.querySelectorAll('.filter-tab');

    filterTabs.forEach(tab => {
        tab.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            filterTabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            currentHistoryFilter = tab.dataset.filter;
            renderFilteredHistory();

            if (currentMode === 'bulk') {
                window.filtersModule?.applyFilters();
            }
        });
    });

    historySearchInput?.addEventListener('input', () => {
        historySearchQuery = historySearchInput.value.toLowerCase().trim();
        renderFilteredHistory();
    });

    function parseHistoryDate(dateStr) {
        if (!dateStr) return null;
        const match = dateStr.match(/(\d{2})\.(\d{2})\.(\d{4})/);
        if (!match) return null;
        return { day: match[1], month: match[2], year: match[3], formatted: `${match[1]}.${match[2]}.${match[3]}` };
    }

    function getDateLabel(dateStr) {
        const parsed = parseHistoryDate(dateStr);
        if (!parsed) return 'Без даты';

        const today = new Date();
        const todayStr = `${String(today.getDate()).padStart(2, '0')}.${String(today.getMonth() + 1).padStart(2, '0')}.${today.getFullYear()}`;
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayStr = `${String(yesterday.getDate()).padStart(2, '0')}.${String(yesterday.getMonth() + 1).padStart(2, '0')}.${yesterday.getFullYear()}`;

        if (parsed.formatted === todayStr) return 'Сегодня';
        if (parsed.formatted === yesterdayStr) return 'Вчера';
        return parsed.formatted;
    }

    function formatDuration(seconds) {
        const sec = parseInt(seconds) || 0;
        if (sec < 60) return `${sec}с`;
        const min = Math.floor(sec / 60);
        const remSec = sec % 60;
        return remSec > 0 ? `${min}м ${remSec}с` : `${min}м`;
    }

    function extractTime(dateStr) {
        if (!dateStr) return '';
        const match = dateStr.match(/(\d{2}:\d{2})/);
        return match ? match[1] : '';
    }

    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    function renderFilteredHistory() {
        if (!historyList) return;

        const minDuration = window.filtersModule?.getMinDuration() || 0;
        const selectedDates = window.filtersModule?.selectedDates || new Set();

        let filtered = callHistory.filter(c => {
            const dur = parseInt(c.duration) || 0;
            if (dur < minDuration) return false;
            if (selectedDates.size > 0) {
                const parsed = parseHistoryDate(c.date);
                if (!parsed || !selectedDates.has(parsed.formatted)) return false;
            }
            if (currentHistoryFilter !== 'all' && c.status !== currentHistoryFilter) return false;
            if (historySearchQuery && !(c.phone || '').toLowerCase().includes(historySearchQuery)) return false;
            return true;
        });

        if (filtered.length === 0) {
            historyList.innerHTML = '';
            historyEmpty?.classList.remove('hidden');
            if (historyEmpty) historyEmpty.textContent = historySearchQuery ? 'Ничего не найдено' : 'Нет звонков';
            return;
        }

        historyEmpty?.classList.add('hidden');
        historyList.innerHTML = '';

        const groups = new Map();
        filtered.forEach(call => {
            const label = getDateLabel(call.date);
            if (!groups.has(label)) groups.set(label, []);
            groups.get(label).push(call);
        });

        groups.forEach((calls, dateLabel) => {
            const separator = document.createElement('li');
            separator.className = 'history-date-separator';
            separator.textContent = dateLabel;
            historyList.appendChild(separator);

            calls.forEach(call => {
                const li = createHistoryItem(call);
                historyList.appendChild(li);
            });
        });
    }

    function createHistoryItem(call) {
        const li = document.createElement('li');
        li.className = 'history-item';
        li.dataset.id = call.id;
        li.dataset.status = call.status || 'unprocessed';

        let statusClass = 'status-unprocessed';
        let statusText = 'ОЖИДАЕТ';
        if (call.status === 'created') { statusClass = 'status-created'; statusText = 'СОЗДАН'; }
        else if (call.status === 'skipped') { statusClass = 'status-skipped'; statusText = 'ПРОПУЩЕН'; }

        const phone = escapeHtml(call.phone || 'Неизвестный');
        const duration = formatDuration(call.duration);
        const time = extractTime(call.date);

        li.innerHTML = `
            <div class="history-top-row">
                <span class="history-phone">${phone}</span>
                <span class="history-duration"><span class="history-duration-icon">⏱</span>${duration}</span>
            </div>
            <div class="history-bottom-row">
                <span class="history-time">${time}</span>
                <span class="history-status-badge ${statusClass}">${statusText}</span>
            </div>
        `;

        li.addEventListener('click', () => {
            const freshCall = callHistory.find(c => c.id === call.id);
            if (freshCall) {
                showCallData(freshCall);
                window.api.lockCall(freshCall.id);
            }
        });

        if (currentCallData && call.id === currentCallData.id) li.classList.add('selected');

        return li;
    }

    async function loadHistory() {
        if (!historyList) return;

        const localHistory = await window.api.getCallHistory() || [];
        const localDataMap = new Map();
        localHistory.forEach(c => localDataMap.set(c.id, { status: c.status, ticketUrl: c.ticketUrl }));

        if (callHistory.length === 0 && localHistory.length > 0) {
            callHistory = [...localHistory];
            renderFilteredHistory();
            updateStatsFromHistory();
        }

        const allCalls = await window.api.getAllCalls() || [];

        callHistory = allCalls.map(call => {
            const local = localDataMap.get(call.id);
            return {
                ...call,
                status: local?.status || (call.hasTicket ? 'created' : 'unprocessed'),
                ticketUrl: local?.ticketUrl
            };
        });

        localHistory.forEach(local => {
            if (!callHistory.find(c => c.id === local.id)) callHistory.push(local);
        });

        callHistory.sort((a, b) => {
            const parseDate = (d) => {
                if (!d) return 0;
                const match = d.match(/(\d{2})\.(\d{2})\.(\d{4})\s+(\d{2}):(\d{2})/);
                if (!match) return 0;
                return new Date(`${match[3]}-${match[2]}-${match[1]}T${match[4]}:${match[5]}`).getTime();
            };
            return parseDate(b.date) - parseDate(a.date);
        });

        window.filtersModule?.setAllCalls(callHistory.filter(c => !c.hasTicket));

        renderFilteredHistory();
        updateStatsFromHistory();
    }

    function saveDraft() {
        if (!currentCallData) return;
        const draft = {
            subject: ticketSubject?.value || '',
            description: ticketDesc?.value || '',
            selectedClientId: window.clientsModule?.getSelectedId(),
            selectedClientObject: window.clientsModule?.getSelectedObject(),
            searchQuery: window.clientsModule?.clientSearch?.value || '',
            ...window.ticketUIModule?.getCloseData()
        };

        clearTimeout(draftTimeout);
        draftTimeout = setTimeout(() => {
            window.api.updateCallDraft(currentCallData.id, draft);
        }, 500);
    }

    ticketSubject?.addEventListener('input', () => {
        if (currentCallData && !isCallLocked) {
            window.api.lockCall(currentCallData.id);
            isCallLocked = true;
        }
        saveDraft();
    });

    ticketDesc?.addEventListener('input', () => {
        if (currentCallData && !isCallLocked) {
            window.api.lockCall(currentCallData.id);
            isCallLocked = true;
        }
        saveDraft();
    });

    async function initVersion() {
        if (appVersionEl) {
            const version = await window.api.getAppVersion();
            appVersionEl.textContent = `v${version}`;
        }
    }
    initVersion();

    window.api.onUpdateAvailable((info) => {
        if (appVersionEl) appVersionEl.textContent = `Обновление... v${info.version}`;
    });

    window.api.onUpdateDownloaded((info) => {
        if (appVersionEl) {
            appVersionEl.textContent = `Перезапуск для v${info.version}`;
            appVersionEl.style.cursor = 'pointer';
            appVersionEl.style.color = '#4caf50';
            appVersionEl.onclick = () => window.api.restartApp();
        }
    });

    window.api.onUpdateError(() => {
        if (appVersionEl) {
            appVersionEl.textContent = `Обновлений не найдено`;
            setTimeout(initVersion, 10000);
        }
    });

    window.api.onCallHistory(() => loadHistory());

    let lastIncomingId = null;
    window.api.onCallData((data) => {
        let shouldShow = false;
        if (!currentCallData) shouldShow = true;
        else if (data && currentCallData.id === data.id) shouldShow = true;
        else if (data && data.id !== lastIncomingId) shouldShow = true;

        if (data) lastIncomingId = data.id;
        if (shouldShow) showCallData(data);
        loadHistory();
    });

    window.api.getCallData().then(showCallData);
    loadHistory();

    window.api.getAllCalls(true).then(calls => {
        window.filtersModule?.setAllCalls(calls.filter(c => !c.hasTicket));
    });
});
