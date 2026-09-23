/**
 * ConnectHub - Standalone Google Drive Backup & Restore Script
 * Run with: node sync-drive.js backup  OR  node sync-drive.js restore
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const gdrive = require('./gdrive');

const DB_FILE = path.join(__dirname, 'db.json');
const mode = process.argv[2] || 'backup';

async function runScript() {
    console.log(`🚀 [Google Drive Sync Tool] Initializing mode: ${mode}...`);
    gdrive.initGoogleDrive();

    try {
        if (mode === 'restore') {
            console.log('⏳ Restoring database backup from Google Drive...');
            const restored = await gdrive.restoreAllDataFromDrive();
            if (restored && (restored.users || restored.posts)) {
                fs.writeFileSync(DB_FILE, JSON.stringify(restored, null, 2));
                console.log('🎉 Successfully restored backup from Google Drive to db.json!');
                console.log(`📊 Stats: ${restored.users?.length || 0} users, ${restored.posts?.length || 0} posts loaded.`);
                process.exit(0);
            } else {
                console.error('❌ No valid backup found on Google Drive.');
                process.exit(1);
            }
        } else {
            let dbData = {};
            if (fs.existsSync(DB_FILE)) {
                const fileData = fs.readFileSync(DB_FILE, 'utf-8');
                dbData = JSON.parse(fileData);
                console.log('📁 Loaded local database from db.json');
            } else {
                console.log('⚠️ db.json not found locally.');
                dbData = { users: [], posts: [], stories: [], reels: [], messages: [], notifications: [] };
            }

            console.log('⏳ Uploading full backup to Google Drive...');
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
        }
    } catch (err) {
        console.error('❌ Script error:', err.message);
        process.exit(1);
    }
}

runScript();
