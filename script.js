const map = L.map('map').setView([31.5, 34.8], 8);

L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
    attribution: '© OpenStreetMap contributors, © CARTO',
    maxZoom: 19
}).addTo(map);

setTimeout(() => { map.invalidateSize(); }, 200);

const activeAlerts = {};
const coordsCache = {}; 
const alertListContainer = document.getElementById('alert-list');

// זמן המתנה רשמי - 10 דקות (במילישניות)
const OFFICIAL_COOLDOWN_TIME = 10 * 60 * 1000; 

setInterval(() => {
    const now = new Date();
    document.getElementById('current-time').innerText = now.toLocaleTimeString('he-IL') + ' | ' + now.toLocaleDateString('he-IL');
}, 1000);

// פונקציה להוספת אזעקה למפה ולפאנל
async function addAlertToMap(areaName) {
    let lat, lon;

    try {
        if (coordsCache[areaName]) {
            lat = coordsCache[areaName].lat;
            lon = coordsCache[areaName].lon;
        } else {
            const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(areaName)}, Israel`);
            const data = await res.json();
            if (data && data.length > 0) {
                lat = data[0].lat;
                lon = data[0].lon;
                coordsCache[areaName] = { lat, lon };
            } else {
                return null;
            }
        }

        const circle = L.circle([lat, lon], { 
            color: 'red', fillColor: '#f03', fillOpacity: 0.5, radius: 4000 
        }).addTo(map);
        
        map.flyTo([lat, lon], 10, { duration: 1.5 });

        const now = new Date();
        const timeStr = now.getHours().toString().padStart(2, '0') + ":" + now.getMinutes().toString().padStart(2, '0');
        
        const card = document.createElement('div');
        card.className = 'alert-card';
        card.innerHTML = `
            <span class="alert-clock">${timeStr}</span>
            <span class="city-name">${areaName}</span>
            <span class="alert-desc">ירי רקטות וטילים</span>
        `;
        alertListContainer.prepend(card);

        return { circle, card };
    } catch (e) { 
        return null; 
    }
}

// ניהול מחזור חיים של אזעקות (פעיל -> ספירה לאחור -> הסתיים)
async function processAlerts(currentActiveCities) {
    const now = Date.now();

    // 1. הוספה או רענון של אזעקות שעכשיו פועלות
    for (const city of currentActiveCities) {
        if (!activeAlerts[city]) {
            const uiElements = await addAlertToMap(city);
            if (uiElements) {
                activeAlerts[city] = {
                    circle: uiElements.circle,
                    card: uiElements.card,
                    status: 'active',
                    lastSeen: now,
                    timer: null
                };
            }
        } else {
            activeAlerts[city].lastSeen = now;
            // אם ירו שוב בזמן שהעיר הייתה בהמתנה - מבטלים את הסיום ומחזירים לאדום
            if (activeAlerts[city].status !== 'active') {
                activeAlerts[city].status = 'active';
                clearTimeout(activeAlerts[city].timer);
            }
        }
    }

    // 2. בדיקה: אם העיר נעלמה מפיקוד העורף - מתחילים ספירה לאחור של 10 דקות
    for (const city in activeAlerts) {
        if (!currentActiveCities.includes(city) && activeAlerts[city].status === 'active') {
            
            activeAlerts[city].status = 'cooldown';
            
            activeAlerts[city].timer = setTimeout(() => {
                showEventEnded(city);
            }, OFFICIAL_COOLDOWN_TIME);
        }
    }
}

// מעביר את הכרטיסייה לסטטוס הסתיים (ירוק) ומוחק את העיגול
function showEventEnded(city) {
    if (!activeAlerts[city]) return;

    activeAlerts[city].status = 'ended';
    const alertData = activeAlerts[city];

    // עדכון העיצוב לירוק
    alertData.card.classList.add('ended');
    alertData.card.querySelector('.alert-desc').innerText = 'האירוע הסתיים';

    // מחיקת העיגול מהמפה
    map.removeLayer(alertData.circle);

    // מחיקת הכרטיסייה לגמרי אחרי דקה אחת
    setTimeout(() => {
        if (activeAlerts[city] && activeAlerts[city].status === 'ended') {
            alertData.card.remove();
            delete activeAlerts[city];
        }
    }, 60 * 1000); 
}

// משיכת הנתונים משרת ה-Node.js
async function fetchAlerts() {
    try {
        const response = await fetch('http://localhost:3000/api/alerts');
        const data = await response.json();
        
        const currentCities = (data && data.data && Array.isArray(data.data)) ? data.data : [];
        processAlerts(currentCities);

    } catch (e) {
        // התעלמות משגיאות רשת זמניות
    }
}

// בדיקת אזעקות חדשות כל 2 שניות
setInterval(fetchAlerts, 2000);