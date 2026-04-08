// ============================================================
// map.js  – כל מה שקשור למפה: פוליגונים, צבעים, אנימציות
// לא נוגע בפאנל / כרטיסיות – זה מופרד ב-ui.js
// ============================================================
// --- אתחול המפה חייב להיות פה למעלה! ---
const map = L.map('map', {
    zoomControl: false,
    minZoom: 7,
}).setView([31.5, 34.8], 8);

L.tileLayer('https://mt1.google.com/vt/lyrs=m&hl=iw&x={x}&y={y}&z={z}', {
    maxZoom: 20,
    noWrap: true,
    attribution: '© Google',
}).addTo(map);

setTimeout(() => map.invalidateSize(), 200);

let userHasInteracted = false;
let interactionTimer  = null;

// אחרי שהמפה נטענת (לשים בקובץ שמאתחל את map, או כאן)
map.on('dragstart zoomstart', () => {
    userHasInteracted = true;
    clearTimeout(interactionTimer);
    // אחרי 30 שניות של חוסר פעילות – חוזרים לאוטו-פן
    interactionTimer = setTimeout(() => { userHasInteracted = false; }, 30_000);
});

// חשיפה גלובלית – מאפשרת לקבצים אחרים (soundPanel וכו') לסמן שהמשתמש פעיל
function markMapUserInteraction() {
    userHasInteracted = true;
    clearTimeout(interactionTimer);
    interactionTimer = setTimeout(() => { userHasInteracted = false; }, 30_000);
}

// activeMapLayers: { [cityName]: { layer, type } }
const activeMapLayers = {};

// זמן שבו כל עיר קיבלה את האזעקה (לחישוב elapsed time)
const cityAlertTimes  = {};

let polygonsData = null;

// ============================================================
// טעינת נתוני פוליגונים
// ============================================================

fetch('area_to_polygon.json')
    .then(r => r.json())
    .then(d => { polygonsData = d; })
    .catch(e => console.warn('[map] שגיאה בטעינת פוליגונים:', e));

// ============================================================
// חישוב צבע + CSS class לפי סוג איום
// ============================================================

function getThreatStyle(type, category) {
    // category מגיע מהשרת (rocket/drone/terrorist/earthquake/tsunami/hazmat/early)
    // type הוא הטקסט המלא של הכותרת (fallback)
    const cat = category || (type === 'early' ? 'early'
        : (type.includes('טיס') || type.includes('כטב"ם')) ? 'drone'
        : 'rocket');

    const STYLES = {
        early:      { color: '#3a40e0', glowClass: 'glow-brown'  },
        drone:      { color: '#ff8c00', glowClass: 'glow-orange' },
        terrorist:  { color: '#7b1fa2', glowClass: 'glow-red'    },
        earthquake: { color: '#795548', glowClass: 'glow-red'    },
        tsunami:    { color: '#0277bd', glowClass: 'glow-red'    },
        hazmat:     { color: '#f57f17', glowClass: 'glow-orange' },
        rocket:     { color: '#ff0000', glowClass: 'glow-red'    },
    };
    return STYLES[cat] || STYLES.rocket;
}

// ============================================================
// ציור עיר על המפה
// ============================================================

