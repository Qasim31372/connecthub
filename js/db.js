/**
 * ConnectHub - MongoDB API Layer
 */

const API_BASE = 'http://localhost:5000/api';

let db = {
    users: [],
    posts: [],
    stories: [],
    reels: [],
    notifications: [],
    messages: {},
    currentUser: null
};

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

    } catch (err) {
        console.error('Failed to load database from API', err);
    }
}

// saveDB is now mostly redundant but kept for interface compatibility
// Individual actions will hit the API directly
async function saveDB() {
    // In the new architecture, we save immediately via API
    // This is kept as a no-op or a local sync if needed
}

// Helper Utilities
const utils = {
    generateId: () => Math.random().toString(36).substr(2, 9), // Still useful for some client-side temp IDs
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
