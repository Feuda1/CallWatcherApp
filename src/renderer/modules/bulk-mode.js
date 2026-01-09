// Модуль режима массового просмотра звонков

const bulkMode = {
    bulkCalls: [],
    bulkIndex: 0,
    bulkStats: { total: 0, filled: 0, unfilled: 0 },
    bulkFirstLoad: true,

    // DOM элементы
    bulkStatsEl: null,
    bulkNavEl: null,
    bulkFilterEl: null,
    bulkPositionEl: null,
    statTotal: null,
    statFilled: null,
    statUnfilled: null,
    btnPrevCall: null,
    btnNextCall: null,
    btnFirstCall: null,
    btnLastCall: null,
    btnRefreshBulk: null,

    // Callbacks
    onShowCall: null,
    filtersModule: null,

    init(onShowCallCallback, filtersModuleRef) {
        this.onShowCall = onShowCallCallback;
        this.filtersModule = filtersModuleRef;

        this.bulkStatsEl = document.getElementById('bulk-stats');
        this.bulkNavEl = document.getElementById('bulk-nav');
        this.bulkFilterEl = document.getElementById('duration-filter-container');
        this.bulkPositionEl = document.getElementById('bulk-position');
        this.statTotal = document.getElementById('stat-total');
        this.statFilled = document.getElementById('stat-filled');
        this.statUnfilled = document.getElementById('stat-unfilled');
        this.btnPrevCall = document.getElementById('btn-prev-call');
        this.btnNextCall = document.getElementById('btn-next-call');
        this.btnFirstCall = document.getElementById('btn-first-call');
        this.btnLastCall = document.getElementById('btn-last-call');
        this.btnRefreshBulk = document.getElementById('btn-refresh-bulk');

        this.setupEventListeners();
    },

    setupEventListeners() {
        this.btnPrevCall?.addEventListener('click', () => {
            if (this.bulkIndex > 0) {
                this.bulkIndex--;
                this.showCurrentCall();
            }
        });

        this.btnNextCall?.addEventListener('click', () => {
            if (this.bulkIndex < this.bulkCalls.length - 1) {
                this.bulkIndex++;
                this.showCurrentCall();
            }
        });

        this.btnFirstCall?.addEventListener('click', () => {
            if (this.bulkCalls.length > 0) {
                this.bulkIndex = 0;
                this.showCurrentCall();
            }
        });

        this.btnLastCall?.addEventListener('click', () => {
            if (this.bulkCalls.length > 0) {
                this.bulkIndex = this.bulkCalls.length - 1;
                this.showCurrentCall();
            }
        });

        this.btnRefreshBulk?.addEventListener('click', async () => {
            this.btnRefreshBulk.classList.add('loading');
            await this.enter(true);
            this.btnRefreshBulk.classList.remove('loading');
        });

        // Подписка на прогресс загрузки
        if (window.api.onBulkProgress) {
            window.api.onBulkProgress((count) => {
                if (this.statTotal) this.statTotal.textContent = count;
            });
        }
    },

    showCurrentCall() {
        if (this.onShowCall && this.bulkCalls.length > 0) {
            this.onShowCall(this.bulkCalls[this.bulkIndex]);
            this.updatePosition();
        }
    },

    async enter(forceRefresh = false) {
        this.bulkStatsEl?.classList.remove('hidden');
        this.bulkNavEl?.classList.remove('hidden');
        this.bulkFilterEl?.classList.remove('hidden');

        const needsRefresh = forceRefresh || this.bulkFirstLoad;
        if (needsRefresh) {
            this.bulkFirstLoad = false;
        }

        if (needsRefresh || this.filtersModule.allBulkCalls.length === 0) {
            const allCalls = await window.api.getAllCalls(needsRefresh);
            const unfilledCalls = allCalls.filter(c => !c.hasTicket);
            this.filtersModule.setAllCalls(unfilledCalls);

            // Применяем фильтры
            this.bulkCalls = unfilledCalls.filter(c => {
                const dur = parseInt(c.duration) || 0;
                return dur >= this.filtersModule.getMinDuration();
            });
            this.bulkIndex = 0;
        }

        const stats = await window.api.getBulkStats();
        this.bulkStats = stats;
        this.updateStats();

        if (this.bulkCalls.length > 0) {
            this.showCurrentCall();
        } else {
            if (this.onShowCall) this.onShowCall(null);
        }
    },

    exit() {
        this.bulkStatsEl?.classList.add('hidden');
        this.bulkNavEl?.classList.add('hidden');
        this.bulkFilterEl?.classList.add('hidden');

        if (this.onShowCall) this.onShowCall(null);
    },

    updateStats() {
        if (this.statTotal) this.statTotal.textContent = this.bulkStats.total;
        if (this.statFilled) this.statFilled.textContent = this.bulkStats.filled;
        if (this.statUnfilled) this.statUnfilled.textContent = this.bulkStats.unfilled;
    },

    updatePosition() {
        if (this.bulkPositionEl) {
            this.bulkPositionEl.textContent = `${this.bulkIndex + 1} из ${this.bulkCalls.length}`;
        }

        if (this.btnPrevCall) this.btnPrevCall.disabled = this.bulkIndex <= 0;
        if (this.btnNextCall) this.btnNextCall.disabled = this.bulkIndex >= this.bulkCalls.length - 1;
        if (this.btnFirstCall) this.btnFirstCall.disabled = this.bulkIndex <= 0;
        if (this.btnLastCall) this.btnLastCall.disabled = this.bulkIndex >= this.bulkCalls.length - 1;
    },

    setCalls(calls) {
        this.bulkCalls = calls;
        this.bulkIndex = 0;
        this.updatePosition();
        if (calls.length > 0) {
            this.showCurrentCall();
        } else {
            if (this.onShowCall) this.onShowCall(null);
        }
    }
};

window.bulkModeModule = bulkMode;
