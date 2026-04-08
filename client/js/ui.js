// ============================================================
// ui.js  – כרטיסיות, icons, פורמט זמן, מיזוג תצוגה
// ============================================================

// ============================================================
// הגדרת כל סוגי האיומים במקום אחד
// שינוי כותרת/צבע/אייקון של סוג מסוים – רק כאן!
// ============================================================

const THREAT_TYPES = {
    rocket: {
        color: '#d32f2f',
        label: 'ירי רקטות וטילים',
        icon: `<svg viewBox="0 0 24 24" width="24" height="24" fill="white"><path d="M14.07,3.58L15.42,2.23C16.21,1.45 17.59,1.45 18.37,2.23L21.78,5.63C22.56,6.41 22.56,7.79 21.78,8.58L20.42,9.93L14.07,3.58M12.66,5L2.55,15.1C2.42,15.38 2.33,15.38 2.26,15.56L1,20.41L1.41,20.83L6.26,19.57C6.44,19.5 6.6,19.41 6.72,19.28L16.83,9.17L12.66,5Z"/></svg>`,
    },
    drone: {
        color: '#ff8c00',
        label: 'חדירת כלי טיס עוין',
        icon: `<svg viewBox="0 0 24 24" width="26" height="26" fill="white"><path d="M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z"/></svg>`,
    },
    terrorist: {
        color: '#7b1fa2',
        label: 'חדירת מחבלים',
        icon: `<svg viewBox="0 0 24 24" width="24" height="24" fill="white"><path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm0 4c1.86 0 3.41 1.28 3.86 3H8.14C8.59 6.28 10.14 5 12 5zm0 12c-2.67 0-5-1.34-5-4 0-1.4.78-2.61 1.93-3.32L11 12.28V17h2v-4.72l2.07-2.6C16.22 10.39 17 11.6 17 13c0 2.66-2.33 4-5 4z"/></svg>`,
    },
    earthquake: {
        color: '#795548',
        label: 'רעידת אדמה',
        icon: `<svg viewBox="0 0 24 24" width="24" height="24" fill="white"><path d="M11.5 2C6.81 2 3 5.81 3 10.5S6.81 19 11.5 19h.5v3c4.86-2.34 8-7 8-11.5C20 5.81 16.19 2 11.5 2zm1 14.5h-2v-2h2v2zm0-4h-2c0-3.25 3-3 3-5 0-1.1-.9-2-2-2s-2 .9-2 2h-2c0-2.21 1.79-4 4-4s4 1.79 4 4c0 2.5-3 2.75-3 5z"/></svg>`,
    },
    tsunami: {
        color: '#0277bd',
        label: 'צונאמי',
        icon: `<svg viewBox="0 0 24 24" width="24" height="24" fill="white"><path d="M17.5 12c-1.93 0-3.5 1.57-3.5 3.5S15.57 19 17.5 19s3.5-1.57 3.5-3.5S19.43 12 17.5 12zM2 17l1.5-1.5c1 1 2.5 1 3.5 0l1.5 1.5c-1 1-2 1.5-3.25 1.5S3 18 2 17zm0-4l1.5-1.5c1.94 1.94 5.06 1.94 7 0L12 13c-2.81 2.81-7.19 2.81-10 0zm10-4l1.5-1.5c1 1 2.5 1 3.5 0L18.5 9c-1 1-2 1.5-3.25 1.5S13 10 12 9zm-10 0l1.5-1.5c1.94 1.94 5.06 1.94 7 0L12 9C9.19 11.81 4.81 11.81 2 9z"/></svg>`,
    },
    hazmat: {
        color: '#f57f17',
        label: 'חומרים מסוכנים',
        icon: `<svg viewBox="0 0 24 24" width="24" height="24" fill="white"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg>`,
    },
    early: {
        color: '#b71111',
        label: 'התרעה מקדימה',
        icon: `<svg viewBox="0 0 24 24" width="24" height="24" fill="white"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg>`,
    },
    clear: {
        color: '#388e3c',
        label: 'סיום אירוע',
        icon: `<svg viewBox="0 0 24 24" width="26" height="26" fill="white"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>`,
    },
};

/**
 * מחזיר את ה-THREAT_TYPE המתאים לפי titles ו-type של event.
 * גם בודק category שנשמר מהשרת.
 */
