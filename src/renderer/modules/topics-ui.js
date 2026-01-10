

const topicsUI = {
    ticketSubject: null,
    topicList: null,
    topicsContainer: null,
    topicsList: [],

    init() {
        this.ticketSubject = document.getElementById('ticket-subject');
        this.topicList = document.getElementById('topic-list');
        this.topicsContainer = document.querySelector('.topics-container');

        this.setupEventListeners();
        this.load();
    },

    setupEventListeners() {
        if (this.ticketSubject) {
            this.ticketSubject.addEventListener('input', () => {
                const query = this.ticketSubject.value.trim().toLowerCase();
                if (query.length > 0 && this.topicsList.length > 0) {
                    const filtered = this.topicsList.filter(t =>
                        t.toLowerCase().includes(query)
                    );
                    if (filtered.length > 0) {
                        this.show(filtered);
                    } else {
                        this.hide();
                    }
                } else {
                    this.hide();
                }
            });
        }

        document.addEventListener('click', (e) => {
            if (this.ticketSubject && this.topicsContainer) {
                if (!this.ticketSubject.contains(e.target) && !this.topicsContainer.contains(e.target)) {
                    this.hide();
                }
            }
        });
    },

    async load() {
        try {
            const topics = await window.api.getTopics();
            this.topicsList = topics || [];
        } catch (e) {
            console.error('Ошибка загрузки тем:', e);
        }
    },

    show(list) {
        if (!this.topicList || !this.topicsContainer) return;

        this.topicList.innerHTML = '';

        list.forEach(topic => {
            const item = document.createElement('li');
            item.textContent = topic;
            item.addEventListener('click', () => {
                if (this.ticketSubject) {
                    this.ticketSubject.value = topic;
                    this.hide();
                    this.ticketSubject.dispatchEvent(new Event('input', { bubbles: true }));
                }
            });
            this.topicList.appendChild(item);
        });

        this.topicsContainer.classList.remove('hidden');
    },

    hide() {
        if (this.topicsContainer) {
            this.topicsContainer.classList.add('hidden');
        }
    },

    async save(topic) {
        if (!topic || !topic.trim()) return false;

        const cleanTopic = topic.trim();
        if (!this.topicsList.includes(cleanTopic)) {
            await window.api.saveTopic(cleanTopic);
            this.topicsList.push(cleanTopic);
            return true;
        }
        return false;
    }
};

window.topicsUIModule = topicsUI;
