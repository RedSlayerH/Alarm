const map = L.map('map', {
    zoomControl: false, // זה מה שמעיף את ה-+ וה-- מצד שמאל למעלה!
     minZoom: 7,

}).setView([31.5, 34.8], 8); // המספר 8 פה בסוף הוא רמת הזום שאתה יכול לשנות

L.tileLayer('https://mt1.google.com/vt/lyrs=m&hl=iw&x={x}&y={y}&z={z}', { 
    maxZoom: 20,
    noWrap: true,              // מונע מהמפה להשתכפל (לצייר את כדור הארץ פעמיים)
    attribution: '© Google'
}).addTo(map);
setTimeout(() => { map.invalidateSize(); }, 200);

const alertListContainer = document.getElementById('alert-list');
const activeMapLayers = {};
const cityAlertTimes = {};

let latestGlobalAlertTime = 0; 
let cityToRegion = {};

fetch('http://localhost:3000/api/cities')
    .then(res => res.json())
    .then(data => { 
        cityToRegion = data; 
        console.log("רשימת האזורים מהשרת:", cityToRegion); // <-- עכשיו זה בתוך הסוגריים המסולסלים!
    });
function getRegion(city) { return cityToRegion[city] || null; }

function pad(num) { return num.toString().padStart(2, '0'); }

// הפונקציה תומכת עכשיו בטווח זמנים (למשל: 23:14 - 23:23)
function getTzofarTimeRange(startTimestamp, endTimestamp) {
    const d1 = new Date(startTimestamp);
    const d2 = new Date(endTimestamp);
    const dateStr = `${pad(d1.getDate())}/${pad(d1.getMonth() + 1)}/${d1.getFullYear()}`;
    const time1 = `${pad(d1.getHours())}:${pad(d1.getMinutes())}`;
    const time2 = `${pad(d2.getHours())}:${pad(d2.getMinutes())}`;
    
    if (time1 === time2) return `${dateStr} (${time1})`;
    return `${dateStr} (${time1} - ${time2})`;
}

function getRelativeTime(timestamp) {
    const diffMs = Date.now() - timestamp;
    const minutes = Math.floor(diffMs / 60000);
    if (minutes < 1) return "עכשיו";
    if (minutes === 1) return "לפני דקה";
    if (minutes === 2) return "לפני 2 דקות";
    if (minutes < 60) return `לפני ${minutes} דקות`;
    const hours = Math.floor(minutes / 60);
    if (hours === 1) return "לפני שעה";
    if (hours === 2) return "לפני שעתיים";
    return `לפני ${hours} שעות`;
}

const iconSiren = `<svg viewBox="0 0 24 24" width="24" height="24" fill="white"><path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.89 2 2 2zm6-6v-5c0-3.07-1.64-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.63 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z"/></svg>`;
const iconCheck = `<svg viewBox="0 0 24 24" width="26" height="26" fill="white"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>`;
const iconRocket = `<svg viewBox="0 0 24 24" width="24" height="24" fill="white"><path d="M14.07,3.58L15.42,2.23C16.21,1.45 17.59,1.45 18.37,2.23L21.78,5.63C22.56,6.41 22.56,7.79 21.78,8.58L20.42,9.93L14.07,3.58M12.66,5L2.55,15.1C2.42,15.38 2.33,15.38 2.26,15.56L1,20.41L1.41,20.83L6.26,19.57C6.44,19.5 6.6,19.41 6.72,19.28L16.83,9.17L12.66,5Z"/></svg>`;
const iconPlane = `<svg viewBox="0 0 24 24" width="26" height="26" fill="white"><path d="M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z"/></svg>`;
const iconEarly = `<svg viewBox="0 0 24 24" width="24" height="24" fill="white"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg>`;

// מחזיר את כל האייקונים הרלוונטיים כדי להציג אחד מעל השני אם צריך
function getIconsForTitles(titles, isRed) {
    if (!isRed) return iconCheck; 
    let icons = '';
    const titleStr = titles.join(' '); 
    if (titleStr.includes('טיס') || titleStr.includes('כטב"ם')) icons += `<div style="margin-bottom:5px;">${iconPlane}</div>`;
    if (titleStr.includes('רקטות') || titleStr.includes('טילים') || icons === '') icons += `<div>${iconRocket}</div>`;
    return icons; 
}

let polygonsData = null;
fetch('area_to_polygon.json')
    .then(res => res.json())
    .then(data => { polygonsData = data; });

function syncAllGlows() {
    Object.keys(activeMapLayers).forEach(city => {
        const layerData = activeMapLayers[city];
        if (layerData && layerData.layer && layerData.layer.getElement) {
            const el = layerData.layer.getElement();
            if (el) {
                const isOrange = layerData.type && (layerData.type.includes('טיס') || layerData.type.includes('כטב"ם'));
                const glowClass = isOrange ? 'glow-orange' : 'glow-red';
                el.classList.remove(glowClass);
                void el.offsetWidth; 
                el.classList.add(glowClass);
            }
        }
    });
}

