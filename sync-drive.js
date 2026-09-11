/**
 * ConnectHub - Standalone Google Drive Backup Script
 * Run with: node sync-drive.js OR npm run sync-drive
 */

require('dotenv').config();
const mongoose = require('mongoose');
const gdrive = require('./gdrive');

const MONGODB_URI = process.env.MONGODB_URI;

// Define Schemas to access collections directly
const User = mongoose.models.User || mongoose.model('User', new mongoose.Schema({}, { strict: false }));
const Post = mongoose.models.Post || mongoose.model('Post', new mongoose.Schema({}, { strict: false }));
const Story = mongoose.models.Story || mongoose.model('Story', new mongoose.Schema({}, { strict: false }));
const Reel = mongoose.models.Reel || mongoose.model('Reel', new mongoose.Schema({}, { strict: false }));
const Message = mongoose.models.Message || mongoose.model('Message', new mongoose.Schema({}, { strict: false }));
const Notification = mongoose.models.Notification || mongoose.model('Notification', new mongoose.Schema({}, { strict: false }));

async function runBackup() {
    console.log('🚀 [Google Drive Backup Script] Initializing...');

    if (!MONGODB_URI) {
        console.error('❌ MONGODB_URI is missing in .env file!');
        process.exit(1);
    }

    try {
        await mongoose.connect(MONGODB_URI);
        console.log('✅ Connected to MongoDB.');

        gdrive.initGoogleDrive();

        const [users, posts, stories, reels, messages, notifications] = await Promise.all([
            User.find().lean(),
            Post.find().lean(),
            Story.find().lean(),
            Reel.find().lean(),
            Message.find().lean(),
            Notification.find().lean()
        ]);

        console.log(`📊 Fetched Data: ${users.length} users, ${posts.length} posts, ${stories.length} stories, ${reels.length} reels, ${messages.length} messages, ${notifications.length} notifications.`);

        console.log('⏳ Uploading / Syncing full backup to Google Drive...');
        const result = await gdrive.syncAllData({
            users,
            posts,
            stories,
            reels,
            messages,
            notifications
        });

        console.log('----------------------------------------------------');
        console.log('🎉 Sync Complete Result:', JSON.stringify(result, null, 2));
        console.log('📋 Current Status:', JSON.stringify(gdrive.getSyncStatus(), null, 2));
        console.log('----------------------------------------------------');

        await mongoose.disconnect();
        console.log('👋 Disconnected from MongoDB. Script finished successfully.');
        process.exit(0);
    } catch (err) {
        console.error('❌ Backup script error:', err.message);
        process.exit(1);
    }
}

runBackup();
