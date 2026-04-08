// ============================================================
// panel.js  – גרירת פאנל, FAB, כיווץ, חיפוש
// לא נוגע במפה ולא באזעקות
// ============================================================

const panel     = document.getElementById('floating-panel');
const header    = document.querySelector('.panel-header');
const fabButton = document.getElementById('fab-button');

let isPanelHidden  = false;
let isDraggingPanel = false;
let isDraggingFab   = false;

let startX, startY, initialTop, initialRight, initialFabTop;
let dragStartTime;
let lastMouseX = 0, currentRotation = 0;

const PANEL_WIDTH       = 400;
const DISMISS_THRESHOLD = -(PANEL_WIDTH * 0.3);

// קיבוע מיקום ראשוני (מונע קפיצה בגרירה הראשונה)
window.addEventListener('DOMContentLoaded', () => {
    const rect = panel.getBoundingClientRect();
    panel.style.top   = `${rect.top}px`;
    panel.style.right = `${window.innerWidth - rect.right}px`;
});

// ============================================================
// גרירת פאנל
// ============================================================

header.addEventListener('mousedown', startPanelDrag);
document.addEventListener('mousemove', doPanelDrag);
document.addEventListener('mouseup',   stopPanelDrag);

function startPanelDrag(e) {
    if (isPanelHidden) return;
    isDraggingPanel = true;
    startX = e.clientX;
    startY = e.clientY;
    lastMouseX = e.clientX;

    const rect = panel.getBoundingClientRect();
    initialTop   = rect.top;
    initialRight = window.innerWidth - rect.right;

    panel.style.transition = '';
    panel.classList.add('dragging');
    document.body.style.userSelect = 'none';

    fabButton.style.top        = `${initialTop}px`;
    fabButton.style.transition = 'none';
}

function doPanelDrag(e) {
    if (!isDraggingPanel) return;

    const dx = startX - e.clientX;
    const dy = e.clientY - startY;

    let newTop   = Math.max(80, initialTop + dy);
    let newRight = initialRight + dx;

    // אפקט נטייה דינמית
    const velX = e.clientX - lastMouseX;
    lastMouseX = e.clientX;
    const targetRotation = Math.max(-5, Math.min(5, velX * 0.3));
    currentRotation += (targetRotation - currentRotation) * 0.2;

    panel.style.transform = `scale(1.01) rotate(${currentRotation}deg)`;
    panel.style.top       = `${newTop}px`;
    panel.style.right     = `${newRight}px`;

    if (newRight < 0) {
        const progress = Math.min(newRight / DISMISS_THRESHOLD, 1);
        panel.style.opacity      = 1 - progress * 0.5;
        fabButton.style.display  = 'flex';
        fabButton.style.right    = `${-70 + progress * 70}px`;
    } else {
        panel.style.opacity     = 1;
        fabButton.style.display = 'none';
        fabButton.style.right   = '-70px';
    }
}

function stopPanelDrag(e) {
    if (!isDraggingPanel) return;
    isDraggingPanel = false;
    panel.classList.remove('dragging');
    document.body.style.userSelect = '';

    panel.style.transform = 'scale(1) rotate(0deg)';
    currentRotation = 0;
    panel.style.transition     = '';
    fabButton.style.transition = '';

    const rect        = panel.getBoundingClientRect();
    const currentRight = window.innerWidth - rect.right;

    if (currentRight <= DISMISS_THRESHOLD) {
        dismissPanel(rect.top);
    } else if (currentRight < 150) {
        snapPanel(rect.top, '20px');
    } else {
        snapPanel(rect.top, null, currentRight);
    }
}

function snapPanel(currentTop, forceRight = null, currentRight = null) {
    panel.style.opacity = 1;
    fabButton.style.right = '-70px';

    if (forceRight) panel.style.right = forceRight;
    else if (currentRight > window.innerWidth - 420) panel.style.right = `${window.innerWidth - 420}px`;

    let top = currentTop;
    if (top < 80) top = 80;
    if (top > window.innerHeight - 100) top = window.innerHeight - 100;
    panel.style.top = `${top}px`;
}

// ============================================================
// Dismiss / Restore
// ============================================================

function dismissPanel(lastTop) {
    isPanelHidden = true;
    panel.style.right   = '-420px';
    panel.style.opacity = 0;

    fabButton.style.display = 'flex';
    fabButton.style.top     = `${lastTop}px`;

    setTimeout(() => {
        fabButton.classList.add('visible');
        fabButton.style.right = '0px';
    }, 10);
}

function restorePanel() {
    isPanelHidden = false;
    fabButton.classList.remove('visible');
    fabButton.style.right = '-70px';

    const badge = document.getElementById('fab-badge');
    if (badge) badge.classList.remove('active');

    const rect = fabButton.getBoundingClientRect();
    panel.style.top          = `${rect.top}px`;
    panel.style.right        = '20px';
    panel.style.opacity      = '1';
    panel.style.pointerEvents = 'auto';
}

// ============================================================
// גרירת FAB (למעלה/מטה בלבד)
// ============================================================

fabButton.addEventListener('mousedown', startFabDrag);
document.addEventListener('mousemove',  doFabDrag);
document.addEventListener('mouseup',    stopFabDrag);

function startFabDrag(e) {
    if (!isPanelHidden) return;
    isDraggingFab = true;
    startY        = e.clientY;
    dragStartTime = Date.now();
    initialFabTop = fabButton.getBoundingClientRect().top;
    fabButton.style.transition = 'none';
}

function doFabDrag(e) {
    if (!isDraggingFab) return;
    let newTop = Math.max(80, Math.min(window.innerHeight - 65, initialFabTop + (e.clientY - startY)));
    fabButton.style.top = `${newTop}px`;
}

function stopFabDrag(e) {
    if (!isDraggingFab) return;
    isDraggingFab = false;
    fabButton.style.transition = 'right 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)';

    const isClick = Date.now() - dragStartTime < 300 && Math.abs(startY - e.clientY) < 5;
    if (isClick) restorePanel();
}

// ============================================================
// כיווץ פאנל
// ============================================================

function toggleCollapse(e) {
    e.stopPropagation();
    const btn = document.getElementById('toggle-btn');
    panel.classList.toggle('collapsed');
    btn.innerText = panel.classList.contains('collapsed') ? '▲' : '▼';
}

document.getElementById('toggle-btn').addEventListener('click', toggleCollapse);

// ============================================================
// חיפוש
// ============================================================

document.getElementById('city-search').addEventListener('input', function () {
    const term = this.value.trim();
    document.querySelectorAll('.alert-card').forEach(card => {
        card.style.display = card.innerText.includes(term) ? 'flex' : 'none';
    });
});