function drawCityOnMap(city, threatType = 'רקטות') {
    if (activeMapLayers[city]) {
        // --- התיקון הקריטי בדפדפן: שדרוג צבע מחום (early) לאדום/כתום ---
        // אם הפוליגון כבר על המפה והוא חום ('early'), אבל השרת אומר לנו עכשיו שהוא אזעקת אמת:
        if (activeMapLayers[city].type === 'early' && threatType !== 'early') {
            // 1. מעדכנים את הסוג שלו לאזעקת האמת
            activeMapLayers[city].type = threatType;
            
            // 2. מאפסים את ה"גיל" שלו לעכשיו! 
            // זה יגרום ללולאת האנימציה (setInterval) לחשוב שזו אזעקה חדשה לגמרי 
            // ולהתחיל את ה-2 דקות של האדום המהבהב מאפס.
            cityAlertTimes[city] = Date.now(); 
        }
        return; // יוצאים, כי הפוליגון כבר קיים על המפה, הלולאה תעדכן את הצבע.
    }
    
    if (!polygonsData) {
        activeMapLayers[city] = 'loading';
        setTimeout(() => { delete activeMapLayers[city]; drawCityOnMap(city, threatType); }, 500);
        return;
    }
    // ... המשך הפונקציה נשאר אותו דבר ...

    const cleanCityName = city.trim();
    let cityCoords = polygonsData[cleanCityName] || polygonsData[Object.keys(polygonsData).find(k => k.replace(/-/g, ' ').replace(/\s+/g, ' ') === cleanCityName.replace(/-/g, ' ').replace(/\s+/g, ' '))];

    if (cityCoords) {
        let mainColor, glowClass;
        
        // --- הלוגיקה החדשה לבחירת צבע ופעימה לפי סוג הדיווח מהשרת ---
        if (threatType === 'early') {
            mainColor = '#b71111'; // צבע בורדו כהה להתרעה מקדימה
            glowClass = 'glow-brown'; // קלאס ה-CSS שניצור עוד רגע
        } else {
            const isOrange = threatType.includes('טיס') || threatType.includes('כטב"ם');
            mainColor = isOrange ? '#ff8c00' : '#ff0000';
            glowClass = isOrange ? 'glow-orange' : 'glow-red';
        }

        const alertTime = cityAlertTimes[city] || Date.now();
        const elapsedMins = (Date.now() - alertTime) / 60000;
        
        // התרעה מקדימה לעולם לא תהפוך לאפור כי היא נמחקת אחרי 3 דקות.
        let initialColor = (elapsedMins >= 5 && threatType !== 'early') ? '#888888' : mainColor;
        let initialClass = elapsedMins < 2 ? glowClass : '';

        const polygonLayer = L.polygon(cityCoords, {
            color: initialColor, weight: 2, fillColor: initialColor, fillOpacity: 0.4, className: initialClass
        }).addTo(map);

        activeMapLayers[city] = { layer: polygonLayer, type: threatType };
        map.flyToBounds(polygonLayer.getBounds(), { maxZoom: 12, padding: [20, 20], duration: 1.5 });
    } else {
        delete activeMapLayers[city]; 
    }
}

setInterval(() => {
    const now = Date.now();
    Object.keys(activeMapLayers).forEach(city => {
        const layerData = activeMapLayers[city];
        if (layerData === 'loading' || !layerData.layer || !layerData.layer.setStyle) return;

        const layer = layerData.layer;
        
        // --- התיקון הקריטי: אנחנו קוראים את סוג האיום *הנוכחי* שהתעדכן ---
        const currentThreatType = layerData.type;
        
        let mainColor, glowClass;
        
        // אם השרת עידכן שזו אזעקה רגילה, הלוגיקה הזו תתפוס את זה מיד ותחליף צבע!
        if (currentThreatType === 'early') {
            mainColor = '#b71111'; // חום/בורדו
            glowClass = 'glow-brown';
        } else {
            const isOrange = currentThreatType.includes('טיס') || currentThreatType.includes('כטב"ם');
            mainColor = isOrange ? '#ff8c00' : '#ff0000';
            glowClass = isOrange ? 'glow-orange' : 'glow-red';
        }

        const alertTime = cityAlertTimes[city] || now;
        const elapsedMins = (now - alertTime) / 60000;
        const pathElement = layer.getElement();

        if (currentThreatType === 'early') {
            // התרעה מקדימה תמיד מהבהבת (למשך 3 הדקות שלה)
            layer.setStyle({ color: mainColor, fillColor: mainColor });
            
            // מסירים קלאסים ישנים ליתר ביטחון (למשל אם זה היה אדום קודם)
            if (pathElement) {
                pathElement.classList.remove('glow-red', 'glow-orange');
                if (!pathElement.classList.contains(glowClass)) pathElement.classList.add(glowClass);
            }
        } else {
            // אזעקה רגילה (טילים/כטב"ם) - מהבהבת לשתי דקות, אדום חלק, ואז אפור
            if (elapsedMins < 2) {
                layer.setStyle({ color: mainColor, fillColor: mainColor });
                if (pathElement) {
                    pathElement.classList.remove('glow-brown'); // מנקים חום אם שודרגנו הרגע מאזהרה מוקדמת!
                    if (!pathElement.classList.contains(glowClass)) pathElement.classList.add(glowClass);
                }
            } else if (elapsedMins < 5) {
                layer.setStyle({ color: mainColor, fillColor: mainColor });
                if (pathElement) pathElement.classList.remove(glowClass, 'glow-brown');
            } else {
                layer.setStyle({ color: '#888888', fillColor: '#888888' });
                if (pathElement) pathElement.classList.remove(glowClass, 'glow-brown');
            }
        }
    });
}, 1000);

