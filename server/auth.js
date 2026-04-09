// ============================================================
// auth.js (Server) – login and register using MongoDB
// ============================================================

const express = require('express');
const router  = express.Router();
const { User } = require('./db');

// ============================================================
// Login
// ============================================================
router.post('/login', async (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({ error: 'חסרים פרטים להתחברות' });
    }

    try {
        const user = await User.findOne({
            username: username.trim(),
            password: password,
        });

        if (user) {
            res.json({ message: 'התחברת בהצלחה!', username: user.username });
        } else {
            res.status(401).json({ error: 'שם משתמש או סיסמה שגויים' });
        }
    } catch (err) {
        console.error('[auth] login error:', err.message);
        res.status(500).json({ error: 'שגיאת שרת' });
    }
});

// ============================================================
// Register
// ============================================================
router.post('/register', async (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({ error: 'חסרים פרטים להרשמה' });
    }

    try {
        const existing = await User.findOne({ username: username.trim() });
        if (existing) {
            return res.status(400).json({ error: 'שם המשתמש כבר תפוס' });
        }

        const newUser = new User({ username: username.trim(), password });
        await newUser.save();

        res.json({ message: 'המשתמש נוצר בהצלחה!', username: newUser.username });
    } catch (err) {
        console.error('[auth] register error:', err.message);
        res.status(500).json({ error: 'שגיאת שרת' });
    }
});

module.exports = router;
