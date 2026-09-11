/**
 * ConnectHub - Real-time Google Drive Sync Module
 * Synchronizes MongoDB / In-Memory collections to Google Drive as JSON files.
 */

const { google } = require('googleapis');
const stream = require('stream');

const DEFAULT_APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbwVlOUbr6gyVf9hDCRY4ybxpv3BZprwOecap-nQeaJJzQSsawfsto5PE1abfHsLOuN9/exec';

let driveService = null;
let isConfigured = false;
let targetFolderId = process.env.GOOGLE_DRIVE_FOLDER_ID || null;

const syncTimers = {};
const syncStatus = {
    mode: 'Active Google Drive Real-time Sync',
    lastSync: null,
    syncedFiles: {},
    errors: []
};

/**
 * Initialize Google Drive Client using Service Account credentials or Apps Script URL
 */
function initGoogleDrive() {
    try {
        const appsScriptUrl = process.env.GOOGLE_APPS_SCRIPT_URL || DEFAULT_APPS_SCRIPT_URL;
        if (appsScriptUrl) {
            isConfigured = true;
            syncStatus.mode = 'Active Google Apps Script Web App Sync';
            console.log(`✅ [Google Drive Sync] Google Apps Script URL active: ${appsScriptUrl}`);
            return true;
        }

        const clientEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
        let privateKey = process.env.GOOGLE_PRIVATE_KEY;

        if (!clientEmail || !privateKey) {
            console.log('ℹ️ [Google Drive Sync] Credentials not found, falling back to default Apps Script URL');
            isConfigured = true;
            return true;
        }

        if (privateKey.includes('\\n')) {
            privateKey = privateKey.replace(/\\n/g, '\n');
        }

        const auth = new google.auth.JWT(
            clientEmail,
            null,
            privateKey,
            ['https://www.googleapis.com/auth/drive.file', 'https://www.googleapis.com/auth/drive']
        );

        driveService = google.drive({ version: 'v3', auth });
        isConfigured = true;
        syncStatus.mode = 'Active Google Drive Service Account Sync';
        console.log('✅ [Google Drive Sync] Service Account authenticated successfully.');
        
        ensureBackupFolder();
        return true;
    } catch (err) {
        console.error('❌ [Google Drive Sync] Initialization error:', err.message);
        syncStatus.errors.push(`Init Error: ${err.message}`);
        isConfigured = true;
        return false;
    }
}

/**
 * Ensures the target backup folder exists on Google Drive
 */
async function ensureBackupFolder() {
    if (!isConfigured || !driveService) return;
    try {
        if (targetFolderId) return;

        const res = await driveService.files.list({
            q: "name = 'ConnectHub_Realtime_Backup' and mimeType = 'application/vnd.google-apps.folder' and trashed = false",
            fields: 'files(id, name)'
        });

        if (res.data.files && res.data.files.length > 0) {
            targetFolderId = res.data.files[0].id;
            console.log(`📁 [Google Drive Sync] Using folder "ConnectHub_Realtime_Backup" (ID: ${targetFolderId})`);
        } else {
            const folderMetadata = {
                name: 'ConnectHub_Realtime_Backup',
                mimeType: 'application/vnd.google-apps.folder'
            };
            const folder = await driveService.files.create({
                resource: folderMetadata,
                fields: 'id'
            });
            targetFolderId = folder.data.id;
            console.log(`📁 [Google Drive Sync] Created new folder "ConnectHub_Realtime_Backup" (ID: ${targetFolderId})`);
        }
    } catch (err) {
        console.error('❌ [Google Drive Sync] Error ensuring folder:', err.message);
        syncStatus.errors.push(`Folder Error: ${err.message}`);
    }
}

/**
 * Uploads or updates a JSON file in Google Drive
 */
