// ============================================================
// presence.js – sends heartbeat from the main map page
// so the user appears online in the chat DM list
// ============================================================

(function () {
    function getUsername() {
        return localStorage.getItem('currentUser') || null;
    }

    async function beat() {
        const username = getUsername();
        if (!username) return;
        try {
            await fetch(`${API_BASE}/api/chat/heartbeat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username })
            });
        } catch (e) { /* silent */ }
    }

    beat(); // immediate on page load
    setInterval(beat, 1000);
})();