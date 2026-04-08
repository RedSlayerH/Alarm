// ============================================================
// auth.js (client)  – כניסה, הרשמה, ניהול UI של משתמש
// ============================================================

// ============================================================
// Stars animation overlay
// ============================================================

function showAuthAnimation(username, type) {
    // type: 'login' | 'logout'
    const isLogin = type === 'login';
    const message = isLogin
        ? `שלום, ${username} 👋`
        : `ביי ביי, ${username} 😢`;

    // Create overlay
    const overlay = document.createElement('div');
    overlay.id = 'auth-anim-overlay';

    // Create stars
    const starsHTML = Array.from({ length: 120 }, (_, i) => {
        const size   = Math.random() * 3 + 1;
        const x      = Math.random() * 100;
        const y      = Math.random() * 100;
        const delay  = Math.random() * 1.5;
        const dur    = Math.random() * 2 + 1.5;
        const color  = isLogin
            ? `hsl(${200 + Math.random() * 60}, 90%, ${70 + Math.random() * 20}%)`
            : `hsl(${20 + Math.random() * 40}, 90%, ${70 + Math.random() * 20}%)`;
        return `<div class="auth-star" style="
            width:${size}px; height:${size}px;
            left:${x}%; top:${y}%;
            background:${color};
            animation-delay:${delay}s;
            animation-duration:${dur}s;
        "></div>`;
    }).join('');

    overlay.innerHTML = `
        <div class="auth-stars-bg">${starsHTML}</div>
        <div class="auth-anim-content">
            <div class="auth-anim-icon">${isLogin ? '🚀' : '👋'}</div>
            <div class="auth-anim-msg">${message}</div>
            <div class="auth-anim-sub">${isLogin ? 'טוען את הנתונים שלך...' : 'מנקה נתונים...'}</div>
        </div>
    `;

    document.body.appendChild(overlay);

    // Trigger entrance animation
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            overlay.classList.add('auth-anim-visible');
        });
    });

    // After 2.2s — fade out, then reload
    setTimeout(() => {
        overlay.classList.add('auth-anim-exit');
        setTimeout(() => {
            location.reload();
        }, 600);
    }, 2200);
}

// ============================================================
// עדכון כפתור Auth
// ============================================================

function updateAuthUI(username) {
    const btn = document.getElementById('auth-button');
    if (username) {
        btn.classList.add('logged-in');
        btn.innerHTML = `<svg viewBox="0 0 24 24"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>`;
        btn.title = `מחובר כ: ${username}`;
        btn.onclick = toggleUserMenu;
    } else {
        btn.classList.remove('logged-in');
        btn.innerHTML = 'כניסת משתמש';
        btn.title = '';
        btn.onclick = openAuthModal;
    }
}

// ============================================================
// מסך משתמש (פאנל מרכזי)
// ============================================================

function toggleUserMenu() {
    const panel = document.getElementById('user-panel');
    if (panel.classList.contains('hidden')) {
        openUserPanel();
    } else {
        closeUserPanel();
    }
}

function openUserPanel() {
    document.getElementById('user-panel').classList.remove('hidden');
}

function closeUserPanel() {
    document.getElementById('user-panel').classList.add('hidden');
}

function logout() {
    const username = localStorage.getItem('currentUser');
    localStorage.removeItem('currentUser');
    updateAuthUI(null);
    closeUserPanel();
    // Show bye animation, then reload
    showAuthAnimation(username || 'משתמש', 'logout');
}

// בדיקה בטעינה
window.addEventListener('DOMContentLoaded', () => {
    const saved = localStorage.getItem('currentUser');
    updateAuthUI(saved || null);
    document.getElementById('auth-button').style.visibility = 'visible';
});

// ============================================================
// Modal
// ============================================================

function openAuthModal() {
    document.getElementById('auth-modal').classList.remove('hidden');
    document.getElementById('auth-msg').innerText = '';
}

function closeAuthModal() {
    document.getElementById('auth-modal').classList.add('hidden');
}

function switchAuthTab(tab) {
    document.getElementById('auth-msg').innerText = '';
    const isLogin = tab === 'login';
    document.getElementById('tab-login').classList.toggle('active', isLogin);
    document.getElementById('tab-register').classList.toggle('active', !isLogin);
    document.getElementById('form-login').classList.toggle('hidden', !isLogin);
    document.getElementById('form-register').classList.toggle('hidden', isLogin);
}

// ============================================================
// שליחה לשרת
// ============================================================

async function submitAuth(action) {
    const msgDiv = document.getElementById('auth-msg');
    let username, password;

    if (action === 'login') {
        username = document.getElementById('login-user').value.trim();
        password = document.getElementById('login-pass').value.trim();
    } else {
        username = document.getElementById('reg-user').value.trim();
        password = document.getElementById('reg-pass').value.trim();
        const pass2 = document.getElementById('reg-pass2').value.trim();
        if (password !== pass2) {
            msgDiv.style.color = '#f44336';
            msgDiv.innerText = 'הסיסמאות אינן תואמות!';
            return;
        }
    }

    if (!username || !password) {
        msgDiv.style.color = '#f44336';
        msgDiv.innerText = 'נא למלא את כל השדות.';
        return;
    }

    try {
        const res  = await fetch(`http://localhost:3000/api/auth/${action}`, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ username, password }),
        });
        const data = await res.json();

        if (res.ok) {
            msgDiv.style.color = '#4caf50';
            msgDiv.innerText   = data.message;
            const user = data.username || username;
            localStorage.setItem('currentUser', user);
            updateAuthUI(user);

            // Close modal, show animation, then reload
            setTimeout(() => {
                closeAuthModal();
                showAuthAnimation(user, 'login');
            }, 600);
        } else {
            msgDiv.style.color = '#f44336';
            msgDiv.innerText   = data.error;
        }
    } catch {
        msgDiv.style.color = '#f44336';
        msgDiv.innerText   = 'שגיאת תקשורת עם השרת.';
    }
}