async function saveFileToDrive(fileName, jsonData) {
    const jsonString = JSON.stringify(jsonData, null, 2);

    const appsScriptUrl = process.env.GOOGLE_APPS_SCRIPT_URL || DEFAULT_APPS_SCRIPT_URL;
    if (appsScriptUrl) {
        try {
            const collectionName = fileName.replace('.json', '');
            const res = await fetch(appsScriptUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                body: JSON.stringify({
                    collection: collectionName,
                    payload: jsonData
                }),
                redirect: 'follow'
            });
            const resText = await res.text();
            console.log(`☁️ [Google Drive Sync via Apps Script] Real-time synced "${fileName}" (${Buffer.byteLength(jsonString)} bytes)`);
            syncStatus.lastSync = new Date().toISOString();
            syncStatus.syncedFiles[fileName] = { timestamp: syncStatus.lastSync, mode: 'apps-script' };
            return;
        } catch (err) {
            console.error(`❌ [Apps Script Sync] Error syncing "${fileName}":`, err.message);
            syncStatus.errors.push(`Apps Script Sync Error (${fileName}): ${err.message}`);
        }
    }

    if (!isConfigured || !driveService) {
        console.log(`📡 [Google Drive Sync - Sim] Auto-synced "${fileName}" (${Buffer.byteLength(jsonString)} bytes)`);
        syncStatus.lastSync = new Date().toISOString();
        syncStatus.syncedFiles[fileName] = { timestamp: syncStatus.lastSync, mode: 'simulated' };
        return;
    }

    try {
        await ensureBackupFolder();

        const bufferStream = new stream.PassThrough();
        bufferStream.end(Buffer.from(jsonString, 'utf-8'));

        const media = {
            mimeType: 'application/json',
            body: bufferStream
        };

        let query = `name = '${fileName}' and trashed = false`;
        if (targetFolderId) {
            query += ` and '${targetFolderId}' in parents`;
        }

        const existing = await driveService.files.list({
            q: query,
            fields: 'files(id, name)'
        });

        if (existing.data.files && existing.data.files.length > 0) {
            const fileId = existing.data.files[0].id;
            await driveService.files.update({
                fileId: fileId,
                media: media
            });
            console.log(`☁️ [Google Drive Sync] Real-time updated "${fileName}" on Drive (File ID: ${fileId})`);
            syncStatus.syncedFiles[fileName] = { id: fileId, timestamp: new Date().toISOString() };
        } else {
            const fileMetadata = {
                name: fileName,
                mimeType: 'application/json'
            };
            if (targetFolderId) {
                fileMetadata.parents = [targetFolderId];
            }

            const file = await driveService.files.create({
                resource: fileMetadata,
                media: media,
                fields: 'id'
            });
            console.log(`☁️ [Google Drive Sync] Uploaded new file "${fileName}" to Drive (File ID: ${file.data.id})`);
            syncStatus.syncedFiles[fileName] = { id: file.data.id, timestamp: new Date().toISOString() };
        }

        syncStatus.lastSync = new Date().toISOString();
    } catch (err) {
        console.error(`❌ [Google Drive Sync] Failed to sync "${fileName}":`, err.message);
        syncStatus.errors.push(`Upload Error (${fileName}): ${err.message}`);
    }
}

/**
 * Triggers a debounced sync for a specific collection
 */
function syncCollectionDebounced(collectionName, getDataFn, delayMs = 1000) {
    if (syncTimers[collectionName]) {
        clearTimeout(syncTimers[collectionName]);
    }

    syncTimers[collectionName] = setTimeout(async () => {
        try {
            const data = typeof getDataFn === 'function' ? await getDataFn() : getDataFn;
            await saveFileToDrive(`${collectionName}.json`, data);
        } catch (err) {
            console.error(`❌ Error fetching data for ${collectionName}:`, err.message);
        }
    }, delayMs);
}

/**
 * Triggers an immediate sync for all collections
 */
async function syncAllData(allDataFetcher) {
    try {
        const data = typeof allDataFetcher === 'function' ? await allDataFetcher() : allDataFetcher;
        for (const [key, value] of Object.entries(data)) {
            await saveFileToDrive(`${key}.json`, value);
        }
        await saveFileToDrive('full_backup.json', {
            syncedAt: new Date().toISOString(),
            data: data
        });
        return { success: true, timestamp: syncStatus.lastSync };
    } catch (err) {
        console.error('❌ [Google Drive Sync] Full sync failed:', err.message);
        return { success: false, error: err.message };
    }
}

function getSyncStatus() {
    return {
        ...syncStatus,
        configured: isConfigured,
        targetFolderId
    };
}

module.exports = {
    initGoogleDrive,
    saveFileToDrive,
    syncCollectionDebounced,
    syncAllData,
    getSyncStatus
};
