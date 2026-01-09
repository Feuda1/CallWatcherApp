// Модуль работы с тикетами (заявками)

const { app, session, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const state = require('./state');
const associations = require('./associations');

// Декодирование HTML-сущностей
function decodeHtmlEntities(text) {
    if (!text) return text;
    return text.replace(/&#x([0-9A-F]+);/gi, (match, hex) => String.fromCharCode(parseInt(hex, 16)))
        .replace(/&#(\d+);/g, (match, dec) => String.fromCharCode(parseInt(dec, 10)))
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'");
}

// Поиск клиентов
async function searchClients(query) {
    try {

        const ses = session.defaultSession;
        const url = `https://clients.denvic.ru/Tickets/GetClientByQuery?query=${encodeURIComponent(query)}`;
        const response = await ses.fetch(url);

        if (response.url.includes('Login') || !response.ok) {
            console.log('[CallWatcher] Поиск требует входа');
            return [];
        }

        const contentType = response.headers.get('content-type');
        if (!contentType || !contentType.includes('application/json')) {
            console.log('[CallWatcher] Поиск вернул не JSON');
            return [];
        }

        const clients = await response.json();

        return clients;
    } catch (error) {
        console.error('[CallWatcher] Ошибка поиска:', error);
        return [];
    }
}

// Создание заявки
async function createTicket({ callData, clientId, clientName, subject, description }) {
    try {

        const ses = session.defaultSession;

        let urlParams = callData.rawParams;
        if (!urlParams) {
            const params = new URLSearchParams();
            if (callData.phone) params.append('selectedPhoneNuber', callData.phone);
            if (callData.id) params.append('linkedId', callData.id);
            if (callData.date) params.append('selectedPhoneDate', callData.date);
            if (callData.duration) params.append('selectedPhoneDuration', callData.duration);
            urlParams = params.toString();

        }

        const pageUrl = `https://clients.denvic.ru/Tickets/Create?${urlParams}`;

        const pageResponse = await ses.fetch(pageUrl);

        if (!pageResponse.ok) {
            throw new Error(`Ошибка загрузки страницы: ${pageResponse.status}`);
        }

        const pageHtml = await pageResponse.text();

        if (pageHtml.includes('Login') && pageHtml.includes('Password')) {
            throw new Error('Требуется авторизация. Пожалуйста, войдите в систему.');
        }

        if (pageHtml.includes('невозможно создать') || pageHtml.includes('ограничен') ||
            pageHtml.includes('недоступн') || pageHtml.includes('error')) {
            const errorMatch = pageHtml.match(/<div[^>]*class="[^"]*alert[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
            const errorText = errorMatch ? errorMatch[1].replace(/<[^>]+>/g, '').trim() : '';

        }

        if (!pageHtml.includes('__RequestVerificationToken')) {
            console.warn('[CallWatcher] Не найден токен верификации, возможно форма недоступна');
        }

        const formParams = new URLSearchParams();

        const inputRegex = /<input[^>]*name="([^"]*)"[^>]*value="([^"]*)"/g;
        let inputMatch;
        while ((inputMatch = inputRegex.exec(pageHtml)) !== null) {
            const [, name, value] = inputMatch;
            if (name && !formParams.has(name)) {
                formParams.append(name, decodeHtmlEntities(value));
            }
        }

        const selectRegex = /<select[^>]*name="([^"]*)"[^>]*>([\s\S]*?)<\/select>/g;
        let selectMatch;
        while ((selectMatch = selectRegex.exec(pageHtml)) !== null) {
            const [, name, content] = selectMatch;
            if (name && !formParams.has(name)) {
                const optionRegex = /<option([^>]*)value="([^"]*)"([^>]*)>/g;
                let optMatch;
                let selectedValue = null;
                while ((optMatch = optionRegex.exec(content)) !== null) {
                    const [, beforeValue, value, afterValue] = optMatch;
                    const fullAttrs = beforeValue + afterValue;
                    const isSelected = fullAttrs.includes('selected');
                    const isDisabled = fullAttrs.includes('disabled');
                    if (isSelected && !isDisabled && value) {
                        selectedValue = value;
                        break;
                    }
                }
                if (selectedValue) {
                    formParams.append(name, decodeHtmlEntities(selectedValue));
                }
            }
        }

        formParams.set('selectedClientId', clientId);
        const rawSubject = subject || 'Входящий звонок';
        const decodedSubject = decodeHtmlEntities(rawSubject);

        formParams.set('newCaption', decodedSubject);



        const formattedDesc = (description || '').replace(/\n/g, '<br>');
        const htmlDesc = `<p>Входящий звонок: ${callData.phone || '?'}<br>Дата: ${callData.date}<br>Длительность: ${callData.duration} с.${formattedDesc ? `<br><br>${formattedDesc}` : ''}</p>`;
        formParams.set('newArticleText', htmlDesc);

        const createResponse = await ses.fetch('https://clients.denvic.ru/Tickets/Create', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: formParams.toString()
        });

        const contentType = createResponse.headers.get('content-type') || '';
        let result;

        if (contentType.includes('application/json')) {
            result = await createResponse.json();
        } else {
            const responseText = await createResponse.text();


            if (responseText.includes('/Tickets/Details/')) {
                const detailsMatch = responseText.match(/\/Tickets\/Details\/(\d+)/);
                if (detailsMatch) {
                    result = { IsValid: true, Redirect: true, Address: `/Tickets/Details/${detailsMatch[1]}` };
                } else {
                    result = { IsValid: false, Error: 'Не удалось определить результат создания' };
                }
            } else {
                const errorMatch = responseText.match(/<div[^>]*class="[^"]*alert[^"]*error[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
                const errorText = errorMatch ? errorMatch[1].replace(/<[^>]+>/g, '').trim() : 'Неизвестная ошибка сервера';
                result = { IsValid: false, Error: errorText };
            }
        }

        if (result.IsValid && callData.phone) {
            associations.setAssociation(callData.phone, clientId, clientName);
        }

        return result;
    } catch (error) {
        console.error('[CallWatcher] Ошибка создания заявки:', error);
        return { IsValid: false, Error: error.message };
    }
}

