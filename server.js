require('dotenv').config();
const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const gdrive = require('./gdrive');

const app = express();
app.use(express.json({ limit: '10mb' }));
app.use(cors());
app.use(express.static(path.join(__dirname)));

const PORT = process.env.PORT || 5000;
const DB_FILE = path.join(__dirname, 'db.json');

// ─── INITIAL SEED DATA ────────────────────────────────────────────────────────
const initialSeed = {
    users: [
        { _id: 'u1', id: 'u1', username: 'alex_nexus', email: 'alex@example.com', name: 'Alex Rivera', avatar: 'AR', bio: 'Creative Explorer | Tech Enthusiast 🚀', followers: 1250, following: 450, password: '123', theme: 'dark', savedPosts: [], followingList: [] },
        { _id: 'u2', id: 'u2', username: 'sophia_codes', email: 'sophia@example.com', name: 'Sophia Chen', avatar: 'SC', bio: 'Building the next gen web 💻', followers: 8900, following: 120, password: '123', theme: 'dark', savedPosts: [], followingList: [] },
        { _id: 'u3', id: 'u3', username: 'marcus_v', email: 'marcus@example.com', name: 'Marcus Vance', avatar: 'MV', bio: 'Visual Storyteller 📸', followers: 3200, following: 800, password: '123', theme: 'dark', savedPosts: [], followingList: [] }
    ],
    pendingUsers: [],
    posts: [
        {
            _id: 'p1',
            id: 'p1',
            userId: 'u2',
            content: 'Just launched the new ultra-responsive UI for ConnectHub! What do you think? 💎',
            image: 'https://images.unsplash.com/photo-1498050108023-c5249f4df085?auto=format&fit=crop&w=1200&q=80',
            likes: ['u1', 'u3'],
            comments: [{ userId: 'u1', text: 'This looks incredible! The glassmorphism is spot on.', timestamp: Date.now() - 3600000 }],
            timestamp: Date.now() - 7200000
        },
        {
            _id: 'p2',
            id: 'p2',
            userId: 'u3',
            content: 'Morning trek in the mountains. The light was perfect. 🏔️',
            image: 'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?auto=format&fit=crop&w=1200&q=80',
            likes: ['u2'],
            comments: [],
            timestamp: Date.now() - 14400000
        }
    ],
    stories: [
        { _id: 's1', id: 's1', userId: 'u2', image: 'https://images.unsplash.com/photo-1517433447755-d14dcb3298c0?auto=format&fit=crop&w=300&q=80', timestamp: Date.now() },
        { _id: 's2', id: 's2', userId: 'u3', image: 'https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=crop&w=300&q=80', timestamp: Date.now() },
        { _id: 's3', id: 's3', userId: 'u1', image: 'https://images.unsplash.com/photo-1472214103451-9374bd1c798e?auto=format&fit=crop&w=300&q=80', timestamp: Date.now() }
    ],
    reels: [
        {
            _id: 'r1',
            id: 'r1',
            userId: 'u1',
            caption: 'Checking out the vibrant night life! 🌟 #nightlife #vibes',
            video: 'https://assets.mixkit.co/videos/preview/mixkit-girl-in-neon-sign-in-urban-street-40098-large.mp4',
            likes: ['u2', 'u3'],
            comments: [{ userId: 'u2', text: 'Loving the aesthetic!', timestamp: Date.now() }],
            timestamp: Date.now()
        },
        {
            _id: 'r2',
            id: 'r2',
            userId: 'u2',
            caption: 'Nature is so therapeutic 🌿🌞 #peaceful #naturewalk',
            video: 'https://assets.mixkit.co/videos/preview/mixkit-forest-stream-in-the-sunlight-529-large.mp4',
            likes: ['u1'],
            comments: [],
            timestamp: Date.now()
        },
        {
            _id: 'r3',
            id: 'r3',
            userId: 'u3',
            caption: 'Lost in the rhythm 🎶🕺 #dancelife #neon',
            video: 'https://assets.mixkit.co/videos/preview/mixkit-man-dancing-under-neon-lights-40099-large.mp4',
            likes: ['u1', 'u2'],
            comments: [],
            timestamp: Date.now()
        }
    ],
    messages: [],
    notifications: []
};

// Load or initialize local DB
let db = loadLocalDB();

