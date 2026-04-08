// ============================================================
// soundPanel.js  – לוח הצלילים (כפתור עיגול + פאנל)
// ניהול ערים לפי סוג התרעה + העלאת שיר + ניגון אוטומטי
// ============================================================

(function () {

    // ============================================================
    // קבועים
    // ============================================================

    const API = 'http://localhost:3000/api/sound';
    const MAX_SUGGESTIONS = 5;
    const MAX_DURATION_SECONDS = 3 * 60; // 3 דקות מקסימום

    // סוגי התרעות
    const ALERT_TYPES = ['alert', 'early', 'clear'];

    // ============================================================
    // State
    // ============================================================

    let currentType    = 'alert';   // הטאב הפעיל
    let allCities      = {};        // { cityName: zone } – מה-API
    let userData       = {          // נתוני המשתמש הנוכחי
        alert: { cities: [], songFile: null },
        early: { cities: [], songFile: null },
        clear: { cities: [], songFile: null },
    };
    let isPanelOpen    = false;

    // blob URLs זמניים למצב אורח (נעלמים ב-refresh)
    const guestBlobUrls = { alert: null, early: null, clear: null };

    // אודיו
    const audioPlayer  = new Audio();
    let   lastPlayedType = null;    // מניעת ניגון כפול

    // גרירה
    let isDraggingFab  = false;
    let fabDragMoved   = false;
    let fabDragStartX  = 0;
    let fabInitialLeft = 0;

    // ============================================================
    // עזר: שם משתמש נוכחי
    // ============================================================

    function getUsername() {
        return localStorage.getItem('currentUser') || null;
    }

    const LS_KEY = 'soundPanel_guest';

    // ============================================================
    // טעינת נתוני משתמש
    // ============================================================

    async function loadUserData() {
        const username = getUsername();

        if (username) {
            try {
                const res  = await fetch(`${API}/userdata?username=${encodeURIComponent(username)}`);
                const data = await res.json();
                // מיזוג בטוח – מוודא שכל סוג קיים
                ALERT_TYPES.forEach(t => {
                    userData[t] = data[t] || { cities: [], songFile: null };
                });
            } catch (e) {
                console.warn('[soundPanel] שגיאה בטעינת נתוני משתמש:', e);
            }
        } else {
            // guest – מ-localStorage
            try {
                const saved = localStorage.getItem(LS_KEY);
                if (saved) {
                    const parsed = JSON.parse(saved);
                    ALERT_TYPES.forEach(t => {
                        userData[t] = parsed[t] || { cities: [], songFile: null };
                    });
                }
            } catch {}
        }

        renderAll();
    }

    // ============================================================
    // שמירת ערים
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
                console.warn('[soundPanel] שגיאה בשמירת ערים:', e);
            }
        } else {
            // שמירה ב-localStorage (רק ערים, לא קבצים)
            try {
                const saved  = localStorage.getItem(LS_KEY);
                const parsed = saved ? JSON.parse(saved) : {};
                ALERT_TYPES.forEach(t => {
                    if (!parsed[t]) parsed[t] = { cities: [], songFile: null };
                });
                parsed[type].cities = cities;
                localStorage.setItem(LS_KEY, JSON.stringify(parsed));
            } catch {}
        }
    }

    // ============================================================
    // טעינת רשימת ערים מהשרת
    // ============================================================

    async function loadCities() {
        try {
            const res  = await fetch('http://localhost:3000/api/cities');
            allCities  = await res.json();
        } catch (e) {
            console.warn('[soundPanel] שגיאה בטעינת ערים:', e);
        }
    }

    // ============================================================
    // בניית ה-HTML של הפאנל ו-FAB
    // ============================================================

    function buildUI() {
        // --- כפתור עיגול ---
        const fab = document.createElement('div');
        fab.id = 'sound-fab';
        fab.title = 'הגדרות צלילים';
        fab.innerHTML = `
            <svg viewBox="0 0 24 24">
                <path d="M12 3v10.55A4 4 0 1 0 14 17V7h4V3h-6z"/>
            </svg>`;
        document.body.appendChild(fab);

        // --- לשונית שחזור ---
        const tab = document.createElement('div');
        tab.id = 'sound-restore-tab';
        document.body.appendChild(tab);

        // --- הפאנל ---
        const panel = document.createElement('div');
        panel.id = 'sound-panel';
        panel.classList.add('sp-hidden');
        panel.innerHTML = buildPanelHTML();
        document.body.appendChild(panel);

        // input קובץ (מחוץ לפאנל כדי שלא יהיה תוכן ב-DOM שלו)
        const fileInput = document.createElement('input');
        fileInput.id     = 'sp-file-input';
        fileInput.type   = 'file';
        fileInput.accept = '.mp3,.wav,.ogg,.m4a,.aac,.flac';
        document.body.appendChild(fileInput);

        bindEvents();
    }

    function buildPanelHTML() {
        return `
            <!-- שורת אייקונים -->
            <div class="sp-icons-row">
                ${buildIconBtn('alert', alertIcon(), 'אזעקה')}
                ${buildIconBtn('early', earlyIcon(), 'התרעה מקדימה')}
                ${buildIconBtn('clear', clearIcon(), 'סיום אירוע')}
            </div>

            <!-- גוף -->
            <div class="sp-body">
                <!-- חיפוש -->
                <div class="sp-search-wrap">
                    <svg class="sp-search-icon" viewBox="0 0 24 24">
                        <path d="M15.5 14h-.79l-.28-.27A6.47 6.47 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/>
                    </svg>
                    <input id="sp-search" class="sp-search-input" type="text"
                           placeholder="חפש יישוב..."
                           autocomplete="off" autocorrect="off" spellcheck="false" dir="rtl">
                </div>

                <!-- הצעות -->
                <div id="sp-suggestions" class="sp-suggestions"></div>

                <!-- תגיות ערים -->
                <div id="sp-tags" class="sp-tags-wrap"></div>

                <!-- אזור שיר -->
                <div class="sp-song-section">
                    <div class="sp-song-label">🎵 צליל לסוג זה</div>

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
    // אייקוני SVG
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
    // קישור אירועים
    // ============================================================

    function bindEvents() {
        const fab        = document.getElementById('sound-fab');
        const restoreTab = document.getElementById('sound-restore-tab');
        const panel      = document.getElementById('sound-panel');
        const searchInput= document.getElementById('sp-search');
        const fileInput  = document.getElementById('sp-file-input');

        // לחיצה על FAB – פתיחת פאנל (רק כפתור שמאלי)
        fab.addEventListener('click', (e) => {
            if (e.button !== 0) return;
            if (suppressNextClick) { suppressNextClick = false; return; }
            if (isDraggingFab) return;
            togglePanel();
        });

        // גרירת FAB שמאלה
        fab.addEventListener('mousedown', onFabMouseDown);
        document.addEventListener('mousemove', onFabMouseMove);
        document.addEventListener('mouseup',   onFabMouseUp);

        // לשונית שחזור
        restoreTab.addEventListener('click', restoreFab);

        // אייקוני סוג
        panel.querySelectorAll('.sp-icon-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const type = btn.getAttribute('data-type');
                switchType(type);
            });
        });

        // חיפוש
        searchInput.addEventListener('input', onSearchInput);
        searchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') hideSuggestions();
        });

        // סגירה בלחיצה מחוץ לפאנל
        // fileDialogOpenedAt מונע סגירה כשדיאלוג הקובץ נסגר
        let fileDialogOpenedAt = 0;

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

            // התעלם מקליקים שמגיעים עד 600ms אחרי פתיחת דיאלוג הקובץ
            if (Date.now() - fileDialogOpenedAt < 600) return;

            hideSuggestions();
            if (isPanelOpen) closePanel();
        });

        // העלאת קובץ
        document.getElementById('sp-upload-trigger').addEventListener('click', () => {
            fileDialogOpenedAt = Date.now();
            fileInput.click();
        });

        fileInput.addEventListener('change', onFileSelected);

        // מחיקת שיר
        document.getElementById('sp-delete-song').addEventListener('click', deleteSong);
    }

    // ============================================================
    // פתיחה/סגירה של הפאנל
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
    // גרירת FAB
    // ============================================================

    // מונע פתיחת פאנל אחרי hide שנגרם מגרירה
    let suppressNextClick = false;

    function onFabMouseDown(e) {
        // רק כפתור שמאלי
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
        const dx      = e.clientX - fabDragStartX;
        if (Math.abs(dx) > 5) fabDragMoved = true;

        // רק גרירה שמאלה מותרת
        const newLeft = Math.max(-60, Math.min(fabInitialLeft + dx, 20));
        document.getElementById('sound-fab').style.left = `${newLeft}px`;
    }

    function onFabMouseUp(e) {
        if (!isDraggingFab) return;
        isDraggingFab = false;

        const fab  = document.getElementById('sound-fab');
        fab.style.transition = '';

        const currentLeft = fab.getBoundingClientRect().left;

        if (fabDragMoved && currentLeft < -20) {
            // הוסתר מספיק שמאלה → dismiss
            suppressNextClick = true;
            hideFab();
        } else if (!fabDragMoved) {
            // לחיצה (לא גרירה) – togglePanel יופעל דרך ה-click listener
        } else {
            // חזרה למקום
            fab.style.left = '20px';
        }
    }

    function hideFab() {
        const fab = document.getElementById('sound-fab');
        fab.style.display = 'none';
        closePanel();

        const tab = document.getElementById('sound-restore-tab');
        tab.classList.add('visible');
    }

    function restoreFab() {
        const fab = document.getElementById('sound-fab');

        // התחל מחוץ למסך ואז גלוש למקום הקבוע
        fab.style.transition = 'none';
        fab.style.left = '-70px';
        fab.style.display = 'flex';

        // requestAnimationFrame כפול מבטיח שה-browser ירנדר את המיקום ההתחלתי לפני האנימציה
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                fab.style.transition = 'left 0.45s cubic-bezier(0.175, 0.885, 0.32, 1.275)';
                fab.style.left = '20px';
            });
        });

        const tab = document.getElementById('sound-restore-tab');
        tab.classList.remove('visible');
    }

    // ============================================================
    // החלפת טאב
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
    }

    // ============================================================
    // חיפוש ערים
    // ============================================================

    function onSearchInput(e) {
        const term = e.target.value.trim();
        if (!term) { hideSuggestions(); return; }

        // מחפשים ערים שמתחילות באותם אותיות
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

        // לחיצה על הצעה
        container.querySelectorAll('.sp-suggestion-item').forEach(item => {
            item.addEventListener('click', (e) => {
                const city = item.getAttribute('data-city');
                addCity(city);
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
    // ניהול ערים
    // ============================================================

    function addCity(city) {
        if (!userData[currentType].cities.includes(city)) {
            userData[currentType].cities.push(city);
            saveCities(currentType);
            renderTags();
            // מונע את המפה מלאפס את הזום בגלל הלחיצה
            if (typeof markMapUserInteraction === 'function') markMapUserInteraction();
        }
    }

    function removeCity(city) {
        userData[currentType].cities = userData[currentType].cities.filter(c => c !== city);
        saveCities(currentType);
        renderTags();
        // מונע את המפה מלאפס את הזום בגלל הלחיצה
        if (typeof markMapUserInteraction === 'function') markMapUserInteraction();
    }

    // ============================================================
    // רינדור תגיות
    // ============================================================

    function renderTags() {
        const container = document.getElementById('sp-tags');
        if (!container) return;

        const cities = userData[currentType].cities;

        // הסרת תגיות שכבר לא קיימות
        Array.from(container.querySelectorAll('.sp-tag')).forEach(tag => {
            if (!cities.includes(tag.getAttribute('data-city'))) {
                container.removeChild(tag);
            }
        });

        // הוספת תגיות חדשות שעדיין לא מוצגות
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
    // רינדור אזור שיר
    // ============================================================

    function renderSongSection() {
        const songData   = userData[currentType];
        const currentDiv = document.getElementById('sp-current-song');
        const nameSpan   = document.getElementById('sp-song-name');
        const statusDiv  = document.getElementById('sp-upload-status');

        if (songData.songFile) {
            // מציג את שם הקובץ בצורה נקייה (ללא prefix)
            const cleanName = songData.songFile.replace(/^[^_]+_[^_]+_\d+/, '') // הסרת username_type_timestamp
                                               .replace(/^_/, '')
                                               || songData.songFile;
            nameSpan.textContent = cleanName;
            currentDiv.classList.add('visible');
        } else {
            currentDiv.classList.remove('visible');
        }

        if (statusDiv) statusDiv.textContent = '';
    }

    function renderIconDots() {
        ALERT_TYPES.forEach(type => {
            const btn = document.querySelector(`.sp-icon-btn[data-type="${type}"]`);
            if (btn) {
                btn.classList.toggle('has-song', !!userData[type].songFile);
            }
        });
    }

    function renderAll() {
        // הגדרת הטאב הפעיל
        document.querySelectorAll('.sp-icon-btn').forEach(btn => {
            btn.classList.toggle('active', btn.getAttribute('data-type') === currentType);
        });
        renderTags();
        renderSongSection();
        renderIconDots();
    }

    // ============================================================
    // העלאת קובץ
    // ============================================================

    async function onFileSelected(e) {
        const file = e.target.files[0];
        if (!file) return;

        const statusDiv = document.getElementById('sp-upload-status');
        statusDiv.classList.remove('error');

        // בדיקת אורך השיר (אם ניתן)
        const ok = await checkDuration(file);
        if (!ok) {
            statusDiv.textContent = `השיר ארוך מדי (מקסימום 3 דקות)`;
            statusDiv.classList.add('error');
            e.target.value = '';
            return;
        }

        const username = getUsername();

        if (!username) {
            // אורח – blob URL בזיכרון בלבד, נעלם ב-refresh
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
        } catch (err) {
            statusDiv.textContent = 'שגיאת תקשורת';
            statusDiv.classList.add('error');
        }

        e.target.value = '';
    }

    // בדיקת אורך השיר
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
                resolve(true); // אם לא ניתן לבדוק, נאפשר
            });
        });
    }

    // ============================================================
    // מחיקת שיר
    // ============================================================

    async function deleteSong() {
        const username = getUsername();

        if (!username) {
            // אורח – מחיקת blob URL מהזיכרון
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
            await fetch(`${API}/song?username=${encodeURIComponent(username)}&alertType=${currentType}`, {
                method: 'DELETE',
            });
        } catch {}

        userData[currentType].songFile = null;
        renderSongSection();
        renderIconDots();
    }

    // ============================================================
    // ניגון אוטומטי – נקרא מ-main.js בעת אזעקה
    // ============================================================

    /**
     * triggerSoundAlert(type, cities)
     * type:   'alert' | 'early' | 'clear'
     * cities: מערך שמות ערים מהאזעקה
     */
    window.triggerSoundAlert = function (type, cities) {
        if (!ALERT_TYPES.includes(type)) return;

        const songData = userData[type];
        if (!songData.songFile) return;

        // בדיקה אם אחד מהיישובים שמורים
        const savedCities = songData.cities;
        if (savedCities.length > 0) {
            const match = cities.some(city => savedCities.includes(city));
            if (!match) return;
        }
        // אם אין ערים שמורות – מנגן תמיד לסוג זה

        playSound(type, songData.songFile);
    };

    function playSound(type, filename) {
        // מניעת כפילות
        if (lastPlayedType === type && !audioPlayer.paused) return;

        lastPlayedType = type;
        // אורח – נגן מה-blob URL שבזיכרון; משתמש מחובר – מהשרת
        const src = guestBlobUrls[type]
            ? guestBlobUrls[type]
            : `${API}/file/${encodeURIComponent(filename)}`;
        audioPlayer.src = src;
        audioPlayer.currentTime = 0;
        audioPlayer.play().catch(e => {
            console.warn('[soundPanel] לא ניתן לנגן:', e.message);
        });
    }

    // ============================================================
    // אתחול
    // ============================================================

    async function init() {
        await loadCities();
        buildUI();
        await loadUserData();
    }

    // מחכה ל-DOMContentLoaded
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // רענון נתונים כשמשתמש מתחבר/מתנתק
    window.addEventListener('storage', (e) => {
        if (e.key === 'currentUser') loadUserData();
    });

})();