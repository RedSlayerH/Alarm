let lastProcessedEventId = null;
const express = require('express');
const axios = require('axios');
const cors = require('cors');
const https = require('https');
const fs = require('fs');

const app = express();
app.use(cors());
app.use(express.json()); 
const authRoutes = require('./auth');
app.use('/api/auth', authRoutes);

const httpsAgent = new https.Agent({ keepAlive: true });

const OREF_ALERTS_URL = 'https://www.oref.org.il/WarningMessages/alert/alerts.json';
const OREF_HISTORY_URL = 'https://www.oref.org.il/WarningMessages/History/AlertsHistory.json';

// === אלו הכותרות שנועדו לעקוף את החסימה של פיקוד העורף ===
const orefHeaders = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Referer': 'https://www.oref.org.il/12481-he/Pakar.aspx',
    'X-Requested-With': 'XMLHttpRequest',
    'Content-Type': 'application/json'
};

let alertsHistory = []; 
let mapCircles = {}; 
let lastKnownCities = []; 
let cityToRegion = {};
const cooldownTimers = {}; 

const ROCKET_COOLDOWN_TIME = 10 * 60 * 1000; 
const GROUPING_TIME_WINDOW = 4 * 60 * 1000;
const CLEAR_MERGE_WINDOW = 5 * 60 * 1000; 

async function loadCitiesMapping() {
    try {
        // קורא את הקובץ המלא של פיקוד העורף
        const rawData = fs.readFileSync('./cities.json', 'utf8');
        const citiesArray = JSON.parse(rawData);
        
        // עובר על כל 1,200 היישובים בשנייה אחת ומחבר עיר לאזור
        citiesArray.forEach(cityObj => {
            if (cityObj.name && cityObj.zone) {
                // שולף את שם העיר ואת האזור (למשל: קריית שמונה -> קו העימות)
                cityToRegion[cityObj.name.trim()] = cityObj.zone.trim(); 
            }
        });
        
        console.log("רשימת האזורים של פיקוד העורף נטענה בהצלחה!");
        console.log("בדיקה - קריית שמונה נמצאת ב:", cityToRegion["קריית שמונה"]); 
    } catch (err) {
        console.error("שגיאה בטעינת cities.json:", err);
    }
}

function generateSmartClearText(citiesArray) {
    const uniqueCities = [...new Set(citiesArray.map(c => c.trim()))];
    if (uniqueCities.length === 0) return 'האירוע הסתיים';
    
    if (uniqueCities.length <= 3) {
        return `האירוע הסתיים ב- <b style="color: #000;">${uniqueCities.join(', ')}</b>`;
    } else {
        const regionsSet = new Set();
        uniqueCities.forEach(city => {
            const region = cityToRegion[city];
            if (region) regionsSet.add(region);
        });
        const regions = Array.from(regionsSet);
        if (regions.length === 0) return `האירוע הסתיים ב- <b style="color: #000;">${uniqueCities.join(', ')}</b>`; 
        if (regions.length === 1) return `האירוע הסתיים באזור- <b style="color: #000;">${regions[0]}</b>`;
        return `האירוע הסתיים באזורים- <b style="color: #000;">${regions.join(', ')}</b>`;
    }
}

// ============================================
// מנגנון מיזוג הודעות שחרור - מתוקן
// ============================================
function addOrMergeClearEvent(newCities, description = '') {
    const now = Date.now();
    const lastAlert = alertsHistory[0];

    // בודקים אם יש כרטיסיית סיום פעילה בטווח של 5 דקות כדי למזג אליה
    if (lastAlert && lastAlert.type === 'clear' && (now - lastAlert.timestamp) < CLEAR_MERGE_WINDOW) {
        const existingCities = lastAlert.cities || [];
        const allAlreadyExist = newCities.every(city => existingCities.includes(city));
        
        if (allAlreadyExist && newCities.length === existingCities.length) return;

        const combinedCities = [...new Set([...existingCities, ...newCities])];
        lastAlert.cities = combinedCities;
        
        // מעדכנים את הטקסט נטו
        lastAlert.text = generateSmartClearText(combinedCities);
        
        // --- התיקון העיקרי: מעדכנים רק את lastUpdateTime ---
        // ה-timestamp המקורי של הכרטיסייה נשאר קבוע!
        lastAlert.lastUpdateTime = now; 
    } else {
        // אם אין כרטיסייה למזג אליה, יוצרים אחת חדשה
        alertsHistory.unshift({
            id: now.toString() + Math.random(),
            type: 'clear',
            titles: ['עדכון פיקוד העורף - סיום אירוע'],
            text: generateSmartClearText(newCities),
            cities: newCities,
            timestamp: now, // הזמן המקורי של האירוע הראשון בקבוצה
            lastUpdateTime: now
        });
    }
}