function loadLocalDB() {
    try {
        if (fs.existsSync(DB_FILE)) {
            const data = fs.readFileSync(DB_FILE, 'utf-8');
            return JSON.parse(data);
        }
    } catch (err) {
        console.error('Error reading local db.json:', err.message);
    }
    return JSON.parse(JSON.stringify(initialSeed));
}

function saveLocalDB() {
    try {
        fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
    } catch (err) {
        console.error('Error saving local db.json:', err.message);
    }
}

// Helper to generate IDs
function generateId() {
    return 'id_' + Math.random().toString(36).substr(2, 9) + Date.now().toString(36);
}

// Real-time Google Drive Sync Helper (Awaited for instant serverless execution)
async function triggerRealtimeSync(collectionName) {
    saveLocalDB();
    try {
        if (collectionName && db[collectionName]) {
            await gdrive.saveFileToDrive(`${collectionName}.json`, db[collectionName]);
        } else {
            await gdrive.syncAllData({
                users: db.users,
                posts: db.posts,
                stories: db.stories,
                reels: db.reels,
                messages: db.messages,
                notifications: db.notifications
            });
        }
    } catch (err) {
        console.error('Real-time sync error:', err.message);
    }
}

// ─── ROUTES ──────────────────────────────────────────────────────────────────

// Google Drive Sync API
app.get('/api/gdrive/status', (req, res) => {
    res.json(gdrive.getSyncStatus());
});

app.post('/api/gdrive/sync', async (req, res) => {
    const result = await gdrive.syncAllData({
        users: db.users,
        posts: db.posts,
        stories: db.stories,
        reels: db.reels,
        messages: db.messages,
        notifications: db.notifications
    });
    res.json(result);
});

app.post('/api/gdrive/restore', async (req, res) => {
    try {
        const restored = await gdrive.restoreAllDataFromDrive();
        if (restored && (restored.users || restored.posts)) {
            db = {
                users: restored.users || [],
                pendingUsers: restored.pendingUsers || [],
                posts: restored.posts || [],
                stories: restored.stories || [],
                reels: restored.reels || [],
                messages: restored.messages || [],
                notifications: restored.notifications || []
            };
            saveLocalDB();
            return res.json({ success: true, message: 'Database restored from Google Drive successfully', db });
        }
        res.status(404).json({ success: false, error: 'No backup found on Google Drive' });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Auth
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    const user = db.users.find(u => u.username === username && u.password === password);
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });
    res.json(user);
});

