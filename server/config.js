// ============================================================
// config.js  – כל הקבועים והפרמטרים של השרת במקום אחד
// שינוי זמנים, URLs ופרמטרים – רק כאן!
// ============================================================
const path = require('path');

module.exports = {

    // --- כתובות ה-API של פיקוד העורף ---
    OREF_ALERTS_URL:  'https://www.oref.org.il/WarningMessages/alert/alerts.json',
    OREF_HISTORY_URL: 'https://www.oref.org.il/WarningMessages/History/AlertsHistory.json',

    // --- כותרות HTTP לבקשות לאורף (מחקות דפדפן) ---
    OREF_HEADERS: {
        'User-Agent':      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer':         'https://www.oref.org.il/12481-he/Pakar.aspx',
        'X-Requested-With':'XMLHttpRequest',
        'Content-Type':    'application/json'
    },

    // --- זמנים (מילישניות) ---
    POLL_INTERVAL_MS:        1000,          // כמה פעמים בשנייה נשאל את האורף
    GROUPING_TIME_WINDOW_MS: 4 * 60 * 1000, // חלון מיזוג אזעקות (4 דקות)
    CLEAR_MERGE_WINDOW_MS:   5 * 60 * 1000, // חלון מיזוג הודעות שחרור (5 דקות)
    EARLY_WARNING_TIMEOUT_MS:3 * 60 * 1000, // כמה זמן התרעה מקדימה נשארת על המפה (3 דקות)
    ROCKET_COOLDOWN_MS:     10 * 60 * 1000, // כמה זמן רקטה נשארת על המפה (10 דקות)
    DRONE_TIMEOUT_MS:       20 * 60 * 1000, // כמה זמן כטב"ם נשאר על המפה (20 דקות)
    MAX_HISTORY_AGE_MS:     24 * 60 * 60 * 1000, // מחיקת היסטוריה ישנה מ-24 שעות
    MAX_HISTORY_SIZE:        200,           // מקסימום רשומות בהיסטוריה (מניעת דליפת זיכרון)

    // --- קבצים ---
    CITIES_FILE: path.join(__dirname, 'cities.json'),

    // --- שרת ---
    PORT: 3000,
};
