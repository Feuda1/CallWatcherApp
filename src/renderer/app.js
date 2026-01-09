

document.addEventListener('DOMContentLoaded', () => {
    const emptyState = document.getElementById('empty-state');
    const callPanel = document.getElementById('call-panel');
    const historyList = document.getElementById('history-list');
    const historyEmpty = document.getElementById('history-empty');

    const callPhone = document.getElementById('call-phone');
    const callDate = document.getElementById('call-date');
    const callDuration = document.getElementById('call-duration');

    const clientSearch = document.getElementById('client-search');
    const clientList = document.getElementById('client-list');
    const suggestionsList = document.getElementById('suggestions-list');
    const suggestionsSection = document.getElementById('suggestions-section');
    const searchSection = document.getElementById('search-section');
    const noSuggestions = document.getElementById('no-suggestions');

    const ticketSubject = document.getElementById('ticket-subject');
    const ticketDesc = document.getElementById('ticket-desc');
    const topicList = document.getElementById('topic-list');
    const btnCreate = document.getElementById('btn-create');
    const btnSkip = document.getElementById('btn-skip');
    const btnLogin = document.getElementById('btn-login');
    const btnLoginHeader = document.getElementById('btn-login-header');
    const btnLogoutHeader = document.getElementById('btn-logout-header');
    const statusIndicator = document.getElementById('status-indicator');
    const appVersionEl = document.getElementById('app-version');

    const closeAfterCreateCheckbox = document.getElementById('close-after-create');
    const closeOptionsDiv = document.getElementById('close-options');

    let allTicketReasons = [];
    let reasonsLoaded = false;
    let selectedReasonIds = new Set();
    let isLoadingReasons = false;

    const customSelectContainer = document.getElementById('close-reason-custom-container');
    const customSelectTrigger = document.getElementById('close-reason-display');
    const customSelectText = document.getElementById('close-reason-text');
    const customSelectDropdown = document.getElementById('close-reason-dropdown');
    const customSelectSearch = document.getElementById('close-reason-search');
    const customSelectList = document.getElementById('close-reason-list');
    const closeReasonSelect = document.getElementById('close-reason');
    const closeCommentInput = document.getElementById('close-comment');
    const closeTimeInput = document.getElementById('close-time');

    function validateCreateButton() {
        if (!selectedClientId) {
            btnCreate.disabled = true;
            btnCreate.title = 'Выберите клиента';
            return;
        }

        const subject = ticketSubject ? ticketSubject.value.trim() : '';
        if (!subject) {
            btnCreate.disabled = true;
            btnCreate.title = 'Укажите тему обращения';
            return;
        }

        if (closeAfterCreateCheckbox && closeAfterCreateCheckbox.checked) {
            if (selectedReasonIds.size === 0) {
                btnCreate.disabled = true;
                btnCreate.title = 'Выберите причину закрытия';
                return;
            }
            const comment = closeCommentInput ? closeCommentInput.value.trim() : '';
            if (!comment) {
                btnCreate.disabled = true;
                btnCreate.title = 'Напишите комментарий закрытия';
                return;
            }
        }

        btnCreate.disabled = false;
        btnCreate.title = '';
    }

    if (closeAfterCreateCheckbox) {
        closeAfterCreateCheckbox.addEventListener('change', validateCreateButton);
    }
    if (closeCommentInput) {
        closeCommentInput.addEventListener('input', validateCreateButton);
    }
    if (ticketSubject) {
        ticketSubject.addEventListener('input', validateCreateButton);
    }

    const btnMinimize = document.getElementById('btn-minimize');
    const btnMaximize = document.getElementById('btn-maximize');
    const btnClose = document.getElementById('btn-close');

    if (btnMinimize) btnMinimize.addEventListener('click', () => window.api.minimizeWindow());
    if (btnMaximize) btnMaximize.addEventListener('click', () => window.api.maximizeWindow());
    if (btnClose) btnClose.addEventListener('click', () => window.api.closeWindow());

    const btnOpenBrowser = document.getElementById('btn-open-browser');
    if (btnOpenBrowser) {
        btnOpenBrowser.addEventListener('click', () => {
            if (currentCallData) {
                window.api.openTicketInBrowser(currentCallData, selectedClientId);
            }
        });
    }

    const audioPlayerContainer = document.getElementById('audio-player-container');
    const callAudio = document.getElementById('call-audio');
    const speedButtons = document.querySelectorAll('.btn-speed');
    const audioPlayBtn = document.getElementById('audio-play-btn');
    const audioProgress = document.getElementById('audio-progress');
    const audioTimeCurrent = document.getElementById('audio-time-current');
    const audioTimeTotal = document.getElementById('audio-time-total');
    let currentPlaybackRate = 1;

    function formatTime(seconds) {
        if (isNaN(seconds)) return '0:00';
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    }

    if (audioPlayBtn && callAudio) {
        audioPlayBtn.addEventListener('click', () => {
            if (callAudio.paused) {
                callAudio.play();
            } else {
                callAudio.pause();
            }
        });

        callAudio.addEventListener('play', () => {
            audioPlayBtn.classList.add('playing');
        });
        callAudio.addEventListener('pause', () => {
            audioPlayBtn.classList.remove('playing');
        });
        callAudio.addEventListener('ended', () => {
            audioPlayBtn.classList.remove('playing');
        });

        callAudio.addEventListener('timeupdate', () => {
            if (callAudio.duration) {
                const percent = (callAudio.currentTime / callAudio.duration) * 100;
                audioProgress.value = percent;
                audioTimeCurrent.textContent = formatTime(callAudio.currentTime);
            }
        });

        callAudio.addEventListener('loadedmetadata', () => {
            audioTimeTotal.textContent = formatTime(callAudio.duration);
            callAudio.playbackRate = currentPlaybackRate;
        });

        audioProgress.addEventListener('input', () => {
            if (callAudio.duration) {
                callAudio.currentTime = (audioProgress.value / 100) * callAudio.duration;
            }
        });
    }

    if (speedButtons) {
        speedButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                const speed = parseFloat(btn.dataset.speed);
                currentPlaybackRate = speed;
                if (callAudio) {
                    callAudio.playbackRate = speed;
                }
                speedButtons.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
            });
        });
    }

    let currentCallData = null;
    let selectedClientId = null;
    let selectedClientObject = null;
    let callHistory = [];
    let isCallLocked = false;
    let draftTimeout = null;
    let lastAudioRequestId = 0;

    let currentMode = 'incoming';
    let bulkCalls = [];
    let bulkIndex = 0;
    let bulkStats = { total: 0, filled: 0, unfilled: 0 };
    let bulkFirstLoad = true;

    const modeTabs = document.querySelectorAll('.mode-tab');
    const bulkStatsEl = document.getElementById('bulk-stats');
    const bulkNavEl = document.getElementById('bulk-nav');
    const statTotal = document.getElementById('stat-total');
    const statFilled = document.getElementById('stat-filled');
    const statUnfilled = document.getElementById('stat-unfilled');
    const btnPrevCall = document.getElementById('btn-prev-call');
    const btnNextCall = document.getElementById('btn-next-call');
    const bulkPositionEl = document.getElementById('bulk-position');
    const btnRefreshBulk = document.getElementById('btn-refresh-bulk');

    modeTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const mode = tab.dataset.mode;
            if (mode === currentMode) return;

            currentMode = mode;
            modeTabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');

            if (mode === 'bulk') {
                enterBulkMode();
            } else {
                exitBulkMode();
            }
        });
    });

    let minDuration = 0;
    let allBulkCalls = [];

    const presetBtns = document.querySelectorAll('.preset-btn');
    const durationValueEl = document.getElementById('duration-value');
    const durationSlider = document.getElementById('duration-slider');

    const durationSliderInline = document.getElementById('duration-slider-inline');
    const durationValueInline = document.getElementById('duration-value-inline');

    function updateDuration(value, syncToInline = true) {
        minDuration = parseInt(value);
        if (durationSlider) durationSlider.value = minDuration;
        if (durationValueEl) durationValueEl.textContent = minDuration + ' сек';

        if (syncToInline && durationSliderInline) durationSliderInline.value = minDuration;
        if (durationValueInline) durationValueInline.textContent = minDuration + 'с';

        presetBtns.forEach(btn => {
            if (parseInt(btn.dataset.value) === minDuration) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });

        applyAllFilters();
    }

    if (durationSlider) {
        durationSlider.addEventListener('input', (e) => {
            updateDuration(e.target.value);
        });
    }

    if (durationSliderInline) {
        durationSliderInline.addEventListener('input', (e) => {
            updateDuration(e.target.value, false);
        });
    }

    presetBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            updateDuration(btn.dataset.value);
        });
    });

    function applyAllFilters() {
        bulkCalls = allBulkCalls.filter(c => {
            const dur = parseInt(c.duration) || 0;
            if (dur < minDuration) return false;

            if (selectedDates && selectedDates.size > 0) {
                const parsed = parseCallDate(c.date);
                if (!parsed || !selectedDates.has(parsed.formatted)) return false;
            }

            return true;
        });
        bulkIndex = 0;
        updateBulkPosition();
        if (bulkCalls.length > 0) {
            showCallData(bulkCalls[0]);
        } else {
            showCallData(null);
        }
    }

    let selectedDates = new Set();
    function parseCallDate(dateStr) {
        if (!dateStr) return null;
        const match = dateStr.match(/(\d{2})\.(\d{2})\.(\d{4})/);
        if (!match) return null;
        return { formatted: `${match[1]}.${match[2]}.${match[3]}` };
    }

    function applyDurationFilter() {
        applyAllFilters();
    }

    const bulkFilterEl = document.getElementById('duration-filter-container');

    async function enterBulkMode(forceRefresh = false) {
        bulkStatsEl?.classList.remove('hidden');
        bulkNavEl?.classList.remove('hidden');
        bulkFilterEl?.classList.remove('hidden');

        const needsRefresh = forceRefresh || bulkFirstLoad;
        if (needsRefresh) {
            bulkFirstLoad = false;
        }

        if (needsRefresh || allBulkCalls.length === 0) {
            const allCalls = await window.api.getAllCalls(needsRefresh);
            allBulkCalls = allCalls.filter(c => !c.hasTicket);
            bulkCalls = allBulkCalls.filter(c => {
                const dur = parseInt(c.duration) || 0;
                return dur >= minDuration;
            });
            bulkIndex = 0;
        }

        const stats = await window.api.getBulkStats();
        bulkStats = stats;
        updateBulkStats();


        if (bulkCalls.length > 0) {
            showCallData(bulkCalls[0]);
            updateBulkPosition();
        } else {
            showCallData(null);
        }
    }

    function exitBulkMode() {
        bulkStatsEl?.classList.add('hidden');
        bulkNavEl?.classList.add('hidden');
        bulkFilterEl?.classList.add('hidden');
        currentMode = 'incoming';


        showCallData(null);
    }

    function updateBulkStats() {
        if (statTotal) statTotal.textContent = bulkStats.total;
        if (statFilled) statFilled.textContent = bulkStats.filled;
        if (statUnfilled) statUnfilled.textContent = bulkStats.unfilled;
    }

    if (window.api.onBulkProgress) {
        window.api.onBulkProgress((count) => {
            if (statTotal) statTotal.textContent = count;
        });
    }

    function updateBulkPosition() {
        if (bulkPositionEl) {
            bulkPositionEl.textContent = `${bulkIndex + 1} из ${bulkCalls.length}`;
        }
        const btnFirstCall = document.getElementById('btn-first-call');
        const btnLastCall = document.getElementById('btn-last-call');

        if (btnPrevCall) btnPrevCall.disabled = bulkIndex <= 0;
        if (btnNextCall) btnNextCall.disabled = bulkIndex >= bulkCalls.length - 1;
        if (btnFirstCall) btnFirstCall.disabled = bulkIndex <= 0;
        if (btnLastCall) btnLastCall.disabled = bulkIndex >= bulkCalls.length - 1;
    }


    btnPrevCall?.addEventListener('click', () => {
        if (bulkIndex > 0) {
            bulkIndex--;
            showCallData(bulkCalls[bulkIndex]);
            updateBulkPosition();
        }
    });

    btnNextCall?.addEventListener('click', () => {
        if (bulkIndex < bulkCalls.length - 1) {
            bulkIndex++;
            showCallData(bulkCalls[bulkIndex]);
            updateBulkPosition();
        }
    });

    document.getElementById('btn-first-call')?.addEventListener('click', () => {
        if (bulkCalls.length > 0) {
            bulkIndex = 0;
            showCallData(bulkCalls[bulkIndex]);
            updateBulkPosition();
        }
    });

    document.getElementById('btn-last-call')?.addEventListener('click', () => {
        if (bulkCalls.length > 0) {
            bulkIndex = bulkCalls.length - 1;
            showCallData(bulkCalls[bulkIndex]);
            updateBulkPosition();
        }
    });

    const btnDatePicker = document.getElementById('btn-date-picker');
    const datePickerDropdown = document.getElementById('date-picker-dropdown');
    const datePickerList = document.getElementById('date-picker-list');
    const datePickerLabel = document.getElementById('date-picker-label');
    const btnClearDate = document.getElementById('btn-clear-date');

    function getAvailableDates() {
        const dateCounts = {};
        allBulkCalls.forEach(call => {
            const parsed = parseCallDate(call.date);
            if (parsed) {
                const key = parsed.formatted;
                dateCounts[key] = (dateCounts[key] || 0) + 1;
            }
        });

        return Object.entries(dateCounts)
            .map(([date, count]) => ({ date, count }))
            .sort((a, b) => {
                const [d1, m1, y1] = a.date.split('.');
                const [d2, m2, y2] = b.date.split('.');
                return new Date(y2, m2 - 1, d2) - new Date(y1, m1 - 1, d1);
            });
    }

    function updateDatePickerLabel() {
        if (!datePickerLabel) return;

        if (selectedDates.size === 0) {
            datePickerLabel.textContent = 'Все даты';
            btnDatePicker?.classList.remove('active');
        } else if (selectedDates.size === 1) {
            datePickerLabel.textContent = [...selectedDates][0];
            btnDatePicker?.classList.add('active');
        } else {
            datePickerLabel.textContent = `${selectedDates.size} дат`;
            btnDatePicker?.classList.add('active');
        }
    }

    function applyDateFilter() {
        applyAllFilters();
        updateDatePickerLabel();
        console.log(`[CallWatcher] Фильтр: ${selectedDates.size} дат, ${bulkCalls.length} звонков`);
    }

    function renderDateList() {
        if (!datePickerList) return;

        const dates = getAvailableDates();
        datePickerList.innerHTML = '';

        if (dates.length === 0) {
            datePickerList.innerHTML = '<div style="padding: 1rem; color: #64748b; text-align: center;">Нет звонков</div>';
            return;
        }

        dates.forEach(({ date, count }) => {
            const item = document.createElement('div');
            const isSelected = selectedDates.has(date);
            item.className = 'date-picker-item' + (isSelected ? ' selected' : '');
            item.innerHTML = `
                <span class="date-checkbox">${isSelected ? '✓' : ''}</span>
                <span class="date-text">${date}</span>
                <span class="date-count">${count}</span>
            `;
            item.addEventListener('click', (e) => {
                e.stopPropagation();
                toggleDate(date);
            });
            datePickerList.appendChild(item);
        });
    }

    function toggleDate(date) {
        if (selectedDates.has(date)) {
            selectedDates.delete(date);
        } else {
            selectedDates.add(date);
        }
        renderDateList();
        applyDateFilter();
    }

    function clearDateFilter() {
        selectedDates.clear();
        renderDateList();
        applyDateFilter();
    }

    btnDatePicker?.addEventListener('click', (e) => {
        e.stopPropagation();
        const isOpen = !datePickerDropdown?.classList.contains('hidden');

        if (!isOpen) {
            renderDateList();
            datePickerDropdown?.classList.remove('hidden');
        } else {
            datePickerDropdown?.classList.add('hidden');
        }
    });

    document.addEventListener('click', (e) => {
        if (datePickerDropdown && !datePickerDropdown.classList.contains('hidden')) {
            if (!e.target.closest('.date-picker-wrapper')) {
                datePickerDropdown.classList.add('hidden');
            }
        }
    });

    btnClearDate?.addEventListener('click', clearDateFilter);

    btnRefreshBulk?.addEventListener('click', async () => {
        btnRefreshBulk.classList.add('loading');
        await enterBulkMode(true);
        btnRefreshBulk.classList.remove('loading');
    });

    function openLogin() { window.api.openLogin(); }
    if (btnLogin) btnLogin.addEventListener('click', openLogin);
    if (btnLoginHeader) btnLoginHeader.addEventListener('click', openLogin);
    if (btnLogoutHeader) btnLogoutHeader.addEventListener('click', () => {
        if (confirm('Выйти из системы?')) {
            window.api.logout();
        }
    });

    const statusText = document.querySelector('.status-text');

    window.api.onLoginStatus((isLoggedIn) => {
        if (isLoggedIn) {
            statusIndicator.classList.remove('offline');
            statusIndicator.classList.add('online');
            statusIndicator.title = 'Авторизован';
            if (statusText) statusText.textContent = 'Подключено';

            if (btnLoginHeader) btnLoginHeader.style.display = 'none';
            if (btnLogoutHeader) btnLogoutHeader.style.display = 'inline-flex';
            if (btnLogin) btnLogin.style.display = 'none';
        } else {
            statusIndicator.classList.remove('online');
            statusIndicator.classList.add('offline');
            statusIndicator.title = 'Не авторизован';
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
            emptyState.classList.add('hidden');
            callPanel.classList.remove('hidden');

            if (data.status === 'skipped' || data.status === 'created') {
                btnSkip.disabled = true;
            } else {
                const found = callHistory.find(c => c.id === data.id);
                if (found && (found.status === 'skipped' || found.status === 'created')) {
                    btnSkip.disabled = true;
                    data.status = found.status;
                } else {
                    btnSkip.disabled = false;
                }
            }

            callPhone.textContent = data.phone || 'Неизвестный';
            callDate.textContent = data.date || '';
            callDuration.textContent = (data.duration || '?') + ' сек';

            const callStatusBadge = document.getElementById('call-status-badge');
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

            const playBtnWrapper = document.querySelector('.play-btn-wrapper');

            let audioUrl = data.audioUrl;
            if (!audioUrl && data.id) {
                audioUrl = `https://clients.denvic.ru/PhoneCalls/GetCallRecord?id=${data.id}`;
            }

            if (audioPlayerContainer && callAudio) {
                if (audioUrl) {
                    audioPlayerContainer.classList.remove('hidden');

                    const currentDatasetUrl = callAudio.dataset.originUrl;
                    if (currentDatasetUrl !== audioUrl) {
                        callAudio.dataset.originUrl = audioUrl;
                        callAudio.pause();
                        callAudio.src = '';
                        audioPlayBtn?.classList.remove('playing');
                        audioProgress.value = 0;
                        audioTimeCurrent.textContent = '0:00';
                        audioTimeTotal.textContent = '0:00';

                        audioTimeTotal.textContent = '0:00';

                        if (playBtnWrapper) playBtnWrapper.classList.add('loading');

                        const currentRequestId = ++lastAudioRequestId;

                        window.api.getAudio(audioUrl).then(result => {
                            if (currentRequestId !== lastAudioRequestId) {
                                console.log('Игнорирование устаревшего аудио ответа', currentRequestId);
                                return;
                            }

                            if (playBtnWrapper) playBtnWrapper.classList.remove('loading');

                            if (result && result.error) {
                                console.error('Аудио недоступно:', result.error);
                                audioPlayerContainer.classList.add('audio-error');
                                audioTimeTotal.textContent = 'Недоступно';
                                audioPlayBtn.disabled = true;
                                audioPlayBtn.title = `Запись недоступна: ${result.error}`;
                                return;
                            }

                            if (result && result.length > 0) {
                                audioPlayerContainer.classList.remove('audio-error');
                                audioPlayBtn.disabled = false;
                                audioPlayBtn.title = '';
                                const blob = new Blob([result], { type: 'audio/mpeg' });
                                callAudio.src = URL.createObjectURL(blob);
                            } else {
                                console.error('Аудио буфер пуст');
                                audioTimeTotal.textContent = 'Ошибка';
                            }
                        }).catch(err => {
                            if (currentRequestId !== lastAudioRequestId) return;

                            if (playBtnWrapper) playBtnWrapper.classList.remove('loading');
                            console.error('Ошибка получения аудио:', err);
                            audioTimeTotal.textContent = 'Ошибка';
                        });
                    }
                } else {
                    audioPlayerContainer.classList.add('hidden');
                    callAudio.pause();
                    callAudio.removeAttribute('src');
                    callAudio.load();
                }
            }

            let finalSuggestions = [];

            if (data.suggestions && data.suggestions.length > 0) {
                const allSuggestions = data.suggestions;

                finalSuggestions = allSuggestions.map(s => ({
                    Id: s.id,
                    _originalName: s.name,
                    Organization: '',
                    FirsName: s.name,
                    LastName: '',
                    Mail: ''
                }));
            }

            if (data.associatedClient) {
                const assoc = data.associatedClient;
                const existingIdx = finalSuggestions.findIndex(s => (s.Id || s.id) === assoc.clientId);

                if (existingIdx >= 0) {
                    const existing = finalSuggestions[existingIdx];
                    existing._displayMeta = '★ ' + (existing._displayMeta || '');
                    finalSuggestions.splice(existingIdx, 1);
                    finalSuggestions.unshift(existing);
                } else {
                    finalSuggestions.unshift({
                        id: assoc.clientId,
                        Id: assoc.clientId,
                        _displayName: assoc.clientName || 'Запомненный клиент',
                        _displayMeta: '★ Ранее выбранный'
                    });
                }
            }


            if (isNewCall) {

                highlightHistoryItem(data.id);


                if (data.draft && data.draft.selectedClientId && data.draft.selectedClientObject) {
                    const draftId = data.draft.selectedClientId;
                    const draftObj = data.draft.selectedClientObject;
                    const exists = finalSuggestions.find(s => (s.Id || s.id) === draftId);
                    if (!exists) {
                        finalSuggestions.unshift(draftObj);
                    }
                }


                renderSuggestions(finalSuggestions);


                if (data.draft) {
                    console.log('Restoring draft for call:', data.id);
                    ticketSubject.value = data.draft.subject || '';
                    ticketDesc.value = data.draft.description || '';
                    clientSearch.value = data.draft.searchQuery || '';

                    if (data.draft.selectedClientId && data.draft.selectedClientObject) {
                        selectedClientId = data.draft.selectedClientId;
                        selectedClientObject = data.draft.selectedClientObject;
                        selectedClientObject = data.draft.selectedClientObject;
                        setTimeout(() => highlightSelectedClient(selectedClientId), 100);
                    } else {
                    }

                    validateCreateButton();

                    if (closeAfterCreateCheckbox) {
                        closeAfterCreateCheckbox.checked = data.draft.closeAfterCreate || false;
                        if (data.draft.closeAfterCreate) {
                            closeOptionsDiv.classList.remove('hidden');
                            ensureReasonsLoaded().then(() => {
                                if (data.draft.multiCloseReasons && Array.isArray(data.draft.multiCloseReasons)) {
                                    selectedReasonIds = new Set(data.draft.multiCloseReasons);
                                } else if (data.draft.closeReason) {
                                    selectedReasonIds = new Set([data.draft.closeReason]);
                                }

                                if (typeof updateCustomSelectUI === 'function') updateCustomSelectUI();
                            });
                        } else {
                            closeOptionsDiv.classList.add('hidden');
                        }
                    }
                    if (closeCommentInput) {
                        closeCommentInput.value = data.draft.closeComment || '';
                    }
                    if (closeTimeInput) {
                        closeTimeInput.value = data.draft.closeTime || '5';
                    }
                } else if (data.associatedClient) {
                    selectedClientId = data.associatedClient.clientId;
                    selectedClientObject = finalSuggestions.find(s => (s.Id || s.id) === selectedClientId);
                    selectedClientId = data.associatedClient.clientId;
                    selectedClientObject = finalSuggestions.find(s => (s.Id || s.id) === selectedClientId);
                    setTimeout(() => highlightSelectedClient(selectedClientId), 100);
                    validateCreateButton();
                    setTimeout(() => highlightSelectedClient(selectedClientId), 100);
                } else {
                    ticketSubject.value = '';
                    ticketDesc.value = '';
                    clientSearch.value = '';
                    toggleSearchMode(false);
                    selectedClientId = null;
                    selectedClientObject = null;
                    selectedClientId = null;
                    selectedClientObject = null;
                    validateCreateButton();
                    clientList.innerHTML = '';

                    if (closeAfterCreateCheckbox) {
                        closeAfterCreateCheckbox.checked = false;
                        closeOptionsDiv.classList.add('hidden');
                    }

                    selectedReasonIds.clear();
                    if (closeReasonSelect) closeReasonSelect.value = '';
                    if (typeof updateCustomSelectUI === 'function') updateCustomSelectUI();

                    if (closeCommentInput) closeCommentInput.value = '';
                    if (closeTimeInput) closeTimeInput.value = '5';
                }


            } else {
                highlightHistoryItem(data.id);
                if (selectedClientId) {
                    highlightSelectedClient(selectedClientId);
                }
            }
        } else {
            emptyState.classList.remove('hidden');
            callPanel.classList.add('hidden');
            currentCallData = null;
            highlightHistoryItem(null);
        }
    }

    function highlightHistoryItem(id) {
        if (!historyList) return;
        const items = historyList.querySelectorAll('.history-item');
        items.forEach(el => {
            if (el.dataset.id == id) {
                el.classList.add('selected');
            } else {
                el.classList.remove('selected');
            }
        });
    }



    function toggleSearchMode(isSearching) {
        if (isSearching) {
            suggestionsSection.classList.add('hidden');
            searchSection.classList.remove('hidden');
        } else {
            suggestionsSection.classList.remove('hidden');
            searchSection.classList.add('hidden');
        }
    }

    function renderSuggestions(suggestions) {
        suggestionsList.innerHTML = '';
        if (suggestions && suggestions.length > 0) {
            noSuggestions.classList.add('hidden');
            suggestions.forEach(client => {
                const li = createClientItem(client);
                suggestionsList.appendChild(li);
            });
        } else {
            noSuggestions.classList.remove('hidden');
        }
    }

    let searchTimeout = null;
    clientSearch.addEventListener('input', () => {
        clearTimeout(searchTimeout);
        const query = clientSearch.value.trim();

        if (query.length < 2) {
            toggleSearchMode(false);
            clientList.innerHTML = '';
            return;
        }

        toggleSearchMode(true);
        clientList.innerHTML = '<li class="client-item hint">Поиск...</li>';

        searchTimeout = setTimeout(() => searchClients(query), 300);
    });

    async function searchClients(query) {
        try {
            const clients = await window.api.searchClients(query);
            clientList.innerHTML = '';

            if (clients && clients.length > 0) {
                renderGroupedClients(clients, clientList);
            } else {
                clientList.innerHTML = '<li class="client-item hint">Ничего не найдено</li>';
            }
        } catch (error) {
            clientList.innerHTML = '<li class="client-item hint error">Ошибка поиска</li>';
        }
    }

    function createClientItem(client) {
        const li = document.createElement('li');
        li.className = 'client-item';

        const id = client.Id || client.id;
        li.dataset.id = id;

        const org = client.Organization || '';
        const firstName = client.FirsName || client.FirstName || '';
        const lastName = client.LastName || '';
        const fullName = `${firstName} ${lastName}`.trim();
        const email = client.Mail || '';

        let mainText = '';
        let metaText = '';

        if (client._originalName) {
            mainText = client._originalName;
        } else if (fullName) {
            mainText = fullName;
        } else {
            mainText = org || 'Неизвестный';
        }

        if (email) {
            if (metaText) metaText += ' • ';
            metaText += email;
        }

        li.innerHTML = `
             <div class="client-name">${escapeHtml(mainText)}</div>
             ${metaText ? `<div class="client-meta">${escapeHtml(metaText)}</div>` : ''}
         `;


        li.addEventListener('click', () => selectClient(client, li));
        return li;
    }

    function renderGroupedClients(clients, container) {
        const groups = {};
        clients.forEach(client => {
            const contractsStr = client.Contracts || '';
            const contracts = contractsStr.split(',').map(c => c.trim()).filter(c => c);

            const firstName = client.FirsName || client.FirstName || '';
            const lastName = client.LastName || '';
            const name = `${firstName} ${lastName} `.trim() || client.Organization || 'Без имени';

            if (contracts.length === 0) {
                const groupName = 'Без договора';
                if (!groups[groupName]) groups[groupName] = [];

                let metaParts = ['Без договора'];
                if (client.Mail) metaParts.push(client.Mail);

                groups[groupName].push({ ...client, _displayName: name, _displayMeta: metaParts.join(' • ') });
            } else {
                contracts.forEach(contract => {
                    const match = contract.match(/^([A-Za-zА-Яа-я0-9]+)/);
                    const prefix = match ? match[1] : 'Прочее';
                    const groupName = `Договоры ${prefix} `;
                    if (!groups[groupName]) groups[groupName] = [];

                    let metaParts = [];
                    if (contract) metaParts.push(contract);
                    if (client.Organization) metaParts.push(`(${client.Organization})`);
                    if (client.Mail) metaParts.push(client.Mail);

                    groups[groupName].push({ ...client, _displayName: name, _displayMeta: metaParts.join(' ') });
                });
            }
        });


        const sortedGroups = Object.keys(groups).sort((a, b) => {
            if (a === 'Без договора') return 1;
            if (b === 'Без договора') return -1;
            return a.localeCompare(b);
        });

        sortedGroups.forEach(groupName => {
            const header = document.createElement('li');
            header.className = 'group-header';
            header.innerHTML = `<span>${escapeHtml(groupName)}</span> <span>${groups[groupName].length}</span>`;
            container.appendChild(header);

            groups[groupName].forEach(c => {
                const li = document.createElement('li');
                li.className = 'client-item indented';
                li.innerHTML = `
                    <div class="client-name">${escapeHtml(c._displayName)}</div>
                    <div class="client-meta">${escapeHtml(c._displayMeta)}</div>
                `;
                li.dataset.id = c.Id || c.id;
                li.addEventListener('click', () => selectClient(c, li));
                container.appendChild(li);
            });
        });
    }


    function selectClient(client, element) {
        selectedClientId = client.Id || client.id;
        selectedClientObject = client;

        document.querySelectorAll('.client-item').forEach(el => el.classList.remove('selected'));
        element.classList.add('selected');
        element.classList.add('selected');
        validateCreateButton();

        saveDraft();
    }

    function highlightSelectedClient(id) {
        if (!id) return;
        const items = document.querySelectorAll('.client-item');
        items.forEach(el => {
            if (el.dataset.id == id) {
                el.classList.add('selected');
                el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
            } else {
                el.classList.remove('selected');
            }
        });
    }


    btnCreate.addEventListener('click', async () => {
        if (!currentCallData || !selectedClientId) return;
        btnCreate.disabled = true;

        const shouldClose = closeAfterCreateCheckbox && closeAfterCreateCheckbox.checked;
        btnCreate.textContent = shouldClose ? 'Создание и закрытие...' : 'Создание...';

        try {
            const ticketData = {
                callData: currentCallData,
                clientId: selectedClientId,
                clientName: selectedClientObject ? (selectedClientObject._displayName || selectedClientObject.name || '') : '',
                subject: ticketSubject.value.trim() || 'Входящий звонок',
                description: ticketDesc.value.trim()
            };
            const result = await window.api.createTicket(ticketData);

            if (result.IsValid && result.Redirect) {
                const subjectValue = ticketSubject.value.trim();
                if (subjectValue) {
                    window.api.saveTopic(subjectValue).then(() => loadTopics());
                }

                if (shouldClose && result.Address) {
                    btnCreate.textContent = 'Закрытие заявки...';

                    const ticketIdMatch = result.Address.match(/\/Tickets\/Details\/(\d+)/);
                    if (ticketIdMatch) {
                        const ticketId = ticketIdMatch[1];
                        const closeResult = await window.api.closeTicket({
                            ticketId: ticketId,
                            reasonId: closeReasonSelect ? closeReasonSelect.value : '',
                            reasonIds: Array.from(selectedReasonIds),
                            comment: closeCommentInput ? closeCommentInput.value : 'Вопрос решён',
                            timeSpent: closeTimeInput ? parseInt(closeTimeInput.value) || 5 : 5
                        });

                        if (closeResult.success) {
                            btnCreate.textContent = '✓ Создано и закрыто!';
                        } else {
                            btnCreate.textContent = '✓ Создано (ошибка закрытия)';
                            console.error('Ошибка закрытия:', closeResult.error);
                        }
                    } else {
                        btnCreate.textContent = '✓ Создано!';
                    }
                } else {
                    btnCreate.textContent = '✓ Создано!';
                }

                btnCreate.classList.add('btn-success');

                const completedCallId = currentCallData?.id;
                setTimeout(() => {
                    currentCallData = null;
                    showCallData(null);
                    window.api.ticketCreated(completedCallId);
                    btnCreate.textContent = 'Создать заявку';
                    btnCreate.disabled = true;

                    if (currentMode === 'bulk') {
                        currentMode = 'incoming';
                        modeTabs.forEach(t => {
                            t.classList.toggle('active', t.dataset.mode === 'incoming');
                        });
                        bulkStatsEl?.classList.add('hidden');
                        bulkNavEl?.classList.add('hidden');
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


    btnSkip.addEventListener('click', () => {
        if (currentCallData && (currentCallData.status === 'skipped' || currentCallData.status === 'created')) return;
        if (currentCallData) {
            window.api.skipCall(currentCallData.id);
        }
        showCallData(null);
    });

    async function loadHistory() {
        if (!historyList) return;
        const calls = await window.api.getCallHistory() || [];
        callHistory = calls;

        if (calls.length === 0) {
            historyList.innerHTML = '';
            historyEmpty.classList.remove('hidden');
            return;
        }

        historyEmpty.classList.add('hidden');

        const updateOrCreateItem = (call, existingEl) => {
            let li = existingEl;
            let statusClass = 'status-unprocessed';
            let statusText = 'ОЖИДАЕТ';

            if (call.status === 'created') {
                statusClass = 'status-created';
                statusText = 'СОЗДАН';
            } else if (call.status === 'skipped') {
                statusClass = 'status-skipped';
                statusText = 'ПРОПУЩЕН';
            }

            const phone = escapeHtml(call.phone || 'Неизвестный');
            const date = call.date || '';

            const innerHTML = `
                <div class="history-phone">${phone}</div>
                <div class="history-meta">
                    <div>${date}</div>
                    <span class="history-status-badge ${statusClass}">${statusText}</span>
                </div>
            `;

            if (!li) {
                li = document.createElement('li');
                li.className = 'history-item';
                li.dataset.id = call.id;
                li.addEventListener('click', () => {
                    const freshCall = callHistory.find(c => c.id === call.id);
                    if (freshCall) {
                        showCallData(freshCall);
                        window.api.lockCall(freshCall.id);
                    }
                });
                li.innerHTML = innerHTML;
            } else {
                if (li.innerHTML !== innerHTML) {
                    li.innerHTML = innerHTML;
                }
            }

            if (currentCallData && call.id === currentCallData.id) {
                li.classList.add('selected');
            } else {
                li.classList.remove('selected');
            }

            return li;
        };

        const existingItems = Array.from(historyList.querySelectorAll('.history-item'));
        const existingMap = new Map();
        existingItems.forEach(el => existingMap.set(el.dataset.id, el));
        calls.forEach((call, index) => {
            const existingEl = existingMap.get(call.id);
            const li = updateOrCreateItem(call, existingEl);

            if (!existingEl) {
                if (index === 0) {
                    historyList.prepend(li);
                } else {
                    const prevCall = calls[index - 1];
                    const prevEl = historyList.querySelector(`.history-item[data-id="${prevCall.id}"]`);
                    if (prevEl) {
                        prevEl.after(li);
                    } else {
                        historyList.appendChild(li);
                    }
                }
            } else {
                existingMap.delete(call.id);
            }
        });

        existingMap.forEach(el => el.remove());
    }

    function saveDraft() {
        if (!currentCallData) return;

        const callId = currentCallData.id;
        const draft = {
            subject: ticketSubject.value,
            description: ticketDesc.value,
            selectedClientId: selectedClientId,
            selectedClientObject: selectedClientObject,
            searchQuery: clientSearch.value,
            closeAfterCreate: closeAfterCreateCheckbox ? closeAfterCreateCheckbox.checked : false,
            closeReason: closeReasonSelect ? closeReasonSelect.value : '',
            multiCloseReasons: Array.from(selectedReasonIds),
            closeComment: closeCommentInput ? closeCommentInput.value : '',
            closeTime: closeTimeInput ? closeTimeInput.value : '5'
        };

        clearTimeout(draftTimeout);
        draftTimeout = setTimeout(() => {
            window.api.updateCallDraft(callId, draft);
        }, 500);
    }
    if (ticketSubject) {
        ticketSubject.addEventListener('input', () => {
            if (currentCallData && !isCallLocked) {
                window.api.lockCall(currentCallData.id);
                isCallLocked = true;
            }
            saveDraft();
        });
    }

    if (ticketDesc) {
        ticketDesc.addEventListener('input', () => {
            if (currentCallData && !isCallLocked) {
                window.api.lockCall(currentCallData.id);
                isCallLocked = true;
            }
            saveDraft();
        });
    }

    async function loadTopics() {
        try {
            const topics = await window.api.getTopics();
            const datalist = document.getElementById('topic-list');
            if (datalist && topics) {
                datalist.innerHTML = topics.map(t => `<option value="${t}">`).join('');
            }
        } catch (err) {
            console.error('Ошибка загрузки тем:', err);
        }
    }
    loadTopics();

    async function initVersion() {
        if (appVersionEl) {
            const version = await window.api.getAppVersion();
            appVersionEl.textContent = `v${version}`;
        }
    }
    initVersion();

    window.api.onUpdateAvailable((info) => {
        console.log('Update available:', info);
        if (appVersionEl) appVersionEl.textContent = `Обновление... v${info.version}`;
    });

    window.api.onUpdateDownloaded((info) => {
        console.log('Update downloaded:', info);
        if (appVersionEl) {
            appVersionEl.textContent = `Перезапуск для v${info.version}`;
            appVersionEl.style.cursor = 'pointer';
            appVersionEl.style.color = '#4caf50';
            appVersionEl.onclick = () => window.api.restartApp();
        }
    });

    window.api.onUpdateError((err) => {
        console.error('Update error:', err);
        if (appVersionEl) {
            const originalText = appVersionEl.textContent;

            appVersionEl.textContent = `Обновлений не найдено`;

            setTimeout(() => {
                initVersion();
            }, 10000);
        }
    });

    const topicsContainer = document.createElement('div');
    topicsContainer.className = 'custom-topics-dropdown hidden';
    ticketSubject.parentNode.appendChild(topicsContainer);

    ticketSubject.addEventListener('input', () => {
        const val = ticketSubject.value.trim().toLowerCase();

        if (val.length === 0) {
            topicsContainer.classList.add('hidden');
            return;
        }

        const filtered = topicsList.filter(t => t.toLowerCase().includes(val));

        if (filtered.length > 0) {
            showTopics(filtered);
        } else {
            topicsContainer.classList.add('hidden');
        }
    });

    document.addEventListener('click', (e) => {
        if (!ticketSubject.contains(e.target) && !topicsContainer.contains(e.target)) {
            topicsContainer.classList.add('hidden');
        }
    });

    function showTopics(list) {
        topicsContainer.innerHTML = '';
        list.forEach(topic => {
            const div = document.createElement('div');
            div.className = 'topic-item';
            div.textContent = topic;
            div.addEventListener('click', () => {
                ticketSubject.value = topic;
                topicsContainer.classList.add('hidden');
            });
            topicsContainer.appendChild(div);
        });
        topicsContainer.classList.remove('hidden');
    }

    let topicsList = [];
    async function initTopics() {
        try {
            topicsList = await window.api.getTopics();
        } catch (e) { console.error(e); }
    }
    initTopics();

    window.api.onCallData(showCallData);
    window.api.onCallHistory(() => loadHistory());
    window.api.getCallData().then(showCallData);
    loadHistory();

    window.api.getAllCalls(true).then(calls => {
        allBulkCalls = calls.filter(c => !c.hasTicket);
        bulkCalls = allBulkCalls.filter(c => {
            const dur = parseInt(c.duration) || 0;
            return dur >= minDuration;
        });
        bulkFirstLoad = false;
        console.log('Предзагружено звонков:', calls.length);
    });

    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    function updateCustomSelectUI() {
        if (!closeReasonSelect || !customSelectText) return;

        const count = selectedReasonIds.size;

        if (count === 0) {
            customSelectText.textContent = 'Выберите причину';
            customSelectText.style.color = 'var(--text-secondary, #64748b)';
            return;
        }

        const names = [];
        selectedReasonIds.forEach(id => {
            const found = allTicketReasons.find(r => r.value === id);
            if (found) names.push(found.text);
            else names.push(id);
        });

        if (count > 1) {
            customSelectText.textContent = `Выбрано причин: ${count}`;
            customSelectText.title = names.join(', ');
        } else {
            customSelectText.textContent = names.join(', ');
            customSelectText.removeAttribute('title');
        }
        customSelectText.style.color = '';

        validateCreateButton();
    }

    function toggleCustomDropdown(force) {
        if (!customSelectDropdown) return;
        const isHidden = customSelectDropdown.classList.contains('hidden');
        const show = (force !== undefined) ? force : isHidden;

        if (show) {
            const rect = customSelectContainer.getBoundingClientRect();
            const spaceBelow = window.innerHeight - rect.bottom - 15;
            const searchHeight = 50;
            const maxListHeightCSS = 250;
            let calculatedMaxHeight = maxListHeightCSS;

            if (spaceBelow < (maxListHeightCSS + searchHeight)) {
                calculatedMaxHeight = Math.max(100, spaceBelow - searchHeight);
            }
            if (customSelectList) customSelectList.style.maxHeight = calculatedMaxHeight + 'px';

            customSelectContainer.classList.remove('opens-up');
            customSelectDropdown.classList.remove('hidden');
            customSelectContainer.classList.add('open');

            if (customSelectSearch) {
                customSelectSearch.value = '';
                customSelectSearch.focus();
            }
            renderCustomOptions(allTicketReasons);
        } else {
            customSelectDropdown.classList.add('hidden');
            customSelectContainer.classList.remove('open');
            if (customSelectList) customSelectList.style.maxHeight = '';
        }
    }

    function renderCustomOptions(list) {
        if (!customSelectList) return;
        customSelectList.innerHTML = '';

        list.forEach(r => {
            const div = document.createElement('div');
            div.className = 'option-item';
            const isSelected = selectedReasonIds.has(r.value);
            if (isSelected) div.classList.add('selected');
            const check = document.createElement('div');
            check.className = 'option-check';
            check.textContent = isSelected ? '✓' : '';

            const textSpan = document.createElement('span');
            textSpan.textContent = r.text;

            div.appendChild(check);
            div.appendChild(textSpan);

            div.addEventListener('click', (e) => {
                e.stopPropagation();

                if (selectedReasonIds.has(r.value)) {
                    selectedReasonIds.delete(r.value);
                    div.classList.remove('selected');
                    check.textContent = '';
                } else {
                    selectedReasonIds.add(r.value);
                    div.classList.add('selected');
                    check.textContent = '✓';
                }

                updateCustomSelectUI();
                if (selectedReasonIds.size > 0) {
                    closeReasonSelect.value = Array.from(selectedReasonIds)[0];
                } else {
                    closeReasonSelect.value = '';
                }

                saveDraft();
            });
            customSelectList.appendChild(div);
        });

        if (list.length === 0) {
            const div = document.createElement('div');
            div.className = 'option-item';
            div.style.cursor = 'default';
            div.style.justifyContent = 'center';
            div.textContent = 'Ничего не найдено';
            customSelectList.appendChild(div);
        }
    }

    async function ensureReasonsLoaded() {
        if (reasonsLoaded) {
            updateCustomSelectUI();
            return;
        }
        if (isLoadingReasons) return;

        if (customSelectText) customSelectText.textContent = 'Загрузка...';
        isLoadingReasons = true;

        try {
            const reasons = await window.api.getTicketReasons();
            allTicketReasons = reasons;

            if (closeReasonSelect) {
                closeReasonSelect.innerHTML = '<option value="">Выберите причину</option>';
                reasons.forEach(r => {
                    const opt = document.createElement('option');
                    opt.value = r.value;
                    opt.textContent = r.text;
                    closeReasonSelect.appendChild(opt);
                });
            }

            reasonsLoaded = true;
            updateCustomSelectUI();
        } catch (e) {
            console.error('Ошибка загрузки причин:', e);
            if (customSelectText) customSelectText.textContent = 'Ошибка загрузки';
        } finally {
            isLoadingReasons = false;
        }
    }
    if (closeAfterCreateCheckbox) {
        closeAfterCreateCheckbox.addEventListener('change', async () => {
            const isChecked = closeAfterCreateCheckbox.checked;
            if (isChecked) {
                closeOptionsDiv.classList.remove('hidden');
                await ensureReasonsLoaded();
            } else {
                closeOptionsDiv.classList.add('hidden');
            }
            saveDraft();
        });
    }

    if (customSelectTrigger) {
        customSelectTrigger.addEventListener('click', (e) => {
            e.stopPropagation();
            if (!reasonsLoaded) {
                ensureReasonsLoaded().then(() => toggleCustomDropdown(true));
            } else {
                toggleCustomDropdown();
            }
        });
    }

    if (customSelectSearch) {
        customSelectSearch.addEventListener('input', (e) => {
            const term = e.target.value.toLowerCase();
            const filtered = allTicketReasons.filter(r => r.text.toLowerCase().includes(term));
            renderCustomOptions(filtered);
        });
        customSelectSearch.addEventListener('click', e => e.stopPropagation());
    }

    document.addEventListener('click', (e) => {
        if (customSelectContainer && !customSelectContainer.contains(e.target)) {
            toggleCustomDropdown(false);
        }
    });

    if (closeReasonSelect) {
        closeReasonSelect.addEventListener('change', saveDraft);
    }
    if (closeCommentInput) {
        closeCommentInput.addEventListener('input', saveDraft);
    }
    if (closeTimeInput) {
        closeTimeInput.addEventListener('input', saveDraft);
    }
});
