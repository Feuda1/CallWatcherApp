// Модуль DatePicker для выбора дат

const datePicker = {
    btnDatePicker: null,
    datePickerDropdown: null,
    datePickerList: null,
    datePickerLabel: null,
    btnClearDate: null,

    // Ссылка на модуль фильтров
    filtersModule: null,

    init(filtersModuleRef) {
        this.filtersModule = filtersModuleRef;

        this.btnDatePicker = document.getElementById('btn-date-picker');
        this.datePickerDropdown = document.getElementById('date-picker-dropdown');
        this.datePickerList = document.getElementById('date-picker-list');
        this.datePickerLabel = document.getElementById('date-picker-label');
        this.btnClearDate = document.getElementById('btn-clear-date');

        this.setupEventListeners();
    },

    setupEventListeners() {
        this.btnDatePicker?.addEventListener('click', (e) => {
            e.stopPropagation();
            const isOpen = !this.datePickerDropdown?.classList.contains('hidden');

            if (!isOpen) {
                this.renderDateList();
                this.datePickerDropdown?.classList.remove('hidden');
            } else {
                this.datePickerDropdown?.classList.add('hidden');
            }
        });

        document.addEventListener('click', (e) => {
            if (this.datePickerDropdown && !this.datePickerDropdown.classList.contains('hidden')) {
                if (!e.target.closest('.date-picker-wrapper')) {
                    this.datePickerDropdown.classList.add('hidden');
                }
            }
        });

        this.btnClearDate?.addEventListener('click', () => {
            this.filtersModule?.clearDateFilter();
            this.updateLabel();
            this.renderDateList();
        });
    },

    updateLabel() {
        if (!this.datePickerLabel || !this.filtersModule) return;

        const selectedDates = this.filtersModule.selectedDates;

        if (selectedDates.size === 0) {
            this.datePickerLabel.textContent = 'Все даты';
            this.btnDatePicker?.classList.remove('active');
        } else if (selectedDates.size === 1) {
            this.datePickerLabel.textContent = [...selectedDates][0];
            this.btnDatePicker?.classList.add('active');
        } else {
            this.datePickerLabel.textContent = `${selectedDates.size} дат`;
            this.btnDatePicker?.classList.add('active');
        }
    },

    renderDateList() {
        if (!this.datePickerList || !this.filtersModule) return;

        const dates = this.filtersModule.getAvailableDates();
        const selectedDates = this.filtersModule.selectedDates;

        this.datePickerList.innerHTML = '';

        if (dates.length === 0) {
            this.datePickerList.innerHTML = '<div style="padding: 1rem; color: #64748b; text-align: center;">Нет звонков</div>';
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
                this.filtersModule.toggleDate(date);
                this.updateLabel();
                this.renderDateList();
            });
            this.datePickerList.appendChild(item);
        });
    }
};

window.datePickerModule = datePicker;