// Получение причин закрытия
async function getTicketReasons() {
    const cached = state.getCachedReasons();
    if (cached && cached.length > 0) {
        return cached;
    }

    try {

        const ses = session.defaultSession;

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000);

        const response = await ses.fetch('https://clients.denvic.ru/Tickets/Details/583867', {
            signal: controller.signal
        });
        clearTimeout(timeout);

        if (!response.ok) {
            throw new Error(`HTTP ошибка: ${response.status}`);
        }

        const html = await response.text();
        const reasons = [];

        const selectMatch = html.match(/<select[^>]*id="ticket_reason_select"[^>]*>([\s\S]*?)<\/select>/i) ||
            html.match(/<select[^>]*name="ticket\.TicketReason"[^>]*>([\s\S]*?)<\/select>/i) ||
            html.match(/<select[^>]*name="ticket\.ReasonId"[^>]*>([\s\S]*?)<\/select>/i);

        if (selectMatch) {
            const optionRegex = /<option[^>]*value="([^"]*)"[^>]*>([^<]*)<\/option>/g;
            let match;
            while ((match = optionRegex.exec(selectMatch[1])) !== null) {
                const [, value, text] = match;
                if (value && value.trim()) {
                    const cleanValue = value.trim();
                    const rawText = text ? text.trim() : cleanValue;
                    reasons.push({ value: decodeHtmlEntities(cleanValue), text: decodeHtmlEntities(rawText) });
                }
            }
        }

        if (reasons.length > 0) {

            state.setCachedReasons(reasons);
            return reasons;
        } else {
            throw new Error('Не удалось спарсить причины из HTML');
        }

    } catch (error) {
        console.warn(`[CallWatcher] Ошибка загрузки причин (${error.message}). Используем резервный список.`);
        state.setCachedReasons(state.FALLBACK_REASONS);
        return state.FALLBACK_REASONS;
    }
}

