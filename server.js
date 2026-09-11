require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const crypto = require('crypto');
const gdrive = require('./gdrive');

const app = express();
app.use(express.json({ limit: '10mb' }));
app.use(cors());

const PORT = process.env.PORT || 5000;
const MONGODB_URI = process.env.MONGODB_URI;

// ─── GOOGLE DRIVE SYNC HELPERS ────────────────────────────────────────────────
async function getAllCollectionsData() {
    const [users, posts, stories, reels, messages, notifications] = await Promise.all([
        User.find().lean(),
        Post.find().lean(),
        Story.find().lean(),
        Reel.find().lean(),
        Message.find().lean(),
        Notification.find().lean()
    ]);
    return { users, posts, stories, reels, messages, notifications };
}

function triggerRealtimeSync(collectionName) {
    if (collectionName) {
        gdrive.syncCollectionDebounced(collectionName, async () => {
            switch (collectionName) {
                case 'users': return await User.find().lean();
                case 'posts': return await Post.find().lean();
                case 'stories': return await Story.find().lean();
                case 'reels': return await Reel.find().lean();
                case 'messages': return await Message.find().lean();
                case 'notifications': return await Notification.find().lean();
                default: return [];
            }
        });
    } else {
        gdrive.syncAllData(getAllCollectionsData);
    }
}

// ─── MODELS ──────────────────────────────────────────────────────────────────

const UserSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    name: String,
    avatar: String,
    bio: String,
    theme: { type: String, default: 'dark' },
    followers: { type: Number, default: 0 },
    following: { type: Number, default: 0 },
    savedPosts: [String],
    followingList: { type: [String], default: [] }
});

const PendingUserSchema = new mongoose.Schema({
    username: { type: String, required: true },
    password: { type: String, required: true },
    email: { type: String, required: true },
    name: String,
    avatar: String,
    bio: String,
    otp: String,
    createdAt: { type: Date, expires: '15m', default: Date.now }
});

const PostSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    content: String,
    image: String,
    likes: [String], // Array of User IDs
    comments: [{
        userId: String,
        text: String,
        timestamp: { type: Number, default: Date.now }
    }],
    timestamp: { type: Number, default: Date.now }
});

const StorySchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    image: String,
    timestamp: { type: Number, default: Date.now }
});

const MessageSchema = new mongoose.Schema({
    chatId: String,
    from: String,
    text: String,
    timestamp: { type: Number, default: Date.now }
});

const NotificationSchema = new mongoose.Schema({
    to: String,
    from: String,
    type: String,
    postId: String,
    timestamp: { type: Number, default: Date.now },
    read: { type: Boolean, default: false }
});

const User = mongoose.model('User', UserSchema);
const PendingUser = mongoose.model('PendingUser', PendingUserSchema);
const Post = mongoose.model('Post', PostSchema);
const Story = mongoose.model('Story', StorySchema);
const Message = mongoose.model('Message', MessageSchema);
const Notification = mongoose.model('Notification', NotificationSchema);

const ReelSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    caption: String,
    video: String,
    likes: { type: [String], default: [] },
    comments: [{
        userId: String,
        text: String,
        timestamp: { type: Number, default: Date.now }
    }],
    timestamp: { type: Number, default: Date.now }
});

const Reel = mongoose.model('Reel', ReelSchema);

// ─── ROUTES ──────────────────────────────────────────────────────────────────

// Google Drive Real-time Sync API
app.get('/api/gdrive/status', (req, res) => {
    res.json(gdrive.getSyncStatus());
});

app.post('/api/gdrive/sync', async (req, res) => {
    const result = await gdrive.syncAllData(getAllCollectionsData);
    res.json(result);
});

