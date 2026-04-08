// ============================================================
// main.js  – נקודת הכניסה הראשית של הקליינט
// אחראי רק על: אתחול מפה, polling, חיבור ui.js ↔ map.js
// לוגיקה → ui.js / map.js
// ============================================================

// ============================================================
// State גלובלי של הקליינט
// ============================================================

let cityToRegionMap = {};

// זמן עדכון אחרון לכל סוג אירוע – מניעת ניגון כפול בין פולינגים
const latestEventTime = { alert: 0, early: 0, clear: 0 };

const alertListContainer = document.getElementById('alert-list');

// ============================================================
// טעינת מיפוי ערים → אזורים מהשרת
// ============================================================

fetch('http://localhost:3000/api/cities')
    .then(r => r.json())
    .then(data => { cityToRegionMap = data; })
    .catch(e => console.warn('[main] שגיאה בטעינת ערים:', e));

function getRegion(city) { return cityToRegionMap[city] || null; }

// ============================================================
// לולאת עדכון ראשית (כל שנייה)
// ============================================================

async function updateUI() {
    try {
        const res  = await fetch('http://localhost:3000/api/state');
        const data = await res.json();

        const history            = data.history        || [];
        const serverActiveCities = data.activeMapCities || {};

        // --- בדיקה אם יש אירוע חדש (לסימון הבאדג' + ניגון צליל) ---
        let newAlertDetected = false;
        history.forEach(event => {
            const t = event.lastUpdateTime;
            if (!t || t <= latestEventTime[event.type]) return;

            latestEventTime[event.type] = t;

            if (event.type === 'alert') {
                newAlertDetected = true;
                if (typeof window.triggerSoundAlert === 'function') {
                    const cities = (event.text || '').split(',').map(c => c.trim()).filter(Boolean);
                    window.triggerSoundAlert('alert', cities);
                }
            } else if (event.type === 'early') {
                if (typeof window.triggerSoundAlert === 'function') {
                    const cities = (event.text || '').split(',').map(c => c.trim()).filter(Boolean);
                    window.triggerSoundAlert('early', cities);
                }
            } else if (event.type === 'clear') {
                if (typeof window.triggerSoundAlert === 'function') {
                    window.triggerSoundAlert('clear', event.cities || []);
                }
            }
        });

        if (newAlertDetected) {
            syncAllGlows(); // מ-map.js
            if (isPanelHidden) {
                const badge = document.getElementById('fab-badge');
                if (badge) badge.classList.add('active');
            }
        }

        // --- עדכון המפה ---
        updateMapFromServer(serverActiveCities, new Set(Object.keys(serverActiveCities))); // מ-map.js

        // --- עדכון הפאנל ---
        const merged = mergeHistoryForDisplay(history);           // מ-ui.js
        renderAlertList(alertListContainer, merged, getRegion);   // מ-ui.js

    } catch (e) {
        console.error('[main] שגיאה ב-updateUI:', e);
    }
}

// ============================================================
// הפעלה
// ============================================================

setInterval(updateUI, 1000);
updateUI();
