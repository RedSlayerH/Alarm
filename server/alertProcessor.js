// ============================================================
// alertProcessor.js
// ============================================================

const {
    GROUPING_TIME_WINDOW_MS,
    CLEAR_MERGE_WINDOW_MS,
    EARLY_WARNING_TIMEOUT_MS,
    ROCKET_COOLDOWN_MS,
    DRONE_TIMEOUT_MS,
} = require('./config');

const state = require('./state');

// ============================================================
// סיווג סוג האיום
// ============================================================

function isEarlyWarningTitle(title = '') {
    return title.includes('צפויות להתקבל') || title.includes('התרעה מקדימה');
}
function isClearTitle(title = '') {
    return title.includes('הסתיים') || title.includes('חזרה לשגרה');
}

/**
 * קטגוריות: rocket | drone | terrorist | earthquake | tsunami | hazmat | early
 */
function getThreatCategory(title = '') {
    if (isEarlyWarningTitle(title))                                   return 'early';
    if (title.includes('טיס') || title.includes('כטב"ם'))            return 'drone';
    if (title.includes('מחבל') || title.includes('פיגוע'))           return 'terrorist';
    if (title.includes('רעידת אדמה') || title.includes('רעידה'))     return 'earthquake';
    if (title.includes('צונאמי'))                                     return 'tsunami';
    if (title.includes('חומרים מסוכנים') ||
        title.includes('רדיולוגי') ||
        title.includes('לא קונבנציונלי'))                            return 'hazmat';
    return 'rocket';
}

function getTimeoutForCategory(category) {
    const MAP = {
        drone:      DRONE_TIMEOUT_MS,
        terrorist:  30 * 60 * 1000,
        earthquake: 10 * 60 * 1000,
        tsunami:    30 * 60 * 1000,
        hazmat:     20 * 60 * 1000,
    };
    return MAP[category] || ROCKET_COOLDOWN_MS;
}

// ============================================================
// עזר
// ============================================================

function buildClearText(cities) {
    const unique = [...new Set(cities.map(c => c.trim()))].filter(Boolean);
    if (unique.length === 0) return 'האירוע הסתיים';
    if (unique.length <= 3) return unique.join(', ');
    const cityToRegion = state.getCityToRegion();
    const regions = [...new Set(unique.map(c => cityToRegion[c]).filter(Boolean))];
    return regions.length > 0 ? regions.join(', ') : unique.join(', ');
}