async function updateUI() {
    try {
        const response = await fetch('http://localhost:3000/api/state');
        const data = await response.json();
        const history = data.history || [];
        let newAlertDetected = false;

        const serverActiveCities = data.activeMapCities || {}; 

        // 1. בודקים אם יש אזעקה כללית חדשה
        history.forEach(event => {
            if (event.type === 'alert') {
                if (event.lastUpdateTime > latestGlobalAlertTime) {
                    latestGlobalAlertTime = event.lastUpdateTime;
                    newAlertDetected = true;
                }
            }
        });

        // 2. שמירת הזמן המדויק לכל עיר
        Object.keys(serverActiveCities).forEach(city => {
            if (serverActiveCities[city].timestamp) {
                cityAlertTimes[city] = serverActiveCities[city].timestamp;
            }
        });

        if (newAlertDetected) {
            setTimeout(syncAllGlows, 100); 
            if (typeof isPanelHidden !== 'undefined' && isPanelHidden) {
                const badge = document.getElementById('fab-badge');
                if (badge) badge.classList.add('active');
            }
        }

        const allCitiesToDraw = new Set(Object.keys(serverActiveCities));
        
        const clearEvents = history.filter(e => {
            const isEarly = e.type === 'early' || 
                            (e.titles && e.titles.some(t => t.includes('מקדימה'))) || 
                            (e.text && e.text.includes('מקדימה'));
            return e.type !== 'alert' && !isEarly;
        });
        
        let latestTimeInHistory = Date.now();
        if (history.length > 0) {
            latestTimeInHistory = Math.max(...history.map(e => e.lastUpdateTime || e.timestamp));
        }
        
        history.forEach(event => {
            if (event.type === 'alert' && event.text) {
                const alertTime = event.lastUpdateTime || event.timestamp;
                
                if (latestTimeInHistory - alertTime > 600000) {
                    return; 
                }

                event.text.split(',').forEach(c => {
                    const cleanCity = c.trim();
                    const region = typeof getRegion === 'function' ? getRegion(cleanCity) : ''; 
                    
                    const hasNewerClear = clearEvents.some(clearEv => {
                        const clearTime = clearEv.lastUpdateTime || clearEv.timestamp;
                        const alertTimeCompare = event.lastUpdateTime || event.timestamp;
                        const clearText = (clearEv.text || "") + " " + (clearEv.titles ? clearEv.titles.join(' ') : "");
                        
                        return clearTime >= alertTimeCompare && 
                               (clearText.includes(region) || clearText.includes(cleanCity));
                    });

                    if (!hasNewerClear) {
                        allCitiesToDraw.add(cleanCity);
                    }
                });
            }
        });

        allCitiesToDraw.forEach(city => {
            if (city) {
                const threatType = serverActiveCities[city] ? serverActiveCities[city].type : 'רקטות';
                
                if (!activeMapLayers[city]) {
                    if (typeof drawCityOnMap === 'function') {
                        drawCityOnMap(city, threatType);
                        if (activeMapLayers[city]) activeMapLayers[city].threatType = threatType; 
                    }
                } else {
                    if (activeMapLayers[city].threatType !== threatType) {
                        if (typeof map !== 'undefined' && activeMapLayers[city].layer) {
                            map.removeLayer(activeMapLayers[city].layer); 
                        }
                        delete activeMapLayers[city];
                        
                        if (typeof drawCityOnMap === 'function') {
                            drawCityOnMap(city, threatType);
                            if (activeMapLayers[city]) activeMapLayers[city].threatType = threatType; 
                        }
                    }
                }
            }
        });

        Object.keys(activeMapLayers).forEach(city => {
            if (!allCitiesToDraw.has(city)) {
                if (activeMapLayers[city] && activeMapLayers[city] !== 'loading' && typeof map !== 'undefined') {
                    map.removeLayer(activeMapLayers[city].layer); 
                }
                delete activeMapLayers[city];
            }
        });

        const mergedHistory = [];
        
        history.forEach(event => {
            const isEarlyAlert = event.type === 'early' || 
                                 (event.titles && event.titles.some(t => t.includes('מקדימה'))) || 
                                 (event.text && event.text.includes('מקדימה'));
            
            const isRed = event.type === 'alert' && !isEarlyAlert;
            const isClear = !isRed && !isEarlyAlert;

            if (isEarlyAlert) {
                let cleanText = (event.text || '').replace(/התרעה מקדימה ב-|בעקבות זיהוי שיגורים.*?באזורים:|בעקבות זיהוי שיגורים.*?באזור:|באזורים-|באזורים:/g, '').trim();

                const existingGroup = mergedHistory.find(e => 
                    e.type === 'early' && 
                    Math.abs(e.timestamp - event.timestamp) <= 300000 
                );

                if (existingGroup) {
                    const existingPlaces = existingGroup.text.split(',');
                    const newPlaces = cleanText.split(',');
                    const combinedPlaces = Array.from(new Set([...existingPlaces, ...newPlaces].map(p => p.trim()).filter(p => p !== '')));
                    
                    existingGroup.text = combinedPlaces.join(', ');
                    existingGroup.lastUpdateTime = Math.max(existingGroup.lastUpdateTime || existingGroup.timestamp, event.lastUpdateTime || event.timestamp);
                } else {
                    let newEvent = JSON.parse(JSON.stringify(event));
                    newEvent.type = 'early'; 
                    newEvent.text = cleanText;
                    mergedHistory.push(newEvent);
                }

            } else if (isRed) {
                const existingGroup = mergedHistory.find(e => 
                    e.type === 'alert' && 
                    Math.abs(e.timestamp - event.timestamp) <= 120000 
                );

                if (existingGroup) {
                    const existingPlaces = (existingGroup.text || '').split(',');
                    const newPlaces = (event.text || '').split(',');
                    const combinedPlaces = Array.from(new Set([...existingPlaces, ...newPlaces].map(p => p.trim()).filter(p => p !== '')));
                    
                    existingGroup.text = combinedPlaces.join(', ');
                    existingGroup.lastUpdateTime = Math.max(existingGroup.lastUpdateTime || existingGroup.timestamp, event.lastUpdateTime || event.timestamp);
                    
                    if (event.titles && existingGroup.titles) {
                        existingGroup.titles = Array.from(new Set([...existingGroup.titles, ...event.titles]));
                    }
                } else {
                    mergedHistory.push(JSON.parse(JSON.stringify(event)));
                }

            } else if (isClear) {
                let cleanTextClear = (event.text || '').replace(/האירוע הסתיים באזורים:|האירוע הסתיים באזור:|האירוע הסתיים ביישובים:|האירוע הסתיים ב-|האירוע הסתיים/g, '').trim();

                const existingGroup = mergedHistory.find(e => 
                    e.type !== 'alert' && e.type !== 'early' && 
                    Math.abs(e.timestamp - event.timestamp) <= 180000 
                );

                if (existingGroup) {
                    const existingPlaces = (existingGroup.text || '').split(',');
                    const newPlaces = cleanTextClear.split(',');
                    const combinedPlaces = Array.from(new Set([...existingPlaces, ...newPlaces].map(p => p.trim()).filter(p => p !== '')));
                    
                    existingGroup.text = combinedPlaces.join(', ');
                    existingGroup.lastUpdateTime = Math.max(existingGroup.lastUpdateTime || existingGroup.timestamp, event.lastUpdateTime || event.timestamp);
                } else {
                    let newEvent = JSON.parse(JSON.stringify(event));
                    newEvent.text = cleanTextClear; 
                    mergedHistory.push(newEvent);
                }
            }
        });

        if (typeof alertListContainer !== 'undefined' && alertListContainer) {
            const serverIds = mergedHistory.map(e => e.id);
            Array.from(alertListContainer.children).forEach(child => {
                if (!serverIds.includes(child.id)) child.remove();
            });

            mergedHistory.forEach((event, index) => {
                let card = document.getElementById(event.id);
                
                const isRed = event.type === 'alert';
                const isEarly = event.type === 'early';
                
                const timeString = typeof getTzofarTimeRange === 'function' ? getTzofarTimeRange(event.timestamp, event.lastUpdateTime || event.timestamp) : '';
                const relativeTimeStr = typeof getRelativeTime === 'function' ? getRelativeTime(event.lastUpdateTime || event.timestamp) : '';

                let mainTitleText = '';
                let citiesString = event.text;
                let colorTheme = '';
                let iconsHtml = '';

                if (isRed) {
                    iconsHtml = typeof getIconsForTitles === 'function' ? getIconsForTitles(event.titles, true) : '';
                    const hasRockets = event.titles && event.titles.some(t => t.includes('רקטות') || t.includes('טילים'));
                    const hasPlanes = event.titles && event.titles.some(t => t.includes('טיס') || t.includes('כטב"ם'));
                    colorTheme = (hasRockets || !hasPlanes) ? '#d32f2f' : '#ff8c00';

                    const citiesArray = (event.text || '').split(',').map(c => c.trim());
                    const regionsSet = new Set();
                    citiesArray.forEach(c => { 
                        const reg = typeof getRegion === 'function' ? getRegion(c) : null; 
                        if (reg) regionsSet.add(reg); 
                    });

                    if (regionsSet.size > 0) mainTitleText = Array.from(regionsSet).join(', ');
                    else mainTitleText = event.titles ? event.titles.join(' | ') : 'התרעת פיקוד העורף';
                    
                } else if (isEarly) {
                    // התרעה מקדימה - נשאר בדיוק כמו שהיה!
                    iconsHtml = typeof iconEarly !== 'undefined' ? iconEarly : '!';
                    mainTitleText = 'מבזק פיקוד העורף - התרעה מקדימה'; 
                    colorTheme = '#b71111'; 
                    
                    const placesArray = (event.text || '').split(',').map(c => c.trim()).filter(c => c !== '');
                    
                    if (placesArray.length <= 3) {
                        citiesString = "התרעה מקדימה ב- <span style='font-weight:bold; color:#ffb300;'>" + placesArray.join(', ') + "</span>";
                    } else {
                        const regionsSet = new Set();
                        placesArray.forEach(c => {
                            const reg = typeof getRegion === 'function' ? getRegion(c) : null;
                            if (reg) regionsSet.add(reg);
                        });
                        const regionsArray = Array.from(regionsSet);
                        
                        if (regionsArray.length > 1) {
                            citiesString = "בעקבות זיהוי שיגורים, צפויות להתקבל התרעות באזורים: <span style='font-weight:bold; color:#ffb300;'>" + regionsArray.join(', ') + "</span>";
                        } else if (regionsArray.length === 1) {
                            citiesString = "בעקבות זיהוי שיגורים, צפויות להתקבל התרעות באזור: <span style='font-weight:bold; color:#ffb300;'>" + regionsArray[0] + "</span>";
                        } else {
                            citiesString = "בעקבות זיהוי שיגורים, צפויות להתקבל התרעות ב- <span style='font-weight:bold; color:#ffb300;'>" + placesArray.join(', ') + "</span>";
                        }
                    }
                    
                } else {
                    // סיום אירוע ירוק - כאן נמצא התיקון שמוציא אזורים!
                    iconsHtml = typeof iconCheck !== 'undefined' ? iconCheck : '✓';
                    mainTitleText = event.titles && event.titles.length > 0 ? event.titles[0] : 'עדכון פיקוד העורף';
                    colorTheme = '#388e3c'; 

                    const placesArray = (event.text || '').split(',').map(c => c.trim()).filter(c => c !== '');
                    const regionsSet = new Set();
                    
                    placesArray.forEach(c => {
                        const reg = typeof getRegion === 'function' ? getRegion(c) : null;
                        if (reg) {
                            regionsSet.add(reg);
                        } else {
                            regionsSet.add(c);
                        }
                    });
                    
                    const regionsArray = Array.from(regionsSet);

                    if (regionsArray.length > 1) {
                        citiesString = "האירוע הסתיים באזורים: <span style='font-weight:bold;'>" + regionsArray.join(', ') + "</span>";
                    } else if (regionsArray.length === 1) {
                        citiesString = "האירוע הסתיים באזור <span style='font-weight:bold;'>" + regionsArray[0] + "</span>";
                    } else {
                        citiesString = "האירוע הסתיים.";
                    }
                }

                if (!card) {
                    card = document.createElement('div');
                    card.id = event.id;
                    card.className = 'alert-card';
                    card.style.display = 'flex';
                    card.style.direction = 'rtl';
                    card.style.backgroundColor = '#ffffff';
                    card.style.borderRadius = '6px';
                    card.style.overflow = 'hidden'; 
                    card.style.marginBottom = '12px';
                    card.style.boxShadow = '0 2px 5px rgba(0,0,0,0.15)';
                    card.style.minHeight = '70px'; 
                    card.style.height = 'auto'; 
                    card.style.flexShrink = '0'; 
                    card.style.alignItems = 'stretch'; 
                    alertListContainer.appendChild(card);
                }

                card.innerHTML = `
                    <div style="background-color: ${colorTheme}; width: 45px; flex-shrink: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 5px 0; color: white; font-weight: bold; font-size: 1.2em;">
                        ${iconsHtml}
                    </div>
                    <div style="padding: 12px 15px; flex-grow: 1; word-wrap: break-word;">
                        <div style="font-size: 1.2em; font-weight: bold; color: #222; margin-bottom: 4px;">${mainTitleText}</div>
                        <div style="font-size: 0.9em; color: ${colorTheme}; margin-bottom: 8px;">
                            <span style="font-weight: bold;">${relativeTimeStr}</span> | ${timeString}
                        </div>
                        <div style="font-size: 0.95em; color: #555; line-height: 1.5;">${citiesString}</div>
                    </div>
                `;

                const expectedNode = alertListContainer.children[index];
                if (expectedNode !== card) alertListContainer.insertBefore(card, expectedNode);
            });
        }

    } catch(e) {
        console.error("Error in updateUI:", e);
    }
}

