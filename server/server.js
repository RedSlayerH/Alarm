// ============================================================
// server.js – main server entry point
// ============================================================

require('dotenv').config(); // loads .env file for local development

const express    = require('express');
const cors       = require('cors');
const fs         = require('fs');
const path       = require('path');

const config     = require('./config');
const state      = require('./state');
const { connectDB } = require('./db');
const { fetchOfficialHistory, pollOref, proxyOrefRequest, setLastClientIP } = require('./orefPoller');
const testRoutes  = require('./testRoutes');
const authRoutes  = require('./auth');
const soundRoutes = require('./soundRoutes');

const app = express();
app.use(cors());
app.use(express.json());

// Serve static client files from root
app.use(express.static(path.join(__dirname, '..')));

// ============================================================
// Routes
// ============================================================

app.use('/api/auth',  authRoutes);
app.use('/api/test',  testRoutes);
app.use('/api/sound', soundRoutes);

app.get('/api/state', (req, res) => {
    // Track real client IP for oref proxy
    const clientIP = req.headers['x-forwarded-for']?.split(',')[0].trim()
        || req.headers['x-real-ip']
        || req.socket.remoteAddress;
    setLastClientIP(clientIP);

    res.json({
        history:         state.getHistory(),
        activeMapCities: state.getMapCircles(),
    });
});

app.get('/api/cities', (req, res) => {
    res.json(state.getCityToRegion());
});

// ============================================================
// Oref proxy routes – forward requests with real client IP
// ============================================================

app.get('/api/proxy/alerts', async (req, res) => {
    const clientIP = req.headers['x-forwarded-for']?.split(',')[0].trim()
        || req.headers['x-real-ip']
        || req.socket.remoteAddress;
    setLastClientIP(clientIP);

    try {
        const { status, data } = await proxyOrefRequest(config.OREF_ALERTS_URL, clientIP);
        res.status(status).json(data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/proxy/history', async (req, res) => {
    const clientIP = req.headers['x-forwarded-for']?.split(',')[0].trim()
        || req.headers['x-real-ip']
        || req.socket.remoteAddress;
    setLastClientIP(clientIP);

    try {
        const { status, data } = await proxyOrefRequest(config.OREF_HISTORY_URL, clientIP);
        res.status(status).json(data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ============================================================
// Load cities mapping
// ============================================================

async function loadCitiesMapping() {
    try {
        const raw    = fs.readFileSync(config.CITIES_FILE, 'utf8');
        const cities = JSON.parse(raw);
        const mapping = {};
        cities.forEach(c => {
            if (c.name && c.zone) mapping[c.name.trim()] = c.zone.trim();
        });
        state.setCityToRegion(mapping);
        console.log(`[server] loaded ${Object.keys(mapping).length} cities`);
    } catch (err) {
        console.error('[server] error loading cities.json:', err.message);
    }
}

// ============================================================
// Start
// ============================================================

async function start() {
    await connectDB();
    await loadCitiesMapping();
    await fetchOfficialHistory();
    setInterval(pollOref, config.POLL_INTERVAL_MS);
    app.listen(config.PORT, () => {
        console.log(`[server] running on http://localhost:${config.PORT}`);
    });
}

start();