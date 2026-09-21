// ============================================================
// chat-app.js – Discord-like chat with DMs + profile popups
// ============================================================

(function () {

    const API     = `${API_BASE}/api/chat`;
    const POLL_MS = 2000;
    const MAX_TEXTAREA_LINES = 5;

    let currentRoom   = 'general';
    let messages      = [];
    let lastMessageAt = null;
    let pollTimer     = null;

    // ── helpers ──────────────────────────────────────────────
    function getUsername() { return localStorage.getItem('currentUser') || null; }

    // ── avatar cache ─────────────────────────────────────────
    const _avatarCache = new Map();

    async function getAvatar(username) {
        if (_avatarCache.has(username)) return _avatarCache.get(username);
        if (username === getUsername()) {
            const url = localStorage.getItem('currentAvatar') || null;
            _avatarCache.set(username, url);
            return url;
        }
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

    function applyAvatar(el, url) {
        if (!url) return;
        const img = new Image();
        img.src           = url;
        img.alt           = '';
        img.style.cssText = 'width:100%;height:100%;border-radius:50%;object-fit:cover;display:block;';
        img.onerror       = () => img.remove();
        el.textContent    = '';
        el.style.background = 'transparent';
        el.appendChild(img);
    }

    function escHtml(str) {
        return str
            .replace(/&/g,'&amp;').replace(/</g,'&lt;')
            .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    }

    function formatTime(iso) {
        const d = new Date(iso);
        return `${d.getHours().toString().padStart(2,'0')}:${d.getMinutes().toString().padStart(2,'0')}`;
    }

    function formatDate(iso) {
        if (!iso) return '—';
        return new Date(iso).toLocaleDateString('he-IL', { year:'numeric', month:'long', day:'numeric' });
    }

    function cleanText(raw) {
        const lines = raw.split('\n');
        let s = 0, e = lines.length - 1;
        while (s <= e && lines[s].trim() === '') s++;
        while (e >= s && lines[e].trim() === '') e--;
        return s > e ? '' : lines.slice(s, e + 1).join('\n');
    }

    // Build DM room name — always alphabetically sorted
    function dmRoomId(userA, userB) {
        return 'dm_' + [userA, userB].sort().join('_');
    }

    // ── user card ─────────────────────────────────────────────
    function initUserCard() {
        const name = getUsername();
        const nameEl   = document.getElementById('user-card-name');
        const avatarEl = document.getElementById('user-card-avatar');
        if (name) {
            nameEl.textContent   = name;
            avatarEl.textContent = name.charAt(0).toUpperCase();
            getAvatar(name).then(url => applyAvatar(avatarEl, url));
        } else {
            nameEl.textContent   = 'לא מחובר';
            avatarEl.textContent = '?';
            avatarEl.style.background = '#888';
        }
    }

    // ================================================================
    // PROFILE POPUPS
    // ================================================================

    let clickTimer = null;
    let currentProfileUser = null;

    function showMiniPopup(username, anchorEl) {
        currentProfileUser = username;
        const popup = document.getElementById('profile-mini-popup');

        const pmpAvatar = document.getElementById('pmp-avatar');
        pmpAvatar.textContent = username.charAt(0).toUpperCase();
        pmpAvatar.style.background = '';
        getAvatar(username).then(url => applyAvatar(pmpAvatar, url));

        document.getElementById('pmp-username').textContent = username;
        document.getElementById('pmp-tag').textContent      = username.toLowerCase();

        popup.classList.remove('hidden');

        const rect = anchorEl.getBoundingClientRect();
        const pw   = 240;
        const ph   = 220;
        let left   = rect.right + 10;
        let top    = rect.top;

        if (left + pw > window.innerWidth  - 10) left = rect.left - pw - 10;
        if (top  + ph > window.innerHeight - 10) top  = window.innerHeight - ph - 10;
        if (top < 10) top = 10;

        popup.style.left = left + 'px';
        popup.style.top  = top  + 'px';
    }

    function hideMiniPopup() {
        document.getElementById('profile-mini-popup').classList.add('hidden');
    }

    function showFullPopup(username) {
        currentProfileUser = username;
        const backdrop = document.getElementById('profile-full-backdrop');

        const pfpAvatar = document.getElementById('pfp-avatar');
        pfpAvatar.textContent = username.charAt(0).toUpperCase();
        pfpAvatar.style.background = '';
        getAvatar(username).then(url => applyAvatar(pfpAvatar, url));

        document.getElementById('pfp-username').textContent = username;
        document.getElementById('pfp-tag').textContent      = username.toLowerCase();
        document.getElementById('pfp-since').textContent    = formatDate(new Date().toISOString());

        backdrop.classList.remove('hidden');
        hideMiniPopup();
    }

    function hideFullPopup() {
        document.getElementById('profile-full-backdrop').classList.add('hidden');
        currentProfileUser = null;
    }

    async function openDM(otherUser, initialMessage) {
        const me = getUsername();
        if (!me || !otherUser || me === otherUser) return;

        const room = dmRoomId(me, otherUser);

        if (initialMessage && initialMessage.trim()) {
            try {
                await fetch(`${API}/messages`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ room, username: me, text: initialMessage.trim() })
                });
            } catch(e) { console.warn('[chat-app] DM send error', e); }
        }

        switchRoom(room, otherUser);
        loadDMList();
        hideMiniPopup();
        hideFullPopup();
        hideMsgInputPopup();
    }

    function switchRoom(roomId, dmPartnerName) {
        currentRoom   = roomId;
        messages      = [];
        lastMessageAt = null;

        const isDM       = roomId.startsWith('dm_');
        const topbarHash = document.querySelector('.topbar-hash');
        const topbarName = document.getElementById('topbar-channel-name');
        const topbarDesc = document.getElementById('topbar-desc');
        const textarea   = document.getElementById('app-textarea');
        const srvGeneral = document.getElementById('srv-general');

        if (isDM) {
            topbarHash.textContent = '💬';
            topbarName.textContent = dmPartnerName || roomId;
            topbarDesc.textContent = 'שיחה פרטית';
            if (textarea) textarea.placeholder = `שלח הודעה ל-${dmPartnerName || roomId}`;
            if (srvGeneral) srvGeneral.classList.remove('active'); // remove pill when in DM
        } else {
            topbarHash.textContent = '#';
            topbarName.textContent = 'כללי';
            topbarDesc.textContent = "צ'אט חי עם משתמשים מהאתר";
            if (textarea) textarea.placeholder = "שלח הודעה ל-#כללי";
            if (srvGeneral) srvGeneral.classList.add('active'); // show pill when in general
            // clear unread bubble when entering general
            const dot = document.getElementById('srv-unread-general');
            if (dot) dot.classList.remove('visible');
        }

        document.querySelectorAll('.dm-item').forEach(el => {
            el.classList.toggle('active', el.dataset.room === roomId);
        });

        loadMessages();
        stopPolling();
        startPolling();
    }

    function showMsgInputPopup(username) {
        const popup = document.getElementById('msg-input-popup');
        document.getElementById('mip-username').textContent = username;
        document.getElementById('mip-textarea').value = '';
        // Reset to centered position each time it opens
        popup.style.left      = '50%';
        popup.style.top       = '';
        popup.style.bottom    = '80px';
        popup.style.transform = 'translateX(-50%)';
        popup.classList.remove('hidden');
        document.getElementById('mip-textarea').focus();
        hideMiniPopup();
    }

    function hideMsgInputPopup() {
        document.getElementById('msg-input-popup').classList.add('hidden');
    }

    function bindPopupEvents() {
        document.getElementById('pmp-btn-message').addEventListener('click', () => {
            if (currentProfileUser) showMsgInputPopup(currentProfileUser);
        });

        document.getElementById('pmp-btn-addfriend').addEventListener('click', () => {
            hideMiniPopup();
        });

        document.getElementById('pfp-btn-message').addEventListener('click', () => {
            if (currentProfileUser) openDM(currentProfileUser, null);
        });

        document.getElementById('pfp-btn-addfriend').addEventListener('click', () => {
            hideFullPopup();
        });

        document.getElementById('profile-full-backdrop').addEventListener('click', (e) => {
            if (e.target === document.getElementById('profile-full-backdrop')) hideFullPopup();
        });

        document.getElementById('mip-send').addEventListener('click', async () => {
            const text = document.getElementById('mip-textarea').value;
            const user = document.getElementById('mip-username').textContent;
            if (user) await openDM(user, text);
        });

        document.getElementById('mip-cancel').addEventListener('click', hideMsgInputPopup);
        document.getElementById('mip-close').addEventListener('click', hideMsgInputPopup);

        document.getElementById('mip-textarea').addEventListener('keydown', async (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                const text = document.getElementById('mip-textarea').value;
                const user = document.getElementById('mip-username').textContent;
                if (user) await openDM(user, text);
            }
        });

        document.addEventListener('click', (e) => {
            const popup = document.getElementById('profile-mini-popup');
            if (!popup.classList.contains('hidden') &&
                !popup.contains(e.target) &&
                !e.target.classList.contains('app-avatar')) {
                hideMiniPopup();
            }
        });
    }

    function handleAvatarClick(e) {
        const avatar = e.target.closest('.app-avatar');
        if (!avatar) return;

        const group    = avatar.closest('.app-msg-group');
        if (!group) return;

        const username = group.dataset.username;
        const me       = getUsername();
        if (!username || username === me) return;

        if (clickTimer) {
            clearTimeout(clickTimer);
            clickTimer = null;
            showFullPopup(username);
        } else {
            clickTimer = setTimeout(() => {
                clickTimer = null;
                showMiniPopup(username, avatar);
            }, 220);
        }
    }

    // ================================================================
    // DM LIST (sidebar)
    // ================================================================
    // DM LIST (sidebar)
    // ================================================================

    // Rooms the user dismissed with X: roomId → lastAt when closed
    const hiddenRooms = new Map();

    async function loadDMList() {
        const me = getUsername();
        if (!me) return;

        try {
            const res  = await fetch(`${API}/dm-rooms?username=${encodeURIComponent(me)}`);
            const data = await res.json();
            if (!Array.isArray(data)) return;
            renderDMList(data);
        } catch(e) { console.warn('[chat-app] loadDMList error', e); }
    }

    function renderDMList(rooms) {
        const list = document.getElementById('dm-list');
        if (!list) return;

        // Un-hide rooms that received a new message since being closed
        rooms.forEach(dm => {
            if (hiddenRooms.has(dm.room)) {
                const closedAt = hiddenRooms.get(dm.room);
                if (dm.lastAt && new Date(dm.lastAt) > new Date(closedAt)) {
                    hiddenRooms.delete(dm.room); // new message — show it again
                }
            }
        });

        // Filter out hidden rooms
        const visible = rooms.filter(dm => !hiddenRooms.has(dm.room));

        if (visible.length === 0) {
            if (!list.querySelector('.dm-item')) {
                list.innerHTML = '<div class="dm-empty" style="padding:4px 8px;font-size:12px;color:#555;">אין שיחות עדיין</div>';
            }
            return;
        }

        // Remove "no conversations" placeholder if present
        const empty = list.querySelector('.dm-empty');
        if (empty) empty.remove();

        // Get rooms already rendered
        const existingRooms = new Set(
            [...list.querySelectorAll('.dm-item')].map(el => el.dataset.room)
        );

        visible.slice().reverse().forEach(dm => {
            if (existingRooms.has(dm.room)) return; // already rendered, skip

            const el = document.createElement('div');
            el.className    = 'dm-item';
            el.dataset.room = dm.room;
            el.dataset.otherUser = dm.otherUser;
            if (dm.room === currentRoom) el.classList.add('active');

            el.innerHTML = `
                <div class="dm-avatar-wrap">
                    <div class="dm-avatar">${escHtml(dm.otherUser.charAt(0).toUpperCase())}</div>
                    <span class="dm-status-dot offline"></span>
                </div>
                <span class="dm-name">${escHtml(dm.otherUser)}</span>
                <button class="dm-close-btn" title="הסר שיחה">✕</button>
            `;

            el.querySelector('.dm-close-btn').addEventListener('click', (e) => {
                e.stopPropagation();
                // Remember when this room was closed, using the room's lastAt
                hiddenRooms.set(dm.room, dm.lastAt || new Date().toISOString());
                if (currentRoom === dm.room) switchRoom('general', null);
                el.remove();
                if (!list.querySelector('.dm-item')) {
                    list.innerHTML = '<div class="dm-empty" style="padding:4px 8px;font-size:12px;color:#555;">אין שיחות עדיין</div>';
                }
            });

            el.addEventListener('click', () => {
                switchRoom(dm.room, dm.otherUser);
                document.querySelectorAll('.dm-item').forEach(i => i.classList.remove('active'));
                el.classList.add('active');
            });

            list.prepend(el); // newest at top
            refreshOnlineStatus();
        });
    }

    // ── message DOM builders ─────────────────────────────────
    function makeGroup(msg) {
        const isMe = msg.username === getUsername();
        const wrapper = document.createElement('div');
        wrapper.className = 'app-msg-group' + (isMe ? ' mine' : '');
        wrapper.dataset.username = msg.username;

        const initial = msg.username.charAt(0).toUpperCase();
        wrapper.innerHTML = `
            <div class="app-avatar" title="${escHtml(msg.username)}" style="cursor:${isMe ? 'default' : 'pointer'}">${initial}</div>
            <div class="app-msg-content">
                <div class="app-group-meta">
                    <span class="app-username">${escHtml(msg.username)}</span>
                    <span class="app-timestamp">${formatTime(msg.sentAt)}</span>
                </div>
                <div class="app-group-bubbles">
                    <div class="app-bubble">${escHtml(msg.text)}</div>
                </div>
            </div>`;

        // Async: swap letter with Google profile picture if available
        const avatarEl = wrapper.querySelector('.app-avatar');
        getAvatar(msg.username).then(url => applyAvatar(avatarEl, url));

        return wrapper;
    }

    function makeDateDivider(dateStr) {
        const d = document.createElement('div');
        d.className    = 'app-date-divider';
        d.dataset.date = dateStr;
        d.textContent  = dateStr;
        return d;
    }

    function renderAll() {
        const container = document.getElementById('app-messages');
        container.innerHTML = '';
        let lastDate = null, lastUser = null;

        messages.forEach(msg => {
            const msgDate = new Date(msg.sentAt).toLocaleDateString('he-IL');
            if (msgDate !== lastDate) {
                container.appendChild(makeDateDivider(msgDate));
                lastDate = msgDate;
                lastUser = null;
            }

            if (lastUser === msg.username) {
                const lastGroup = container.querySelector('.app-msg-group:last-of-type');
                if (lastGroup) {
                    const bubblesCol = lastGroup.querySelector('.app-group-bubbles');
                    if (bubblesCol) {
                        const b = document.createElement('div');
                        b.className   = 'app-bubble';
                        b.textContent = msg.text;
                        bubblesCol.appendChild(b);
                        lastUser = msg.username;
                        return;
                    }
                }
            }

            container.appendChild(makeGroup(msg));
            lastUser = msg.username;
        });

        // Notify shop module that messages were rendered
        document.dispatchEvent(new CustomEvent('chatMessagesRendered'));
    }

    function appendMessage(msg) {
        const container = document.getElementById('app-messages');
        if (!container) return;

        const msgDate   = new Date(msg.sentAt).toLocaleDateString('he-IL');
        const dividers  = container.querySelectorAll('.app-date-divider');
        const lastDiv   = dividers[dividers.length - 1];
        if (!lastDiv || lastDiv.dataset.date !== msgDate) {
            container.appendChild(makeDateDivider(msgDate));
        }

        const groups    = container.querySelectorAll('.app-msg-group');
        const lastGroup = groups[groups.length - 1];
        if (lastGroup && lastGroup.dataset.username === msg.username) {
            const bubblesCol = lastGroup.querySelector('.app-group-bubbles');
            if (bubblesCol) {
                const b = document.createElement('div');
                b.className   = 'app-bubble';
                b.textContent = msg.text;
                bubblesCol.appendChild(b);
                return;
            }
        }

        container.appendChild(makeGroup(msg));

        // Notify shop module (new message group added)
        document.dispatchEvent(new CustomEvent('chatMessagesRendered'));
    }

    function scrollToBottom(smooth) {
        const el = document.getElementById('app-messages');
        if (el) el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'instant' });
    }

    function isAtBottom() {
        const el = document.getElementById('app-messages');
        return el ? el.scrollHeight - el.scrollTop - el.clientHeight < 80 : true;
    }

    async function loadMessages() {
        try {
            const res  = await fetch(`${API}/messages?room=${encodeURIComponent(currentRoom)}`);
            const data = await res.json();
            if (!Array.isArray(data)) return;
            messages = data;
            renderAll();
            if (messages.length > 0) lastMessageAt = messages[messages.length - 1].sentAt;
            scrollToBottom(false);
        } catch(e) { console.warn('[chat-app] load error', e); }
    }

    function startPolling() {
        stopPolling();
        pollTimer = setInterval(pollMessages, POLL_MS);
    }

    function stopPolling() {
        if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
    }

    // Poll general in background when in a DM, to show unread bubble
    let generalPollTimer   = null;
    let generalLastSeen    = null;

    function startGeneralUnreadPoll() {
        stopGeneralUnreadPoll();
        generalLastSeen = new Date().toISOString();
        generalPollTimer = setInterval(async () => {
            if (currentRoom === 'general') return;
            try {
                const after = generalLastSeen ? `&after=${encodeURIComponent(generalLastSeen)}` : '';
                const res   = await fetch(`${API}/poll?room=general${after}`);
                const data  = await res.json();
                if (Array.isArray(data) && data.length > 0) {
                    generalLastSeen = data[data.length - 1].sentAt;
                    const dot = document.getElementById('srv-unread-general');
                    if (dot) dot.classList.add('visible');
                }
            } catch(e) { /* silent */ }
        }, 5000);
    }

    function stopGeneralUnreadPoll() {
        if (generalPollTimer) { clearInterval(generalPollTimer); generalPollTimer = null; }
    }

    // Poll DM list periodically so new conversations appear without refresh
    let dmListPollTimer = null;

    function startDMListPoll() {
        if (dmListPollTimer) return;
        dmListPollTimer = setInterval(() => {
            loadDMList();
        }, 3000);
    }

    function stopDMListPoll() {
        if (dmListPollTimer) { clearInterval(dmListPollTimer); dmListPollTimer = null; }
    }

    async function pollMessages() {
        try {
            const after = lastMessageAt ? `&after=${encodeURIComponent(lastMessageAt)}` : '';
            const res   = await fetch(`${API}/poll?room=${encodeURIComponent(currentRoom)}${after}`);
            const data  = await res.json();
            if (!Array.isArray(data) || data.length === 0) return;

            const wasBottom = isAtBottom();
            data.forEach(msg => {
                if (!messages.find(m => m._id === msg._id)) {
                    messages.push(msg);
                    appendMessage(msg);
                }
            });
            lastMessageAt = messages[messages.length - 1].sentAt;

            if (!wasBottom) {
                const dot = document.getElementById('srv-unread-general');
                if (dot) dot.classList.add('visible');
            } else {
                scrollToBottom(true);
            }
        } catch(e) { /* silent */ }
    }

    async function sendMessage() {
        const ta       = document.getElementById('app-textarea');
        const username = getUsername();
        if (!username) return;

        const cleaned = cleanText(ta.value);
        if (!cleaned) return;

        ta.value = '';
        autoResize(ta);

        try {
            const res  = await fetch(`${API}/messages`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ room: currentRoom, username, text: cleaned })
            });
            const data = await res.json();
            if (res.ok && data.message) {
                if (!messages.find(m => m._id === data.message._id)) {
                    messages.push(data.message);
                    appendMessage(data.message);
                    lastMessageAt = data.message.sentAt;
                }
                const dot = document.getElementById('srv-unread-general');
                if (dot) dot.classList.remove('visible');
                scrollToBottom(true);

                if (currentRoom.startsWith('dm_')) loadDMList();
            }
        } catch(e) { console.warn('[chat-app] send error', e); }
    }

    function autoResize(ta) {
        ta.style.height = 'auto';
        const lh   = 22;
        const maxH = lh * MAX_TEXTAREA_LINES + 26;
        const newH = Math.min(ta.scrollHeight, maxH);
        ta.style.height = newH + 'px';
        ta.style.overflowY = ta.scrollHeight > maxH ? 'auto' : 'hidden';
    }

    function bindScrollClearUnread() {
        const el = document.getElementById('app-messages');
        if (!el) return;
        el.addEventListener('scroll', () => {
            if (isAtBottom()) {
                const dot = document.getElementById('srv-unread-general');
                if (dot) dot.classList.remove('visible');
            }
        });
    }

    function runStarTransition(direction, onDone) {
        const overlay = document.getElementById('star-overlay');
        const canvas  = document.getElementById('star-canvas');
        const ctx     = canvas.getContext('2d');

        overlay.classList.remove('hidden');
        canvas.width  = window.innerWidth;
        canvas.height = window.innerHeight;

        const dir = direction === 'left' ? -1 : 1;

        const stars = Array.from({ length: 180 }, () => ({
            x: Math.random() * canvas.width,
            y: Math.random() * canvas.height,
            speed: 2 + Math.random() * 8,
            size: 0.5 + Math.random() * 1.5,
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
                s.x += dir * speed;

                if (dir < 0 && s.x < 0)           s.x = canvas.width;
                if (dir > 0 && s.x > canvas.width) s.x = 0;

                const tailLen = speed * 4;
                const alpha   = Math.min(0.2 + progress * 0.8, 1);

                ctx.beginPath();
                ctx.moveTo(s.x, s.y);
                ctx.lineTo(s.x - dir * tailLen, s.y);
                ctx.strokeStyle = `rgba(255,255,255,${alpha})`;
                ctx.lineWidth   = s.size;
                ctx.stroke();
            });

            if (frame < totalFrames) {
                requestAnimationFrame(draw);
            } else {
                onDone();
            }
        }

        requestAnimationFrame(draw);
    }

    function bindBackBtn() {
        const btn = document.getElementById('back-to-map');
        if (!btn) return;
        btn.addEventListener('click', () => {
            stopPolling();
            stopGeneralUnreadPoll();
            stopDMListPoll();
            stopHeartbeat();
            stopOnlinePoll();
            const label = document.getElementById('star-label');
            if (label) label.textContent = 'חוזר למפה...';
            runStarTransition('left', () => {
                window.location.href = 'index.html';
            });
        });
    }

    function bindInput() {
        const ta   = document.getElementById('app-textarea');
        const send = document.getElementById('app-send-btn');

        ta.addEventListener('input',   () => autoResize(ta));
        ta.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
            }
        });
        send.addEventListener('click', sendMessage);
    }

    function bindAvatarClicks() {
        const container = document.getElementById('app-messages');
        container.addEventListener('click', handleAvatarClick);
    }

    // ── Draggable message input popup ────────────────────────
    function makeDraggable() {
        const popup  = document.getElementById('msg-input-popup');
        const handle = document.getElementById('mip-drag-handle');
        if (!popup || !handle) return;

        let isDragging = false, startX, startY, startLeft, startTop;

        handle.addEventListener('mousedown', (e) => {
            if (e.target.tagName === 'BUTTON') return;
            isDragging = true;
            const rect = popup.getBoundingClientRect();
            // Switch to absolute positioning
            popup.style.left      = rect.left + 'px';
            popup.style.top       = rect.top  + 'px';
            popup.style.bottom    = 'auto';
            popup.style.transform = 'none';
            startX    = e.clientX;
            startY    = e.clientY;
            startLeft = rect.left;
            startTop  = rect.top;
            popup.classList.add('dragging');
            e.preventDefault();
        });

        document.addEventListener('mousemove', (e) => {
            if (!isDragging) return;
            const newLeft = Math.max(0, Math.min(window.innerWidth  - popup.offsetWidth,  startLeft + e.clientX - startX));
            const newTop  = Math.max(0, Math.min(window.innerHeight - popup.offsetHeight, startTop  + e.clientY - startY));
            popup.style.left = newLeft + 'px';
            popup.style.top  = newTop  + 'px';
        });

        document.addEventListener('mouseup', () => {
            if (isDragging) {
                isDragging = false;
                popup.classList.remove('dragging');
                popup.style.animation = 'none';
            }
        });
    }

    // ── Heartbeat — tell the server we're online ─────────────
    let heartbeatTimer = null;

    function startHeartbeat() {
        const username = getUsername();
        if (!username) return;

        async function beat() {
            try {
                await fetch(`${API}/heartbeat`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username })
                });
            } catch(e) { /* silent */ }
        }

        beat(); // immediate first beat
        heartbeatTimer = setInterval(beat, 1000);
    }

    function stopHeartbeat() {
        if (heartbeatTimer) { clearInterval(heartbeatTimer); heartbeatTimer = null; }
    }

    // Fetch online status for all visible DM users and update dots
    async function refreshOnlineStatus() {
        const items = document.querySelectorAll('.dm-item[data-other-user]');
        if (items.length === 0) return;

        const usernames = [...items].map(el => el.dataset.otherUser);
        try {
            const res  = await fetch(`${API}/online-status?usernames=${usernames.map(encodeURIComponent).join(',')}`);
            const data = await res.json();
            items.forEach(el => {
                const dot = el.querySelector('.dm-status-dot');
                if (!dot) return;
                const online = data[el.dataset.otherUser];
                dot.className = 'dm-status-dot ' + (online ? 'online' : 'offline');
            });
        } catch(e) { /* silent */ }
    }

    let onlinePollTimer = null;
    function startOnlinePoll() {
        refreshOnlineStatus();
        onlinePollTimer = setInterval(refreshOnlineStatus, 1000);
    }
    function stopOnlinePoll() {
        if (onlinePollTimer) { clearInterval(onlinePollTimer); onlinePollTimer = null; }
    }

    // ── Clicking the general server icon goes back to general ─
    function bindServerIconClick() {
        const srv = document.getElementById('srv-general');
        if (!srv) return;
        srv.addEventListener('click', () => {
            if (currentRoom !== 'general') switchRoom('general', null);
        });
    }

    function init() {
        // Set general as active on load
        const srvGeneral = document.getElementById('srv-general');
        if (srvGeneral) srvGeneral.classList.add('active');

        initUserCard();
        bindBackBtn();
        bindInput();
        bindScrollClearUnread();
        bindPopupEvents();
        bindAvatarClicks();
        makeDraggable();
        bindServerIconClick();
        loadDMList();
        loadMessages().then(() => {
            startPolling();
            startGeneralUnreadPoll();
            startDMListPoll();
            startHeartbeat();
            startOnlinePoll();
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();