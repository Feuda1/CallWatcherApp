

const filters = {
    minDuration: 0,
    selectedDates: new Set(),
    allBulkCalls: [],
    bulkCalls: [],


    durationSlider: null,
    durationSliderInline: null,
    durationValueEl: null,
    durationValueInline: null,
    presetBtns: null,


    onFiltersChanged: null,

    init(onFiltersChangedCallback) {
        this.onFiltersChanged = onFiltersChangedCallback;

        this.durationSlider = document.getElementById('duration-slider');
        this.durationSliderInline = document.getElementById('duration-slider-inline');
        this.durationValueEl = document.getElementById('duration-value');
        this.durationValueInline = document.getElementById('duration-value-inline');
        this.presetBtns = document.querySelectorAll('.preset-btn');

        this.setupEventListeners();
    },

    setupEventListeners() {
        if (this.durationSlider) {
            this.durationSlider.addEventListener('input', (e) => {
                this.updateDuration(e.target.value);
            });
        }

        if (this.durationSliderInline) {
            this.durationSliderInline.addEventListener('input', (e) => {
                this.updateDuration(e.target.value, false);
            });
        }

        if (this.presetBtns) {
            this.presetBtns.forEach(btn => {
                btn.addEventListener('click', () => {
                    this.updateDuration(btn.dataset.value);
                });
            });
        }
    },

    updateDuration(value, syncToInline = true) {
        this.minDuration = parseInt(value);

        if (this.durationSlider) this.durationSlider.value = this.minDuration;
        if (this.durationValueEl) this.durationValueEl.textContent = this.minDuration + ' сек';

        if (syncToInline && this.durationSliderInline) this.durationSliderInline.value = this.minDuration;
        if (this.durationValueInline) this.durationValueInline.textContent = this.minDuration + 'с';

        if (this.presetBtns) {
            this.presetBtns.forEach(btn => {
                if (parseInt(btn.dataset.value) === this.minDuration) {
                    btn.classList.add('active');
                } else {
                    btn.classList.remove('active');
                }
            });
        }

        this.applyFilters();
    },

    parseCallDate(dateStr) {
        if (!dateStr) return null;
        const match = dateStr.match(/(\d{2})\.(\d{2})\.(\d{4})/);
        if (!match) return null;
        return { formatted: `${match[1]}.${match[2]}.${match[3]}` };
    },

    applyFilters() {
        this.bulkCalls = this.allBulkCalls.filter(c => {
            const dur = parseInt(c.duration) || 0;
            if (dur < this.minDuration) return false;

            if (this.selectedDates && this.selectedDates.size > 0) {
                const parsed = this.parseCallDate(c.date);
                if (!parsed || !this.selectedDates.has(parsed.formatted)) return false;
            }

            return true;
        });

        if (this.onFiltersChanged) {
            this.onFiltersChanged(this.bulkCalls);
        }
    },

    setAllCalls(calls) {
        this.allBulkCalls = calls;
    },

    getFilteredCalls() {
        return this.bulkCalls;
    },

    getMinDuration() {
        return this.minDuration;
    },


    toggleDate(date) {
        if (this.selectedDates.has(date)) {
            this.selectedDates.delete(date);
        } else {
            this.selectedDates.add(date);
        }
        this.applyFilters();
    },

    clearDateFilter() {
        this.selectedDates.clear();
        this.applyFilters();
    },

    getAvailableDates() {
        const dateCounts = {};
        this.allBulkCalls.forEach(call => {
            const parsed = this.parseCallDate(call.date);
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
};

window.filtersModule = filters;
