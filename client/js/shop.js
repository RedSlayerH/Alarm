// ============================================================
// shop.js – Cosmetics Shop (avatar accessories)
// All items are free. Persisted via localStorage.
// ============================================================

(function () {

    // ── Storage key ─────────────────────────────────────────
    const LS_KEY = 'myalertmap_equipped_accessory';

    // ── Item definitions ─────────────────────────────────────
    // cssClass must match a .sprite-<name> rule in shop.css
    // pos: which corner the badge appears on avatar
    const SHOP_ITEMS = [
        // ── Pokémon ──────────────────────────────────────────
        {
            id: 'pikachu', name: 'פיקאצ\'ו', nameEn: 'Pikachu',
            img: 'client/img/shop/pikachu.gif', cssClass: 'sprite-pikachu',
            tag: 'חינם', category: 'pokemon',
        },
        {
            id: 'charizard', name: 'צ\'ריזארד', nameEn: 'Charizard',
            img: 'client/img/shop/charizard.gif', cssClass: 'sprite-charizard',
            tag: 'חינם', category: 'pokemon',
        },
        {
            id: 'mewtwo', name: 'מיוטו', nameEn: 'Mewtwo',
            img: 'client/img/shop/mewtwo.gif', cssClass: 'sprite-mewtwo',
            tag: 'חינם', category: 'pokemon',
        },
        {
            id: 'rayquaza', name: 'ריקוואזה', nameEn: 'Rayquaza',
            img: 'client/img/shop/rayquaza.gif', cssClass: 'sprite-rayquaza',
            tag: 'חינם', category: 'pokemon',
        },
        {
            id: 'mega-rayquaza-shiny', name: 'מגה ריקוואזה שיני', nameEn: 'Mega Rayquaza Shiny',
            img: 'client/img/shop/mega-rayquaza-shiny.gif', cssClass: 'sprite-mega-rayquaza-shiny',
            tag: 'חינם', category: 'pokemon',
        },
        {
            id: 'reshiram', name: 'רשירם', nameEn: 'Reshiram',
            img: 'client/img/shop/reshiram.gif', cssClass: 'sprite-reshiram',
            tag: 'חינם', category: 'pokemon',
        },
        {
            id: 'zekrom', name: 'זקרום', nameEn: 'Zekrom',
            img: 'client/img/shop/zekrom.gif', cssClass: 'sprite-zekrom',
            tag: 'חינם', category: 'pokemon',
        },
        {
            id: 'giratina', name: 'גיראטינה', nameEn: 'Giratina',
            img: 'client/img/shop/giratina.gif', cssClass: 'sprite-giratina',
            tag: 'חינם', category: 'pokemon',
        },
        {
            id: 'giratina-shiny', name: 'גיראטינה שיני', nameEn: 'Giratina Shiny',
            img: 'client/img/shop/giratina-shiny.gif', cssClass: 'sprite-giratina-shiny',
            tag: 'חינם', category: 'pokemon',
        },
        {
            id: 'darkrai', name: 'דארקראי', nameEn: 'Darkrai',
            img: 'client/img/shop/darkrai.gif', cssClass: 'sprite-darkrai',
            tag: 'חינם', category: 'pokemon',
        },
        // ── Other ────────────────────────────────────────────
        {
            id: 'patrick', name: 'פטריק', nameEn: 'Patrick',
            img: 'client/img/shop/patrick.gif', cssClass: 'sprite-patrick',
            tag: 'חינם', category: 'other',
        },
        {
            id: 'umbrella', name: 'מטריה', nameEn: 'Umbrella',
            img: 'client/img/shop/umbrella.gif', cssClass: 'sprite-umbrella',
            tag: 'חינם', category: 'other',
        },
        {
            id: 'flame-bird', name: 'עוף להבות', nameEn: 'Flame Bird',
            img: 'client/img/shop/flame-bird.jpg', cssClass: 'sprite-flame-bird',
            tag: 'חינם', category: 'other',
        },
        // ── Crowns ───────────────────────────────────────────
        {
            id: 'crown', name: 'כתר זהב', nameEn: 'Gold Crown',
            img: 'client/img/shop/crown.jpg', cssClass: 'sprite-crown',
            tag: 'חינם', category: 'effects',
        },
        {
            id: 'dark-crown', name: 'כתר כהה', nameEn: 'Dark Crown',
            img: 'client/img/shop/dark-crown.jpg', cssClass: 'sprite-dark-crown',
            tag: 'חינם', category: 'effects',
        },
    ];

    // ── State ────────────────────────────────────────────────
    let equippedId = localStorage.getItem(LS_KEY) || null;
    let activeTab  = 'all';

    // ── Public API ───────────────────────────────────────────
    window.Shop = {
        getEquipped,
        getItem,
        equip,
        remove,
        open:  openShop,
        close: closeShop,
        refreshAllAccessories,
    };

    // ── Getters ──────────────────────────────────────────────
    function getEquipped() { return equippedId; }

    function getItem(id) { return SHOP_ITEMS.find(i => i.id === id) || null; }

    // ── Equip / Remove ───────────────────────────────────────
    function equip(id) {
        equippedId = id;
        localStorage.setItem(LS_KEY, id);
        refreshAllAccessories();
        rerenderShop();
    }

    function remove() {
        equippedId = null;
        localStorage.removeItem(LS_KEY);
        refreshAllAccessories();
        rerenderShop();
    }

    // ── Attach accessory to an avatar element ────────────────
    // avatarEl: the .app-avatar / .pmp-avatar / .pfp-avatar / .uc-avatar DOM node
    // Returns the wrapper div (already replaces avatarEl in DOM if needed)
    function attachAccessory(avatarEl) {
        if (!avatarEl) return;

        // Find or create wrapper
        let wrap = avatarEl.parentElement;
        const alreadyWrapped = wrap && wrap.classList.contains('avatar-acc-wrap');

        if (!alreadyWrapped) {
            // Insert wrapper around the avatar
            wrap = document.createElement('div');
            wrap.className = 'avatar-acc-wrap';
            wrap.style.cssText = 'position:relative;display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;';
            avatarEl.parentNode.insertBefore(wrap, avatarEl);
            wrap.appendChild(avatarEl);
        }

        // Remove any existing accessory
        wrap.querySelectorAll('.avatar-accessory').forEach(el => el.remove());

        if (!equippedId) return;

        const item = getItem(equippedId);
        if (!item) return;

        const acc = document.createElement('img');
        acc.className = `avatar-accessory ${item.cssClass}`;
        acc.src       = item.img;
        acc.alt       = '';
        acc.draggable = false;
        wrap.appendChild(acc);
    }

    // Re-attach accessories to all visible avatars in the page
    function refreshAllAccessories() {
        // Chat message avatars
        document.querySelectorAll('.app-msg-group.mine .app-avatar').forEach(el => {
            attachAccessory(el);
        });

        // User card avatar (bottom left)
        const ucAvatar = document.getElementById('user-card-avatar');
        if (ucAvatar) attachAccessory(ucAvatar);

        // Profile mini popup avatar (only if it's OUR profile)
        // We only show our own accessory — handled in chat-app.js popup code
    }

    // ── Shop HTML ────────────────────────────────────────────
    function buildShopHTML() {
        const categories = [
            { id: 'all',     label: 'הכל' },
            { id: 'pokemon', label: 'פוקימון' },
            { id: 'effects', label: 'כתרים' },
            { id: 'other',   label: 'אחר' },
        ];

        const equippedItem = equippedId ? getItem(equippedId) : null;

        const tabsHtml = categories.map(c =>
            `<button class="shop-tab${activeTab === c.id ? ' active' : ''}" data-tab="${c.id}">${c.label}</button>`
        ).join('');

        const filteredItems = activeTab === 'all'
            ? SHOP_ITEMS
            : SHOP_ITEMS.filter(i => i.category === activeTab);

        const itemsHtml = filteredItems.map(item => {
            const isEquipped = item.id === equippedId;
            return `
            <div class="shop-item${isEquipped ? ' equipped' : ''}" data-item-id="${item.id}">
                ${isEquipped ? '<div class="shop-item-equipped-badge">✓</div>' : ''}
                <div class="shop-item-preview">
                    <img src="${item.img}" alt="${item.nameEn}" style="width:100%;height:100%;object-fit:contain;image-rendering:pixelated;" draggable="false">
                </div>
                <div class="shop-item-name">${item.name}</div>
                <div class="shop-item-tag">${item.tag}</div>
                <button class="shop-item-btn ${isEquipped ? 'remove' : 'equip'}" data-action="${isEquipped ? 'remove' : 'equip'}" data-item-id="${item.id}">
                    ${isEquipped ? '✕ הסר' : 'לבוש'}
                </button>
            </div>`;
        }).join('');

        const previewHtml = equippedItem ? `
            <div class="shop-equipped-preview">
                <div class="sep-avatar-demo" style="position:relative;">
                    ${getUsername() ? getUsername().charAt(0).toUpperCase() : '?'}
                    <img src="${equippedItem.img}" class="avatar-accessory ${equippedItem.cssClass}" alt="" draggable="false"
                         style="position:absolute;pointer-events:none;z-index:10;">
                </div>
                <div>
                    <div class="sep-label">מצויד כעת</div>
                    <div class="sep-name">${equippedItem.name}</div>
                </div>
            </div>
        ` : `
            <div class="shop-equipped-preview">
                <div class="sep-avatar-demo">${getUsername() ? getUsername().charAt(0).toUpperCase() : '?'}</div>
                <div>
                    <div class="sep-label">מצויד כעת</div>
                    <div class="sep-name" style="color:#72767d;">אין אביזר מצויד</div>
                </div>
            </div>
        `;

        return `
        <div id="shop-panel" class="hidden">
            <div class="shop-modal">
                <div class="shop-header">
                    <div class="shop-header-left">
                        <div class="shop-header-icon">🛒</div>
                        <div>
                            <div class="shop-title">חנות אביזרים</div>
                            <div class="shop-subtitle">התאם את הפרופיל שלך</div>
                        </div>
                    </div>
                    <button class="shop-close-btn" id="shop-close-btn">✕</button>
                </div>

                <div class="shop-tabs">
                    ${tabsHtml}
                </div>

                <div class="shop-body">
                    ${previewHtml}
                    <div class="shop-section-label">אביזרים זמינים</div>
                    <div class="shop-grid">
                        ${itemsHtml}
                    </div>
                </div>
            </div>
        </div>`;
    }

    function getUsername() {
        return localStorage.getItem('currentUser') || null;
    }

    // ── Inject / re-render shop ──────────────────────────────
    function injectShop() {
        const existing = document.getElementById('shop-panel');
        if (existing) existing.remove();

        const div = document.createElement('div');
        div.innerHTML = buildShopHTML();
        document.body.appendChild(div.firstElementChild);

        bindShopEvents();
    }

    function rerenderShop() {
        const panel = document.getElementById('shop-panel');
        if (!panel || panel.classList.contains('hidden')) return;
        // Preserve open state — rebuild inner HTML only
        injectShop();
        document.getElementById('shop-panel').classList.remove('hidden');
    }

    function bindShopEvents() {
        // Close button
        document.getElementById('shop-close-btn')?.addEventListener('click', closeShop);

        // Click outside
        document.getElementById('shop-panel')?.addEventListener('click', (e) => {
            if (e.target.id === 'shop-panel') closeShop();
        });

        // Tabs
        document.querySelectorAll('.shop-tab').forEach(btn => {
            btn.addEventListener('click', () => {
                activeTab = btn.dataset.tab;
                rerenderShop();
            });
        });

        // Equip / Remove buttons
        document.querySelectorAll('.shop-item-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const action = btn.dataset.action;
                const id     = btn.dataset.itemId;
                if (action === 'equip')  equip(id);
                if (action === 'remove') remove();
            });
        });
    }

    // ── Open / Close ─────────────────────────────────────────
    function openShop() {
        injectShop();
        document.getElementById('shop-panel').classList.remove('hidden');
    }

    function closeShop() {
        const panel = document.getElementById('shop-panel');
        if (panel) panel.classList.add('hidden');
    }

    // ── Init: hook up the "חנות" nav item click ───────────────
    function init() {
        // Find the nav item with "חנות" text and make it clickable
        document.querySelectorAll('.disc-nav-item').forEach(item => {
            if (item.textContent.includes('חנות')) {
                item.style.cursor = 'pointer';
                item.addEventListener('click', openShop);
            }
        });

        // Apply accessory to own messages on first load
        // (wait a tick so chat messages are rendered)
        setTimeout(refreshAllAccessories, 500);

        // Re-apply after every poll cycle (new messages may have appeared)
        // chat-app.js fires custom event 'chatMessagesRendered' — we listen if available,
        // otherwise fall back to a periodic refresh
        document.addEventListener('chatMessagesRendered', refreshAllAccessories);
        setInterval(refreshAllAccessories, 3000);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();