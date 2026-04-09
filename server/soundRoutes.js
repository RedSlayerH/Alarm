// ============================================================
// soundRoutes.js – sound panel routes using MongoDB
// ============================================================

const express  = require('express');
const fs       = require('fs');
const path     = require('path');
const router   = express.Router();
const { SoundSettings } = require('./db');

// multer for file uploads
let multer;
try {
    multer = require('multer');
} catch(e) {
    console.error('[soundRoutes] multer not installed! Run: npm install multer');
}

// ============================================================
// Folder setup (only for uploaded audio files)
// ============================================================

const SOUNDS_DIR  = path.join(__dirname, 'sounds');
const BUILTIN_DIR = path.join(__dirname, 'sounds', 'builtin');

if (!fs.existsSync(SOUNDS_DIR))  fs.mkdirSync(SOUNDS_DIR,  { recursive: true });
if (!fs.existsSync(BUILTIN_DIR)) fs.mkdirSync(BUILTIN_DIR, { recursive: true });

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
        if (allowed.includes(ext)) cb(null, true);
        else cb(new Error('Unsupported format. Use MP3, WAV, OGG, M4A, AAC or FLAC'), false);
    };

    upload = multer({ storage, fileFilter, limits: { fileSize: 20 * 1024 * 1024 } });
}

// ============================================================
// Built-in melodies
// ============================================================

const BUILTIN_MELODIES = [
    { id: 'builtin_1', name: 'מנגינה 1', file: 'melody_1.wav' },
    { id: 'builtin_2', name: 'מנגינה 2', file: 'melody_2.mp3' },
    { id: 'builtin_3', name: 'מנגינה 3', file: 'melody_3.mp3' },
];

// ============================================================
// Helper – get or create sound settings for a user
// ============================================================

async function getUserSettings(username) {
    let doc = await SoundSettings.findOne({ username });
    if (!doc) {
        doc = new SoundSettings({ username });
        await doc.save();
    }
    return doc;
}

// ============================================================
// GET /api/sound/userdata?username=xxx
// ============================================================

router.get('/userdata', async (req, res) => {
    const { username } = req.query;
    if (!username) return res.status(400).json({ error: 'missing username' });

    try {
        const doc = await getUserSettings(username);
        res.json({
            alert: doc.alert,
            early: doc.early,
            clear: doc.clear,
        });
    } catch (err) {
        console.error('[soundRoutes] userdata error:', err.message);
        res.status(500).json({ error: 'server error' });
    }
});

// ============================================================
// POST /api/sound/cities
// body: { username, alertType, cities }
// ============================================================

router.post('/cities', async (req, res) => {
    const { username, alertType, cities } = req.body;
    if (!username || !alertType) return res.status(400).json({ error: 'missing params' });

    try {
        await SoundSettings.findOneAndUpdate(
            { username },
            { $set: { [`${alertType}.cities`]: cities || [] } },
            { upsert: true, new: true }
        );
        res.json({ success: true });
    } catch (err) {
        console.error('[soundRoutes] cities error:', err.message);
        res.status(500).json({ error: 'server error' });
    }
});

// ============================================================
// POST /api/sound/builtin
// body: { username, alertType, builtinMelodyId, builtinActive }
// ============================================================

router.post('/builtin', async (req, res) => {
    const { username, alertType, builtinMelodyId, builtinActive } = req.body;
    if (!username || !alertType) return res.status(400).json({ error: 'missing params' });

    try {
        await SoundSettings.findOneAndUpdate(
            { username },
            {
                $set: {
                    [`${alertType}.builtinMelodyId`]: builtinMelodyId ?? null,
                    [`${alertType}.builtinActive`]:   !!builtinActive,
                }
            },
            { upsert: true, new: true }
        );
        res.json({ success: true });
    } catch (err) {
        console.error('[soundRoutes] builtin error:', err.message);
        res.status(500).json({ error: 'server error' });
    }
});

// ============================================================
// POST /api/sound/upload?username=xxx&alertType=alert
// ============================================================

router.post('/upload', async (req, res) => {
    if (!upload) return res.status(500).json({ error: 'multer not installed' });

    upload.single('song')(req, res, async (err) => {
        if (err) return res.status(400).json({ error: err.message });
        if (!req.file) return res.status(400).json({ error: 'no file uploaded' });

        const { username, alertType } = req.query;
        if (!username || !alertType) return res.status(400).json({ error: 'missing params' });

        try {
            // Delete old file from disk if exists
            const existing = await SoundSettings.findOne({ username });
            if (existing && existing[alertType]?.songFile) {
                const oldPath = path.join(SOUNDS_DIR, existing[alertType].songFile);
                if (fs.existsSync(oldPath)) {
                    try { fs.unlinkSync(oldPath); } catch {}
                }
            }

            await SoundSettings.findOneAndUpdate(
                { username },
                { $set: { [`${alertType}.songFile`]: req.file.filename } },
                { upsert: true, new: true }
            );

            res.json({ success: true, filename: req.file.filename });
        } catch (err) {
            console.error('[soundRoutes] upload error:', err.message);
            res.status(500).json({ error: 'server error' });
        }
    });
});

// ============================================================
// DELETE /api/sound/song?username=xxx&alertType=alert
// ============================================================

router.delete('/song', async (req, res) => {
    const { username, alertType } = req.query;
    if (!username || !alertType) return res.status(400).json({ error: 'missing params' });

    try {
        const doc = await SoundSettings.findOne({ username });
        if (doc && doc[alertType]?.songFile) {
            const filePath = path.join(SOUNDS_DIR, doc[alertType].songFile);
            if (fs.existsSync(filePath)) {
                try { fs.unlinkSync(filePath); } catch {}
            }
            await SoundSettings.findOneAndUpdate(
                { username },
                { $set: { [`${alertType}.songFile`]: null } }
            );
        }
        res.json({ success: true });
    } catch (err) {
        console.error('[soundRoutes] delete error:', err.message);
        res.status(500).json({ error: 'server error' });
    }
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
// GET /api/sound/builtin/:filename
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
// GET /api/sound/melodies
// ============================================================

router.get('/melodies', (req, res) => {
    res.json(BUILTIN_MELODIES);
});

module.exports = router;
