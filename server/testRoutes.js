// ============================================================
// testRoutes.js  – נתיבי בדיקה (Development only!)
// כל ה-endpoints של /api/test* כאן, בנפרד מהשרת הראשי
// ============================================================

const express = require('express');
const router  = express.Router();
const { processAlert, processEarlyWarning, processClearEvent } = require('./alertProcessor');

/**
 * POST /api/test/alert?cities=קריית שמונה,מטולה&type=ירי רקטות וטילים
 * מדמה אזעקה חדשה
 */
router.get('/alert', (req, res) => {
    const cities = req.query.cities
        ? req.query.cities.split(',').map(c => c.trim())
        : ['קריית שמונה', 'מטולה', 'כפר גלעדי', 'תל חי'];
    const type = req.query.type || 'ירי רקטות וטילים';

    processAlert(cities, type);
    console.log(`[testRoutes] אזעקת ${type} מדומה: ${cities.join(', ')}`);
    res.json({ success: true, message: `הופעלה אזעקת "${type}" מדומה!`, cities });
});

/**
 * GET /api/test/clear?cities=קריית שמונה,מטולה
 * מדמה שחרור
 */
router.get('/clear', (req, res) => {
    const cities = req.query.cities
        ? req.query.cities.split(',').map(c => c.trim())
        : ['קריית שמונה', 'מטולה', 'כפר גלעדי', 'תל חי'];

    processClearEvent(cities);
    console.log(`[testRoutes] שחרור מדומה: ${cities.join(', ')}`);
    res.json({ success: true, message: 'שחרור מדומה בוצע!', cities });
});

/**
 * GET /api/test/early?cities=אשדוד - א,גן יבנה
 * מדמה התרעה מקדימה
 */
router.get('/early', (req, res) => {
    const cities = req.query.cities
        ? req.query.cities.split(',').map(c => c.trim())
        : ['אשדוד - א,ב,ד,ה', 'גן יבנה'];

    processEarlyWarning(cities);
    console.log(`[testRoutes] התרעה מקדימה מדומה: ${cities.join(', ')}`);
    res.json({ success: true, message: 'התרעה מקדימה מדומה הופעלה!', cities });
});

/**
 * GET /api/test/drone?cities=אשקלון
 * מדמה כטב"ם
 */
router.get('/drone', (req, res) => {
    const cities = req.query.cities
        ? req.query.cities.split(',').map(c => c.trim())
        : ['אשקלון', 'אשדוד - א,ב,ד,ה'];

    processAlert(cities, 'חדירת כלי טיס עוין');
    console.log(`[testRoutes] כטב"ם מדומה: ${cities.join(', ')}`);
    res.json({ success: true, message: 'כטב"ם מדומה הופעל!', cities });
});

module.exports = router;