setInterval(updateUI, 1000);

// ============================================
// מנוע גרירה חופשית (אפקט מגנוט, נטייה דינמית, ופיזיקה חלקה)
// ============================================
// ============================================
// מנוע גרירה חופשית (אפקט מגנוט, נטייה דינמית, ופיזיקה חלקה)
// ============================================
const panel = document.getElementById('floating-panel');
const header = document.querySelector('.panel-header');
const fabButton = document.getElementById('fab-button');
const fabBadge = document.getElementById('fab-badge');

let isPanelHidden = false;
let isDraggingPanel = false;
let isDraggingFab = false;
let startX, startY, initialTop, initialRight, initialFabTop;
let dragStartTime;

const PANEL_WIDTH = 400; 
const DISMISS_THRESHOLD = -(PANEL_WIDTH * 0.3); // 30% מחוץ למסך

// משתנים למעקב אחר מהירות הגרירה (לצורך אפקט הנטייה)
let lastMouseX = 0;
let currentRotation = 0;

// --- התיקון: קיבוע המיקום ההתחלתי מיד בטעינה ---
// זה מונע את הקפיצה/חוסר האנימציה בגרירה הראשונה!
window.addEventListener('DOMContentLoaded', () => {
    const rect = panel.getBoundingClientRect();
    panel.style.top = `${rect.top}px`;
    panel.style.right = `${window.innerWidth - rect.right}px`;
});

