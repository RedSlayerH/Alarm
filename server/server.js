// ============================================================
// server.js  – נקודת הכניסה הראשית לשרת
// אחראי רק על: הגדרת Express, רישום routes, הפעלת polling
// לוגיקה עסקית → alertProcessor.js
// state         → state.js
// polling       → orefPoller.js
// ============================================================

const express    = require('express');
const cors       = require('cors');
const fs         = require('fs');
const path       = require('path');

const config     = require('./config');
const state      = require('./state');
const { fetchOfficialHistory, pollOref } = require('./orefPoller');
const testRoutes = require('./testRoutes');
const authRoutes = require('./auth');
const soundRoutes = require('./soundRoutes'); // פיצ'ר לוח הצלילים

const app = express();
app.use(cors());
app.use(express.json());

// הגשת קבצי הקליינט הסטטיים מה-root
app.use(express.static(path.join(__dirname, '..')));

// ============================================================
// Routes
// ============================================================

// --- Auth ---
app.use('/api/auth', authRoutes);

// --- בדיקות (Development) ---
app.use('/api/test', testRoutes);

// --- Sound Panel ---
app.use('/api/sound', soundRoutes);

// --- State (מה שהקליינט מושך כל שנייה) ---
app.get('/api/state', (req, res) => {
    res.json({
        history:        state.getHistory(),
        activeMapCities: state.getMapCircles(),
    });
});

// --- מיפוי ערים לאזורים ---
app.get('/api/cities', (req, res) => {
    res.json(state.getCityToRegion());
});

// ============================================================
// טעינת נתוני ערים
// ============================================================

async function loadCitiesMapping() {
    try {
        const raw = fs.readFileSync(config.CITIES_FILE, 'utf8');
        const cities = JSON.parse(raw);
        const mapping = {};
        cities.forEach(c => {
            if (c.name && c.zone) mapping[c.name.trim()] = c.zone.trim();
        });
        state.setCityToRegion(mapping);
        console.log(`[server] נטענו ${Object.keys(mapping).length} ערים`);
    } catch (err) {
        console.error('[server] שגיאה בטעינת cities.json:', err.message);
    }
}

// ============================================================
// הפעלה
// ============================================================

async function start() {
    await loadCitiesMapping();
    await fetchOfficialHistory();
    setInterval(pollOref, config.POLL_INTERVAL_MS);
    app.listen(config.PORT, () => {
        console.log(`[server] רץ על http://localhost:${config.PORT}`);
    });
}

start();