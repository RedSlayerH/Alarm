// ============================================================
// chatRoutes.js – chat API routes
// GET  /api/chat/messages?room=general       – last 50 messages
// POST /api/chat/messages                    – send a message
// GET  /api/chat/poll?room=general&after=ts  – long-poll for new messages
// ============================================================

const express = require('express');
const router  = express.Router();
const { ChatMessage } = require('./db');

const MAX_MESSAGES = 50;

// ============================================================
// Online presence — in-memory map: username → last heartbeat ms
// A user is considered online if heartbeat was within 35 seconds
// ============================================================

const onlineMap = new Map(); // username → Date.now()
const ONLINE_TIMEOUT_MS = 2000;

function isOnline(username) {
    const last = onlineMap.get(username);
    return last && (Date.now() - last) < ONLINE_TIMEOUT_MS;
}

// POST /api/chat/heartbeat  { username }
router.post('/heartbeat', (req, res) => {
    const { username } = req.body;
    if (!username) return res.status(400).json({ error: 'missing username' });
    onlineMap.set(username, Date.now());
    res.json({ ok: true });
});

// GET /api/chat/online-status?usernames=ron,saar
router.get('/online-status', (req, res) => {
    const names = (req.query.usernames || '').split(',').filter(Boolean);
    const result = {};
    names.forEach(name => { result[name] = isOnline(name); });
    res.json(result);
});

// ============================================================
// GET /api/chat/messages?room=general
// Returns last 50 messages for a room (oldest first)
// ============================================================

router.get('/messages', async (req, res) => {
    const { room } = req.query;
    if (!room) return res.status(400).json({ error: 'missing room' });

    try {
        const messages = await ChatMessage
            .find({ room })
            .sort({ sentAt: -1 })
            .limit(MAX_MESSAGES)
            .lean();

        // Return oldest-first so the client can append in order
        res.json(messages.reverse());
    } catch (err) {
        console.error('[chatRoutes] get messages error:', err.message);
        res.status(500).json({ error: 'server error' });
    }
});

// ============================================================
// POST /api/chat/messages
// Body: { room, username, text }
// Saves the message and trims old ones above the 50-message cap
// ============================================================

router.post('/messages', async (req, res) => {
    const { room, username, text } = req.body;
    if (!room || !username || !text?.trim()) {
        return res.status(400).json({ error: 'missing fields' });
    }

    try {
        const msg = new ChatMessage({ room, username, text: text.trim() });
        await msg.save();

        // Keep only the latest 50 messages per room
        const count = await ChatMessage.countDocuments({ room });
        if (count > MAX_MESSAGES) {
            const oldest = await ChatMessage
                .find({ room })
                .sort({ sentAt: 1 })
                .limit(count - MAX_MESSAGES)
                .select('_id');
            const ids = oldest.map(m => m._id);
            await ChatMessage.deleteMany({ _id: { $in: ids } });
        }

        res.json({ success: true, message: msg });
    } catch (err) {
        console.error('[chatRoutes] post message error:', err.message);
        res.status(500).json({ error: 'server error' });
    }
});

// ============================================================
// GET /api/chat/poll?room=general&after=ISO_DATE
// Returns messages newer than `after` – used for live polling
// ============================================================

router.get('/poll', async (req, res) => {
    const { room, after } = req.query;
    if (!room) return res.status(400).json({ error: 'missing room' });

    try {
        const query = { room };
        if (after) query.sentAt = { $gt: new Date(after) };

        const messages = await ChatMessage
            .find(query)
            .sort({ sentAt: 1 })
            .lean();

        res.json(messages);
    } catch (err) {
        console.error('[chatRoutes] poll error:', err.message);
        res.status(500).json({ error: 'server error' });
    }
});

// ============================================================
// GET /api/chat/dm-rooms?username=ron
// Returns all DM rooms the user participated in, with the other
// person's name and the last message preview
// ============================================================

router.get('/dm-rooms', async (req, res) => {
    const { username } = req.query;
    if (!username) return res.status(400).json({ error: 'missing username' });

    try {
        // Find all rooms that start with 'dm_' and contain this username
        const dmPattern = new RegExp(`^dm_.*${username}.*`);
        const rooms = await ChatMessage.distinct('room', { room: dmPattern });

        const result = await Promise.all(rooms.map(async (room) => {
            // Room format: dm_userA_userB (alphabetically sorted)
            const parts = room.replace('dm_', '').split('_');
            const otherUser = parts.find(p => p !== username) || parts[0];

            const lastMsg = await ChatMessage
                .findOne({ room })
                .sort({ sentAt: -1 })
                .lean();

            const unread = await ChatMessage.countDocuments({
                room,
                username: { $ne: username },
                sentAt: { $gt: new Date(Date.now() - 24 * 60 * 60 * 1000) }
            });

            return {
                room,
                otherUser,
                lastMessage: lastMsg ? lastMsg.text : '',
                lastAt: lastMsg ? lastMsg.sentAt : null,
                unread,
            };
        }));

        // Sort by most recent message
        result.sort((a, b) => new Date(b.lastAt) - new Date(a.lastAt));
        res.json(result);
    } catch (err) {
        console.error('[chatRoutes] dm-rooms error:', err.message);
        res.status(500).json({ error: 'server error' });
    }
});

module.exports = router;