function makeId(prefix = '') {
    return `${prefix}${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

// ============================================================
// Clear
// ============================================================

function processClearEvent(cities) {
    const now = Date.now();
    const history = state.getHistory();
    const last = history[0];

    if (last && last.type === 'clear' && (now - last.timestamp) < CLEAR_MERGE_WINDOW_MS) {
        const combined = [...new Set([...(last.cities || []), ...cities])];
        if (combined.length === (last.cities || []).length) return;
        last.cities = combined;
        last.text = buildClearText(combined);
        last.lastUpdateTime = now;
    } else {
        state.pushToHistory({
            id: makeId('clear_'),
            type: 'clear',
            titles: ['עדכון פיקוד העורף - סיום אירוע'],
            text: buildClearText(cities),
            cities: [...cities],
            timestamp: now,
            lastUpdateTime: now,
        });
    }
    cities.forEach(city => {
        state.clearAllTimersForCity(city.trim());
        state.deleteMapCircle(city.trim());
    });
}

// ============================================================
// Early Warning
// ============================================================

function processEarlyWarning(cities) {
    const now = Date.now();
    const history = state.getHistory();
    const last = history[0];

    if (last && last.type === 'early' && (now - last.lastUpdateTime) < GROUPING_TIME_WINDOW_MS) {
        const combined = [...new Set([...(last.cities || []), ...cities])];
        last.cities = combined;
        last.text = combined.join(', ');
        last.lastUpdateTime = now;
    } else {
        state.pushToHistory({
            id: makeId('early_'),
            type: 'early',
            titles: ['מבזק פיקוד העורף - התרעה מקדימה'],
            text: cities.join(', '),
            cities: [...cities],
            timestamp: now,
            lastUpdateTime: now,
        });
    }

    cities.forEach(city => {
        const clean = city.trim();
        const current = state.getMapCircles()[clean];
        if (current && current.type !== 'early') return;
        state.setMapCircle(clean, { type: 'early', category: 'early', timestamp: now });
        state.setEarlyTimer(clean, EARLY_WARNING_TIMEOUT_MS, () => {
            const circle = state.getMapCircles()[clean];
            if (circle && circle.type === 'early') state.deleteMapCircle(clean);
        });
    });
}

// ============================================================
// Alert
// ============================================================

function processAlert(cities, title) {
    const now = Date.now();
    const category = getThreatCategory(title);
    const history = state.getHistory();
    const last = history[0];

    if (last && last.type === 'alert' && (now - last.lastUpdateTime) < GROUPING_TIME_WINDOW_MS) {
        if (!last.titles.includes(title)) last.titles.push(title);
        const combined = [...new Set([...last.text.split(',').map(c => c.trim()), ...cities])];
        last.text = combined.join(', ');
        last.lastUpdateTime = now;
    } else {
        state.pushToHistory({
            id: makeId('alert_'),
            type: 'alert',
            category,
            titles: [title],
            text: cities.join(', '),
            timestamp: now,
            lastUpdateTime: now,
        });
    }

    const timeoutMs = getTimeoutForCategory(category);

    cities.forEach(city => {
        const clean = city.trim();
        state.clearAllTimersForCity(clean);
        state.setMapCircle(clean, { type: title, category, timestamp: now });

        if (category === 'drone') {
            state.setDroneTimer(clean, timeoutMs, () => {
                const circle = state.getMapCircles()[clean];
                if (circle && circle.category === 'drone') {
                    state.deleteMapCircle(clean);
                    processClearEvent([clean]);
                }
            });
        } else {
            state.setRocketTimer(clean, timeoutMs, () => {
                const circle = state.getMapCircles()[clean];
                if (circle && circle.timestamp === now) state.deleteMapCircle(clean);
            });
        }
    });
}

// ============================================================
// Official History
// ============================================================

function processOfficialHistory(historyData) {
    if (!Array.isArray(historyData)) return;

    [...historyData].reverse().forEach(alert => {
        const alertTime = new Date(alert.alertDate).getTime();
        const title = alert.title || 'התרעת פיקוד העורף';
        const cities = alert.data.split(',').map(c => c.trim());
        const history = state.getHistory();

        if (isClearTitle(title)) {
            const last = history[0];
            if (last && last.type === 'clear' && (alertTime - last.timestamp) < CLEAR_MERGE_WINDOW_MS) {
                const combined = [...new Set([...(last.cities || []), ...cities])];
                last.cities = combined;
                last.text = buildClearText(combined);
                last.lastUpdateTime = alertTime;
            } else {
                state.pushToHistory({
                    id: makeId('hist_clear_'),
                    type: 'clear',
                    titles: [title],
                    text: buildClearText(cities),
                    cities: [...cities],
                    timestamp: alertTime,
                    lastUpdateTime: alertTime,
                });
            }
        } else {
            const category = getThreatCategory(title);
            const last = history[0];
            if (last && last.type === 'alert' && (alertTime - last.lastUpdateTime) < GROUPING_TIME_WINDOW_MS) {
                if (!last.titles.includes(title)) last.titles.push(title);
                const combined = [...new Set([...last.text.split(',').map(c => c.trim()), ...cities])];
                last.text = combined.join(', ');
                last.lastUpdateTime = alertTime;
            } else {
                state.pushToHistory({
                    id: makeId('hist_alert_'),
                    type: 'alert',
                    category,
                    titles: [title],
                    text: alert.data,
                    timestamp: alertTime,
                    lastUpdateTime: alertTime,
                });
            }
            cities.forEach(city => {
                state.setMapCircle(city, { type: title, category, timestamp: alertTime });
            });
        }
    });

    state.getHistory()
        .filter(e => e.type === 'clear')
        .forEach(clearEvent => {
            (clearEvent.cities || []).forEach(city => {
                const circle = state.getMapCircles()[city];
                if (circle && clearEvent.timestamp > circle.timestamp) state.deleteMapCircle(city);
            });
        });
}

module.exports = {
    processClearEvent,
    processEarlyWarning,
    processAlert,
    processOfficialHistory,
    isEarlyWarningTitle,
    isClearTitle,
    getThreatCategory,
};