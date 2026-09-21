// ============================================================
// chat.js – chat panel (self-contained IIFE)
// ============================================================

(function () {

    // ============================================================
    // Config
    // ============================================================

    const API          = `${API_BASE}/api/chat`;
    const POLL_MS      = 2000;   // poll for new messages every 2 seconds
    const MAX_TEXTAREA_LINES = 3;

    // Rooms definition
    const ROOMS = [
        { id: 'general',  emoji: '🌐', label: 'צ\'אט כללי',    open: true  },
        { id: 'sep1',     sep: true },
        { id: 'private',  emoji: '👤', label: 'פרטי',           open: false },
        { id: 'groups',   emoji: '👥', label: 'קבוצות',         open: false },
        { id: 'sep2',     sep: true },
        { id: 'gaming',   emoji: '🎮', label: 'גיימינג',        open: false },
        { id: 'dating',   emoji: '❤️', label: 'היכרויות',       open: false },
    ];

    // ============================================================
    // State
    // ============================================================

    let isPanelOpen   = false;
    let currentRoom   = null;
    let messages      = [];       // current room messages
    let lastMessageAt = null;     // ISO string of newest message seen
    let pollTimer     = null;

    // ============================================================
    // Helper: get logged-in username
    // ============================================================

    function getUsername() {
        return localStorage.getItem('currentUser') || null;
    }

    // ============================================================
    // Avatar cache
    // ============================================================

    const _avatarCache = new Map(); // username → url | null

    async function getAvatar(username) {
        if (_avatarCache.has(username)) return _avatarCache.get(username);

        // For current user – check localStorage first (no network needed)
        if (username === getUsername()) {
            const url = localStorage.getItem('currentAvatar') || null;
            _avatarCache.set(username, url);
            return url;
        }

        // For other users – ask the server once
        try {
            const res  = await fetch(`${API_BASE}/api/auth/avatar/${encodeURIComponent(username)}`);
            const data = await res.json();
            const url  = data.avatar || null;
            _avatarCache.set(username, url);
            return url;
        } catch {
            _avatarCache.set(username, null);
            return null;
        }
    }

    function setAvatarImg(el, url) {
        if (!url) return;
        const img = new Image();
        img.src              = url;
        img.alt              = '';
        img.style.cssText    = 'width:100%;height:100%;border-radius:50%;object-fit:cover;display:block;';
        img.onerror          = () => img.remove();
        el.textContent       = '';
        el.style.background  = 'transparent';
        el.appendChild(img);
    }

    // ============================================================
    // Build the whole UI
    // ============================================================

    function buildUI() {
        // --- FAB only — panel is now chat-app.html ---
        const fab = document.createElement('div');
        fab.id    = 'chat-fab';
        fab.title = '';
        fab.innerHTML = `
            ${chatBubbleIcon()}
            <div class="chat-unread-dot" id="chat-unread-dot"></div>
        `;
        document.body.appendChild(fab);

        bindEvents();
        updateFabState();
    }

    function chatBubbleIcon() {
        // Custom chat bubble SVG with a gradient feel
        return `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <defs>
                <linearGradient id="chatGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" style="stop-color:#6ea8fe"/>
                    <stop offset="100%" style="stop-color:#4a6fa5"/>
                </linearGradient>
            </defs>
            <path fill="url(#chatGrad)"
                  d="M20 2H4C2.9 2 2 2.9 2 4v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-3 11H7v-2h10v2zm0-3H7V8h10v2z"/>
        </svg>`;
    }

    function sendArrowIcon() {
        return `<svg viewBox="0 0 24 24">
            <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
        </svg>`;
    }

    function buildPanelHTML() {
        const sidebarHTML = ROOMS.map(r => {
            if (r.sep) return `<div class="chat-sidebar-sep"></div>`;
            const lockedClass = r.open ? '' : 'locked';
            return `<button class="chat-room-btn ${lockedClass}"
                            data-room="${r.id}"
                            data-label="${r.label}"
                            title="${r.label}">
                        ${r.emoji}
                    </button>`;
        }).join('');

        return `
            <!-- Sidebar -->
            <div id="chat-sidebar">${sidebarHTML}</div>

            <!-- Content area -->
            <div id="chat-content">

                <!-- Header -->
                <div id="chat-header">
                    <span id="chat-header-icon">💬</span>
                    <div>
                        <div id="chat-header-title">בחר צ'אט</div>
                        <div id="chat-header-sub">בחר חדר מהתפריט משמאל</div>
                    </div>
                    <button id="chat-close-btn" title="סגור">✕</button>
                </div>

                <!-- Empty state (shown before a room is selected) -->
                <div id="chat-empty-state">
                    <div class="chat-empty-icon">💬</div>
                    <div>בחר צ'אט מהעמודה משמאל כדי להתחיל לכתוב</div>
                </div>

                <!-- Messages (hidden until room selected) -->
                <div id="chat-messages" style="display:none;"></div>

                <!-- Input area (hidden until room selected) -->
                <div id="chat-input-area" style="display:none;">
                    <textarea id="chat-textarea"
                              placeholder="כתוב הודעה..."
                              rows="1"
                              dir="auto"></textarea>
                    <button id="chat-send-btn" title="שלח">
                        ${sendArrowIcon()}
                    </button>
                </div>

            </div>`;
    }

    // ============================================================
    // Events
    // ============================================================

    function bindEvents() {
        const fab = document.getElementById('chat-fab');

        // FAB click — trigger star transition then navigate to chat app
        fab.addEventListener('click', () => {
            if (!getUsername()) return; // locked — do nothing
            launchChatTransition();
        });

        // Update tooltip if not logged in
        fab.addEventListener('mouseenter', () => {
            updateFabState();
        });

        // Reload user data when login/logout happens
        window.addEventListener('storage', (e) => {
            if (e.key === 'currentUser') {
                updateFabState();
            }
        });
    }

    // ============================================================
    // Star transition — fly to chat-app.html (stars go RIGHT)
    // ============================================================

    function launchChatTransition() {
        // Create overlay
        const overlay = document.createElement('div');
        overlay.style.cssText = `
            position:fixed;inset:0;z-index:9999;
            background:#000;display:flex;
            align-items:center;justify-content:center;
            pointer-events:all;
        `;

        const canvas = document.createElement('canvas');
        canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;';

        const label = document.createElement('div');
        label.textContent = 'עובר לצ\'אט';
        label.style.cssText = `
            position:relative;z-index:1;
            font-size:22px;font-weight:700;color:#fff;
            letter-spacing:2px;font-family:inherit;
            text-shadow:0 0 20px rgba(255,255,255,0.8);
            animation:none;opacity:1;
        `;

        overlay.appendChild(canvas);
        overlay.appendChild(label);
        document.body.appendChild(overlay);

        canvas.width  = window.innerWidth;
        canvas.height = window.innerHeight;
        const ctx = canvas.getContext('2d');

        // Generate stars
        const stars = Array.from({ length: 180 }, () => ({
            x: Math.random() * canvas.width,
            y: Math.random() * canvas.height,
            speed: 2 + Math.random() * 8,
            size:  0.5 + Math.random() * 1.5,
        }));

        let frame = 0;
        const totalFrames = 80;

        function draw() {
            frame++;
            const progress = frame / totalFrames;

            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.fillStyle = `rgba(0,0,0,${Math.min(progress * 1.4, 1)})`;
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            stars.forEach(s => {
                const speed  = s.speed * (1 + progress * 14);
                s.x += speed; // fly RIGHT toward chat
                if (s.x > canvas.width) s.x = 0;

                const tailLen = speed * 4;
                const alpha   = Math.min(0.2 + progress * 0.8, 1);

                ctx.beginPath();
                ctx.moveTo(s.x, s.y);
                ctx.lineTo(s.x - tailLen, s.y);
                ctx.strokeStyle = `rgba(255,255,255,${alpha})`;
                ctx.lineWidth   = s.size;
                ctx.stroke();
            });

            if (frame < totalFrames) {
                requestAnimationFrame(draw);
            } else {
                window.location.href = 'chat-app.html';
            }
        }

        requestAnimationFrame(draw);
    }

    // ============================================================
    // FAB state – locked vs unlocked look
    // ============================================================

    function updateFabState() {
        const fab = document.getElementById('chat-fab');
        if (!fab) return;
        const loggedIn = !!getUsername();

        if (loggedIn) {
            // Remove lock overlay if it exists
            let tip = fab.querySelector('.chat-locked-tip');
            if (tip) tip.remove();
            fab.style.opacity = '1';
            fab.style.cursor  = 'pointer';
        } else {
            fab.style.opacity = '0.55';
            fab.style.cursor  = 'default';
            // Add tip if not there yet
            if (!fab.querySelector('.chat-locked-tip')) {
                const tip = document.createElement('div');
                tip.className   = 'chat-locked-tip';
                tip.textContent = '🔒 התחבר כדי להשתמש בצ\'אט';
                fab.appendChild(tip);
            }
        }
    }

    // ============================================================
    // Panel open / close / toggle
    // ============================================================

    function togglePanel() {
        if (isPanelOpen) closePanel();
        else openPanel();
    }

    function openPanel() {
        isPanelOpen = true;
        document.getElementById('chat-panel').classList.remove('cp-hidden');
        clearUnreadDot();
    }

    function closePanel() {
        isPanelOpen = false;
        document.getElementById('chat-panel').classList.add('cp-hidden');
        stopPolling();
    }

    function clearUnreadDot() {
        const dot = document.getElementById('chat-unread-dot');
        if (dot) dot.classList.remove('visible');
    }

    // ============================================================
    // Room selection
    // ============================================================

    function selectRoom(roomId) {
        currentRoom   = roomId;
        messages      = [];
        lastMessageAt = null;

        // Highlight active room button
        document.querySelectorAll('.chat-room-btn').forEach(btn => {
            btn.classList.toggle('active', btn.getAttribute('data-room') === roomId);
        });

        // Update header
        const def = ROOMS.find(r => r.id === roomId);
        document.getElementById('chat-header-icon').textContent  = def.emoji;
        document.getElementById('chat-header-title').textContent = def.label;
        document.getElementById('chat-header-sub').textContent   = 'צ\'אט חי';

        // Show messages + input
        document.getElementById('chat-empty-state').style.display  = 'none';
        document.getElementById('chat-messages').style.display     = 'flex';
        document.getElementById('chat-input-area').style.display   = 'flex';

        // Clear messages
        document.getElementById('chat-messages').innerHTML = '';

        // Load history then start polling
        loadMessages().then(() => startPolling());
    }

    // ============================================================
    // Load historical messages
    // ============================================================

    async function loadMessages() {
        try {
            const res  = await fetch(`${API}/messages?room=${currentRoom}`);
            const data = await res.json();
            if (!Array.isArray(data)) return;

            messages = data;
            renderAllMessages();

            if (messages.length > 0) {
                lastMessageAt = messages[messages.length - 1].sentAt;
            }

            scrollToBottom(false);
        } catch (e) {
            console.warn('[chat] loadMessages error:', e);
        }
    }

    // ============================================================
    // Polling for new messages
    // ============================================================

    function startPolling() {
        stopPolling();
        pollTimer = setInterval(pollMessages, POLL_MS);
    }

    function stopPolling() {
        if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
    }

    async function pollMessages() {
        if (!currentRoom) return;
        try {
            const after = lastMessageAt ? `&after=${encodeURIComponent(lastMessageAt)}` : '';
            const res   = await fetch(`${API}/poll?room=${currentRoom}${after}`);
            const data  = await res.json();
            if (!Array.isArray(data) || data.length === 0) return;

            const wasAtBottom = isScrolledToBottom();

            data.forEach(msg => {
                // Avoid duplicates
                if (!messages.find(m => m._id === msg._id)) {
                    messages.push(msg);
                    appendMessage(msg);
                }
            });

            lastMessageAt = messages[messages.length - 1].sentAt;

            if (wasAtBottom) scrollToBottom(true);
            else if (!isPanelOpen) showUnreadDot();

        } catch (e) {
            // silent – network hiccup is fine
        }
    }

    // ============================================================
    // Render all messages from scratch
    // ============================================================

    function renderAllMessages() {
        const container = document.getElementById('chat-messages');
        container.innerHTML = '';

        let lastDate = null;
        let lastUser = null;

        messages.forEach((msg, i) => {
            const msgDate = new Date(msg.sentAt).toLocaleDateString('he-IL');
            if (msgDate !== lastDate) {
                container.appendChild(makeDateDivider(msgDate));
                lastDate = msgDate;
                lastUser = null; // force new group after date divider
            }

            const isContinued = (lastUser === msg.username);
            container.appendChild(makeMessageEl(msg, isContinued));
            lastUser = msg.username;
        });
    }

    // ============================================================
    // Append a single new message (for live updates)
    // ============================================================

    function appendMessage(msg) {
        const container = document.getElementById('chat-messages');
        if (!container) return;

        const lastEl   = container.lastElementChild;
        const lastUser = lastEl?.dataset?.username || null;
        const isCont   = (lastUser === msg.username);

        // Check if we need a date divider
        const msgDate = new Date(msg.sentAt).toLocaleDateString('he-IL');
        const allDividers = container.querySelectorAll('.chat-date-divider');
        const lastDivider = allDividers[allDividers.length - 1];
        if (!lastDivider || lastDivider.dataset.date !== msgDate) {
            container.appendChild(makeDateDivider(msgDate));
        }

        if (isCont && lastEl) {
            // Append bubble into the last group's bubbles column (under the vertical line)
            const bubblesCol = lastEl.querySelector('.chat-group-bubbles');
            if (bubblesCol) {
                const bubble = document.createElement('div');
                bubble.className = 'chat-bubble';
                bubble.textContent = msg.text;
                bubblesCol.appendChild(bubble);
                return;
            }
        }

        container.appendChild(makeMessageEl(msg, false));
    }

    // ============================================================
    // Build DOM elements
    // ============================================================

    function makeMessageEl(msg, isContinued) {
        const wrapper  = document.createElement('div');
        wrapper.dataset.username = msg.username;
        const isMe     = msg.username === getUsername();
        const mineClass = isMe ? ' mine' : '';

        if (isContinued) {
            wrapper.className = 'chat-msg-continued' + mineClass;
            wrapper.innerHTML = `<div class="chat-bubble">${escHtml(msg.text)}</div>`;
        } else {
            wrapper.className = 'chat-msg-group' + mineClass;
            const initial = msg.username.charAt(0).toUpperCase();
            const time    = formatTime(msg.sentAt);
            wrapper.innerHTML = `
                <div class="chat-group-header">
                    <div class="chat-avatar">${initial}</div>
                    <span class="chat-username">${escHtml(msg.username)}</span>
                    <span class="chat-timestamp">${time}</span>
                </div>
                <div class="chat-group-sep"></div>
                <div class="chat-group-bubbles">
                    <div class="chat-bubble">${escHtml(msg.text)}</div>
                </div>`;

            // Async: swap letter with Google profile picture if available
            const avatarEl = wrapper.querySelector('.chat-avatar');
            getAvatar(msg.username).then(url => setAvatarImg(avatarEl, url));
        }

        return wrapper;
    }

    function makeDateDivider(dateStr) {
        const div = document.createElement('div');
        div.className     = 'chat-date-divider';
        div.dataset.date  = dateStr;
        div.textContent   = dateStr;
        return div;
    }

    // ============================================================
    // Send message
    // ============================================================

    async function sendMessage() {
        const ta       = document.getElementById('chat-textarea');
        const username = getUsername();
        if (!username || !currentRoom) return;

        // Clean up excessive blank lines
        const raw     = ta.value;
        const cleaned = cleanText(raw);
        if (!cleaned) return;

        ta.value = '';
        autoResizeTextarea(ta);

        try {
            const res  = await fetch(`${API}/messages`, {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify({ room: currentRoom, username, text: cleaned }),
            });
            const data = await res.json();
            if (res.ok && data.message) {
                // Don't wait for poll – add it immediately
                if (!messages.find(m => m._id === data.message._id)) {
                    messages.push(data.message);
                    appendMessage(data.message);
                    lastMessageAt = data.message.sentAt;
                }
                scrollToBottom(true);
            }
        } catch (e) {
            console.warn('[chat] sendMessage error:', e);
        }
    }

    // ============================================================
    // Textarea helpers
    // ============================================================

    function autoResizeTextarea(ta) {
        ta.style.height = 'auto';
        const lineHeight = 21; // px per line (approx 13.5px font * 1.5 line-height)
        const maxH       = lineHeight * MAX_TEXTAREA_LINES + 18; // 18 = padding top+bottom
        const newH       = Math.min(ta.scrollHeight, maxH);
        ta.style.height  = newH + 'px';

        if (ta.scrollHeight > maxH) {
            ta.style.overflowY = 'auto';
        } else {
            ta.style.overflowY = 'hidden';
        }
    }

    /**
     * Trim leading/trailing blank lines.
     * If the text is ONLY blank lines, return empty string.
     */
    function cleanText(raw) {
        // Split into lines, remove leading and trailing empty lines
        const lines = raw.split('\n');
        let start = 0, end = lines.length - 1;
        while (start <= end && lines[start].trim() === '') start++;
        while (end >= start && lines[end].trim() === '') end--;
        if (start > end) return '';
        return lines.slice(start, end + 1).join('\n');
    }

    // ============================================================
    // Scroll helpers
    // ============================================================

    function scrollToBottom(smooth) {
        const el = document.getElementById('chat-messages');
        if (!el) return;
        el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'instant' });
    }

    function isScrolledToBottom() {
        const el = document.getElementById('chat-messages');
        if (!el) return true;
        return el.scrollHeight - el.scrollTop - el.clientHeight < 60;
    }

    // ============================================================
    // Unread dot
    // ============================================================

    function showUnreadDot() {
        const dot = document.getElementById('chat-unread-dot');
        if (dot) dot.classList.add('visible');
    }

    // ============================================================
    // Utils
    // ============================================================

    function escHtml(str) {
        return str
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function formatTime(iso) {
        const d = new Date(iso);
        const h = d.getHours().toString().padStart(2, '0');
        const m = d.getMinutes().toString().padStart(2, '0');
        return `${h}:${m}`;
    }

    // ============================================================
    // Init
    // ============================================================

    function init() {
        buildUI();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // Re-check fab state after login/logout animation reloads the page
    window.addEventListener('storage', (e) => {
        if (e.key === 'currentUser') updateFabState();
    });

})();