function resolveThreatType(event) {
    if (event.type === 'clear') return THREAT_TYPES.clear;
    if (event.type === 'early') return THREAT_TYPES.early;

    // קודם כל לפי category שהשרת שלח
    if (event.category && THREAT_TYPES[event.category]) {
        return THREAT_TYPES[event.category];
    }

    // fallback: לפי כותרות
    const str = (event.titles || []).join(' ');
    if (str.includes('מחבל') || str.includes('פיגוע'))       return THREAT_TYPES.terrorist;
    if (str.includes('טיס') || str.includes('כטב"ם'))        return THREAT_TYPES.drone;
    if (str.includes('רעידת אדמה') || str.includes('רעידה')) return THREAT_TYPES.earthquake;
    if (str.includes('צונאמי'))                               return THREAT_TYPES.tsunami;
    if (str.includes('חומרים מסוכנים') ||
        str.includes('רדיולוגי') ||
        str.includes('לא קונבנציונלי'))                      return THREAT_TYPES.hazmat;
    return THREAT_TYPES.rocket;
}

// ============================================================
// פורמט זמן
// ============================================================

function pad(n) { return n.toString().padStart(2, '0'); }

function formatTimeRange(t1, t2) {
    const d1 = new Date(t1), d2 = new Date(t2);
    const date = `${pad(d1.getDate())}/${pad(d1.getMonth()+1)}/${d1.getFullYear()}`;
    const s1 = `${pad(d1.getHours())}:${pad(d1.getMinutes())}`;
    const s2 = `${pad(d2.getHours())}:${pad(d2.getMinutes())}`;
    return s1 === s2 ? `${date} (${s1})` : `${date} (${s1} - ${s2})`;
}

function relativeTime(ts) {
    const m = Math.floor((Date.now() - ts) / 60000);
    if (m < 1)   return 'עכשיו';
    if (m === 1) return 'לפני דקה';
    if (m === 2) return 'לפני 2 דקות';
    if (m < 60)  return `לפני ${m} דקות`;
    const h = Math.floor(m / 60);
    if (h === 1) return 'לפני שעה';
    if (h === 2) return 'לפני שעתיים';
    return `לפני ${h} שעות`;
}

// ============================================================
// עזר: עוטף ערים בתוך spans לחיצים (רק ערים, לא אזורים)
// ============================================================

/**
 * מקבל מחרוזת של ערים מופרדות בפסיק,
 * ומחזיר HTML שבו כל עיר (שיש לה אזור = היא עיר אמיתית) עטופה ב-span לחיץ.
 */
function buildClickableCities(text, cityToRegionFn, style = '', boldUnresolved = false) {
    return text.split(',').map(c => {
        const city = c.trim();
        if (!city) return '';
        const isCity = !!cityToRegionFn(city);
        if (isCity) {
            return `<span class="city-link" data-city="${city}" style="${style}">${city}</span>`;
        }
        // מקום שאין לו אזור – אם ביקשנו הדגשה, נעטוף ב-b
        return boldUnresolved ? `<b>${city}</b>` : city;
    }).join(', ');
}

// ============================================================
// בניית תוכן כרטיסייה
// ============================================================

