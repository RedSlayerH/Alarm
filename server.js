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

const orefHeaders = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Referer': 'https://www.oref.org.il/12481-he/Pakar.aspx',
    'X-Requested-With': 'XMLHttpRequest',
    'Content-Type': 'application/json'
};

let alertsHistory = []; 
let mapCircles = {}; 
let cityToRegion = {};

const earlyWarningTimers = {}; 
const EARLY_WARNING_TIMEOUT = 3 * 60 * 1000; // 3 דקות להתרעה מקדימה
const GROUPING_TIME_WINDOW = 4 * 60 * 1000;
const CLEAR_MERGE_WINDOW = 5 * 60 * 1000; 
const ROCKET_COOLDOWN_TIME = 10 * 60 * 1000;

async function loadCitiesMapping() {
    try {
        const rawData = fs.readFileSync('./cities.json', 'utf8');
        const citiesArray = JSON.parse(rawData);
        citiesArray.forEach(cityObj => {
            if (cityObj.name && cityObj.zone) {
                cityToRegion[cityObj.name.trim()] = cityObj.zone.trim(); 
            }
        });
        console.log("רשימת האזורים נטענה בהצלחה!");
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

function addOrMergeClearEvent(newCities) {
    const now = Date.now();
    const lastAlert = alertsHistory[0];

    if (lastAlert && lastAlert.type === 'clear' && (now - lastAlert.timestamp) < CLEAR_MERGE_WINDOW) {
        const existingCities = lastAlert.cities || [];
        const allAlreadyExist = newCities.every(city => existingCities.includes(city));
        
        if (allAlreadyExist && newCities.length === existingCities.length) return;

        const combinedCities = [...new Set([...existingCities, ...newCities])];
        lastAlert.cities = combinedCities;
        lastAlert.text = generateSmartClearText(combinedCities);
        lastAlert.lastUpdateTime = now; 
    } else {
        alertsHistory.unshift({
            id: now.toString() + Math.random(),
            type: 'clear',
            titles: ['עדכון פיקוד העורף - סיום אירוע'],
            text: generateSmartClearText(newCities),
            cities: newCities,
            timestamp: now, 
            lastUpdateTime: now
        });
    }
}

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

                    cities.forEach(city => {
                        mapCircles[city] = { status: 'active', type: realTitle, timestamp: alertTime };
                    });
                }
            });
            
            alertsHistory.forEach(event => {
                if (event.type === 'clear') {
                    (event.cities || []).forEach(city => {
                        if (mapCircles[city] && event.timestamp > mapCircles[city].timestamp) {
                            delete mapCircles[city];
                        }
                    });
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
        
        const currentTime = new Date().toLocaleTimeString('he-IL');
        console.log(`===== [${currentTime}] =====`, response.data);

        let apiData = response.data;
        if (typeof apiData === 'string') {
            if (apiData.trim() === '') {
                apiData = null;
            } else {
                try { apiData = JSON.parse(apiData.trim()); } catch(e) { apiData = null; }
            }
        }

        if (apiData && apiData.data && apiData.data.length > 0) {
            
            if (apiData.id === lastProcessedEventId) return; 
            lastProcessedEventId = apiData.id;

            const currentCities = apiData.data;
            const alertTitle = apiData.title || 'התרעת פיקוד העורף'; 
            const now = Date.now();

            const isEarlyWarning = alertTitle.includes('צפויות להתקבל') || alertTitle.includes('התרעה מקדימה');
            const isClearEvent = alertTitle.includes('הסתיים') || alertTitle.includes('חזרה לשגרה') || (apiData.cat === '10' && !isEarlyWarning);

            if (isEarlyWarning) {
                const lastAlert = alertsHistory[0];
                
                if (lastAlert && lastAlert.type === 'early' && (now - lastAlert.lastUpdateTime) < GROUPING_TIME_WINDOW) {
                    const existingCities = lastAlert.cities || lastAlert.text.split(',').map(c => c.trim());
                    const combinedCities = [...new Set([...existingCities, ...currentCities])];
                    lastAlert.cities = combinedCities;
                    lastAlert.text = combinedCities.join(', '); 
                    lastAlert.lastUpdateTime = now;
                } else {
                    alertsHistory.unshift({
                        id: apiData.id + Math.random(),
                        type: 'early', 
                        titles: ['מבזק פיקוד העורף - התרעה מקדימה'],
                        text: currentCities.join(', '), 
                        cities: currentCities,
                        timestamp: now,
                        lastUpdateTime: now
                    });
                }

                currentCities.forEach(city => {
                    const cleanCity = city.trim();
                    if (!mapCircles[cleanCity] || mapCircles[cleanCity].type === 'early') {
                        mapCircles[cleanCity] = { status: 'active', type: 'early', timestamp: now };
                        if (earlyWarningTimers[cleanCity]) clearTimeout(earlyWarningTimers[cleanCity]);
                        
                        earlyWarningTimers[cleanCity] = setTimeout(() => {
                            if (mapCircles[cleanCity] && mapCircles[cleanCity].type === 'early') {
                                delete mapCircles[cleanCity];
                                delete earlyWarningTimers[cleanCity];
                            }
                        }, EARLY_WARNING_TIMEOUT);
                    }
                });
                return; 
            }

            if (isClearEvent) {
                currentCities.forEach(city => {
                    delete mapCircles[city]; 
                    if (earlyWarningTimers[city]) clearTimeout(earlyWarningTimers[city]); 
                });
                addOrMergeClearEvent(currentCities);
                return; 
            }

            const lastAlert = alertsHistory[0];
            if (lastAlert && lastAlert.type === 'alert' && (now - lastAlert.lastUpdateTime) < GROUPING_TIME_WINDOW) {
                if (!lastAlert.titles.includes(alertTitle)) lastAlert.titles.push(alertTitle);
                const combinedCities = [...new Set([...lastAlert.text.split(',').map(c=>c.trim()), ...currentCities])];
                lastAlert.text = combinedCities.join(', ');
                lastAlert.lastUpdateTime = now;
            } else {
                alertsHistory.unshift({
                    id: apiData.id,
                    type: 'alert',
                    titles: [alertTitle],
                    text: currentCities.join(', '),
                    timestamp: now,
                    lastUpdateTime: now
                });
            }

            // === התיקון הקריטי: החלפנו את citiesQuery שהיה גורם לקריסה! ===
            currentCities.forEach(city => {
                const cleanCity = city.trim();
                if (earlyWarningTimers[cleanCity]) clearTimeout(earlyWarningTimers[cleanCity]);
                mapCircles[cleanCity] = { status: 'active', type: alertTitle, timestamp: now };

                if (alertTitle.includes('רקטות') || alertTitle.includes('טילים')) {
                    earlyWarningTimers[cleanCity] = setTimeout(() => {
                        if (mapCircles[cleanCity] && mapCircles[cleanCity].timestamp === now) {
                            delete mapCircles[cleanCity];
                        }
                    }, ROCKET_COOLDOWN_TIME);
                }
            });

        }
    } catch (error) {}
}

loadCitiesMapping().then(() => { fetchOfficialHistory().then(() => { setInterval(pollOref, 1000); }); });

app.get('/api/state', (req, res) => {
    res.json({ history: alertsHistory, activeMapCities: mapCircles });
});
app.get('/api/cities', (req, res) => { res.json(cityToRegion); });

app.get('/api/test', (req, res) => {
    const citiesQuery = req.query.cities ? req.query.cities.split(',') : ['קריית שמונה', 'מטולה', 'כפר גלעדי', 'תל חי'];
    const type = req.query.type || 'ירי רקטות וטילים';
    const now = Date.now();

    alertsHistory.unshift({
        id: now.toString() + Math.random(),
        type: 'alert',
        titles: [type],
        text: citiesQuery.join(', '),
        timestamp: now,
        lastUpdateTime: now
    });

    citiesQuery.forEach(city => {
        city = city.trim();
        if (earlyWarningTimers[city]) clearTimeout(earlyWarningTimers[city]);
        mapCircles[city] = { status: 'active', type: type, timestamp: now };
    });

    res.json({ success: true, message: `הופעלה אזעקת ${type} מדומה!` });
});

app.get('/api/test-clear', (req, res) => {
    const citiesQuery = req.query.cities ? req.query.cities.split(',') : ['קריית שמונה', 'מטולה', 'כפר גלעדי', 'תל חי'];
    citiesQuery.forEach(city => {
        delete mapCircles[city.trim()];
    });
    addOrMergeClearEvent(citiesQuery);
    res.json({ success: true, message: `הופעל שחרור מדומה! הפוליגונים נמחקו.` });
});

app.get('/api/test-early', (req, res) => {
    const citiesQuery = req.query.cities ? req.query.cities.split(',') : ['אשדוד - א,ב,ד,ה', 'אשדוד - ג,ו,ז', 'גן יבנה'];
    const now = Date.now();

    alertsHistory.unshift({
        id: now.toString() + Math.random(),
        type: 'early',
        titles: ['מבזק פיקוד העורף - התרעה מקדימה'],
        text: citiesQuery.join(', '), 
        cities: citiesQuery,
        timestamp: now,
        lastUpdateTime: now
    });

    citiesQuery.forEach(city => {
        const cleanCity = city.trim();
        if (!mapCircles[cleanCity] || mapCircles[cleanCity].type === 'early') {
            mapCircles[cleanCity] = { status: 'active', type: 'early', timestamp: now };
            if (earlyWarningTimers[cleanCity]) clearTimeout(earlyWarningTimers[cleanCity]);
            earlyWarningTimers[cleanCity] = setTimeout(() => {
                if (mapCircles[cleanCity] && mapCircles[cleanCity].type === 'early') {
                    delete mapCircles[cleanCity];
                    delete earlyWarningTimers[cleanCity];
                }
            }, EARLY_WARNING_TIMEOUT);
        }
    });

    res.json({ success: true, message: `הופעלה התרעה מקדימה מדומה ל-3 דקות!` });
});

app.listen(3000, () => console.log('Server running on http://localhost:3000'));