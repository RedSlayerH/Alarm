const express = require('express');
const fs = require('fs');
const router = express.Router();

const USERS_FILE = './users.json';

// פונקציית עזר לקריאת המשתמשים מהקובץ
function getUsers() {
    try {
        const data = fs.readFileSync(USERS_FILE, 'utf8');
        return JSON.parse(data);
    } catch (err) {
        return [];
    }
}

// פונקציית עזר לשמירת משתמשים לקובץ
function saveUsers(users) {
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
}

// נתיב הרשמה
router.post('/register', (req, res) => {
    const { username, password } = req.body;
    
    if (!username || !password) {
        return res.status(400).json({ error: 'חובה להזין שם משתמש וסיסמה' });
    }

    const users = getUsers();
    
    // בדיקה אם המשתמש כבר קיים
    if (users.find(u => u.username === username)) {
        return res.status(400).json({ error: 'שם המשתמש כבר תפוס' });
    }

    // הוספת המשתמש החדש (במערכת אמיתית נצפין את הסיסמה, אבל נתחיל פשוט)
    users.push({ username, password });
    saveUsers(users);

    res.json({ success: true, message: 'נרשמת בהצלחה!' });
});

// נתיב התחברות
router.post('/login', (req, res) => {
    const { username, password } = req.body;
    const users = getUsers();

    const user = users.find(u => u.username === username && u.password === password);
    
    if (user) {
        res.json({ success: true, message: 'התחברת בהצלחה!', username: user.username });
    } else {
        res.status(401).json({ error: 'שם משתמש או סיסמה שגויים' });
    }
});

module.exports = router;