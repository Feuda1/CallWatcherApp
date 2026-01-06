const debugEl = document.getElementById('debug');
function log(msg) {
    console.log('[Notification]', msg);
}

log('Script loaded');

if (!window.api) {
    log('ERROR: window.api is missing!');
    document.body.innerHTML += '<h2 style="color:red; background:white; padding:10px;">Ошибка API: Preload не загружен</h2>';
}

function updateUI(data) {
    log('Updating UI with: ' + JSON.stringify(data));
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
        log('Received null data');
    }
}


document.addEventListener('DOMContentLoaded', () => {
    log('DOM Ready');

    if (window.api) {
        window.api.onCallData((data) => {
            log('Event: call-data received');
            updateUI(data);
        });

        window.api.getCallData().then(data => {
            log('Promise: getCallData result');
            updateUI(data);
        }).catch(err => {
            log('Error getting call data: ' + err);
        });

        const btnFill = document.getElementById('btn-fill');
        if (btnFill) {
            btnFill.addEventListener('click', () => {
                log('Button: Fill clicked');
                window.api.fillTicket();
            });
        }

        const btnSkip = document.getElementById('btn-skip');
        if (btnSkip) {
            btnSkip.addEventListener('click', () => {
                log('Button: Skip clicked');
                window.api.skipCall();
                window.close();
            });
        }
    }
});
