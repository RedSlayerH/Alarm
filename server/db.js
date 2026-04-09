// ============================================================
// db.js – MongoDB connection using mongoose
// ============================================================

require('dns').setServers(['8.8.8.8', '8.8.4.4']);

const mongoose = require('mongoose');

async function connectDB() {
    const uri = process.env.MONGODB_URI;
    if (!uri) {
        console.error('[db] MONGODB_URI environment variable is not set!');
        process.exit(1);
    }
    try {
        await mongoose.connect(uri);
        console.log('[db] Connected to MongoDB successfully');
    } catch (err) {
        console.error('[db] MongoDB connection error:', err.message);
        process.exit(1);
    }
}

// ============================================================
// User schema
// ============================================================

const userSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true, trim: true },
    password: { type: String, required: true },
}, { timestamps: true });

// ============================================================
// Sound settings schema
// ============================================================

const soundTypeSchema = new mongoose.Schema({
    cities:          { type: [String], default: [] },
    songFile:        { type: String,   default: null },
    builtinMelodyId: { type: String,   default: null },
    builtinActive:   { type: Boolean,  default: false },
}, { _id: false });

const soundSettingsSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true, trim: true },
    alert:    { type: soundTypeSchema, default: () => ({}) },
    early:    { type: soundTypeSchema, default: () => ({}) },
    clear:    { type: soundTypeSchema, default: () => ({}) },
}, { timestamps: true });

const User          = mongoose.model('User',          userSchema);
const SoundSettings = mongoose.model('SoundSettings', soundSettingsSchema);

module.exports = { connectDB, User, SoundSettings };
