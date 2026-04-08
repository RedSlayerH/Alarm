// ============================================================
// state.js  – כל ה-State של השרת במקום אחד
// alertsHistory, mapCircles, טיימרים – הכל כאן
// שאר המודולים רק מייבאים מכאן, לא מגדירים state בעצמם
// ============================================================

const { MAX_HISTORY_SIZE, MAX_HISTORY_AGE_MS } = require('./config');

// --- היסטוריית האזעקות (מה שמוצג בפאנל) ---
let alertsHistory = [];

// --- עיגולי/פוליגוני המפה הפעילים כרגע ---
// מבנה: { [cityName]: { type, category, timestamp } }
let mapCircles = {};

// --- מיפוי עיר → אזור (נטען מ-cities.json) ---
let cityToRegion = {};

// --- טיימרים פנימיים (לא חשוף ל-API) ---
// מופרדים לפי סוג כדי למנוע התנגשויות!
const earlyTimers  = {};   // התרעות מקדימות
const rocketTimers = {};   // רקטות וטילים
const droneTimers  = {};   // כטב"מים וטיסנים

// ============================================================
// פונקציות גישה ל-State
// ============================================================

function getHistory()     { return alertsHistory; }
function getMapCircles()  { return mapCircles; }
function getCityToRegion(){ return cityToRegion; }
function setCityToRegion(data) { cityToRegion = data; }

// ============================================================
// ניהול היסטוריה
// ============================================================

/**
 * מוסיף רשומה לראש ההיסטוריה ומנקה רשומות ישנות/עודפות
 */
function pushToHistory(event) {
    alertsHistory.unshift(event);
    pruneHistory();
}

/**
 * מנקה את ההיסטוריה: מסיר רשומות ישנות מ-24 שעות ומגביל גודל
 */
function pruneHistory() {
    const cutoff = Date.now() - MAX_HISTORY_AGE_MS;
    alertsHistory = alertsHistory
        .filter(e => (e.lastUpdateTime || e.timestamp) > cutoff)
        .slice(0, MAX_HISTORY_SIZE);
}

// ============================================================
// ניהול טיימרים – פונקציות עזר
// ============================================================

function clearEarlyTimer(city) {
    if (earlyTimers[city]) { clearTimeout(earlyTimers[city]); delete earlyTimers[city]; }
}
function clearRocketTimer(city) {
    if (rocketTimers[city]) { clearTimeout(rocketTimers[city]); delete rocketTimers[city]; }
}
function clearDroneTimer(city) {
    if (droneTimers[city]) { clearTimeout(droneTimers[city]); delete droneTimers[city]; }
}

/** מנקה את כל הטיימרים של עיר (למקרה של שחרור) */
function clearAllTimersForCity(city) {
    clearEarlyTimer(city);
    clearRocketTimer(city);
    clearDroneTimer(city);
}

function setEarlyTimer(city, ms, callback) {
    clearEarlyTimer(city);
    earlyTimers[city] = setTimeout(callback, ms);
}
function setRocketTimer(city, ms, callback) {
    clearRocketTimer(city);
    rocketTimers[city] = setTimeout(callback, ms);
}
function setDroneTimer(city, ms, callback) {
    clearDroneTimer(city);
    droneTimers[city] = setTimeout(callback, ms);
}

// ============================================================
// ניהול מעגלי המפה
// ============================================================

function setMapCircle(city, data) {
    mapCircles[city] = data;
}
function deleteMapCircle(city) {
    delete mapCircles[city];
}

module.exports = {
    getHistory,
    getMapCircles,
    getCityToRegion,
    setCityToRegion,
    pushToHistory,
    clearAllTimersForCity,
    setEarlyTimer,
    setRocketTimer,
    setDroneTimer,
    setMapCircle,
    deleteMapCircle,
};