// --- גרירת הפאנל הגדול ---
header.addEventListener('mousedown', startPanelDrag);
document.addEventListener('mousemove', doPanelDrag);
document.addEventListener('mouseup', stopPanelDrag);

function startPanelDrag(e) {
    if (isPanelHidden) return;
    isDraggingPanel = true;
    startX = e.clientX;
    startY = e.clientY;
    lastMouseX = e.clientX; 
    dragStartTime = Date.now();
    
    const rect = panel.getBoundingClientRect();
    initialTop = rect.top;
    initialRight = window.innerWidth - rect.right;
    
    // מנקים מעברים שמוגדרים ישירות על הסטייל, נותנים ל-CSS לעבוד!
    panel.style.transition = '';
    
    panel.classList.add('dragging');
    document.body.style.userSelect = 'none';

    fabButton.style.top = `${initialTop}px`;
    fabButton.style.transition = 'none'; 
}

function doPanelDrag(e) {
// ... השאר נשאר בדיוק אותו דבר!
    if (!isDraggingPanel) return;
    
    const dx = startX - e.clientX; 
    const dy = e.clientY - startY;

    let newTop = initialTop + dy;
    let newRight = initialRight + dx;

    // --- התיקון: חוסם את הפאנל מלעלות מעל אזור כפתור ההתחברות ---
    if (newTop < 80) {
        newTop = 80;
    }

    // --- חישוב הנטייה הדינמית (Physics-based Rotation) ---
    const velocityX = e.clientX - lastMouseX; 
    lastMouseX = e.clientX;

    const targetRotation = Math.max(-5, Math.min(5, velocityX * 0.3));
    currentRotation += (targetRotation - currentRotation) * 0.2;

    panel.style.transform = `scale(1.01) rotate(${currentRotation}deg)`;
    panel.style.top = `${newTop}px`;
    panel.style.right = `${newRight}px`;

    // --- אנימציה כשהפאנל נדחף לקיר הימני ---
    if (newRight < 0) {
        const progress = Math.min(newRight / DISMISS_THRESHOLD, 1);
        panel.style.opacity = 1 - (progress * 0.5); 
        
        fabButton.style.display = 'flex';
        fabButton.style.right = `${-70 + (progress * 70)}px`; 
    } else {
        panel.style.opacity = 1;
        fabButton.style.display = 'none';
        fabButton.style.right = '-70px';
    }
}