function buildCardContent(event, cityToRegionFn) {
    const threat = resolveThreatType(event);
    const { type, titles = [], text = '' } = event;

    if (type === 'alert') {
        const citiesArr = text.split(',').map(c => c.trim());
        const regions   = [...new Set(citiesArr.map(cityToRegionFn).filter(Boolean))];

        // בדיקה אם יש גם טילים וגם כטב"מים באותה אזעקה
        const titleStr   = (titles || []).join(' ');
        const hasRockets = titleStr.includes('רקטות') || titleStr.includes('טילים');
        const hasDrones  = titleStr.includes('טיס') || titleStr.includes('כטב"ם');
        const isMixed    = hasRockets && hasDrones;

        let colorTheme, iconsHtml;
        if (isMixed) {
            colorTheme = THREAT_TYPES.rocket.color;
            iconsHtml  = `<div style="margin-bottom:3px;">${THREAT_TYPES.drone.icon}</div><div>${THREAT_TYPES.rocket.icon}</div>`;
        } else {
            colorTheme = threat.color;
            iconsHtml  = `<div>${threat.icon}</div>`;
        }

        return {
            colorTheme,
            iconsHtml,
            mainTitle:  regions.length > 0 ? regions.join(', ') : (titles.join(' | ') || threat.label),
            citiesHtml: buildClickableCities(text, cityToRegionFn),
        };
    }

    if (type === 'early') {
        const places = text.split(',').map(c => c.trim()).filter(Boolean);
        let citiesHtml;
        if (places.length <= 3) {
            const clickable = buildClickableCities(places.join(','), cityToRegionFn, 'font-weight:bold;color:#ffb300;');
            citiesHtml = `התרעה מקדימה ב- ${clickable}`;
        } else {
            const regions = [...new Set(places.map(cityToRegionFn).filter(Boolean))];
            const regionStr = regions.length > 1
                ? `באזורים: <span style="font-weight:bold;color:#ffb300;">${regions.join(', ')}</span>`
                : regions.length === 1
                    ? `באזור: <span style="font-weight:bold;color:#ffb300;">${regions[0]}</span>`
                    : `ב- ${buildClickableCities(places.join(','), cityToRegionFn, 'font-weight:bold;color:#ffb300;')}`;
            citiesHtml = `בעקבות זיהוי שיגורים, צפויות להתקבל התרעות ${regionStr}`;
        }
        return {
            colorTheme: threat.color,
            iconsHtml:  `<div>${threat.icon}</div>`,
            mainTitle:  'מבזק פיקוד העורף - התרעה מקדימה',
            citiesHtml,
        };
    }

    // clear
    const parts = text.split(',').map(s => s.trim()).filter(Boolean);
    let citiesHtml;
    if (parts.length > 3) {
        const regions = [...new Set(parts.map(cityToRegionFn).filter(Boolean))];
        // ערים שאין להן אזור – נציג אותן בנפרד בעיצוב בולט
        const unresolved = [...new Set(parts.filter(p => !cityToRegionFn(p)))];
        let display;
        if (regions.length > 0 && unresolved.length > 0) {
            display = [...regions, ...unresolved].join(', ');
        } else if (regions.length > 0) {
            display = regions.join(', ');
        } else {
            display = unresolved.join(', ') || text;
        }
        citiesHtml = `האירוע הסתיים באזורים: <b>${display}</b>`;
    } else if (parts.length > 1) {
        // כל מיקום – עיר או לא – מוצג בבולד
        citiesHtml = `האירוע הסתיים ב${buildClickableCities(text, cityToRegionFn, 'font-weight:bold;color:#222;', true)}`;
    } else if (parts.length === 1) {
        const isCity = !!cityToRegionFn(parts[0]);
        citiesHtml = isCity
            ? `האירוע הסתיים ב<span class="city-link" data-city="${parts[0]}" style="font-weight:bold;color:#222;">${parts[0]}</span>`
            : `האירוע הסתיים באזור <b>${parts[0]}</b>`;
    } else {
        citiesHtml = 'האירוע הסתיים.';
    }
    return {
        colorTheme: threat.color,
        iconsHtml:  `<div>${threat.icon}</div>`,
        mainTitle:  titles[0] || 'עדכון פיקוד העורף',
        citiesHtml,
    };
}

// ============================================================
// מיזוג היסטוריה לתצוגה
// ============================================================