// Auth
app.post('/api/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        const user = await User.findOne({ username, password });
        if (!user) return res.status(401).json({ error: 'Invalid credentials' });
        res.json(user);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/register', async (req, res) => {
    try {
        const { username, email, password, name, avatar, bio } = req.body;
        
        const existingUsername = await User.findOne({ username });
        if (existingUsername) return res.status(400).json({ error: 'Username taken' });
        const existingEmail = await User.findOne({ email });
        if (existingEmail) return res.status(400).json({ error: 'Email already in use' });

        const otp = Math.floor(100000 + Math.random() * 900000).toString();

        await PendingUser.deleteMany({ email });

        const pendingUser = new PendingUser({ 
            username, email, password, name, avatar, bio, otp
        });
        await pendingUser.save();

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
            } else {
                const text = await emailjsRes.text();
                console.error('EmailJS error:', text);
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
        const pendingUser = await PendingUser.findOne({ email });
        
        if (!pendingUser) return res.status(404).json({ error: 'Session expired or invalid. Please register again.' });
        if (pendingUser.otp !== otp) return res.status(400).json({ error: 'Invalid OTP' });

        const existingUsername = await User.findOne({ username: pendingUser.username });
        if (existingUsername) return res.status(400).json({ error: 'Username was taken while verifying.' });

        const user = new User({
            username: pendingUser.username,
            password: pendingUser.password,
            email: pendingUser.email,
            name: pendingUser.name,
            avatar: pendingUser.avatar,
            bio: pendingUser.bio
        });
        
        await user.save();
        await PendingUser.deleteOne({ email });
        triggerRealtimeSync('users');
        res.json(user);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Users
app.get('/api/users', async (req, res) => {
    const users = await User.find();
    res.json(users);
});

app.get('/api/users/:id', async (req, res) => {
    const user = await User.findById(req.params.id);
    res.json(user);
});

app.put('/api/users/:id', async (req, res) => {
    const user = await User.findByIdAndUpdate(req.params.id, req.body, { new: true });
    triggerRealtimeSync('users');
    res.json(user);
});

app.post('/api/users/:id/follow', async (req, res) => {
    try {
        const { currentUserId } = req.body;
        const userToFollow = await User.findById(req.params.id);
        const currentUser = await User.findById(currentUserId);
        
        if (!userToFollow || !currentUser) {
            return res.status(404).json({ error: 'User not found' });
        }

        if (!currentUser.followingList) {
            currentUser.followingList = [];
        }

        const index = currentUser.followingList.indexOf(userToFollow._id.toString());
        let followed = false;

        if (index === -1) {
            currentUser.followingList.push(userToFollow._id.toString());
            currentUser.following = (currentUser.following || 0) + 1;
            userToFollow.followers = (userToFollow.followers || 0) + 1;
            followed = true;
        } else {
            currentUser.followingList.splice(index, 1);
            currentUser.following = Math.max(0, (currentUser.following || 0) - 1);
            userToFollow.followers = Math.max(0, (userToFollow.followers || 0) - 1);
            followed = false;
        }

        await currentUser.save();
        await userToFollow.save();
        triggerRealtimeSync('users');

        res.json({ followed, currentUser, userToFollow });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Posts
app.get('/api/posts', async (req, res) => {
    const posts = await Post.find().sort({ timestamp: -1 });
    res.json(posts);
});

app.post('/api/posts', async (req, res) => {
    const post = new Post(req.body);
    await post.save();
    triggerRealtimeSync('posts');
    res.json(post);
});

app.delete('/api/posts/:id', async (req, res) => {
    await Post.findByIdAndDelete(req.params.id);
    triggerRealtimeSync('posts');
    res.json({ success: true });
});

app.post('/api/posts/:id/like', async (req, res) => {
    const { userId } = req.body;
    const post = await Post.findById(req.params.id);
    const index = post.likes.indexOf(userId);
    if (index === -1) post.likes.push(userId);
    else post.likes.splice(index, 1);
    await post.save();
    triggerRealtimeSync('posts');
    res.json(post);
});

app.post('/api/posts/:id/comment', async (req, res) => {
    const post = await Post.findById(req.params.id);
    post.comments.push(req.body);
    await post.save();
    triggerRealtimeSync('posts');
    res.json(post);
});

// Stories
app.get('/api/stories', async (req, res) => {
    const stories = await Story.find().sort({ timestamp: -1 });
    res.json(stories);
});

app.post('/api/stories', async (req, res) => {
    try {
        const story = new Story(req.body);
        await story.save();
        triggerRealtimeSync('stories');
        res.json(story);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Reels
app.get('/api/reels', async (req, res) => {
    try {
        const reels = await Reel.find().sort({ timestamp: -1 });
        res.json(reels);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/reels', async (req, res) => {
    try {
        const reel = new Reel(req.body);
        await reel.save();
        triggerRealtimeSync('reels');
        res.json(reel);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/reels/:id/like', async (req, res) => {
    try {
        const { userId } = req.body;
        const reel = await Reel.findById(req.params.id);
        if (!reel) return res.status(404).json({ error: 'Reel not found' });
        
        const index = reel.likes.indexOf(userId);
        if (index === -1) reel.likes.push(userId);
        else reel.likes.splice(index, 1);
        
        await reel.save();
        triggerRealtimeSync('reels');
        res.json(reel);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/reels/:id/comment', async (req, res) => {
    try {
        const reel = await Reel.findById(req.params.id);
        if (!reel) return res.status(404).json({ error: 'Reel not found' });
        
        reel.comments.push(req.body);
        await reel.save();
        triggerRealtimeSync('reels');
        res.json(reel);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Messages
app.get('/api/messages/:chatId', async (req, res) => {
    const messages = await Message.find({ chatId: req.params.chatId });
    res.json(messages);
});

app.post('/api/messages', async (req, res) => {
    const msg = new Message(req.body);
    await msg.save();
    triggerRealtimeSync('messages');
    res.json(msg);
});

// Notifications
app.get('/api/notifications/:userId', async (req, res) => {
    const notifs = await Notification.find({ to: req.params.userId }).sort({ timestamp: -1 });
    res.json(notifs);
});

app.post('/api/notifications', async (req, res) => {
    const notif = new Notification(req.body);
    await notif.save();
    triggerRealtimeSync('notifications');
    res.json(notif);
});

app.put('/api/notifications/read/:userId', async (req, res) => {
    await Notification.updateMany({ to: req.params.userId }, { read: true });
    triggerRealtimeSync('notifications');
    res.json({ success: true });
});

// ─── SEED DATA ───────────────────────────────────────────────────────────────

async function seed() {
    const count = await User.countDocuments();
    let createdUsers;
    if (count === 0) {
        console.log('Seeding database...');
        const users = [
            { username: 'alex_nexus', email: 'alex@example.com', name: 'Alex Rivera', avatar: 'AR', bio: 'Creative Explorer | Tech Enthusiast 🚀', followers: 1250, following: 450, password: '123' },
            { username: 'sophia_codes', email: 'sophia@example.com', name: 'Sophia Chen', avatar: 'SC', bio: 'Building the next gen web 💻', followers: 8900, following: 120, password: '123' },
            { username: 'marcus_v', email: 'marcus@example.com', name: 'Marcus Vance', avatar: 'MV', bio: 'Visual Storyteller 📸', followers: 3200, following: 800, password: '123' }
        ];
        createdUsers = await User.insertMany(users);
        
        const posts = [
            {
                userId: createdUsers[1]._id,
                content: 'Just launched the new ultra-responsive UI for ConnectHub! What do you think? 💎',
                image: 'https://images.unsplash.com/photo-1498050108023-c5249f4df085?auto=format&fit=crop&w=1200&q=80',
                likes: [createdUsers[0]._id.toString(), createdUsers[2]._id.toString()],
                comments: [{ userId: createdUsers[0]._id.toString(), text: 'This looks incredible! The glassmorphism is spot on.', timestamp: Date.now() - 3600000 }],
                timestamp: Date.now() - 7200000
            },
            {
                userId: createdUsers[2]._id,
                content: 'Morning trek in the mountains. The light was perfect. 🏔️',
                image: 'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?auto=format&fit=crop&w=1200&q=80',
                likes: [createdUsers[1]._id.toString()],
                comments: [],
                timestamp: Date.now() - 14400000
            }
        ];
        await Post.insertMany(posts);

        const stories = [
            { userId: createdUsers[1]._id, image: 'https://images.unsplash.com/photo-1517433447755-d14dcb3298c0?auto=format&fit=crop&w=300&q=80' },
            { userId: createdUsers[2]._id, image: 'https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=crop&w=300&q=80' },
            { userId: createdUsers[0]._id, image: 'https://images.unsplash.com/photo-1472214103451-9374bd1c798e?auto=format&fit=crop&w=300&q=80' }
        ];
        await Story.insertMany(stories);
    } else {
        createdUsers = await User.find();
    }

    const reelCount = await Reel.countDocuments();
    if (reelCount === 0 && createdUsers && createdUsers.length >= 3) {
        const reels = [
            {
                userId: createdUsers[0]._id,
                caption: 'Checking out the vibrant night life! 🌟 #nightlife #vibes',
                video: 'https://assets.mixkit.co/videos/preview/mixkit-girl-in-neon-sign-in-urban-street-40098-large.mp4',
                likes: [createdUsers[1]._id.toString(), createdUsers[2]._id.toString()],
                comments: [{ userId: createdUsers[1]._id.toString(), text: 'Loving the aesthetic!', timestamp: Date.now() }]
            },
            {
                userId: createdUsers[1]._id,
                caption: 'Nature is so therapeutic 🌿🌞 #peaceful #naturewalk',
                video: 'https://assets.mixkit.co/videos/preview/mixkit-forest-stream-in-the-sunlight-529-large.mp4',
                likes: [createdUsers[0]._id.toString()],
                comments: []
            },
            {
                userId: createdUsers[2]._id,
                caption: 'Lost in the rhythm 🎶🕺 #dancelife #neon',
                video: 'https://assets.mixkit.co/videos/preview/mixkit-man-dancing-under-neon-lights-40099-large.mp4',
                likes: [createdUsers[0]._id.toString(), createdUsers[1]._id.toString()],
                comments: []
            }
        ];
        await Reel.insertMany(reels);
        console.log('Seeded Reels!');
    }
    console.log('Seed complete.');
}

// ─── START SERVER ────────────────────────────────────────────────────────────

const clientOptions = { serverApi: { version: '1', strict: true, deprecationErrors: true } };

mongoose.connect(MONGODB_URI, clientOptions)
    .then(async () => {
        console.log('Pinged your deployment. You successfully connected to MongoDB Atlas!');
        await seed();
        gdrive.initGoogleDrive();
        triggerRealtimeSync();
        app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
    })
    .catch(err => console.error('Could not connect to MongoDB Atlas', err));
