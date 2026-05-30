const fs = require('fs');
const path = require('path');

const DOWNLOADS_DIR = path.join(__dirname, '..', 'downloads');
const FILE_LIFETIME_MS = 10 * 60 * 1000; // 10 minutes

function ensureDownloadsDir() {
  if (!fs.existsSync(DOWNLOADS_DIR)) {
    fs.mkdirSync(DOWNLOADS_DIR, { recursive: true });
    console.log('[Cleanup] Created downloads directory at:', DOWNLOADS_DIR);
  }
}

function cleanupExpiredFiles() {
  ensureDownloadsDir();
  console.log('[Cleanup] Running sweep of downloads folder...');

  fs.readdir(DOWNLOADS_DIR, (err, files) => {
    if (err) {
      console.error('[Cleanup] Error reading downloads folder:', err);
      return;
    }

    const now = Date.now();

    files.forEach((file) => {
      const filePath = path.join(DOWNLOADS_DIR, file);
      if (file.startsWith('.')) return;

      fs.stat(filePath, (statErr, stats) => {
        if (statErr) return;
        const age = now - stats.mtimeMs;
        if (age > FILE_LIFETIME_MS) {
          fs.unlink(filePath, (unlinkErr) => {
            if (!unlinkErr) {
              console.log(`[Cleanup] Deleted expired file: ${file} (Age: ${Math.round(age / 1000 / 60)} mins)`);
            }
          });
        }
      });
    });
  });
}

function startCleanupTask(intervalMs = 5 * 60 * 1000) {
  ensureDownloadsDir();
  cleanupExpiredFiles();
  setInterval(cleanupExpiredFiles, intervalMs);
  console.log(`[Cleanup] Background task started. Sweeping every ${intervalMs / 1000 / 60} minutes.`);
}

module.exports = {
  startCleanupTask,
  ensureDownloadsDir,
  DOWNLOADS_DIR
};