function handleAutoClear(city) { /* ... לא השתנה ... */ }

async function fetchOfficialHistory() {
   try {
        const response = await axios.get(OREF_HISTORY_URL, {
            headers: orefHeaders,
            httpsAgent
        });

        if (response.data && Array.isArray(response.data)) {
            response.data.reverse().forEach(alert => {
                const alertTime = new Date(alert.alertDate).getTime();
                const now = Date.now();
                const realTitle = alert.title || 'התרעת פיקוד העורף';
                
                // ====== שיפור כאן: זיהוי הודעת שחרור היסטורית ======
                const isClear = realTitle.includes('הסתיים') || realTitle.includes('חזרה לשגרה');
                const cities = alert.data.split(',').map(c => c.trim());

                if (isClear) {
                    addOrMergeClearEvent(cities);
                } else {
                    const lastAlert = alertsHistory[0];
                    if (lastAlert && lastAlert.type === 'alert' && (alertTime - lastAlert.lastUpdateTime) < GROUPING_TIME_WINDOW) {
                        if (!lastAlert.titles.includes(realTitle)) lastAlert.titles.push(realTitle);
                        const combinedCities = [...new Set([...lastAlert.text.split(',').map(c=>c.trim()), ...cities])];
                        lastAlert.text = combinedCities.join(', ');
                        lastAlert.lastUpdateTime = alertTime;
                    } else {
                        alertsHistory.unshift({
                            id: 'hist_' + alertTime + '_' + Math.random(),
                            type: 'alert', 
                            titles: [realTitle],
                            text: alert.data,
                            timestamp: alertTime,
                            lastUpdateTime: alertTime
                        });
                    }

                    if (realTitle.includes('רקטות')) {
                        const timePassed = now - alertTime;
                        if (timePassed < ROCKET_COOLDOWN_TIME) {
                            cities.forEach(city => {
                                mapCircles[city] = { status: 'cooldown', type: realTitle };
                                cooldownTimers[city] = setTimeout(() => handleAutoClear(city), ROCKET_COOLDOWN_TIME - timePassed);
                            });
                        }
                    }
                }
            });
        }
    } catch (e) {}
}

