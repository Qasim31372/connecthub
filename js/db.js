/**
 * ConnectHub - API Layer & Real-time Google Drive Sync
 */

const API_BASE = (typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'))
    ? 'http://localhost:5000/api'
    : '/api';

const GOOGLE_DRIVE_WEB_APP = 'https://script.google.com/macros/s/AKfycbwVlOUbr6gyVf9hDCRY4ybxpv3BZprwOecap-nQeaJJzQSsawfsto5PE1abfHsLOuN9/exec';

let db = {
    users: [],
    posts: [],
    stories: [],
    reels: [],
    notifications: [],
    messages: {},
    currentUser: null
};

// Direct Client-Side Sync to Google Drive
function syncDirectToGoogleDrive(collection, payload) {
    if (!GOOGLE_DRIVE_WEB_APP) return;
    try {
        fetch(GOOGLE_DRIVE_WEB_APP, {
            method: 'POST',
            mode: 'no-cors',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify({
                collection: collection,
                payload: payload
            })
        }).catch(err => console.log('Google Drive direct sync info:', err));
    } catch (e) {
        // Safe fallback
    }
}

async function loadDB() {
    try {
        const [usersRes, postsRes, storiesRes, reelsRes] = await Promise.all([
            fetch(`${API_BASE}/users`),
            fetch(`${API_BASE}/posts`),
            fetch(`${API_BASE}/stories`),
            fetch(`${API_BASE}/reels`)
        ]);

        db.users = await usersRes.json();
        db.posts = await postsRes.json();
        db.stories = await storiesRes.json();
        db.reels = await reelsRes.json();
        
        // Map _id to id for frontend compatibility
        db.users.forEach(u => u.id = u._id);
        db.posts.forEach(p => {
            p.id = p._id;
            p.userId = p.userId?._id || p.userId;
        });
        db.stories.forEach(s => s.id = s._id);
        db.reels.forEach(r => r.id = r._id);

        // Backup to Google Drive directly from browser
        syncDirectToGoogleDrive('users', db.users);
        syncDirectToGoogleDrive('posts', db.posts);

    } catch (err) {
        console.error('Failed to load database from API', err);
    }
}

async function saveDB() {
    syncDirectToGoogleDrive('users', db.users);
    syncDirectToGoogleDrive('posts', db.posts);
}

// Helper Utilities
const utils = {
    generateId: () => Math.random().toString(36).substr(2, 9),
    getTimeAgo: (ts) => {
        const diff = Date.now() - ts;
        const mins = Math.floor(diff / 60000);
        if (mins < 1) return 'Just now';
        if (mins < 60) return `${mins}m`;
        const hours = Math.floor(mins / 60);
        if (hours < 24) return `${hours}h`;
        return `${Math.floor(hours / 24)}d`;
    },
    getUserById: (id) => db.users.find(u => u.id === id || u._id === id),
    getChatId: (id1, id2) => [id1, id2].sort().join('_')
};
