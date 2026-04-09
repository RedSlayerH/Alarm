// ============================================================
// orefPoller.js  – אחראי על polling מה-API של פיקוד העורף
// לא נוגע ב-state ישירות – מעביר הכל ל-alertProcessor
// ============================================================

const axios  = require('axios');
const https  = require('https');
const { OREF_ALERTS_URL, OREF_HISTORY_URL, OREF_HEADERS } = require('./config');
const { processAlert, processEarlyWarning, processClearEvent, processOfficialHistory, isEarlyWarningTitle, isClearTitle } = require('./alertProcessor');

const httpsAgent = new https.Agent({ keepAlive: true });

// מונע עיבוד אותה אזעקה פעמיים
let lastProcessedEventId = null;

// Last known real client IP (updated when clients poll /api/state)
let lastClientIP = null;

function setLastClientIP(ip) {
    if (ip && ip !== '::1' && ip !== '127.0.0.1') {
        lastClientIP = ip;
    }
}

// ============================================================
// Build headers – inject real client IP if available
// ============================================================

function buildHeaders(clientIP) {
    const ip = clientIP || lastClientIP;
    const headers = { ...OREF_HEADERS };
    if (ip) {
        headers['X-Forwarded-For'] = ip;
        headers['X-Real-IP']       = ip;
        headers['Client-IP']       = ip;
    }
    return headers;
}

// ============================================================
// טעינת היסטוריה ראשונית בהפעלת השרת
// ============================================================

async function fetchOfficialHistory() {
    try {
        const res = await axios.get(OREF_HISTORY_URL, { headers: buildHeaders(), httpsAgent });
        if (res.data && Array.isArray(res.data)) {
            processOfficialHistory(res.data);
            console.log(`[orefPoller] נטענו ${res.data.length} רשומות היסטוריה`);
        }
    } catch (err) {
        console.warn('[orefPoller] שגיאה בטעינת היסטוריה:', err.message);
    }
}

// ============================================================
// Polling – נשאל כל שנייה
// ============================================================

async function pollOref() {
    try {
        const res = await axios.get(OREF_ALERTS_URL, { headers: buildHeaders(), httpsAgent });

        let data = res.data;

        // נרמול: לפעמים מגיע string ריק במקום null
        if (typeof data === 'string') {
            data = data.trim() === '' ? null : JSON.parse(data.trim());
        }

        // אין אזעקה פעילה
        if (!data || !data.data || data.data.length === 0) return;

        // מניעת עיבוד כפול
        if (data.id === lastProcessedEventId) return;
        lastProcessedEventId = data.id;

        const cities = data.data.map(c => c.trim ? c.trim() : c);
        const title  = data.title || 'התרעת פיקוד העורף';

        console.log(`[orefPoller] אזעקה חדשה | ID: ${data.id} | כותרת: ${title} | ערים: ${cities.join(', ')}`);

        if (isEarlyWarningTitle(title)) {
            processEarlyWarning(cities);
        } else if (isClearTitle(title) || data.cat === '10') {
            processClearEvent(cities);
        } else {
            processAlert(cities, title);
        }

    } catch (err) {
        console.warn('[orefPoller] שגיאת polling:', err.message);
    }
}

// ============================================================
// Proxy – forwards oref requests with real client IP
// ============================================================

async function proxyOrefRequest(url, clientIP) {
    const res = await axios.get(url, {
        headers: buildHeaders(clientIP),
        httpsAgent,
        validateStatus: null,
    });
    return { status: res.status, data: res.data };
}

module.exports = { fetchOfficialHistory, pollOref, proxyOrefRequest, setLastClientIP };