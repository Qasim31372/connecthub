/**
 * ConnectHub - Standalone Google Drive Backup Script (No MongoDB)
 * Run with: node sync-drive.js OR npm run sync-drive
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const gdrive = require('./gdrive');

const DB_FILE = path.join(__dirname, 'db.json');

async function runBackup() {
    console.log('🚀 [Google Drive Backup Script] Initializing...');

    let dbData = {};

    try {
        if (fs.existsSync(DB_FILE)) {
            const fileData = fs.readFileSync(DB_FILE, 'utf-8');
            dbData = JSON.parse(fileData);
            console.log('📁 Loaded local database from db.json');
        } else {
            console.log('⚠️ db.json not found locally. Running initial setup sync...');
            dbData = { users: [], posts: [], stories: [], reels: [], messages: [], notifications: [] };
        }

        gdrive.initGoogleDrive();

        console.log('⏳ Uploading / Syncing full backup to Google Drive...');
        const result = await gdrive.syncAllData({
            users: dbData.users || [],
            posts: dbData.posts || [],
            stories: dbData.stories || [],
            reels: dbData.reels || [],
            messages: dbData.messages || [],
            notifications: dbData.notifications || []
        });

        console.log('----------------------------------------------------');
        console.log('🎉 Sync Complete Result:', JSON.stringify(result, null, 2));
        console.log('📋 Current Status:', JSON.stringify(gdrive.getSyncStatus(), null, 2));
        console.log('----------------------------------------------------');

        process.exit(0);
    } catch (err) {
        console.error('❌ Backup script error:', err.message);
        process.exit(1);
    }
}

runBackup();