function drawCityOnMap(city, threatType = 'רקטות', category = 'rocket') {
    // 1. אם נתוני הפוליגונים טרם נטענו מהקובץ, פשוט נחזור.
    // השרת במילא ינסה לצייר שוב בעוד שנייה ב-updateUI הבא.
    if (!polygonsData) return;

    // 2. אם הפוליגון כבר קיים על המפה – נבדוק רק שדרוג איום (ממקדימה לאמיתי)
    if (activeMapLayers[city]) {
        if (activeMapLayers[city] === 'loading') return;
        if (activeMapLayers[city].category === 'early' && category !== 'early') {
            activeMapLayers[city].type     = threatType;
            activeMapLayers[city].category = category;
            cityAlertTimes[city] = Date.now(); // מאפס שעון
        }
        return;
    }

    // 3. מציאת קואורדינטות הפוליגון
    const clean = city.trim();
    const coords = polygonsData[clean]
        || polygonsData[Object.keys(polygonsData).find(k =>
            k.replace(/-/g, ' ').replace(/\s+/g, ' ') ===
            clean.replace(/-/g, ' ').replace(/\s+/g, ' ')
        )];

    // אם אין פוליגון לעיר הזו בקובץ, אין מה לצייר
    if (!coords) return;

    // 4. ציור הפוליגון על המפה
    const { color, glowClass } = getThreatStyle(threatType, category);
    const alertTime   = cityAlertTimes[city] || Date.now();
    const elapsedMins = (Date.now() - alertTime) / 60000;

    const initialColor = (elapsedMins >= 5 && threatType !== 'early') ? '#888888' : color;
    const initialClass = elapsedMins < 2 ? glowClass : '';

    const layer = L.polygon(coords, {
        color:       initialColor,
        weight:      2,
        fillColor:   initialColor,
        fillOpacity: 0.4,
        className:   initialClass,
    }).addTo(map);

    activeMapLayers[city] = { layer, type: threatType, category };

    // 5. הקפצת המפה לאזור – רק אם המשתמש לא זז ורק אם האזעקה חדשה (עד 10 שניות)
    const isNewAlert = (Date.now() - (cityAlertTimes[city] || 0)) < 10_000;
    if (!userHasInteracted && isNewAlert) {
        map.stop();
        map.flyToBounds(layer.getBounds(), { maxZoom: 12, padding: [20, 20], duration: 1.5 });
    }
}

// ============================================================
// הסרת עיר מהמפה
// ============================================================

function removeCityFromMap(city) {
    const layerData = activeMapLayers[city];
    if (!layerData || layerData === 'loading') return;
    if (map.hasLayer(layerData.layer)) map.removeLayer(layerData.layer);
    delete activeMapLayers[city];
    delete cityAlertTimes[city];
}

// ============================================================
// סנכרון Glow (נקרא אחרי כל update)
// ============================================================

function syncAllGlows() {
    Object.keys(activeMapLayers).forEach(city => {
        const ld = activeMapLayers[city];
        if (ld === 'loading' || !ld.layer?.getElement) return;
        const el = ld.layer.getElement();
        if (!el) return;
        const { glowClass } = getThreatStyle(ld.type);
        el.classList.remove('glow-red', 'glow-orange', 'glow-brown');
        void el.offsetWidth;
        el.classList.add(glowClass);
    });
}

// ============================================================
// לולאת עדכון אנימציות (כל שנייה)
// ============================================================

// כל הקלאסים האפשריים של glow – לניקוי בטוח
const ALL_GLOW_CLASSES = ['glow-red', 'glow-orange', 'glow-brown'];

/**
 * מגדיר צבע לפוליגון ומוודא שהקלאס נשאר אחרי setStyle.
 * Leaflet מוחק className כשעושים setStyle — לכן מוסיפים אחרי.
 */
function applyPolygonStyle(layer, color, glowClass) {
    layer.setStyle({ color, fillColor: color, fillOpacity: 0.4 });
    const el = layer.getElement();
    if (!el) return;
    ALL_GLOW_CLASSES.forEach(c => el.classList.remove(c));
    if (glowClass) el.classList.add(glowClass);
}

setInterval(() => {
    const now = Date.now();

    Object.keys(activeMapLayers).forEach(city => {
        const ld = activeMapLayers[city];
        if (ld === 'loading' || !ld.layer?.setStyle) return;

        const { color, glowClass } = getThreatStyle(ld.type, ld.category);
        const alertTime   = cityAlertTimes[city] || now;
        const elapsedMins = (now - alertTime) / 60000;

        if (ld.category === 'early') {
            // התרעה מקדימה: תמיד פועמת, נעלמת אחרי 3 דקות
            applyPolygonStyle(ld.layer, color, glowClass);
            if (elapsedMins >= 3) removeCityFromMap(city);
        } else {
            if (elapsedMins < 2) {
                applyPolygonStyle(ld.layer, color, glowClass);   // פועם
            } else if (elapsedMins < 5) {
                applyPolygonStyle(ld.layer, color, null);        // צבע מלא, בלי glow
            } else if (elapsedMins < 11) {
                applyPolygonStyle(ld.layer, '#888888', null);    // אפור
            } else {
                // גיבוי: אם אחרי 11 דקות עדיין על המפה, מחק
                removeCityFromMap(city);
            }
        }
    });
}, 1000);

