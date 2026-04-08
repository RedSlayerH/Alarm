// ============================================================
// config.client.js – כתובת השרת (local או production)
// כדי לשנות את כתובת ה-production, שנה רק כאן!
// ============================================================

const API_BASE = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
    ? 'http://localhost:3000'
    : 'https://your-app-url.railway.app';