function mergeHistoryForDisplay(history) {
    const merged = [];

    history.forEach(event => {
        const isEarly = event.type === 'early' ||
            event.titles?.some(t => t.includes('מקדימה')) ||
            event.text?.includes('מקדימה');
        const isRed   = event.type === 'alert' && !isEarly;

        if (isEarly) {
            const cleanText = (event.text || '').replace(/התרעה מקדימה ב-|בעקבות זיהוי שיגורים.*?באזורים:|בעקבות זיהוי שיגורים.*?באזור:|באזורים-|באזורים:/g, '').trim();
            const existing  = merged.find(e => e.type === 'early' && Math.abs(e.timestamp - event.timestamp) <= 300000);
            if (existing) {
                const combined = [...new Set([...existing.text.split(','), ...cleanText.split(',')].map(p => p.trim()).filter(Boolean))];
                existing.text = combined.join(', ');
                existing.lastUpdateTime = Math.max(existing.lastUpdateTime || existing.timestamp, event.lastUpdateTime || event.timestamp);
            } else {
                merged.push({ ...event, type: 'early', text: cleanText });
            }

        } else if (isRed) {
            const existing = merged.find(e => e.type === 'alert' && Math.abs(e.timestamp - event.timestamp) <= 120000);
            if (existing) {
                const combined = [...new Set([...existing.text.split(','), ...event.text.split(',')].map(p => p.trim()).filter(Boolean))];
                existing.text = combined.join(', ');
                existing.lastUpdateTime = Math.max(existing.lastUpdateTime || existing.timestamp, event.lastUpdateTime || event.timestamp);
                if (event.titles) existing.titles = [...new Set([...existing.titles, ...event.titles])];
                // שמור category אם יש
                if (event.category && !existing.category) existing.category = event.category;
            } else {
                merged.push({ ...event });
            }

        } else {
            const cleanText = (event.text || '').replace(/האירוע הסתיים באזורים:|האירוע הסתיים באזור:|האירוע הסתיים ביישובים:|האירוע הסתיים ב-|האירוע הסתיים/g, '').trim();
            const existing  = merged.find(e => e.type !== 'alert' && e.type !== 'early' && Math.abs(e.timestamp - event.timestamp) <= 180000);
            if (existing) {
                const combined = [...new Set([...existing.text.split(','), ...cleanText.split(',')].map(p => p.trim()).filter(Boolean))];
                existing.text = combined.join(', ');
                existing.lastUpdateTime = Math.max(existing.lastUpdateTime || existing.timestamp, event.lastUpdateTime || event.timestamp);
            } else {
                merged.push({ ...event, text: cleanText });
            }
        }
    });

    return merged;
}

// ============================================================
// רינדור כרטיסיות
// ============================================================

function renderAlertList(container, mergedHistory, cityToRegionFn) {
    const serverIds = mergedHistory.map(e => e.id);
    Array.from(container.children).forEach(child => {
        if (!serverIds.includes(child.id)) child.remove();
    });

    mergedHistory.forEach((event, index) => {
        let card = document.getElementById(event.id);
        const { colorTheme, iconsHtml, mainTitle, citiesHtml } = buildCardContent(event, cityToRegionFn);
        const timeString = formatTimeRange(event.timestamp, event.lastUpdateTime || event.timestamp);
        const relTime    = relativeTime(event.lastUpdateTime || event.timestamp);

        if (!card) {
            card = document.createElement('div');
            card.id        = event.id;
            card.className = 'alert-card';
            Object.assign(card.style, {
                display: 'flex', direction: 'rtl', backgroundColor: '#ffffff',
                borderRadius: '6px', overflow: 'hidden', marginBottom: '12px',
                boxShadow: '0 2px 5px rgba(0,0,0,0.15)', minHeight: '70px',
                height: 'auto', flexShrink: '0', alignItems: 'stretch',
            });
            container.appendChild(card);
        }

        card.innerHTML = `
            <div style="background-color:${colorTheme};width:45px;flex-shrink:0;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:5px 0;">
                ${iconsHtml}
            </div>
            <div style="padding:12px 15px;flex-grow:1;word-wrap:break-word;">
                <div style="font-size:1.2em;font-weight:bold;color:#222;margin-bottom:4px;">${mainTitle}</div>
                <div style="font-size:0.9em;color:${colorTheme};margin-bottom:8px;">
                    <span style="font-weight:bold;">${relTime}</span> | ${timeString}
                </div>
                <div style="font-size:0.95em;color:#555;line-height:1.5;">${citiesHtml}</div>
            </div>`;

        const expected = container.children[index];
        if (expected !== card) container.insertBefore(card, expected);
    });
}

// ============================================================
// CSS דינמי לספאנים לחיצים
// ============================================================

(function injectCityLinkStyles() {
    if (document.getElementById('city-link-style')) return;
    const style = document.createElement('style');
    style.id = 'city-link-style';
    style.textContent = `
        .city-link {
            cursor: pointer;
            transition: color 0.15s ease;
        }
        .city-link:hover {
            color: #1565c0 !important;
            text-decoration: underline;
        }
    `;
    document.head.appendChild(style);
})();

// ============================================================
// Event delegation – לחיצה על עיר → זום + פין
// ============================================================

document.addEventListener('click', function(e) {
    const span = e.target.closest('.city-link');
    if (!span) return;
    const city = span.getAttribute('data-city');
    if (city && typeof flyToCity === 'function') flyToCity(city);
});