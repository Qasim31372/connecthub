/**
 * ==============================================================================
 * CONNECTHUB - GOOGLE APPS SCRIPT FOR REAL-TIME GOOGLE DRIVE BACKUP
 * ==============================================================================
 * How to use:
 * 1. Go to https://script.google.com/ and click "New Project".
 * 2. Delete existing code, paste this ENTIRE code block into Code.gs, and Save (Ctrl+S).
 * 3. Click "Deploy" -> "New deployment".
 * 4. Select type "Web app".
 * 5. Set:
 *    - Description: ConnectHub Backup Web App
 *    - Execute as: "Me"
 *    - Who has access: "Anyone" (or Anyone with Google account)
 * 6. Click "Deploy", authorize permissions when prompted, and copy the Web App URL!
 * 7. Paste the Web App URL into your ConnectHub .env file:
 *    GOOGLE_APPS_SCRIPT_URL="https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec"
 * ==============================================================================
 */

function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    var action = data.action || 'sync';
    var collectionName = data.collection || 'full_backup';
    var payload = data.payload || data;

    // Get or Create Backup Folder on Google Drive
    var folderName = 'ConnectHub_Realtime_Backup';
    var folders = DriveApp.getFoldersByName(folderName);
    var folder;

    if (folders.hasNext()) {
      folder = folders.next();
    } else {
      folder = DriveApp.createFolder(folderName);
    }

    if (action === 'get' || action === 'load' || action === 'restore') {
      var fileName = collectionName.indexOf('.json') === -1 ? collectionName + '.json' : collectionName;
      var files = folder.getFilesByName(fileName);
      if (files.hasNext()) {
        var file = files.next();
        var content = file.getAs(MimeType.PLAIN_TEXT).getDataAsString();
        return ContentService.createTextOutput(JSON.stringify({
          status: 'success',
          collection: collectionName,
          data: JSON.parse(content)
        })).setMimeType(ContentService.MimeType.JSON);
      } else {
        return ContentService.createTextOutput(JSON.stringify({
          status: 'not_found',
          message: 'File ' + fileName + ' not found in Google Drive backup folder.'
        })).setMimeType(ContentService.MimeType.JSON);
      }
    }

    // Save JSON file in Google Drive
    var fileName = collectionName.indexOf('.json') === -1 ? collectionName + '.json' : collectionName;
    var jsonContent = JSON.stringify(payload, null, 2);
    var files = folder.getFilesByName(fileName);

    if (files.hasNext()) {
      var file = files.next();
      file.setContent(jsonContent);
    } else {
      folder.createFile(fileName, jsonContent, MimeType.PLAIN_TEXT);
    }

    return ContentService.createTextOutput(JSON.stringify({
      status: 'success',
      message: 'Successfully backed up ' + fileName + ' to Google Drive!',
      timestamp: new Date().toISOString()
    })).setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({
      status: 'error',
      message: err.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

function doGet(e) {
  try {
    var params = (e && e.parameter) ? e.parameter : {};
    var action = params.action || 'status';
    var collectionName = params.collection || 'full_backup';

    if (action === 'get' || action === 'load' || action === 'restore') {
      var folderName = 'ConnectHub_Realtime_Backup';
      var folders = DriveApp.getFoldersByName(folderName);
      if (!folders.hasNext()) {
        return ContentService.createTextOutput(JSON.stringify({
          status: 'not_found',
          message: 'Folder ConnectHub_Realtime_Backup not found on Google Drive'
        })).setMimeType(ContentService.MimeType.JSON);
      }
      var folder = folders.next();
      var fileName = collectionName.indexOf('.json') === -1 ? collectionName + '.json' : collectionName;
      var files = folder.getFilesByName(fileName);
      if (files.hasNext()) {
        var file = files.next();
        var content = file.getAs(MimeType.PLAIN_TEXT).getDataAsString();
        return ContentService.createTextOutput(JSON.stringify({
          status: 'success',
          collection: collectionName,
          data: JSON.parse(content)
        })).setMimeType(ContentService.MimeType.JSON);
      } else {
        return ContentService.createTextOutput(JSON.stringify({
          status: 'not_found',
          message: 'File ' + fileName + ' not found on Google Drive'
        })).setMimeType(ContentService.MimeType.JSON);
      }
    }

    return ContentService.createTextOutput(JSON.stringify({
      status: 'online',
      service: 'ConnectHub Google Drive Backup Service (Google Apps Script)',
      timestamp: new Date().toISOString()
    })).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({
      status: 'error',
      message: err.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}
