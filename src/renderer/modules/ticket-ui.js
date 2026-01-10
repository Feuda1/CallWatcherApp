

const ticketUI = {
    closeAfterCreateCheckbox: null,
    closeOptionsDiv: null,
    closeReasonSelect: null,
    closeCommentInput: null,
    closeTimeInput: null,
    btnCreate: null,
    ticketSubject: null,


    customSelectContainer: null,
    customSelectTrigger: null,
    customSelectText: null,
    customSelectDropdown: null,
    customSelectSearch: null,
    customSelectList: null,


    allTicketReasons: [],
    reasonsLoaded: false,
    isLoadingReasons: false,
    selectedReasonIds: new Set(),


    onValidationChange: null,
    getSelectedClientId: null,

    init(getSelectedClientIdCallback, onValidationChangeCallback) {
        this.getSelectedClientId = getSelectedClientIdCallback;
        this.onValidationChange = onValidationChangeCallback;

        this.closeAfterCreateCheckbox = document.getElementById('close-after-create');
        this.closeOptionsDiv = document.getElementById('close-options');
        this.closeReasonSelect = document.getElementById('close-reason');
        this.closeCommentInput = document.getElementById('close-comment');
        this.closeTimeInput = document.getElementById('close-time');
        this.btnCreate = document.getElementById('btn-create');
        this.ticketSubject = document.getElementById('ticket-subject');

        this.customSelectContainer = document.getElementById('close-reason-custom-container');
        this.customSelectTrigger = document.getElementById('close-reason-display');
        this.customSelectText = document.getElementById('close-reason-text');
        this.customSelectDropdown = document.getElementById('close-reason-dropdown');
        this.customSelectSearch = document.getElementById('close-reason-search');
        this.customSelectList = document.getElementById('close-reason-list');

        this.setupEventListeners();
    },

    setupEventListeners() {
        if (this.closeAfterCreateCheckbox) {
            this.closeAfterCreateCheckbox.addEventListener('change', () => {
                this.validate();
                this.handleCheckboxChange();
            });
        }

        if (this.closeCommentInput) {
            this.closeCommentInput.addEventListener('input', () => this.validate());
        }

        if (this.ticketSubject) {
            this.ticketSubject.addEventListener('input', () => this.validate());
        }


        this.customSelectTrigger?.addEventListener('click', () => {
            this.toggleDropdown();
        });


        this.customSelectSearch?.addEventListener('input', () => {
            this.renderOptions(this.allTicketReasons);
        });


        document.addEventListener('click', (e) => {
            if (this.customSelectContainer && !this.customSelectContainer.contains(e.target)) {
                this.toggleDropdown(false);
            }
        });

        if (this.closeReasonSelect) {
            this.closeReasonSelect.addEventListener('change', () => {

            });
        }
    },

    async handleCheckboxChange() {
        const isChecked = this.closeAfterCreateCheckbox?.checked;
        if (isChecked) {
            this.closeOptionsDiv?.classList.remove('hidden');
            await this.ensureReasonsLoaded();
        } else {
            this.closeOptionsDiv?.classList.add('hidden');
        }
    },

    validate() {
        if (!this.btnCreate) return;

        const selectedClientId = this.getSelectedClientId ? this.getSelectedClientId() : null;

        if (!selectedClientId) {
            this.btnCreate.disabled = true;
            this.btnCreate.title = 'Выберите клиента';
            return;
        }

        const subject = this.ticketSubject ? this.ticketSubject.value.trim() : '';
        if (!subject) {
            this.btnCreate.disabled = true;
            this.btnCreate.title = 'Укажите тему обращения';
            return;
        }

        if (this.closeAfterCreateCheckbox && this.closeAfterCreateCheckbox.checked) {
            if (this.selectedReasonIds.size === 0) {
                this.btnCreate.disabled = true;
                this.btnCreate.title = 'Выберите причину закрытия';
                return;
            }
            const comment = this.closeCommentInput ? this.closeCommentInput.value.trim() : '';
            if (!comment) {
                this.btnCreate.disabled = true;
                this.btnCreate.title = 'Напишите комментарий закрытия';
                return;
            }
        }

        this.btnCreate.disabled = false;
        this.btnCreate.title = '';

        if (this.onValidationChange) {
            this.onValidationChange(true);
        }
    },

    async ensureReasonsLoaded() {
        if (this.reasonsLoaded || this.isLoadingReasons) return;

        this.isLoadingReasons = true;
        try {
            const reasons = await window.api.getTicketReasons();
            this.allTicketReasons = reasons || [];
            this.reasonsLoaded = true;
            this.renderOptions(this.allTicketReasons);
        } catch (e) {
            console.error('Ошибка загрузки причин:', e);
        } finally {
            this.isLoadingReasons = false;
        }
    },

    updateCustomSelectUI() {
        if (!this.customSelectText) return;

        if (this.selectedReasonIds.size === 0) {
            this.customSelectText.textContent = 'Выберите причину';
        } else if (this.selectedReasonIds.size === 1) {
            const id = [...this.selectedReasonIds][0];
            const reason = this.allTicketReasons.find(r => r.value === id);
            this.customSelectText.textContent = reason ? reason.text : id;
        } else {
            this.customSelectText.textContent = `Выбрано: ${this.selectedReasonIds.size}`;
        }
    },

    toggleDropdown(force) {
        if (!this.customSelectDropdown) return;

        const shouldOpen = force !== undefined ? force : this.customSelectDropdown.classList.contains('hidden');

        if (shouldOpen) {
            this.customSelectDropdown.classList.remove('hidden');


            const rect = this.customSelectContainer.getBoundingClientRect();
            const spaceBelow = window.innerHeight - rect.bottom;
            const spaceAbove = rect.top;

            if (spaceBelow < 250 && spaceAbove > spaceBelow) {
                this.customSelectDropdown.style.bottom = '100%';
                this.customSelectDropdown.style.top = 'auto';
                this.customSelectDropdown.style.maxHeight = Math.min(spaceAbove - 10, 300) + 'px';
            } else {
                this.customSelectDropdown.style.top = '100%';
                this.customSelectDropdown.style.bottom = 'auto';
                this.customSelectDropdown.style.maxHeight = Math.min(spaceBelow - 10, 300) + 'px';
            }
        } else {
            this.customSelectDropdown.classList.add('hidden');
        }
    },

    renderOptions(list) {
        if (!this.customSelectList) return;

        const searchQuery = this.customSelectSearch?.value?.toLowerCase() || '';
        const filtered = list.filter(r =>
            !searchQuery || r.text.toLowerCase().includes(searchQuery)
        );

        this.customSelectList.innerHTML = '';

        filtered.forEach(reason => {
            const isSelected = this.selectedReasonIds.has(reason.value);
            const option = document.createElement('div');
            option.className = 'option-item' + (isSelected ? ' selected' : '');
            option.innerHTML = `
                <div class="option-check">${isSelected ? '✓' : ''}</div>
                <span>${reason.text}</span>
            `;
            option.addEventListener('click', (e) => {
                e.stopPropagation();
                if (isSelected) {
                    this.selectedReasonIds.delete(reason.value);
                } else {
                    this.selectedReasonIds.add(reason.value);
                }
                this.renderOptions(list);
                this.updateCustomSelectUI();
                this.validate();
            });
            this.customSelectList.appendChild(option);
        });
    },

    getCloseData() {
        return {
            closeAfterCreate: this.closeAfterCreateCheckbox?.checked || false,
            reasonIds: [...this.selectedReasonIds],
            comment: this.closeCommentInput?.value || '',
            timeSpent: parseInt(this.closeTimeInput?.value) || 5
        };
    },

    setCloseData(data) {
        if (this.closeAfterCreateCheckbox && data.closeAfterCreate !== undefined) {
            this.closeAfterCreateCheckbox.checked = data.closeAfterCreate;
            if (data.closeAfterCreate) {
                this.closeOptionsDiv?.classList.remove('hidden');
            }
        }

        if (data.reasonIds) {
            this.selectedReasonIds = new Set(data.reasonIds);
            this.updateCustomSelectUI();
        }

        if (this.closeCommentInput && data.comment !== undefined) {
            this.closeCommentInput.value = data.comment;
        }

        if (this.closeTimeInput && data.timeSpent !== undefined) {
            this.closeTimeInput.value = data.timeSpent;
        }
    },

    reset() {
        this.selectedReasonIds.clear();
        if (this.closeAfterCreateCheckbox) this.closeAfterCreateCheckbox.checked = false;
        if (this.closeOptionsDiv) this.closeOptionsDiv.classList.add('hidden');
        if (this.closeCommentInput) this.closeCommentInput.value = '';
        if (this.closeTimeInput) this.closeTimeInput.value = '5';
        this.updateCustomSelectUI();
    }
};

window.ticketUIModule = ticketUI;