// Закрытие заявки
async function closeTicket(params) {
    try {
        let { ticketId, reasonId, reasonIds, comment, timeSpent } = params;
        console.log('[CallWatcher] Закрытие заявки:', ticketId);

        if (reasonIds && Array.isArray(reasonIds) && reasonIds.length > 0) {
            if (reasonIds.length === 1) {
                reasonId = reasonIds[0];
            } else {
                const reasonsList = state.getCachedReasons() || state.FALLBACK_REASONS;
                const selectedTexts = [];

                reasonIds.forEach(id => {
                    const r = reasonsList.find(x => x.value == id);
                    if (r) selectedTexts.push(typeof r.text === 'string' ? r.text : id);
                    else selectedTexts.push(id);
                });

                const namesStr = selectedTexts.join(', ');
                if (namesStr) {
                    const prefix = `[Причины: ${namesStr}]`;
                    comment = comment ? `${prefix}\n${comment}` : prefix;
                }
                reasonId = reasonIds[0];
            }
        }


        const ses = session.defaultSession;

        const pageUrl = `https://clients.denvic.ru/Tickets/Details/${ticketId}`;

        const pageResponse = await ses.fetch(pageUrl);

        if (!pageResponse.ok) {
            throw new Error(`Ошибка загрузки страницы заявки: ${pageResponse.status}`);
        }

        const pageHtml = await pageResponse.text();


        let token = null;
        const tokenTagMatch = pageHtml.match(/<input[^>]*__RequestVerificationToken[^>]*>/i);
        if (tokenTagMatch) {
            const valMatch = tokenTagMatch[0].match(/value="([^"]*)"/i);
            if (valMatch) token = valMatch[1];
        }

        if (!token) {
            throw new Error('Не найден токен верификации (__RequestVerificationToken)');
        }


        const formParams = new URLSearchParams();
        formParams.append('__RequestVerificationToken', token);
        formParams.append('ticket.StateId', '4');

        let reasonParamName = 'ticket.TicketReason';
        if (pageHtml.match(/name="ticket\.ReasonId"/)) {
            reasonParamName = 'ticket.ReasonId';
        }

        if (reasonIds && Array.isArray(reasonIds) && reasonIds.length > 0) {
            reasonIds.forEach(id => {
                formParams.append(reasonParamName, decodeHtmlEntities(id || ''));
            });
        } else {
            formParams.append(reasonParamName, decodeHtmlEntities(reasonId || ''));
        }

        formParams.append('newArticle.Body', `<p>${comment || 'Вопрос решён'}</p>`);
        formParams.append('newArticleTimeUnit', (timeSpent || 5).toString());
        formParams.append('newArticle.Internal', 'false');

        const inputGlobalRegex = /<input([^>]*)>/gi;
        let inputTagMatch;
        while ((inputTagMatch = inputGlobalRegex.exec(pageHtml)) !== null) {
            const tagContent = inputTagMatch[1];
            const nameMatch = tagContent.match(/name="([^"]*)"/i);
            const valMatch = tagContent.match(/value="([^"]*)"/i);

            if (nameMatch) {
                const name = nameMatch[1];
                const value = valMatch ? valMatch[1] : '';

                if (name && !formParams.has(name) && !name.includes('__RequestVerification')) {
                    formParams.append(name, decodeHtmlEntities(value));
                }
            }
        }

        const selectRegex = /<select[^>]*name="([^"]*)"[^>]*>([\s\S]*?)<\/select>/g;
        let selectMatch;
        while ((selectMatch = selectRegex.exec(pageHtml)) !== null) {
            const [, name, content] = selectMatch;



            if (name && !formParams.has(name) && name !== 'ticket.TicketReason') {
                const optionRegex = /<option([^>]*)value="([^"]*)"([^>]*)>/g;
                let optMatch;
                let selectedValue = null;
                while ((optMatch = optionRegex.exec(content)) !== null) {
                    const [, beforeValue, value, afterValue] = optMatch;
                    const fullAttrs = beforeValue + afterValue;

                    const isSelected = fullAttrs.includes('selected');
                    const isDisabled = fullAttrs.includes('disabled');
                    if (isSelected && !isDisabled && value) {
                        selectedValue = value;
                        break;
                    }
                }
                if (selectedValue) {
                    formParams.append(name, decodeHtmlEntities(selectedValue));
                }
            }
        }


        const saveResponse = await ses.fetch(`https://clients.denvic.ru/Tickets/Details/${ticketId}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: formParams.toString()
        });

        const saveHtml = await saveResponse.text();


        try {
            if (saveHtml.startsWith('{') && saveHtml.endsWith('}')) {
                const json = JSON.parse(saveHtml);
                if (typeof json.IsValid !== 'undefined' && !json.IsValid) {
                    console.error('[CallWatcher] Сервер вернул ошибку валидации:', json);
                    throw new Error(json.Error || 'Ошибка валидации (сервер не принял данные)');
                }
            }
        } catch (e) {
            if (e.message.includes('Ошибка валидации')) throw e;
        }

        if (saveHtml.includes('newArticleTimeUnit') || saveHtml.includes('Учет времени')) {


            const timeTokenMatch = saveHtml.match(/name="__RequestVerificationToken"[^>]*value="([^"]*)"/);
            const timeToken = timeTokenMatch ? timeTokenMatch[1] : token;

            const timeParams = new URLSearchParams();
            timeParams.append('__RequestVerificationToken', timeToken);
            timeParams.append('newArticleTimeUnit', String(timeSpent || 5));
            timeParams.append('ticketId', String(ticketId));

            const timeResponse = await ses.fetch(`https://clients.denvic.ru/Tickets/SaveTime/${ticketId}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: timeParams.toString()
            });


        }


        return { success: true };
    } catch (error) {
        console.error('[CallWatcher] Ошибка закрытия заявки:', error);
        return { success: false, error: error.message };
    }
}

// Открыть заявку в браузере
function openTicketInBrowser(callData, clientId) {
    if (!callData) {
        console.error('[CallWatcher] Нет данных звонка для открытия в браузере');
        return;
    }

    const params = new URLSearchParams();

    if (clientId) {
        params.append('id', clientId);
    }

    if (callData.phone) {
        params.append('selectedPhoneNuber', callData.phone);
    }

    if (callData.id) {
        params.append('linkedId', callData.id);
    }

    if (callData.date) {
        params.append('selectedPhoneDate', callData.date);
    }

    if (callData.duration) {
        params.append('selectedPhoneDuration', callData.duration);
    }

    const url = `https://clients.denvic.ru/Tickets/Create?${params.toString()}`;


    shell.openExternal(url);
}

module.exports = {
    decodeHtmlEntities,
    searchClients,
    createTicket,
    getTicketReasons,
    closeTicket,
    openTicketInBrowser
};
