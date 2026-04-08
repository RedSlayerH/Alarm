// ============================================================
// soundRoutes.js  – נתיבי שרת לפיצ'ר לוח הצלילים
// העלאת שירים, שמירת יישובים לפי סוג התרעה, פירוט per-user
// ============================================================

const express  = require('express');
const fs       = require('fs');
const path     = require('path');
const router   = express.Router();

// ספריית multer להעלאת קבצים (npm install multer)
let multer;
try {
    multer = require('multer');
} catch(e) {
    console.error('[soundRoutes] multer לא מותקן! הרץ: npm install multer');
}

// ============================================================
// הגדרות תיקיות
// ============================================================

const SOUNDS_DIR    = path.join(__dirname, 'sounds');          // קבצי השמע
const USERDATA_DIR  = path.join(__dirname, 'soundUserData');   // נתוני משתמשים

// יצירת תיקיות אם לא קיימות
if (!fs.existsSync(SOUNDS_DIR))   fs.mkdirSync(SOUNDS_DIR,   { recursive: true });
if (!fs.existsSync(USERDATA_DIR)) fs.mkdirSync(USERDATA_DIR, { recursive: true });

// ============================================================
// הגדרת multer – שמירת קבצים עם שם ייחודי
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
            cb(new Error('פורמט קובץ לא נתמך. השתמש ב-MP3, WAV, OGG, M4A, AAC או FLAC'), false);
        }
    };

    upload = multer({ storage, fileFilter, limits: { fileSize: 20 * 1024 * 1024 } });
}

// ============================================================
// עזר: קריאה/כתיבה של נתוני משתמש
// ============================================================

function getUserDataPath(username) {
    // ניקוי שם משתמש מתווים מסוכנים
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
        // מפה: alertType → { cities: [], songFile: null }
        alert: { cities: [], songFile: null },
        early: { cities: [], songFile: null },
        clear: { cities: [], songFile: null },
    };
}

// ============================================================
// GET /api/sound/userdata?username=xxx
// מחזיר את נתוני המשתמש (ערים + שמות קבצים)
// ============================================================

router.get('/userdata', (req, res) => {
    const { username } = req.query;
    if (!username) return res.status(400).json({ error: 'חסר username' });

    const data = loadUserData(username);
    res.json(data);
});

// ============================================================
// POST /api/sound/cities
// שמירת ערים לסוג התרעה מסוים
// body: { username, alertType, cities }
// ============================================================

router.post('/cities', (req, res) => {
    const { username, alertType, cities } = req.body;
    if (!username || !alertType) return res.status(400).json({ error: 'חסרים פרמטרים' });

    const data = loadUserData(username);
    if (!data[alertType]) data[alertType] = { cities: [], songFile: null };
    data[alertType].cities = cities || [];
    saveUserData(username, data);

    res.json({ success: true });
});

// ============================================================
// POST /api/sound/upload?username=xxx&alertType=alert
// העלאת קובץ שמע – מחליף קובץ קודם אם קיים
// ============================================================

router.post('/upload', (req, res) => {
    if (!upload) return res.status(500).json({ error: 'multer לא מותקן' });

    upload.single('song')(req, res, (err) => {
        if (err) return res.status(400).json({ error: err.message });
        if (!req.file) return res.status(400).json({ error: 'לא הועלה קובץ' });

        const { username, alertType } = req.query;
        if (!username || !alertType) return res.status(400).json({ error: 'חסרים פרמטרים' });

        // מחיקת קובץ ישן אם קיים
        const data = loadUserData(username);
        if (!data[alertType]) data[alertType] = { cities: [], songFile: null };

        if (data[alertType].songFile) {
            const oldPath = path.join(SOUNDS_DIR, data[alertType].songFile);
            if (fs.existsSync(oldPath)) {
                try { fs.unlinkSync(oldPath); } catch {}
            }
        }

        // שמירת שם הקובץ החדש
        data[alertType].songFile = req.file.filename;
        saveUserData(username, data);

        res.json({ success: true, filename: req.file.filename });
    });
});

// ============================================================
// DELETE /api/sound/song?username=xxx&alertType=alert
// מחיקת שיר לסוג התרעה
// ============================================================

router.delete('/song', (req, res) => {
    const { username, alertType } = req.query;
    if (!username || !alertType) return res.status(400).json({ error: 'חסרים פרמטרים' });

    const data = loadUserData(username);
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
// הגשת קובץ השמע לדפדפן
// ============================================================

router.get('/file/:filename', (req, res) => {
    const filename = req.params.filename.replace(/[^a-zA-Z0-9א-ת._-]/g, '');
    const filePath = path.resolve(SOUNDS_DIR, filename);

    // מניעת path traversal
    if (!filePath.startsWith(path.resolve(SOUNDS_DIR))) {
        return res.status(400).json({ error: 'בקשה לא חוקית' });
    }

    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'קובץ לא נמצא' });

    res.sendFile(filePath);
});

module.exports = router;
