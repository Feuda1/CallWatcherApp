// Модуль работы с клиентами (поиск, выбор, отображение)

const clients = {
    clientSearch: null,
    clientList: null,
    suggestionsList: null,
    suggestionsSection: null,
    searchSection: null,
    noSuggestions: null,

    selectedClientId: null,
    selectedClientObject: null,
    searchTimeout: null,

    // Callbacks
    onClientSelected: null,

    init(onClientSelectedCallback) {
        this.onClientSelected = onClientSelectedCallback;

        this.clientSearch = document.getElementById('client-search');
        this.clientList = document.getElementById('client-list');
        this.suggestionsList = document.getElementById('suggestions-list');
        this.suggestionsSection = document.getElementById('suggestions-section');
        this.searchSection = document.getElementById('search-section');
        this.noSuggestions = document.getElementById('no-suggestions');

        this.setupEventListeners();
    },

    setupEventListeners() {
        if (this.clientSearch) {
            this.clientSearch.addEventListener('input', () => {
                clearTimeout(this.searchTimeout);
                const query = this.clientSearch.value.trim();

                if (query.length < 2) {
                    this.toggleSearchMode(false);
                    this.clientList.innerHTML = '';
                    return;
                }

                this.toggleSearchMode(true);
                this.clientList.innerHTML = '<li class="client-item hint">Поиск...</li>';

                this.searchTimeout = setTimeout(() => this.search(query), 300);
            });
        }
    },

    toggleSearchMode(isSearching) {
        if (isSearching) {
            this.suggestionsSection?.classList.add('hidden');
            this.searchSection?.classList.remove('hidden');
        } else {
            this.suggestionsSection?.classList.remove('hidden');
            this.searchSection?.classList.add('hidden');
        }
    },

    async search(query) {
        try {
            const result = await window.api.searchClients(query);
            if (result && result.length > 0) {
                this.renderGroupedClients(result, this.clientList);
            } else {
                this.clientList.innerHTML = '<li class="client-item hint">Ничего не найдено</li>';
            }
        } catch (err) {
            console.error('Ошибка поиска:', err);
            this.clientList.innerHTML = '<li class="client-item hint">Ошибка поиска</li>';
        }
    },

    createClientItem(client) {
        const item = document.createElement('li');
        item.className = 'client-item';
        item.dataset.id = client.Id || client.id;

        let displayName = client._displayName || '';
        let displayMeta = client._displayMeta || '';

        if (!displayName) {
            const firstName = client.FirsName || client.firstName || '';
            const lastName = client.LastName || client.lastName || '';
            const org = client.Organization || client.organization || '';
            displayName = [firstName, lastName].filter(Boolean).join(' ') || org || client._originalName || 'Без имени';
        }

        if (!displayMeta) {
            const org = client.Organization || client.organization || '';
            const mail = client.Mail || client.mail || '';
            displayMeta = [org, mail].filter(Boolean).join(' • ');
        }

        item.innerHTML = `
            <span class="client-name">${this.escapeHtml(displayName)}</span>
            ${displayMeta ? `<span class="client-meta">${this.escapeHtml(displayMeta)}</span>` : ''}
        `;

        item.addEventListener('click', () => {
            this.select(client, item);
        });

        return item;
    },

    renderGroupedClients(clients, container) {
        container.innerHTML = '';

        const groups = {};
        const other = [];

        clients.forEach(client => {
            const org = client.Organization || client.organization || '';
            if (org) {
                if (!groups[org]) groups[org] = [];
                groups[org].push(client);
            } else {
                other.push(client);
            }
        });

        const sortedOrgs = Object.keys(groups).sort((a, b) =>
            groups[b].length - groups[a].length
        );

        sortedOrgs.forEach(org => {
            const groupEl = document.createElement('li');
            groupEl.className = 'client-group';

            const header = document.createElement('div');
            header.className = 'group-header';
            header.innerHTML = `
                <span class="group-name">${this.escapeHtml(org)}</span>
                <span class="group-count">${groups[org].length}</span>
            `;
            groupEl.appendChild(header);

            const list = document.createElement('ul');
            list.className = 'group-list';
            groups[org].forEach(client => {
                list.appendChild(this.createClientItem(client));
            });
            groupEl.appendChild(list);

            header.addEventListener('click', () => {
                groupEl.classList.toggle('collapsed');
            });

            container.appendChild(groupEl);
        });

        if (other.length > 0) {
            other.forEach(client => {
                container.appendChild(this.createClientItem(client));
            });
        }
    },

    renderSuggestions(suggestions) {
        if (!this.suggestionsList) return;

        this.suggestionsList.innerHTML = '';

        if (!suggestions || suggestions.length === 0) {
            if (this.noSuggestions) this.noSuggestions.classList.remove('hidden');
            return;
        }

        if (this.noSuggestions) this.noSuggestions.classList.add('hidden');

        suggestions.forEach(s => {
            const item = this.createClientItem(s);
            this.suggestionsList.appendChild(item);
        });
    },

    select(client, element) {
        this.selectedClientId = client.Id || client.id;
        this.selectedClientObject = client;

        // Убираем выделение со всех
        document.querySelectorAll('.client-item.selected').forEach(el => {
            el.classList.remove('selected');
        });

        // Выделяем текущий
        if (element) {
            element.classList.add('selected');
        }

        if (this.onClientSelected) {
            this.onClientSelected(this.selectedClientId, this.selectedClientObject);
        }
    },

    highlightSelected(id) {
        document.querySelectorAll('.client-item').forEach(el => {
            if (el.dataset.id === String(id)) {
                el.classList.add('selected');
            } else {
                el.classList.remove('selected');
            }
        });
    },

    getSelectedId() {
        return this.selectedClientId;
    },

    getSelectedObject() {
        return this.selectedClientObject;
    },

    setSelected(id, obj) {
        this.selectedClientId = id;
        this.selectedClientObject = obj;
    },

    clear() {
        this.selectedClientId = null;
        this.selectedClientObject = null;
        if (this.clientSearch) this.clientSearch.value = '';
        if (this.clientList) this.clientList.innerHTML = '';
        this.toggleSearchMode(false);
    },

    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
};

window.clientsModule = clients;
