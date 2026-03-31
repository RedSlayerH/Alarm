const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();
app.use(cors());

const OREF_API_URL = 'https://www.oref.org.il/WarningMessages/alert/alerts.json';

app.get('/api/alerts', async (req, res) => {
    try {
        const response = await axios.get(OREF_API_URL, {
            headers: {
                'X-Requested-With': 'XMLHttpRequest',
                'Referer': 'https://www.oref.org.il/',
                'Accept': 'application/json'
            },
            timeout: 5000 // מניעת תקיעת השרת
        });
        
        // בדיקה שהתשובה היא באמת אובייקט ולא מחרוזת ריקה (קורה כשאין אזעקות)
        let alertsData = { data: [] };
        
        if (typeof response.data === 'object' && response.data !== null) {
            alertsData = response.data;
        } else if (typeof response.data === 'string' && response.data.trim() !== '') {
            // לפעמים ה-API מחזיר מחרוזת עם BOM שצריך לנקות
            try {
                alertsData = JSON.parse(response.data.replace(/^\uFEFF/, ''));
            } catch (e) {
                alertsData = { data: [] };
            }
        }

        res.json(alertsData);

    } catch (error) {
        // במידה ויש שגיאה, נחזיר מערך ריק כדי שה-Front-End לא יקרוס
        res.json({ data: [] });
    }
});

const PORT = 3000;
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});