app.post('/api/register', async (req, res) => {
    try {
        const { username, email, password, name, avatar, bio } = req.body;
        
        const existingUsername = db.users.find(u => u.username === username);
        if (existingUsername) return res.status(400).json({ error: 'Username taken' });
        const existingEmail = db.users.find(u => u.email === email);
        if (existingEmail) return res.status(400).json({ error: 'Email already in use' });

        const otp = Math.floor(100000 + Math.random() * 900000).toString();

        db.pendingUsers = db.pendingUsers.filter(p => p.email !== email);
        db.pendingUsers.push({ 
            username, email, password, name, avatar, bio, otp, createdAt: Date.now()
        });

        const emailjsPayload = {
            service_id: 'service_kgm8v2k',
            template_id: 'template_mkc0ap9',
            user_id: '-fECxdXbbH6A-szJS',
            accessToken: 'Dza2TLKsGBg2gtzeCH_ow',
            template_params: {
                email: email,
                passcode: otp,
                time: new Date(Date.now() + 15 * 60000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            }
        };

        try {
            const emailjsRes = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(emailjsPayload)
            });
            if (emailjsRes.ok) {
                console.log('Verification OTP sent via EmailJS!');
            }
        } catch (emailErr) {
            console.error('Error sending EmailJS email:', emailErr);
        }

        res.json({ message: 'Registration successful. Please check your email to verify your account.' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/verify-otp', async (req, res) => {
    try {
        const { email, otp } = req.body;
        const pendingUser = db.pendingUsers.find(p => p.email === email);
        
        if (!pendingUser) return res.status(404).json({ error: 'Session expired or invalid. Please register again.' });
        if (pendingUser.otp !== otp) return res.status(400).json({ error: 'Invalid OTP' });

        const newId = generateId();
        const newUser = {
            _id: newId,
            id: newId,
            username: pendingUser.username,
            password: pendingUser.password,
            email: pendingUser.email,
            name: pendingUser.name || pendingUser.username,
            avatar: pendingUser.avatar || pendingUser.username.substring(0, 2).toUpperCase(),
            bio: pendingUser.bio || '',
            theme: 'dark',
            followers: 0,
            following: 0,
            savedPosts: [],
            followingList: []
        };

        db.users.push(newUser);
        db.pendingUsers = db.pendingUsers.filter(p => p.email !== email);

        await triggerRealtimeSync('users');
        res.json(newUser);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Users
app.get('/api/users', (req, res) => {
    res.json(db.users);
});

app.get('/api/users/:id', (req, res) => {
    const user = db.users.find(u => u._id === req.params.id || u.id === req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(user);
});

app.put('/api/users/:id', async (req, res) => {
    const index = db.users.findIndex(u => u._id === req.params.id || u.id === req.params.id);
    if (index === -1) return res.status(404).json({ error: 'User not found' });

    db.users[index] = { ...db.users[index], ...req.body };
    await triggerRealtimeSync('users');
    res.json(db.users[index]);
});

app.post('/api/users/:id/follow', async (req, res) => {
    try {
        const { currentUserId } = req.body;
        const userToFollow = db.users.find(u => u._id === req.params.id || u.id === req.params.id);
        const currentUser = db.users.find(u => u._id === currentUserId || u.id === currentUserId);

        if (!userToFollow || !currentUser) {
            return res.status(404).json({ error: 'User not found' });
        }

        if (!currentUser.followingList) currentUser.followingList = [];

        const targetId = userToFollow._id || userToFollow.id;
        const index = currentUser.followingList.indexOf(targetId);
        let followed = false;

        if (index === -1) {
            currentUser.followingList.push(targetId);
            currentUser.following = (currentUser.following || 0) + 1;
            userToFollow.followers = (userToFollow.followers || 0) + 1;
            followed = true;
        } else {
            currentUser.followingList.splice(index, 1);
            currentUser.following = Math.max(0, (currentUser.following || 0) - 1);
            userToFollow.followers = Math.max(0, (userToFollow.followers || 0) - 1);
            followed = false;
        }

        await triggerRealtimeSync('users');
        res.json({ followed, currentUser, userToFollow });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Posts
app.get('/api/posts', (req, res) => {
    const sortedPosts = [...db.posts].sort((a, b) => b.timestamp - a.timestamp);
    res.json(sortedPosts);
});

app.post('/api/posts', async (req, res) => {
    const newId = generateId();
    const newPost = {
        _id: newId,
        id: newId,
        likes: [],
        comments: [],
        timestamp: Date.now(),
        ...req.body
    };
    db.posts.unshift(newPost);
    await triggerRealtimeSync('posts');
    res.json(newPost);
});

app.delete('/api/posts/:id', async (req, res) => {
    db.posts = db.posts.filter(p => p._id !== req.params.id && p.id !== req.params.id);
    await triggerRealtimeSync('posts');
    res.json({ success: true });
});

app.post('/api/posts/:id/like', async (req, res) => {
    const { userId } = req.body;
    const post = db.posts.find(p => p._id === req.params.id || p.id === req.params.id);
    if (!post) return res.status(404).json({ error: 'Post not found' });

    if (!post.likes) post.likes = [];
    const index = post.likes.indexOf(userId);
    if (index === -1) post.likes.push(userId);
    else post.likes.splice(index, 1);

    await triggerRealtimeSync('posts');
    res.json(post);
});

app.post('/api/posts/:id/comment', async (req, res) => {
    const post = db.posts.find(p => p._id === req.params.id || p.id === req.params.id);
    if (!post) return res.status(404).json({ error: 'Post not found' });

    if (!post.comments) post.comments = [];
    const comment = { ...req.body, timestamp: Date.now() };
    post.comments.push(comment);

    await triggerRealtimeSync('posts');
    res.json(post);
});

// Stories
app.get('/api/stories', (req, res) => {
    const sortedStories = [...db.stories].sort((a, b) => b.timestamp - a.timestamp);
    res.json(sortedStories);
});

app.post('/api/stories', async (req, res) => {
    const newId = generateId();
    const story = {
        _id: newId,
        id: newId,
        timestamp: Date.now(),
        ...req.body
    };
    db.stories.unshift(story);
    await triggerRealtimeSync('stories');
    res.json(story);
});

// Reels
app.get('/api/reels', (req, res) => {
    const sortedReels = [...db.reels].sort((a, b) => b.timestamp - a.timestamp);
    res.json(sortedReels);
});

app.post('/api/reels', async (req, res) => {
    const newId = generateId();
    const reel = {
        _id: newId,
        id: newId,
        likes: [],
        comments: [],
        timestamp: Date.now(),
        ...req.body
    };
    db.reels.unshift(reel);
    await triggerRealtimeSync('reels');
    res.json(reel);
});

app.post('/api/reels/:id/like', async (req, res) => {
    const { userId } = req.body;
    const reel = db.reels.find(r => r._id === req.params.id || r.id === req.params.id);
    if (!reel) return res.status(404).json({ error: 'Reel not found' });

    if (!reel.likes) reel.likes = [];
    const index = reel.likes.indexOf(userId);
    if (index === -1) reel.likes.push(userId);
    else reel.likes.splice(index, 1);

    await triggerRealtimeSync('reels');
    res.json(reel);
});

app.post('/api/reels/:id/comment', async (req, res) => {
    const reel = db.reels.find(r => r._id === req.params.id || r.id === req.params.id);
    if (!reel) return res.status(404).json({ error: 'Reel not found' });

    if (!reel.comments) reel.comments = [];
    reel.comments.push({ ...req.body, timestamp: Date.now() });

    await triggerRealtimeSync('reels');
    res.json(reel);
});

// Messages
app.get('/api/messages/:chatId', (req, res) => {
    const messages = db.messages.filter(m => m.chatId === req.params.chatId);
    res.json(messages);
});

app.post('/api/messages', async (req, res) => {
    const newId = generateId();
    const msg = {
        _id: newId,
        id: newId,
        timestamp: Date.now(),
        ...req.body
    };
    db.messages.push(msg);
    await triggerRealtimeSync('messages');
    res.json(msg);
});

// Notifications
app.get('/api/notifications/:userId', (req, res) => {
    const notifs = db.notifications
        .filter(n => n.to === req.params.userId)
        .sort((a, b) => b.timestamp - a.timestamp);
    res.json(notifs);
});

app.post('/api/notifications', async (req, res) => {
    const newId = generateId();
    const notif = {
        _id: newId,
        id: newId,
        read: false,
        timestamp: Date.now(),
        ...req.body
    };
    db.notifications.unshift(notif);
    await triggerRealtimeSync('notifications');
    res.json(notif);
});

app.put('/api/notifications/read/:userId', async (req, res) => {
    db.notifications.forEach(n => {
        if (n.to === req.params.userId) n.read = true;
    });
    await triggerRealtimeSync('notifications');
    res.json({ success: true });
});

// Root / HTML Catch-all Route (Express 5 compatible)
app.use((req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    res.sendFile(path.join(__dirname, 'index.html'));
});

// ─── START SERVER ────────────────────────────────────────────────────────────

async function initDatabase() {
    gdrive.initGoogleDrive();

    console.log('🔄 Checking Google Drive for existing database backup...');
    try {
        const restored = await gdrive.restoreAllDataFromDrive();
        if (restored && (restored.users?.length > 0 || restored.posts?.length > 0)) {
            db = {
                users: restored.users || [],
                pendingUsers: restored.pendingUsers || [],
                posts: restored.posts || [],
                stories: restored.stories || [],
                reels: restored.reels || [],
                messages: restored.messages || [],
                notifications: restored.notifications || []
            };
            saveLocalDB();
            console.log(`✅ Successfully restored database from Google Drive! (${db.users.length} users, ${db.posts.length} posts loaded)`);
            return;
        }
    } catch (err) {
        console.error('⚠️ Could not restore from Google Drive on startup:', err.message);
    }

    console.log('ℹ️ No backup found on Google Drive or Drive empty. Preserving local db.json / seed data...');
    db = loadLocalDB();
    saveLocalDB();
    await triggerRealtimeSync();
}

app.listen(PORT, async () => {
    console.log(`⚡ Server running cleanly on port ${PORT}`);
    await initDatabase();
});

module.exports = app;
