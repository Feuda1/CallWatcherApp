

const audio = {
    callAudio: null,
    audioPlayBtn: null,
    audioProgress: null,
    audioTimeCurrent: null,
    audioTimeTotal: null,
    audioPlayerContainer: null,
    speedButtons: null,
    currentPlaybackRate: 1,
    lastAudioRequestId: 0,

    init() {
        this.callAudio = document.getElementById('call-audio');
        this.audioPlayBtn = document.getElementById('audio-play-btn');
        this.audioProgress = document.getElementById('audio-progress');
        this.audioTimeCurrent = document.getElementById('audio-time-current');
        this.audioTimeTotal = document.getElementById('audio-time-total');
        this.audioPlayerContainer = document.getElementById('audio-player-container');
        this.speedButtons = document.querySelectorAll('.btn-speed');

        this.setupEventListeners();
    },

    formatTime(seconds) {
        if (isNaN(seconds)) return '0:00';
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    },

    setupEventListeners() {

        this.audioDownloadBtn = document.getElementById('audio-download-btn');
        if (this.audioDownloadBtn) {
            this.audioDownloadBtn.addEventListener('click', async () => {
                if (!this.callAudio || !this.callAudio.dataset.originUrl) return;

                const url = this.callAudio.dataset.originUrl;
                const filename = this.callAudio.dataset.filename;

                this.audioDownloadBtn.disabled = true;
                this.audioDownloadBtn.classList.add('loading');
                const spinner = this.audioDownloadBtn.querySelector('.spinner-ring-small');
                if (spinner) spinner.classList.remove('hidden');

                try {
                    const result = await window.api.downloadAudio(url, filename);
                    if (result && result.success) {
                    } else {
                        console.error('Download failed:', result.error);
                        alert('Ошибка скачивания: ' + (result.error || 'Unknown error'));
                    }
                } catch (e) {
                    console.error('Download exception:', e);
                    alert('Ошибка скачивания: ' + e.message);
                } finally {
                    this.audioDownloadBtn.disabled = false;
                    this.audioDownloadBtn.classList.remove('loading');
                    if (spinner) spinner.classList.add('hidden');
                }
            });
        }

        if (this.audioPlayBtn && this.callAudio) {
            this.audioPlayBtn.addEventListener('click', () => {
                if (this.callAudio.paused) {
                    this.callAudio.play();
                } else {
                    this.callAudio.pause();
                }
            });

            this.callAudio.addEventListener('play', () => {
                this.audioPlayBtn.classList.add('playing');
            });
            this.callAudio.addEventListener('pause', () => {
                this.audioPlayBtn.classList.remove('playing');
            });
            this.callAudio.addEventListener('ended', () => {
                this.audioPlayBtn.classList.remove('playing');
            });

            this.callAudio.addEventListener('timeupdate', () => {
                if (this.callAudio.duration) {
                    const percent = (this.callAudio.currentTime / this.callAudio.duration) * 100;
                    this.audioProgress.value = percent;
                    this.audioTimeCurrent.textContent = this.formatTime(this.callAudio.currentTime);
                }
            });

            this.callAudio.addEventListener('loadedmetadata', () => {
                this.audioTimeTotal.textContent = this.formatTime(this.callAudio.duration);
                this.callAudio.playbackRate = this.currentPlaybackRate;
            });

            this.audioProgress.addEventListener('input', () => {
                if (this.callAudio.duration) {
                    this.callAudio.currentTime = (this.audioProgress.value / 100) * this.callAudio.duration;
                }
            });
        }

        if (this.speedButtons) {
            this.speedButtons.forEach(btn => {
                btn.addEventListener('click', () => {
                    const speed = parseFloat(btn.dataset.speed);
                    this.currentPlaybackRate = speed;
                    if (this.callAudio) {
                        this.callAudio.playbackRate = speed;
                    }
                    this.speedButtons.forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                });
            });
        }
    },

    async loadAudio(audioUrl, suggestedFilename) {
        if (!this.callAudio || !this.audioPlayerContainer) return;

        this.audioDownloadBtn = document.getElementById('audio-download-btn');

        if (!audioUrl) {
            this.hide();
            return;
        }

        this.audioPlayerContainer.classList.remove('hidden');

        const currentDatasetUrl = this.callAudio.dataset.originUrl;
        if (currentDatasetUrl === audioUrl) return;

        this.callAudio.dataset.originUrl = audioUrl;
        if (suggestedFilename) {
            this.callAudio.dataset.filename = suggestedFilename;
        }

        this.callAudio.pause();
        this.callAudio.src = '';
        this.audioPlayBtn?.classList.remove('playing');
        this.audioProgress.value = 0;
        this.audioTimeCurrent.textContent = '0:00';
        this.audioTimeTotal.textContent = '0:00';

        if (this.audioDownloadBtn) {
            this.audioDownloadBtn.disabled = true;
        }

        const playBtnWrapper = document.querySelector('.play-btn-wrapper');
        if (playBtnWrapper) playBtnWrapper.classList.add('loading');

        const currentRequestId = ++this.lastAudioRequestId;

        try {
            const result = await window.api.getAudio(audioUrl);

            if (currentRequestId !== this.lastAudioRequestId) {
                console.log('Игнорирование устаревшего аудио ответа', currentRequestId);
                return;
            }

            if (playBtnWrapper) playBtnWrapper.classList.remove('loading');

            if (result && result.error) {
                console.error('Аудио недоступно:', result.error);
                this.audioPlayerContainer.classList.add('audio-error');
                this.audioTimeTotal.textContent = 'Недоступно';
                this.audioPlayBtn.disabled = true;
                this.audioPlayBtn.title = `Запись недоступна: ${result.error}`;
                if (this.audioDownloadBtn) this.audioDownloadBtn.disabled = true;
                return;
            }

            if (result && result.length > 0) {
                this.audioPlayerContainer.classList.remove('audio-error');
                this.audioPlayBtn.disabled = false;
                this.audioPlayBtn.title = '';
                if (this.audioDownloadBtn) this.audioDownloadBtn.disabled = false;

                const blob = new Blob([result], { type: 'audio/mpeg' });
                this.callAudio.src = URL.createObjectURL(blob);
            } else {
                console.error('Аудио буфер пуст');
                this.audioTimeTotal.textContent = 'Ошибка';
                if (this.audioDownloadBtn) this.audioDownloadBtn.disabled = true;
            }
        } catch (err) {
            if (currentRequestId !== this.lastAudioRequestId) return;

            if (playBtnWrapper) playBtnWrapper.classList.remove('loading');
            console.error('Ошибка получения аудио:', err);
            this.audioTimeTotal.textContent = 'Ошибка';
            if (this.audioDownloadBtn) this.audioDownloadBtn.disabled = true;
        }
    },

    hide() {
        if (this.audioPlayerContainer) {
            this.audioPlayerContainer.classList.add('hidden');
        }
        if (this.callAudio) {
            this.callAudio.pause();
            this.callAudio.removeAttribute('src');
            this.callAudio.load();
        }
    },

    reset() {
        if (this.callAudio) {
            this.callAudio.dataset.originUrl = '';
        }
    }
};


window.audioModule = audio;
