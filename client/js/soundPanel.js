// ============================================================
// soundPanel.js  – sound panel with built-in melody picker
// ============================================================

(function () {

    // ============================================================
    // Constants
    // ============================================================

    const API = `${API_BASE}/api/sound`;
    const MAX_SUGGESTIONS      = 5;
    const MAX_DURATION_SECONDS = 3 * 60;

    const ALERT_TYPES = ['alert', 'early', 'clear'];

    // Built-in melodies – fetched from server, but we keep a default list
    // so the UI can render immediately while the fetch is in flight.
    let BUILTIN_MELODIES = [
        { id: 'builtin_1', name: 'מנגינה 1' },
        { id: 'builtin_2', name: 'מנגינה 2' },
        { id: 'builtin_3', name: 'מנגינה 3' },
    ];

    // ============================================================
    // State
    // ============================================================

    let currentType = 'alert';
    let allCities   = {};
    let userData    = {
        alert: { cities: [], songFile: null, builtinMelodyId: null, builtinActive: false },
        early: { cities: [], songFile: null, builtinMelodyId: null, builtinActive: false },
        clear: { cities: [], songFile: null, builtinMelodyId: null, builtinActive: false },
    };
    let isPanelOpen = false;

    // Blob URLs for guest uploaded files (lost on refresh)
    const guestBlobUrls = { alert: null, early: null, clear: null };

    // Audio
    const audioPlayer  = new Audio();
    let lastPlayedType = null;

    // Drag state
    let isDraggingFab  = false;
    let fabDragMoved   = false;
    let fabDragStartX  = 0;
    let fabInitialLeft = 0;

    // ============================================================
    // LocalStorage keys
    // ============================================================

    const LS_KEY = 'soundPanel_guest';

    // ============================================================
    // Helpers
    // ============================================================

    function getUsername() {
        return localStorage.getItem('currentUser') || null;
    }

    // ============================================================
    // Load built-in melodies from server
    // ============================================================

    async function loadBuiltinMelodies() {
        try {
            const res  = await fetch(`${API}/melodies`);
            const data = await res.json();
            if (Array.isArray(data) && data.length > 0) {
                BUILTIN_MELODIES = data;
            }
        } catch (e) {
            console.warn('[soundPanel] Could not load built-in melodies:', e);
        }
    }

    // ============================================================
    // Load user data
    // ============================================================

    async function loadUserData() {
        const username = getUsername();

        if (username) {
            try {
                const res  = await fetch(`${API}/userdata?username=${encodeURIComponent(username)}`);
                const data = await res.json();
                ALERT_TYPES.forEach(t => {
                    userData[t] = data[t] || { cities: [], songFile: null, builtinMelodyId: null, builtinActive: false };
                    // Migrate missing fields
                    if (userData[t].builtinMelodyId === undefined) userData[t].builtinMelodyId = null;
                    if (userData[t].builtinActive   === undefined) userData[t].builtinActive   = false;
                });
            } catch (e) {
                console.warn('[soundPanel] Error loading user data:', e);
            }
        } else {
            // Guest – from localStorage
            try {
                const saved = localStorage.getItem(LS_KEY);
                if (saved) {
                    const parsed = JSON.parse(saved);
                    ALERT_TYPES.forEach(t => {
                        userData[t] = parsed[t] || { cities: [], songFile: null, builtinMelodyId: null, builtinActive: false };
                        if (userData[t].builtinMelodyId === undefined) userData[t].builtinMelodyId = null;
                        if (userData[t].builtinActive   === undefined) userData[t].builtinActive   = false;
                    });
                }
            } catch {}
        }

        renderAll();
    }

    // ============================================================
    // Save cities
    // ============================================================

    async function saveCities(type) {
        const username = getUsername();
        const cities   = userData[type].cities;

        if (username) {
            try {
                await fetch(`${API}/cities`, {
                    method:  'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body:    JSON.stringify({ username, alertType: type, cities }),
                });
            } catch (e) {
                console.warn('[soundPanel] Error saving cities:', e);
            }
        } else {
            _saveGuestData();
        }
    }

    // ============================================================
    // Save built-in melody choice
    // ============================================================

    async function saveBuiltinChoice(type) {
        const username = getUsername();
        const { builtinMelodyId, builtinActive } = userData[type];

        if (username) {
            try {
                await fetch(`${API}/builtin`, {
                    method:  'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body:    JSON.stringify({ username, alertType: type, builtinMelodyId, builtinActive }),
                });
            } catch (e) {
                console.warn('[soundPanel] Error saving builtin choice:', e);
            }
        } else {
            _saveGuestData();
        }
    }

    function _saveGuestData() {
        try {
            const toSave = {};
            ALERT_TYPES.forEach(t => {
                toSave[t] = {
                    cities:          userData[t].cities,
                    builtinMelodyId: userData[t].builtinMelodyId,
                    builtinActive:   userData[t].builtinActive,
                    // Don't save songFile name for guests (blob URLs are session-only)
                    songFile: null,
                };
            });
            localStorage.setItem(LS_KEY, JSON.stringify(toSave));
        } catch {}
    }

    // ============================================================
    // Load city list
    // ============================================================

    async function loadCities() {
        try {
            const res  = await fetch(`${API_BASE}/api/cities`);
            allCities  = await res.json();
        } catch (e) {
            console.warn('[soundPanel] Error loading cities:', e);
        }
    }

    // ============================================================
    // Build UI
    // ============================================================

    function buildUI() {
        // FAB button
        const fab = document.createElement('div');
        fab.id    = 'sound-fab';
        fab.title = 'הגדרות צלילים';
        fab.innerHTML = `
            <svg viewBox="0 0 24 24">
                <path d="M12 3v10.55A4 4 0 1 0 14 17V7h4V3h-6z"/>
            </svg>`;
        document.body.appendChild(fab);

        // Restore tab
        const tab = document.createElement('div');
        tab.id = 'sound-restore-tab';
        document.body.appendChild(tab);

        // Panel wrapper
        const panel = document.createElement('div');
        panel.id = 'sound-panel';
        panel.classList.add('sp-hidden');
        panel.innerHTML = buildPanelHTML();
        document.body.appendChild(panel);

        // Hidden file input
        const fileInput   = document.createElement('input');
        fileInput.id      = 'sp-file-input';
        fileInput.type    = 'file';
        fileInput.accept  = '.mp3,.wav,.ogg,.m4a,.aac,.flac';
        document.body.appendChild(fileInput);

        bindEvents();
    }

    function buildPanelHTML() {
        return `
            <!-- Sticky icons row -->
            <div class="sp-icons-row" id="sp-icons-row">
                ${buildIconBtn('alert', alertIcon(), 'אזעקה')}
                ${buildIconBtn('early', earlyIcon(), 'התרעה מקדימה')}
                ${buildIconBtn('clear', clearIcon(), 'סיום אירוע')}
            </div>

            <!-- Scrollable body -->
            <div class="sp-body" id="sp-body">

                <!-- City search -->
                <div class="sp-search-wrap">
                    <svg class="sp-search-icon" viewBox="0 0 24 24">
                        <path d="M15.5 14h-.79l-.28-.27A6.47 6.47 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/>
                    </svg>
                    <input id="sp-search" class="sp-search-input" type="text"
                           placeholder="חפש יישוב..."
                           autocomplete="off" autocorrect="off" spellcheck="false" dir="rtl">
                </div>

                <!-- Suggestions -->
                <div id="sp-suggestions" class="sp-suggestions"></div>

                <!-- City tags -->
                <div id="sp-tags" class="sp-tags-wrap"></div>

                <!-- Upload song section -->
                <div class="sp-song-section">
                    <div class="sp-song-label">🎵 צליל מותאם אישית</div>

                    <div id="sp-current-song" class="sp-current-song">
                        <svg class="sp-current-song-icon" viewBox="0 0 24 24">
                            <path d="M12 3v10.55A4 4 0 1 0 14 17V7h4V3h-6z"/>
                        </svg>
                        <span id="sp-song-name" class="sp-current-song-name"></span>
                        <button type="button" class="sp-delete-song-btn" id="sp-delete-song" title="הסר שיר">×</button>
                    </div>

                    <button type="button" class="sp-upload-btn" id="sp-upload-trigger">
                        <svg viewBox="0 0 24 24">
                            <path d="M19.35 10.04A7.49 7.49 0 0 0 12 4C9.11 4 6.6 5.64 5.35 8.04A5.994 5.994 0 0 0 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96zM14 13v4h-4v-4H7l5-5 5 5h-3z"/>
                        </svg>
                        העלה שיר (MP3/WAV/OGG)
                    </button>

                    <div id="sp-upload-status" class="sp-upload-status"></div>
                </div>

                <!-- Built-in melodies section -->
                <div class="sp-builtin-section">
                    <div class="sp-song-label">🎼 בחר מנגינה מובנית</div>
                    <div id="sp-builtin-list" class="sp-builtin-list">
                        <!-- rendered by renderBuiltinMelodies() -->
                    </div>
                </div>

            </div>`;
    }

    function buildIconBtn(type, iconSvg, label) {
        return `
            <button type="button" class="sp-icon-btn" data-type="${type}" title="${label}">
                <span class="sp-song-dot"></span>
                ${iconSvg}
                <span class="sp-icon-label">${label}</span>
            </button>`;
    }

    // ============================================================
    // SVG icons
    // ============================================================

    function alertIcon() {
        return `<svg viewBox="0 0 24 24" fill="#c0392b">
            <path d="M14.07,3.58L15.42,2.23C16.21,1.45 17.59,1.45 18.37,2.23L21.78,5.63C22.56,6.41 22.56,7.79 21.78,8.58L20.42,9.93L14.07,3.58M12.66,5L2.55,15.1C2.42,15.38 2.33,15.38 2.26,15.56L1,20.41L1.41,20.83L6.26,19.57C6.44,19.5 6.6,19.41 6.72,19.28L16.83,9.17L12.66,5Z"/>
        </svg>`;
    }

    function earlyIcon() {
        return `<svg viewBox="0 0 24 24" fill="#e67e22">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>
        </svg>`;
    }

    function clearIcon() {
        return `<svg viewBox="0 0 24 24" fill="#27ae60">
            <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
        </svg>`;
    }

    // ============================================================
    // Bind events
    // ============================================================

    function bindEvents() {
        const fab         = document.getElementById('sound-fab');
        const restoreTab  = document.getElementById('sound-restore-tab');
        const panel       = document.getElementById('sound-panel');
        const searchInput = document.getElementById('sp-search');
        const fileInput   = document.getElementById('sp-file-input');

        // FAB click
        fab.addEventListener('click', (e) => {
            if (e.button !== 0) return;
            if (suppressNextClick) { suppressNextClick = false; return; }
            if (isDraggingFab) return;
            togglePanel();
        });

        // FAB drag
        fab.addEventListener('mousedown', onFabMouseDown);
        document.addEventListener('mousemove', onFabMouseMove);
        document.addEventListener('mouseup',   onFabMouseUp);

        // Restore tab
        restoreTab.addEventListener('click', restoreFab);

        // Alert type icon buttons
        panel.querySelectorAll('.sp-icon-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                switchType(btn.getAttribute('data-type'));
            });
        });

        // Search input
        searchInput.addEventListener('input', onSearchInput);
        searchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') hideSuggestions();
        });

        // Close panel on outside click
        let suppressPanelClose = false;
        function tempSuppressClose(ms = 3000) {
            suppressPanelClose = true;
            setTimeout(() => { suppressPanelClose = false; }, ms);
        }

        document.addEventListener('click', (e) => {
            const soundPanel = document.getElementById('sound-panel');
            const soundFab   = document.getElementById('sound-fab');
            const fileInp    = document.getElementById('sp-file-input');
            const path       = e.composedPath();
            const insidePanel = soundPanel && path.includes(soundPanel);
            const insideFab   = soundFab   && path.includes(soundFab);
            const insideFile  = fileInp    && path.includes(fileInp);

            if (insidePanel || insideFab || insideFile) {
                if (typeof markMapUserInteraction === 'function') markMapUserInteraction();
                return;
            }
            if (suppressPanelClose) return;

            hideSuggestions();
            if (isPanelOpen) closePanel();
        });

        // Upload button
        document.getElementById('sp-upload-trigger').addEventListener('click', (e) => {
            e.preventDefault();
            tempSuppressClose(3000);
            fileInput.click();
        });

        fileInput.addEventListener('change', (e) => {
            tempSuppressClose(3000);
            onFileSelected(e);
        });

        // Delete uploaded song
        document.getElementById('sp-delete-song').addEventListener('click', (e) => {
            e.stopPropagation();
            deleteSong();
        });
    }

    // ============================================================
    // Panel open / close
    // ============================================================

    function togglePanel() {
        if (isPanelOpen) closePanel();
        else openPanel();
    }

    function openPanel() {
        isPanelOpen = true;
        document.getElementById('sound-panel').classList.remove('sp-hidden');
        renderAll();
    }

    function closePanel() {
        isPanelOpen = false;
        document.getElementById('sound-panel').classList.add('sp-hidden');
        hideSuggestions();
    }

    // ============================================================
    // FAB drag
    // ============================================================

    let suppressNextClick = false;

    function onFabMouseDown(e) {
        if (e.button !== 0) return;
        isDraggingFab  = true;
        fabDragMoved   = false;
        fabDragStartX  = e.clientX;
        const fab      = document.getElementById('sound-fab');
        fabInitialLeft = fab.getBoundingClientRect().left;
        fab.style.transition = 'none';
        e.preventDefault();
    }

    function onFabMouseMove(e) {
        if (!isDraggingFab) return;
        const dx = e.clientX - fabDragStartX;
        if (Math.abs(dx) > 5) fabDragMoved = true;
        const newLeft = Math.max(-60, Math.min(fabInitialLeft + dx, 20));
        document.getElementById('sound-fab').style.left = `${newLeft}px`;
    }

    function onFabMouseUp(e) {
        if (!isDraggingFab) return;
        isDraggingFab = false;
        const fab = document.getElementById('sound-fab');
        fab.style.transition = '';
        const currentLeft = fab.getBoundingClientRect().left;

        if (fabDragMoved && currentLeft < -20) {
            suppressNextClick = true;
            hideFab();
        } else if (!fabDragMoved) {
            // click handled via click event
        } else {
            fab.style.left = '20px';
        }
    }

    function hideFab() {
        document.getElementById('sound-fab').style.display = 'none';
        closePanel();
        document.getElementById('sound-restore-tab').classList.add('visible');
    }

    function restoreFab() {
        const fab = document.getElementById('sound-fab');
        fab.style.transition = 'none';
        fab.style.left       = '-70px';
        fab.style.display    = 'flex';

        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                fab.style.transition = 'left 0.45s cubic-bezier(0.175, 0.885, 0.32, 1.275)';
                fab.style.left       = '20px';
            });
        });

        document.getElementById('sound-restore-tab').classList.remove('visible');
    }

    // ============================================================
    // Switch alert type tab
    // ============================================================

    function switchType(type) {
        currentType = type;
        document.querySelectorAll('.sp-icon-btn').forEach(btn => {
            btn.classList.toggle('active', btn.getAttribute('data-type') === type);
        });
        hideSuggestions();
        document.getElementById('sp-search').value = '';
        renderTags();
        renderSongSection();
        renderBuiltinMelodies();
    }

    // ============================================================
    // City search
    // ============================================================

    function onSearchInput(e) {
        const term = e.target.value.trim();
        if (!term) { hideSuggestions(); return; }

        const matches = Object.keys(allCities)
            .filter(city => city.startsWith(term))
            .slice(0, MAX_SUGGESTIONS);

        if (matches.length === 0) { hideSuggestions(); return; }
        showSuggestions(matches);
    }

    function showSuggestions(cities) {
        const container = document.getElementById('sp-suggestions');
        container.innerHTML = cities.map(city => {
            const zone = allCities[city] || '';
            return `
                <div class="sp-suggestion-item" data-city="${city}">
                    <span class="sp-suggestion-city">${city}</span>
                    ${zone ? `<span class="sp-suggestion-zone">${zone}</span>` : ''}
                </div>`;
        }).join('');
        container.classList.add('visible');

        container.querySelectorAll('.sp-suggestion-item').forEach(item => {
            item.addEventListener('click', () => {
                addCity(item.getAttribute('data-city'));
                document.getElementById('sp-search').value = '';
                hideSuggestions();
            });
        });
    }

    function hideSuggestions() {
        const container = document.getElementById('sp-suggestions');
        if (container) {
            container.classList.remove('visible');
            container.innerHTML = '';
        }
    }

    // ============================================================
    // City management
    // ============================================================

    function addCity(city) {
        if (!userData[currentType].cities.includes(city)) {
            userData[currentType].cities.push(city);
            saveCities(currentType);
            renderTags();
            if (typeof markMapUserInteraction === 'function') markMapUserInteraction();
        }
    }

    function removeCity(city) {
        userData[currentType].cities = userData[currentType].cities.filter(c => c !== city);
        saveCities(currentType);
        renderTags();
        if (typeof markMapUserInteraction === 'function') markMapUserInteraction();
    }

    // ============================================================
    // Render: tags
    // ============================================================

    function renderTags() {
        const container = document.getElementById('sp-tags');
        if (!container) return;
        const cities = userData[currentType].cities;

        Array.from(container.querySelectorAll('.sp-tag')).forEach(tag => {
            if (!cities.includes(tag.getAttribute('data-city'))) container.removeChild(tag);
        });

        const existing = new Set(
            Array.from(container.querySelectorAll('.sp-tag')).map(t => t.getAttribute('data-city'))
        );

        cities.forEach(city => {
            if (existing.has(city)) return;
            const tag = document.createElement('div');
            tag.className = 'sp-tag';
            tag.setAttribute('data-city', city);
            tag.innerHTML = `<span>${city}</span><button type="button" class="sp-tag-remove" data-city="${city}" title="הסר">×</button>`;
            tag.querySelector('.sp-tag-remove').addEventListener('click', (e) => {
                e.stopPropagation();
                removeCity(city);
            });
            container.appendChild(tag);
        });
    }

    // ============================================================
    // Render: uploaded song section
    // ============================================================

    function renderSongSection() {
        const songData   = userData[currentType];
        const currentDiv = document.getElementById('sp-current-song');
        const nameSpan   = document.getElementById('sp-song-name');
        const statusDiv  = document.getElementById('sp-upload-status');

        if (songData.songFile) {
            const cleanName = songData.songFile
                .replace(/^[^_]+_[^_]+_\d+/, '')
                .replace(/^_/, '')
                || songData.songFile;
            nameSpan.textContent = cleanName;
            currentDiv.classList.add('visible');
        } else {
            currentDiv.classList.remove('visible');
        }

        // Dim uploaded song row when builtin is active
        const uploadArea = document.querySelector('.sp-song-section');
        if (uploadArea) {
            uploadArea.classList.toggle('sp-dimmed', !!songData.builtinActive);
        }

        if (statusDiv) statusDiv.textContent = '';
    }

    // ============================================================
    // Render: built-in melodies
    // ============================================================

    function renderBuiltinMelodies() {
        const container = document.getElementById('sp-builtin-list');
        if (!container) return;

        const songData = userData[currentType];

        container.innerHTML = BUILTIN_MELODIES.map(m => {
            const isSelected = songData.builtinMelodyId === m.id;
            const isActive   = isSelected && songData.builtinActive;

            return `
                <div class="sp-melody-row ${isActive ? 'sp-melody-active' : ''}" data-melody-id="${m.id}">
                    <!-- Checkbox -->
                    <button type="button"
                            class="sp-melody-checkbox ${isActive ? 'checked' : ''}"
                            data-melody-id="${m.id}"
                            title="${isActive ? 'בטל בחירה' : 'בחר מנגינה זו'}">
                        ${isActive ? checkIcon() : ''}
                    </button>

                    <!-- Melody name -->
                    <span class="sp-melody-name">${m.name}</span>

                    <!-- Play preview button -->
                    <button type="button" class="sp-melody-preview" data-melody-id="${m.id}" title="השמע תצוגה מקדימה">
                        ▶
                    </button>
                </div>`;
        }).join('');

        // Bind checkbox clicks
        container.querySelectorAll('.sp-melody-checkbox').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                onMelodyCheckboxClick(btn.getAttribute('data-melody-id'));
            });
        });

        // Bind preview clicks
        container.querySelectorAll('.sp-melody-preview').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                previewMelody(btn.getAttribute('data-melody-id'));
            });
        });

        // Update uploaded-song dimming
        renderSongSection();
    }

    function checkIcon() {
        return `<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
            <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
        </svg>`;
    }

    // ============================================================
    // Melody checkbox logic
    // ============================================================

    function onMelodyCheckboxClick(melodyId) {
        const songData = userData[currentType];
        const isSame   = songData.builtinMelodyId === melodyId;

        if (isSame && songData.builtinActive) {
            // Uncheck: deactivate built-in → uploaded song takes over (if any)
            songData.builtinActive = false;
        } else {
            // Select & activate this melody
            songData.builtinMelodyId = melodyId;
            songData.builtinActive   = true;
        }

        saveBuiltinChoice(currentType);
        renderBuiltinMelodies();
        renderIconDots();
    }

    // ============================================================
    // Preview a melody (plays it once)
    // ============================================================

    function previewMelody(melodyId) {
        const melody = BUILTIN_MELODIES.find(m => m.id === melodyId);
        if (!melody || !melody.file) return;
        const src = `${API}/builtin/${encodeURIComponent(melody.file)}`;
        audioPlayer.src = src;
        audioPlayer.currentTime = 0;
        audioPlayer.play().catch(e => console.warn('[soundPanel] Preview error:', e.message));
    }

    // ============================================================
    // Render: icon dots (green dot = has sound configured)
    // ============================================================

    function renderIconDots() {
        ALERT_TYPES.forEach(type => {
            const btn = document.querySelector(`.sp-icon-btn[data-type="${type}"]`);
            if (btn) {
                const d = userData[type];
                const hasSomething = (d.builtinActive && d.builtinMelodyId) || (!d.builtinActive && d.songFile);
                btn.classList.toggle('has-song', hasSomething);
            }
        });
    }

    // ============================================================
    // Render all
    // ============================================================

    function renderAll() {
        document.querySelectorAll('.sp-icon-btn').forEach(btn => {
            btn.classList.toggle('active', btn.getAttribute('data-type') === currentType);
        });
        renderTags();
        renderSongSection();
        renderBuiltinMelodies();
        renderIconDots();
    }

    // ============================================================
    // File upload
    // ============================================================

    async function onFileSelected(e) {
        const file = e.target.files[0];
        if (!file) return;

        const statusDiv = document.getElementById('sp-upload-status');
        statusDiv.classList.remove('error');

        const ok = await checkDuration(file);
        if (!ok) {
            statusDiv.textContent = 'השיר ארוך מדי (מקסימום 3 דקות)';
            statusDiv.classList.add('error');
            e.target.value = '';
            return;
        }

        const username = getUsername();

        if (!username) {
            if (guestBlobUrls[currentType]) URL.revokeObjectURL(guestBlobUrls[currentType]);
            guestBlobUrls[currentType] = URL.createObjectURL(file);
            userData[currentType].songFile = file.name;
            renderSongSection();
            renderIconDots();
            statusDiv.textContent = 'כדי לשמור שירים לצמיתות, יש להתחבר.';
            e.target.value = '';
            return;
        }

        statusDiv.textContent = 'מעלה...';

        const formData = new FormData();
        formData.append('song', file);

        try {
            const res  = await fetch(
                `${API}/upload?username=${encodeURIComponent(username)}&alertType=${currentType}`,
                { method: 'POST', body: formData }
            );
            const data = await res.json();

            if (res.ok) {
                userData[currentType].songFile = data.filename;
                renderSongSection();
                renderIconDots();
                statusDiv.textContent = '✓ הועלה בהצלחה!';
                setTimeout(() => { statusDiv.textContent = ''; }, 3000);
            } else {
                statusDiv.textContent = data.error || 'שגיאה בהעלאה';
                statusDiv.classList.add('error');
            }
        } catch {
            statusDiv.textContent = 'שגיאת תקשורת';
            statusDiv.classList.add('error');
        }

        e.target.value = '';
    }

    function checkDuration(file) {
        return new Promise(resolve => {
            const audio = document.createElement('audio');
            const url   = URL.createObjectURL(file);
            audio.src   = url;
            audio.addEventListener('loadedmetadata', () => {
                URL.revokeObjectURL(url);
                resolve(audio.duration <= MAX_DURATION_SECONDS);
            });
            audio.addEventListener('error', () => {
                URL.revokeObjectURL(url);
                resolve(true);
            });
        });
    }

    // ============================================================
    // Delete uploaded song
    // ============================================================

    async function deleteSong() {
        const username = getUsername();

        if (!username) {
            if (guestBlobUrls[currentType]) {
                URL.revokeObjectURL(guestBlobUrls[currentType]);
                guestBlobUrls[currentType] = null;
            }
            userData[currentType].songFile = null;
            renderSongSection();
            renderIconDots();
            return;
        }

        try {
            await fetch(
                `${API}/song?username=${encodeURIComponent(username)}&alertType=${currentType}`,
                { method: 'DELETE' }
            );
        } catch {}

        userData[currentType].songFile = null;
        renderSongSection();
        renderIconDots();
    }

    // ============================================================
    // Auto-play trigger — called from main.js
    // ============================================================

    window.triggerSoundAlert = function (type, cities) {
        if (!ALERT_TYPES.includes(type)) return;

        const songData   = userData[type];
        const savedCities = songData.cities;

        // Check if alert matches saved cities (empty list = always play)
        if (savedCities.length > 0) {
            const match = cities.some(city => savedCities.includes(city));
            if (!match) return;
        }

        // Decide what to play
        if (songData.builtinActive && songData.builtinMelodyId) {
            // Play built-in melody
            const melody = BUILTIN_MELODIES.find(m => m.id === songData.builtinMelodyId);
            if (melody && melody.file) {
                playSoundSrc(type, `${API}/builtin/${encodeURIComponent(melody.file)}`);
            }
        } else if (!songData.builtinActive && songData.songFile) {
            // Play uploaded song
            const src = guestBlobUrls[type]
                ? guestBlobUrls[type]
                : `${API}/file/${encodeURIComponent(songData.songFile)}`;
            playSoundSrc(type, src);
        }
    };

    function playSoundSrc(type, src) {
        if (lastPlayedType === type && !audioPlayer.paused) return;
        lastPlayedType       = type;
        audioPlayer.src      = src;
        audioPlayer.currentTime = 0;
        audioPlayer.play().catch(e => console.warn('[soundPanel] Cannot play:', e.message));
    }

    // ============================================================
    // Init
    // ============================================================

    async function init() {
        await loadCities();
        await loadBuiltinMelodies();
        buildUI();
        await loadUserData();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // Refresh when user logs in/out
    window.addEventListener('storage', (e) => {
        if (e.key === 'currentUser') loadUserData();
    });

})();