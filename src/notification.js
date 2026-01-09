const debugEl = document.getElementById('debug');
function log(msg) {
    console.log('[Notification]', msg);
}

log('Скрипт загружен');

if (!window.api) {
    log('ОШИБКА: window.api отсутствует!');
    document.body.innerHTML += '<h2 style="color:red; background:white; padding:10px;">Ошибка API: Preload не загружен</h2>';
}

function updateUI(data) {
    log('Обновление интерфейса: ' + JSON.stringify(data));
    if (data) {
        const phone = data.phone || 'Неизвестный';
        document.getElementById('phone').textContent = phone;
        document.getElementById('date').textContent = `Время: ${data.date || 'Неизвестно'}`;
        document.getElementById('duration').textContent = `Длительность: ${data.duration || '?'} сек`;


        const audioContainer = document.getElementById('audio-player-container');
        const audioEl = document.getElementById('call-audio');
        if (data.audioUrl && audioContainer && audioEl) {
            audioContainer.style.display = 'block';
            if (audioEl.dataset.originUrl !== data.audioUrl) {
                audioEl.dataset.originUrl = data.audioUrl;
                window.api.getAudio(data.audioUrl).then(buffer => {
                    if (buffer) {
                        const blob = new Blob([buffer], { type: 'audio/mpeg' });
                        audioEl.src = URL.createObjectURL(blob);
                    }
                });
            }
        } else if (audioContainer) {
            audioContainer.style.display = 'none';
        }
    } else {
        log('Получены пустые данные');
    }
}


document.addEventListener('DOMContentLoaded', () => {
    log('DOM готов');

    if (window.api) {
        window.api.onCallData((data) => {
            log('Событие: call-data получено');
            updateUI(data);
        });

        window.api.getCallData().then(data => {
            log('Промис: результат getCallData');
            updateUI(data);
        }).catch(err => {
            log('Ошибка получения данных звонка: ' + err);
        });

        const btnFill = document.getElementById('btn-fill');
        if (btnFill) {
            btnFill.addEventListener('click', () => {
                log('Кнопка: Заполнить нажата');
                window.api.fillTicket();
            });
        }

        const btnSkip = document.getElementById('btn-skip');
        if (btnSkip) {
            btnSkip.addEventListener('click', () => {
                log('Кнопка: Пропустить нажата');
                window.api.skipCall();
                window.close();
            });
        }
    }
});
