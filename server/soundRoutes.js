// ============================================================
// soundRoutes.js  – נתיבי שרת לפיצ'ר לוח הצלילים
// העלאת שירים, שמירת יישובים לפי סוג התרעה, פירוט per-user
// ============================================================

const express  = require('express');
const fs       = require('fs');
const path     = require('path');
const router   = express.Router();

// multer for file uploads (npm install multer)
let multer;
try {
    multer = require('multer');
} catch(e) {
    console.error('[soundRoutes] multer not installed! Run: npm install multer');
}

// ============================================================
// Folder setup
// ============================================================

const SOUNDS_DIR    = path.join(__dirname, 'sounds');
const USERDATA_DIR  = path.join(__dirname, 'soundUserData');
const BUILTIN_DIR   = path.join(__dirname, 'sounds', 'builtin'); // built-in melodies

if (!fs.existsSync(SOUNDS_DIR))   fs.mkdirSync(SOUNDS_DIR,   { recursive: true });
if (!fs.existsSync(USERDATA_DIR)) fs.mkdirSync(USERDATA_DIR, { recursive: true });
if (!fs.existsSync(BUILTIN_DIR))  fs.mkdirSync(BUILTIN_DIR,  { recursive: true });

// ============================================================
// multer setup
// ============================================================

let upload = null;

if (multer) {
    const storage = multer.diskStorage({
        destination: (req, file, cb) => cb(null, SOUNDS_DIR),
        filename: (req, file, cb) => {
            const username  = req.query.username  || 'guest';
            const alertType = req.query.alertType || 'alert';
            const ext       = path.extname(file.originalname).toLowerCase();
            cb(null, `${username}_${alertType}_${Date.now()}${ext}`);
        },
    });

    const fileFilter = (req, file, cb) => {
        const allowed = ['.mp3', '.wav', '.ogg', '.m4a', '.aac', '.flac'];
        const ext     = path.extname(file.originalname).toLowerCase();
        if (allowed.includes(ext)) {
            cb(null, true);
        } else {
            cb(new Error('Unsupported file format. Use MP3, WAV, OGG, M4A, AAC or FLAC'), false);
        }
    };

    upload = multer({ storage, fileFilter, limits: { fileSize: 20 * 1024 * 1024 } });
}

// ============================================================
// Built-in melodies manifest
// Each melody: { id, name, file }
// ============================================================

const BUILTIN_MELODIES = [
    { id: 'builtin_1', name: 'מנגינה 1', file: 'melody_1.wav' },
    { id: 'builtin_2', name: 'מנגינה 2', file: 'melody_2.mp3' },
    { id: 'builtin_3', name: 'מנגינה 3', file: 'melody_3.mp3' },
];

// ============================================================
// User data helpers
// ============================================================

function getUserDataPath(username) {
    const safe = username.replace(/[^a-zA-Z0-9א-ת_-]/g, '_');
    return path.join(USERDATA_DIR, `${safe}.json`);
}