function stopPanelDrag(e) {
    if (!isDraggingPanel) return;
    isDraggingPanel = false;
    
    panel.classList.remove('dragging');
    document.body.style.userSelect = '';
    
    // החזרת זווית ישרה
    panel.style.transform = `scale(1) rotate(0deg)`;
    currentRotation = 0;
    
    // מנקה סטיילים - ה-CSS יעשה את אנימציית החזרה לבד!
    panel.style.transition = '';
    fabButton.style.transition = '';

    const dx = startX - e.clientX;
    const dy = e.clientY - startY;
    const timeElapsed = Date.now() - dragStartTime;
    const isClick = timeElapsed < 200 && Math.abs(dx) < 5 && Math.abs(dy) < 5;

    const rect = panel.getBoundingClientRect();
    const currentRight = window.innerWidth - rect.right;

    // --- קבלת החלטות ---
    if (currentRight <= DISMISS_THRESHOLD) {
        dismissPanel(rect.top);
    } 
    else if (currentRight < 150) {
        panel.style.opacity = 1;
        panel.style.right = '20px';
        fabButton.style.right = '-70px';

        let currentTop = rect.top;
        if (currentTop < 80) panel.style.top = '80px'; 
        if (currentTop > window.innerHeight - 100) panel.style.top = `${window.innerHeight - 100}px`;
    } 
    else {
        panel.style.opacity = 1;
        fabButton.style.right = '-70px';

        let currentTop = rect.top;
        if (currentTop < 80) panel.style.top = '80px'; 
        if (currentTop > window.innerHeight - 100) panel.style.top = `${window.innerHeight - 100}px`;
        if (currentRight > window.innerWidth - 420) panel.style.right = `${window.innerWidth - 420}px`;
    }
}

