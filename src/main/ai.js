const settings = require('./settings');
const FormData = require('form-data');
const fetch = require('node-fetch');
const { HttpsProxyAgent } = require('https-proxy-agent');

function getProxyAgent() {
    let proxyUrl = settings.getSetting('proxy_url');
    if (proxyUrl) {
        if (!proxyUrl.startsWith('http://') && !proxyUrl.startsWith('https://')) {
            proxyUrl = 'http://' + proxyUrl;
        }
        return new HttpsProxyAgent(proxyUrl);
    }

    const systemProxy = process.env.HTTPS_PROXY || process.env.https_proxy ||
        process.env.HTTP_PROXY || process.env.http_proxy;
    if (systemProxy) {
        return new HttpsProxyAgent(systemProxy);
    }

    return undefined;
}

async function transcribeAudio(audioBuffer) {
    const apiKey = settings.getApiKey('openai');
    if (!apiKey) {
        throw new Error('API ключ Whisper не настроен');
    }

    const formData = new FormData();
    formData.append('file', audioBuffer, {
        filename: 'audio.mp3',
        contentType: 'audio/mpeg'
    });
    formData.append('model', 'whisper-1');
    formData.append('language', 'ru');
    formData.append('response_format', 'text');

    const fetchOptions = {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${apiKey}`,
            ...formData.getHeaders()
        },
        body: formData
    };

    const agent = getProxyAgent();
    if (agent) {
        console.log('[CallWatcher] Whisper: используется прокси');
        fetchOptions.agent = agent;
    }

    const response = await fetch('https://api.openai.com/v1/audio/transcriptions', fetchOptions);

    if (!response.ok) {
        const error = await response.text();
        console.error('[CallWatcher] Whisper error:', error);
        throw new Error(`Whisper API: ${response.status}`);
    }

    return (await response.text()).trim();
}

async function generateTicketData(transcript, reasons = []) {
    const apiKey = settings.getApiKey('deepseek');
    if (!apiKey) {
        console.log('[CallWatcher] DeepSeek не настроен, используем простую обработку');
        return {
            subject: 'Входящий звонок',
            description: transcript.substring(0, 300),
            closeComment: 'Консультация проведена'
        };
    }

    const reasonListString = (reasons && reasons.length > 0)
        ? "СПИСОК ДОСТУПНЫХ ПРИЧИН (выбери одну или НЕСКОЛЬКО, укажи их ID в массиве reasonIds):\n" + reasons.map(r => `- ID: "${r.id}", Название: "${r.name}"`).join('\n')
        : "Причины не заданы. Поле reasonIds оставь пустым массивом.";

    const systemPrompt = `Твоя задача — извлечь сухие факты из звонка для CRM и выбрать подходящие причины обращения.
    
${reasonListString}

ПРАВИЛА ВЫБОРА ПРИЧИН:
1. "1С" выбирай ТОЛЬКО если в разговоре явно упоминается "1С".
2. Если речь про кассу, работу на кассе, ошибки кассы -> выбирай причину, содержащую "iikoFront" или "консультации, настройка" (обычно "iikoFront (консультации, настройка)").
3. Если речь про настройки вне кассы, бэк-офис, склад, карты, меню -> выбирай причину, содержащую "iikoOffice" или "Айкоофис" (обычно "iikoOffice/Айкоофис (консультации, настройка)").
4. Если проблем несколько, выбирай НЕСКОЛЬКО причин.

ФОРМАТ ОТВЕТА (JSON):
{
  "subject": "Суть проблемы в 3-5 слов",
  "description": "Что случилось. Факты. Ошибки. Без вступлений.",
  "closeComment": "Только факты о выполненных действиях. Без 'успешно', 'вопрос решен'.",
  "reasonIds": ["ID_1", "ID_2"]   // Массив ID выбранных причин. Если ничего не подходит — пустой массив [].
}

ПРИМЕР:
{
  "subject": "Не работает касса и сканер",
  "description": "Ошибка ФН 234, сканер не читает штрихкоды.",
  "closeComment": "Перезапустил службу, переподключил сканер.",
  "reasonIds": ["kkt_error", "scanner_fix"]
}`;

    const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
            model: 'deepseek-chat',
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: `Транскрипт звонка:\n${transcript}` }
            ],
            temperature: 0.3,
            max_tokens: 500
        })
    });

    if (!response.ok) {
        const error = await response.text();
        console.error('[CallWatcher] DeepSeek error:', error);
        throw new Error(`DeepSeek API: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';

    try {
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);

            if (!parsed.reasonIds && parsed.reasonId) {
                parsed.reasonIds = [parsed.reasonId];
            }

            return parsed;
        }
    } catch (e) {
        console.error('[CallWatcher] Ошибка парсинга JSON:', e);
    }

    return {
        subject: 'Входящий звонок',
        description: transcript.substring(0, 300),
        closeComment: 'Консультация проведена',
        reasonIds: []
    };
}

async function processAudioForTicket(audioBuffer, reasons) {
    console.log('[CallWatcher] Начало транскрипции...');
    const transcript = await transcribeAudio(audioBuffer);
    console.log('[CallWatcher] Транскрипт получен, длина:', transcript.length);

    console.log('[CallWatcher] Генерация данных заявки...');
    const ticketData = await generateTicketData(transcript, reasons);
    console.log('[CallWatcher] Данные заявки готовы');

    return {
        transcript,
        ...ticketData
    };
}

module.exports = {
    transcribeAudio,
    generateTicketData,
    processAudioForTicket
};
