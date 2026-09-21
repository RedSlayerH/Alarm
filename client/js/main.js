// ============================================================
// main.js  – נקודת הכניסה הראשית של הקליינט
// אחראי רק על: אתחול מפה, polling, חיבור ui.js ↔ map.js
// לוגיקה → ui.js / map.js
// ============================================================

// ============================================================
// State גלובלי של הקליינט
// ============================================================

let cityToRegionMap = {};

// מעקב אחר אירועים שכבר שמענו עליהם: id → { lastUpdateTime, knownCities Set }
const seenEvents = {};

const alertListContainer = document.getElementById('alert-list');

// ============================================================
// טעינת מיפוי ערים → אזורים מהשרת
// ============================================================

fetch(`${API_BASE}/api/cities`)
    .then(r => r.json())
    .then(data => { cityToRegionMap = data; })
    .catch(e => console.warn('[main] שגיאה בטעינת ערים:', e));

function normalizeQuotes(str) {
    return str
        .replace(/״/g, "'")    // Hebrew gershayim → single quote
        .replace(/׳/g, "'")    // Hebrew geresh → single quote
        .replace(/[""]/g, "'") // curly double quotes → single quote
        .replace(/"/g, "'")    // ASCII double quote → single quote
        .replace(/['']/g, "'") // curly single quotes → single quote
        .replace(/''/g, "'");  // double single quote → single quote
}

function getRegion(city) {
    if (!city) return null;
    if (cityToRegionMap[city]) return cityToRegionMap[city];
    const normalized = normalizeQuotes(city);
    if (cityToRegionMap[normalized]) return cityToRegionMap[normalized];
    for (const key of Object.keys(cityToRegionMap)) {
        if (normalizeQuotes(key) === normalized) return cityToRegionMap[key];
    }
    return null;
}

// ============================================================
// לולאת עדכון ראשית (כל שנייה)
// ============================================================

async function updateUI() {
    try {
        const res  = await fetch(`${API_BASE}/api/state`);
        const data = await res.json();

        const history            = data.history        || [];
        const serverActiveCities = data.activeMapCities || {};

        // --- בדיקה אם יש אירוע חדש (לסימון הבאדג' + ניגון צליל) ---
        let newAlertDetected = false;
        history.forEach(event => {
            const t   = event.lastUpdateTime;
            const id  = event.id;
            if (!t || !id) return;

            const seen = seenEvents[id];

            // ערים נוכחיות של האירוע
            const allCities = (event.type === 'clear')
                ? (event.cities || [])
                : (event.text || '').split(',').map(c => c.trim()).filter(Boolean);

            if (!seen) {
                // אירוע חדש לגמרי – כל הערים נחשבות "חדשות"
                seenEvents[id] = { lastUpdateTime: t, knownCities: new Set(allCities) };

                if (event.type === 'alert') {
                    newAlertDetected = true;
                    if (typeof window.triggerSoundAlert === 'function') {
                        window.triggerSoundAlert('alert', allCities);
                    }
                } else if (event.type === 'early') {
                    if (typeof window.triggerSoundAlert === 'function') {
                        window.triggerSoundAlert('early', allCities);
                    }
                } else if (event.type === 'clear') {
                    if (typeof window.triggerSoundAlert === 'function') {
                        window.triggerSoundAlert('clear', allCities);
                    }
                }

            } else if (t > seen.lastUpdateTime) {
                // אירוע קיים שעודכן – מצא רק ערים חדשות שלא היו קודם
                const newCities = allCities.filter(c => !seen.knownCities.has(c));

                // עדכן את הסט והזמן
                allCities.forEach(c => seen.knownCities.add(c));
                seen.lastUpdateTime = t;

                // נגן רק אם הצטרפו ערים חדשות שנמצאות ברשימה שלי
                if (newCities.length > 0) {
                    if (event.type === 'alert') {
                        newAlertDetected = true;
                        if (typeof window.triggerSoundAlert === 'function') {
                            window.triggerSoundAlert('alert', newCities);
                        }
                    } else if (event.type === 'early') {
                        if (typeof window.triggerSoundAlert === 'function') {
                            window.triggerSoundAlert('early', newCities);
                        }
                    } else if (event.type === 'clear') {
                        if (typeof window.triggerSoundAlert === 'function') {
                            window.triggerSoundAlert('clear', newCities);
                        }
                    }
                }
            }
        });

        if (newAlertDetected) {
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

// ============================================================
// Google OAuth helpers
// ============================================================

function loginWithGoogle() {
    window.location.href = `${API_BASE}/api/auth/google`;
}

// If redirected back from Google OAuth, read the cookie and log in
(function handleGoogleCallback() {
    const params = new URLSearchParams(window.location.search);
    if (params.get('auth') !== 'google') return;

    // Read the googleUser cookie set by the server
    const match = document.cookie.match(/(?:^|;\s*)googleUser=([^;]+)/);
    if (match) {
        const username = decodeURIComponent(match[1]);
        localStorage.setItem('currentUser', username);
        // Clean up cookie
        document.cookie = 'googleUser=; Max-Age=0; path=/';
    }

    // Read the googleAvatar cookie (only set for Google users)
    const avatarMatch = document.cookie.match(/(?:^|;\s*)googleAvatar=([^;]+)/);
    if (avatarMatch) {
        localStorage.setItem('currentAvatar', decodeURIComponent(avatarMatch[1]));
        document.cookie = 'googleAvatar=; Max-Age=0; path=/';
    }

    // Reload without ?auth=google so the page initializes with the correct user
    window.location.replace('/index.html');
})();