function toggleCollapse(e) {
    e.stopPropagation();

    const panel = document.getElementById('floating-panel');
    const btn = document.getElementById('toggle-btn');

    if (panel.classList.contains('collapsed')) {
        panel.classList.remove('collapsed');
        btn.innerText = '▼';
    } else {
        panel.classList.add('collapsed');
        btn.innerText = '▲';
    }
}

function dismissPanel(lastTop) {
    isPanelHidden = true;
    
    // מחליק את הפאנל עד הסוף החוצה ומעלים אותו
    panel.style.right = '-420px';
    panel.style.opacity = 0;
    
    // מוודא שהכפתור באותו גובה וקופץ פנימה סופית
    fabButton.style.display = 'flex';
    fabButton.style.top = `${lastTop}px`;
    
    // דיליי קטנטן מאפשר ל-CSS לרנדר את הקפיצה של הכפתור
    setTimeout(() => {
        fabButton.classList.add('visible');
        fabButton.style.right = '0px'; 
    }, 10);
}

// --- גרירת הכפתור השחור (למעלה/למטה בלבד) ---
fabButton.addEventListener('mousedown', startFabDrag);
document.addEventListener('mousemove', doFabDrag);
document.addEventListener('mouseup', stopFabDrag);

function startFabDrag(e) {
    if (!isPanelHidden) return;
    isDraggingFab = true;
    startY = e.clientY;
    dragStartTime = Date.now();
    const rect = fabButton.getBoundingClientRect();
    initialFabTop = rect.top;
    fabButton.style.transition = 'none';
}

function doFabDrag(e) {
    if (!isDraggingFab) return;
    const dy = e.clientY - startY;
    let newTop = initialFabTop + dy;
    
    // התיקון: חוסם את הכפתור מלעלות מעל 80 פיקסלים
    if (newTop < 80) newTop = 80; 
    
    if (newTop > window.innerHeight - 65) newTop = window.innerHeight - 65;
    fabButton.style.top = `${newTop}px`;
}

function stopFabDrag(e) {
    if (!isDraggingFab) return;
    isDraggingFab = false;
    fabButton.style.transition = 'right 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)';

    // התיקון כאן: בודקים את המרחק האמיתי שהעכבר עבר מאז הלחיצה
    const dy = Math.abs(startY - e.clientY);
    const timeElapsed = Date.now() - dragStartTime;
    
    // לחיצה תחשב רק אם: העכבר לא זז יותר מ-5 פיקסלים *וגם* הזמן היה קצר מ-300ms
    const isClick = timeElapsed < 300 && dy < 5;

    // פותחים את הפאנל אך ורק אם זו הייתה באמת לחיצה ולא סוף של גרירה!
    if (isClick) {
        restorePanel();
    }
}

function restorePanel() {
    isPanelHidden = false;
    
    const panel = document.getElementById('floating-panel');
    const fabButton = document.getElementById('fab-button');

    // 1. מעלימים את המלבן השחור
    fabButton.classList.remove('visible');
    fabButton.style.right = '-70px';
    
    const badge = document.getElementById('fab-badge');
    if (badge) badge.classList.remove('active');
    
    // 2. מחזירים את הפאנל למסך
    const rect = fabButton.getBoundingClientRect();
    panel.style.top = `${rect.top}px`;
    panel.style.right = '20px'; 
    panel.style.opacity = '1';
    panel.style.pointerEvents = 'auto'; // מחזירים לו את האפשרות לקבל לחיצות!
}