function loadUserData(username) {
    const filePath = getUserDataPath(username);
    try {
        if (!fs.existsSync(filePath)) return getDefaultUserData();
        return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch {
        return getDefaultUserData();
    }
}

function saveUserData(username, data) {
    const filePath = getUserDataPath(username);
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
}

function getDefaultUserData() {
    return {
        // builtinMelodyId:  which builtin melody is selected (null = none)
        // builtinActive:    true = builtin plays, false = uploaded song plays
        alert: { cities: [], songFile: null, builtinMelodyId: null, builtinActive: false },
        early: { cities: [], songFile: null, builtinMelodyId: null, builtinActive: false },
        clear: { cities: [], songFile: null, builtinMelodyId: null, builtinActive: false },
    };
}

// Migrate old user data that lacks new fields
function migrateUserData(data) {
    ['alert', 'early', 'clear'].forEach(t => {
        if (!data[t]) data[t] = getDefaultUserData()[t];
        if (data[t].builtinMelodyId === undefined) data[t].builtinMelodyId = null;
        if (data[t].builtinActive   === undefined) data[t].builtinActive   = false;
    });
    return data;
}

// ============================================================
// GET /api/sound/userdata?username=xxx
// ============================================================

router.get('/userdata', (req, res) => {
    const { username } = req.query;
    if (!username) return res.status(400).json({ error: 'missing username' });
    const data = migrateUserData(loadUserData(username));
    res.json(data);
});

// ============================================================
// POST /api/sound/cities
// body: { username, alertType, cities }
// ============================================================

router.post('/cities', (req, res) => {
    const { username, alertType, cities } = req.body;
    if (!username || !alertType) return res.status(400).json({ error: 'missing params' });

    const data = migrateUserData(loadUserData(username));
    if (!data[alertType]) data[alertType] = getDefaultUserData()[alertType];
    data[alertType].cities = cities || [];
    saveUserData(username, data);

    res.json({ success: true });
});

// ============================================================
// POST /api/sound/builtin
// body: { username, alertType, builtinMelodyId, builtinActive }
// ============================================================

router.post('/builtin', (req, res) => {
    const { username, alertType, builtinMelodyId, builtinActive } = req.body;
    if (!username || !alertType) return res.status(400).json({ error: 'missing params' });

    const data = migrateUserData(loadUserData(username));
    if (!data[alertType]) data[alertType] = getDefaultUserData()[alertType];
    data[alertType].builtinMelodyId = builtinMelodyId ?? null;
    data[alertType].builtinActive   = !!builtinActive;
    saveUserData(username, data);

    res.json({ success: true });
});

// ============================================================
// POST /api/sound/upload?username=xxx&alertType=alert
// ============================================================

router.post('/upload', (req, res) => {
    if (!upload) return res.status(500).json({ error: 'multer not installed' });

    upload.single('song')(req, res, (err) => {
        if (err) return res.status(400).json({ error: err.message });
        if (!req.file) return res.status(400).json({ error: 'no file uploaded' });

        const { username, alertType } = req.query;
        if (!username || !alertType) return res.status(400).json({ error: 'missing params' });

        const data = migrateUserData(loadUserData(username));
        if (!data[alertType]) data[alertType] = getDefaultUserData()[alertType];

        // Delete old file
        if (data[alertType].songFile) {
            const oldPath = path.join(SOUNDS_DIR, data[alertType].songFile);
            if (fs.existsSync(oldPath)) {
                try { fs.unlinkSync(oldPath); } catch {}
            }
        }

        data[alertType].songFile = req.file.filename;
        saveUserData(username, data);

        res.json({ success: true, filename: req.file.filename });
    });
});

// ============================================================
// DELETE /api/sound/song?username=xxx&alertType=alert
// ============================================================

router.delete('/song', (req, res) => {
    const { username, alertType } = req.query;
    if (!username || !alertType) return res.status(400).json({ error: 'missing params' });

    const data = migrateUserData(loadUserData(username));
    if (data[alertType]?.songFile) {
        const filePath = path.join(SOUNDS_DIR, data[alertType].songFile);
        if (fs.existsSync(filePath)) {
            try { fs.unlinkSync(filePath); } catch {}
        }
        data[alertType].songFile = null;
        saveUserData(username, data);
    }

    res.json({ success: true });
});

// ============================================================
// GET /api/sound/file/:filename
// ============================================================

router.get('/file/:filename', (req, res) => {
    const filename = req.params.filename.replace(/[^a-zA-Z0-9א-ת._-]/g, '');
    const filePath = path.resolve(SOUNDS_DIR, filename);

    if (!filePath.startsWith(path.resolve(SOUNDS_DIR))) {
        return res.status(400).json({ error: 'invalid request' });
    }

    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'file not found' });

    res.sendFile(filePath);
});

// ============================================================
// GET /api/sound/builtin/:filename  – serve built-in melodies
// ============================================================

router.get('/builtin/:filename', (req, res) => {
    const filename = req.params.filename.replace(/[^a-zA-Z0-9._-]/g, '');
    const filePath = path.resolve(BUILTIN_DIR, filename);

    if (!filePath.startsWith(path.resolve(BUILTIN_DIR))) {
        return res.status(400).json({ error: 'invalid request' });
    }

    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'file not found' });

    res.sendFile(filePath);
});

// ============================================================
// GET /api/sound/melodies  – return the built-in melodies list
// ============================================================

router.get('/melodies', (req, res) => {
    res.json(BUILTIN_MELODIES);
});

module.exports = router;