async function pollOref() {
    try {
        const response = await axios.get(OREF_ALERTS_URL, { 
            headers: orefHeaders,
            httpsAgent
        });
        
        // לוקח את השעה המדויקת בפורמט ישראל
        const currentTime = new Date().toLocaleTimeString('he-IL');
        console.log(`== ${currentTime} ==`);
        console.log(response.data);

        // מעביר את הנתונים שקיבלנו מהשרת למשתנה שהקוד יודע לעבוד איתו
        let apiData = response.data;
        
        // מוודאים שהטקסט לא ריק
        if (typeof apiData === 'string') {
            if (apiData.trim() === '') {
                apiData = null;
            } else {
                try { apiData = JSON.parse(apiData.trim()); } catch(e) { apiData = null; }
            }
        }

        if (apiData && apiData.data && apiData.data.length > 0) {
            
            // חסימת כפילויות מאותו ID
            if (apiData.id === lastProcessedEventId) return; 
            lastProcessedEventId = apiData.id;

            const currentCities = apiData.data;
            const alertTitle = apiData.title || 'התרעת פיקוד העורף'; 
            const now = Date.now();

            // === יצירת המלבן הירוק ומחיקת הערים מהמפה (אירוע הסתיים) ===
            // === יצירת המלבן הירוק ומחיקת הערים מהמפה (אירוע הסתיים) ===
            if (alertTitle.includes('הסתיים') || apiData.cat === '10') {
                currentCities.forEach(city => {
                    delete mapCircles[city]; // מוחק מהמפה
                    if (cooldownTimers[city]) clearTimeout(cooldownTimers[city]); // מכבה טיימרים
                });
                
                // הפונקציה המאחדת! היא כבר יודעת לעצב את הכותרת והטקסט בנפרד
                addOrMergeClearEvent(currentCities);
                
                return; 
            }

            // === טיפול באזעקה חדשה (אדומה/כתומה) ===
            const lastAlert = alertsHistory[0];

            // מיזוג אם זו אזעקה מאותו גל
            if (lastAlert && lastAlert.type === 'alert' && (now - lastAlert.lastUpdateTime) < GROUPING_TIME_WINDOW) {
                if (!lastAlert.titles.includes(alertTitle)) lastAlert.titles.push(alertTitle);
                const combinedCities = [...new Set([...lastAlert.text.split(',').map(c=>c.trim()), ...currentCities])];
                lastAlert.text = combinedCities.join(', ');
                lastAlert.lastUpdateTime = now;
            } else {
                // כרטיסיית אזעקה חדשה לגמרי
                alertsHistory.unshift({
                    id: apiData.id,
                    type: 'alert',
                    titles: [alertTitle],
                    text: currentCities.join(', '),
                    timestamp: now,
                    lastUpdateTime: now
                });
            }

            // עדכון המפה (צביעת הערים בלבד, ללא טיימר מחיקה אוטומטי)
            currentCities.forEach(city => {
                city = city.trim();
                
                // עדיין מנקים טיימרים ישנים אם נשארו כאלה בטעות
                if (cooldownTimers[city]) {
                    clearTimeout(cooldownTimers[city]);
                    delete cooldownTimers[city];
                }
                
                mapCircles[city] = { status: 'active', type: alertTitle };
            });

        }
    } catch (error) {
        // מתעלם משגיאות רשת שקטות
    }
}

loadCitiesMapping().then(() => { fetchOfficialHistory().then(() => { setInterval(pollOref, 1000); }); });
// ... כל שאר הקובץ נשאר זהה ...

app.get('/api/state', (req, res) => {
    res.json({ history: alertsHistory, activeMapCities: mapCircles });
});

app.get('/api/cities', (req, res) => { res.json(cityToRegion); });

// ============================================
// סימולטור אזעקות - לבדיקות דרך הדפדפן (F12)
// ============================================
app.get('/api/test', (req, res) => {
    // לוקח את הערים מהבקשה, ואם אין - שם 4 יישובים בקו העימות כברירת מחדל
    const citiesQuery = req.query.cities ? req.query.cities.split(',') : ['קריית שמונה', 'מטולה', 'כפר גלעדי', 'תל חי'];
    const type = req.query.type || 'ירי רקטות וטילים';
    const now = Date.now();

    // מכניסים את האזעקה המזויפת להיסטוריה
    alertsHistory.unshift({
        id: now.toString() + Math.random(),
        type: 'alert',
        titles: [type],
        text: citiesQuery.join(', '),
        timestamp: now,
        lastUpdateTime: now
    });

    // מדליקים אותם במפה ומפעילים טיימרים!
    citiesQuery.forEach(city => {
        city = city.trim();
        if (cooldownTimers[city]) clearTimeout(cooldownTimers[city]);
        
        mapCircles[city] = { status: 'active', type: type };
        
        // טיימר מחיקה רק אם זה טילים
        if (type.includes('רקטות') || type.includes('טילים')) {
            cooldownTimers[city] = setTimeout(() => handleAutoClear(city), ROCKET_COOLDOWN_TIME);
        }
    });

    res.json({ success: true, message: `הופעלה אזעקת ${type} מדומה!` });
});

app.listen(3000, () => console.log('Server running on http://localhost:3000'));