// ============================================================
// פין מפה – זום לעיר והצגת אייקון
// ============================================================

let cityPinMarker = null;
let cityPinTimer  = null;

// אייקון פין אדום בסגנון Google Maps
const cityPinIcon = L.divIcon({
    className: '',
    html: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 36" width="36" height="54">
        <path d="M12 0C5.373 0 0 5.373 0 12c0 9 12 24 12 24S24 21 24 12C24 5.373 18.627 0 12 0z"
              fill="#e53935" stroke="#b71c1c" stroke-width="1"/>
        <circle cx="12" cy="12" r="5" fill="white"/>
    </svg>`,
    iconSize:   [36, 54],
    iconAnchor: [18, 54],
    popupAnchor:[0, -54],
});

/**
 * מבצע זום לעיר ומציג פין אדום למשך 5 שניות.
 * עובד גם אם אין פוליגון פעיל – מחפש בנתוני הפוליגונים.
 */
function flyToCity(cityName) {
    if (!polygonsData) return;

    const clean = cityName.trim();
    const coords = polygonsData[clean]
        || polygonsData[Object.keys(polygonsData).find(k =>
            k.replace(/-/g, ' ').replace(/\s+/g, ' ') ===
            clean.replace(/-/g, ' ').replace(/\s+/g, ' ')
        )];

    if (!coords || coords.length === 0) return;

    // חישוב גבולות הפוליגון
    const bounds = L.polygon(coords).getBounds();
    const center = bounds.getCenter();

    // הסרת פין קודם
    if (cityPinMarker) { map.removeLayer(cityPinMarker); cityPinMarker = null; }
    clearTimeout(cityPinTimer);

    // זום לעיר
    userHasInteracted = true;
    clearTimeout(interactionTimer);
    interactionTimer = setTimeout(() => { userHasInteracted = false; }, 30_000);

    map.flyToBounds(bounds, { maxZoom: 14, padding: [60, 60], duration: 1.2 });

    // הצגת פין
    cityPinMarker = L.marker(center, { icon: cityPinIcon, zIndexOffset: 9000 }).addTo(map);

    // הסרה אחרי 5 שניות
    cityPinTimer = setTimeout(() => {
        if (cityPinMarker) { map.removeLayer(cityPinMarker); cityPinMarker = null; }
    }, 5000);
}

// ============================================================
// עדכון פוליגונים לפי state מהשרת
// ============================================================

/**
 * serverActiveCities: { [city]: { type, timestamp } }
 * allCitiesToDraw: Set של ערים שצריכות להיות על המפה
 */
function updateMapFromServer(serverActiveCities, allCitiesToDraw) {
    // 1. עדכון זמנים
    Object.keys(serverActiveCities).forEach(city => {
        if (serverActiveCities[city].timestamp) {
            cityAlertTimes[city] = serverActiveCities[city].timestamp;
        }
    });

    // 2. ציור ערים חדשות / עדכון קיימות
    allCitiesToDraw.forEach(city => {
        if (!city) return;
        const cityData = serverActiveCities[city] || {};
        drawCityOnMap(city, cityData.type || 'רקטות', cityData.category || 'rocket');
    });

    // 3. הסרת ערים שכבר לא אמורות להיות
    Object.keys(activeMapLayers).forEach(city => {
        if (!allCitiesToDraw.has(city)) removeCityFromMap(city);
    });
}