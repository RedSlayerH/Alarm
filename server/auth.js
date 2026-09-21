// ============================================================
// auth.js (Server) – login, register, and Google OAuth
// ============================================================

const express  = require('express');
const router   = express.Router();
const passport = require('passport');
const { Strategy: GoogleStrategy } = require('passport-google-oauth20');
const { User } = require('./db');

// ============================================================
// Passport – Google Strategy
// ============================================================

passport.use(new GoogleStrategy({
    clientID:     process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL:  process.env.GOOGLE_CALLBACK_URL,
}, async (accessToken, refreshToken, profile, done) => {
    try {
        // Use Google email prefix as username, fallback to display name
        const emailPrefix = profile.emails?.[0]?.value?.split('@')[0] || profile.displayName;
        const googleId    = profile.id;
        const avatar      = profile.photos?.[0]?.value || null;

        // Find existing user by googleId
        let user = await User.findOne({ googleId });

        if (!user) {
            // Check if username already taken (by a regular account)
            const base = emailPrefix.replace(/[^a-zA-Z0-9_]/g, '_');
            let username = base;
            let i = 1;
            while (await User.findOne({ username })) {
                username = `${base}_${i++}`;
            }
            user = await User.create({ username, googleId, avatar, password: null });
        } else if (avatar && user.avatar !== avatar) {
            user.avatar = avatar;
            await user.save();
        }

        return done(null, user);
    } catch (err) {
        return done(err, null);
    }
}));

passport.serializeUser((user, done) => done(null, user._id.toString()));
passport.deserializeUser(async (id, done) => {
    try {
        const user = await User.findById(id).lean();
        done(null, user);
    } catch (e) { done(e, null); }
});

// ============================================================
// Google OAuth routes
// ============================================================

// Step 1 – redirect to Google
router.get('/google', passport.authenticate('google', {
    scope: ['profile', 'email'],
    prompt: 'select_account',
}));

// Step 2 – Google redirects back here
router.get('/google/callback',
    passport.authenticate('google', { failureRedirect: '/index.html?auth=failed' }),
    (req, res) => {
        const cookieOpts = {
            maxAge: 7 * 24 * 60 * 60 * 1000,
            httpOnly: false, // client JS needs to read it
            sameSite: 'lax',
        };
        // Store username and avatar URL in cookies the client JS can read
        res.cookie('googleUser', req.user.username, cookieOpts);
        if (req.user.avatar) {
            res.cookie('googleAvatar', req.user.avatar, cookieOpts);
        }
        res.redirect('/index.html?auth=google');
    }
);

// ============================================================
// Login
// ============================================================
router.post('/login', async (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({ error: 'חסרים פרטים להתחברות' });
    }

    try {
        const user = await User.findOne({
            username: username.trim(),
            password: password,
        });

        if (user) {
            res.json({ message: 'התחברת בהצלחה!', username: user.username });
        } else {
            res.status(401).json({ error: 'שם משתמש או סיסמה שגויים' });
        }
    } catch (err) {
        console.error('[auth] login error:', err.message);
        res.status(500).json({ error: 'שגיאת שרת' });
    }
});

// ============================================================
// Register
// ============================================================
router.post('/register', async (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({ error: 'חסרים פרטים להרשמה' });
    }

    try {
        const existing = await User.findOne({ username: username.trim() });
        if (existing) {
            return res.status(400).json({ error: 'שם המשתמש כבר תפוס' });
        }

        const newUser = new User({ username: username.trim(), password });
        await newUser.save();

        res.json({ message: 'המשתמש נוצר בהצלחה!', username: newUser.username });
    } catch (err) {
        console.error('[auth] register error:', err.message);
        res.status(500).json({ error: 'שגיאת שרת' });
    }
});

// ============================================================
// GET /api/auth/avatar/:username
// Returns the Google avatar URL for a user (or null if none)
// ============================================================
router.get('/avatar/:username', async (req, res) => {
    try {
        const user = await User.findOne({ username: req.params.username }).lean();
        res.json({ avatar: user?.avatar || null });
    } catch (err) {
        res.json({ avatar: null });
    }
});

module.exports = router;