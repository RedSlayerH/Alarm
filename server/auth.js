// ============================================================
// auth.js (Server) – טיפול בבקשות הרשמה והתחברות מהקליינט
// מיועד לרוץ על Node.js ולא בדפדפן!
// ============================================================

const express = require('express');
const fs = require('fs');
const path = require('path');
const router = express.Router();

// נתיב לקובץ המשתמשים שלך
const USERS_FILE = path.join(__dirname, 'users.json');

// פונקציית עזר לקריאת המשתמשים מהקובץ
function getUsers() {
    try {
        if (!fs.existsSync(USERS_FILE)) return [];
        const data = fs.readFileSync(USERS_FILE, 'utf8');
        return JSON.parse(data);
    } catch (err) {
        console.error('[auth] שגיאה בקריאת קובץ משתמשים:', err.message);
        return [];
    }
}

// פונקציית עזר לשמירת משתמשים לקובץ
function saveUsers(users) {
    try {
        fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), 'utf8');
    } catch (err) {
        console.error('[auth] שגיאה בשמירת קובץ משתמשים:', err.message);
    }
}

// ============================================================
// התחברות (Login)
// ============================================================
router.post('/login', (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({ error: 'חסרים פרטים להתחברות' });
    }

    const users = getUsers();
    const user = users.find(u => u.username === username && u.password === password);

    if (user) {
        res.json({ message: 'התחברת בהצלחה!', username: user.username });
    } else {
        res.status(401).json({ error: 'שם משתמש או סיסמה שגויים' });
    }
});

// ============================================================
// הרשמה (Register)
// ============================================================
router.post('/register', (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({ error: 'חסרים פרטים להרשמה' });
    }

    const users = getUsers();
    const existingUser = users.find(u => u.username === username);

    if (existingUser) {
        return res.status(400).json({ error: 'שם המשתמש כבר תפוס' });
    }

    // הוספת משתמש חדש
    users.push({ username, password });
    saveUsers(users);

    res.json({ message: 'המשתמש נוצר בהצלחה!', username });
});

module.exports = router;