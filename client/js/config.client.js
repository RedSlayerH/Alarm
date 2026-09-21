// ============================================================
// config.client.js – כתובת השרת (local או production)
// כדי לשנות את כתובת ה-production, שנה רק כאן!
// ============================================================

const API_BASE = window.location.hostname.includes('railway.app')
    ? 'https://alarm-production-158b.up.railway.app'
    : window.location.origin;