// ============================================
// מערכת חיפוש וסינון התרעות חכמה
// ============================================
const searchInput = document.getElementById('city-search');
searchInput.addEventListener('input', function(e) {
    const searchTerm = e.target.value.trim();
    const allCards = document.querySelectorAll('.alert-card');
    allCards.forEach(card => {
        const cardText = card.innerText;
        if (cardText.includes(searchTerm)) card.style.display = 'flex';
        else card.style.display = 'none';
    });
});
// ===========================================
// מערכת משתמשים (התחברות/הרשמה)
// ===========================================

// בדיקה אם המשתמש כבר מחובר ברגע שהדף נטען
// פונקציה שהופכת את הכפתור לסמל של איש בוואטסאפ
function updateAuthUI(username) {
    const authBtn = document.getElementById('auth-button');
    if (username) {
        authBtn.classList.add('logged-in');
        // סמל איש גנרי מ-SVG
        authBtn.innerHTML = `<svg viewBox="0 0 24 24"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>`;
        authBtn.title = `מחובר כ: ${username}`; // ברחיפה עם העכבר יראו את השם!
    } else {
        authBtn.classList.remove('logged-in');
        authBtn.innerHTML = 'כניסת משתמש';
        authBtn.title = '';
    }
}

// בדיקה אם המשתמש כבר מחובר ברגע שהדף נטען
window.addEventListener('DOMContentLoaded', () => {
    const savedUser = localStorage.getItem('currentUser');
    if (savedUser) {
        updateAuthUI(savedUser);
    }
});

function openAuthModal() {
    document.getElementById('auth-modal').classList.remove('hidden');
    document.getElementById('auth-msg').innerText = ''; // ניקוי הודעות קודמות
}

function closeAuthModal() {
    document.getElementById('auth-modal').classList.add('hidden');
}

// החלפה בין לשונית "משתמש קיים" ל"משתמש חדש"
function switchAuthTab(tab) {
    document.getElementById('auth-msg').innerText = '';
    
    if (tab === 'login') {
        document.getElementById('tab-login').classList.add('active');
        document.getElementById('tab-register').classList.remove('active');
        document.getElementById('form-login').classList.remove('hidden');
        document.getElementById('form-register').classList.add('hidden');
    } else {
        document.getElementById('tab-register').classList.add('active');
        document.getElementById('tab-login').classList.remove('active');
        document.getElementById('form-register').classList.remove('hidden');
        document.getElementById('form-login').classList.add('hidden');
    }
}

// שליחת הנתונים לשרת (auth.js ערוך ומוכן לקבל את זה)
async function submitAuth(action) {
    let username, password;
    const msgDiv = document.getElementById('auth-msg');

    if (action === 'login') {
        username = document.getElementById('login-user').value.trim();
        password = document.getElementById('login-pass').value.trim();
    } else {
        username = document.getElementById('reg-user').value.trim();
        password = document.getElementById('reg-pass').value.trim();
        const pass2 = document.getElementById('reg-pass2').value.trim();

        // בדיקה שהסיסמאות תואמות בהרשמה
        if (password !== pass2) {
            msgDiv.style.color = '#f44336'; // אדום
            msgDiv.innerText = 'הסיסמאות אינן תואמות!';
            return;
        }
    }

    if (!username || !password) {
        msgDiv.style.color = '#f44336';
        msgDiv.innerText = 'נא למלא את כל השדות.';
        return;
    }

    try {
        const response = await fetch(`http://localhost:3000/api/auth/${action}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });

        const data = await response.json();

        if (response.ok) {
            msgDiv.style.color = '#4caf50'; // ירוק
            msgDiv.innerText = data.message;
            
            // שומרים את המשתמש בדפדפן ומעדכנים את הכפתור לסמל
            const loggedInUser = data.username || username; 
            localStorage.setItem('currentUser', loggedInUser);
            updateAuthUI(loggedInUser); // <<--- זו השורה החדשה

            // סוגרים את החלון אחרי שנייה וחצי
            setTimeout(closeAuthModal, 1500);
        } else {
            msgDiv.style.color = '#f44336';
            msgDiv.innerText = data.error; // למשל: "שם המשתמש כבר תפוס" שמגיע מהשרת
        }
    } catch (err) {
        msgDiv.style.color = '#f44336';
        msgDiv.innerText = 'שגיאת תקשורת עם השרת.';
    }
}

document.getElementById('toggle-btn').addEventListener('click', toggleCollapse);
updateUI();