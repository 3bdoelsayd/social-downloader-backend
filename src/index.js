const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const sanitize = require('sanitize-filename');

const downloader = require('./downloader');
const cleanup = require('./cleanup');

const app = express();
const PORT = process.env.PORT || 4000;

// Middleware
app.use(cors());
app.use(express.json());

// In-memory store for tracking background downloads
const activeDownloads = {};

// Root / Health Check - Fixed: (req, res) not (res, response)
app.get('/', (req, res) => {
  res.json({
    status: 'online',
    message: 'Social Video Downloader API is running.',
    platform: process.platform
  });
});

/**
 * 1. Analyze video URL
 */
app.post('/api/analyze', async (req, res) => {
  const { url } = req.body;

  if (!url || typeof url !== 'string') {
    return res.status(400).json({ error: 'Valid URL is required.' });
  }

  try {
    const info = await downloader.analyzeUrl(url);
    res.json(info);
  } catch (error) {
    console.error('[API] Error in /api/analyze:', error);
    res.status(500).json({ error: error.message || 'Failed to analyze video link.' });
  }
});

/**
 * 2. Start download in background
 */
app.post('/api/download', async (req, res) => {
  const { url, formatId } = req.body;

  if (!url || typeof url !== 'string') {
    return res.status(400).json({ error: 'Valid URL is required.' });
  }

  try {
    const info = await downloader.analyzeUrl(url);
    const selectedFormat = info.formats.find(f => f.id === formatId) || info.formats[0];

    const downloadId = crypto.randomUUID();
    const sanitizedTitle = sanitize(info.title).replace(/\s+/g, '_');
    const filename = `${sanitizedTitle}_${Date.now()}.${selectedFormat.ext}`;
    const filePath = path.join(cleanup.DOWNLOADS_DIR, filename);

    activeDownloads[downloadId] = {
      status: 'downloading',
      percent: 0,
      speed: '0 KiB/s',
      size: 'Unknown size',
      filename: filename,
      filePath: filePath,
      error: null
    };

    console.log(`[API] Spawned background download ${downloadId} for: ${info.title}`);

    downloader.downloadVideo(url, selectedFormat.formatSpec, filePath, (percent, speed, size) => {
      if (activeDownloads[downloadId]) {
        activeDownloads[downloadId].percent = percent;
        activeDownloads[downloadId].speed = speed;
        activeDownloads[downloadId].size = size;
      }
    }).then(() => {
      if (activeDownloads[downloadId]) {
        activeDownloads[downloadId].status = 'completed';
        activeDownloads[downloadId].percent = 100;
        console.log(`[API] Background download ${downloadId} completed.`);
      }
    }).catch((err) => {
      if (activeDownloads[downloadId]) {
        activeDownloads[downloadId].status = 'failed';
        activeDownloads[downloadId].error = err.message || 'Download failed on server.';
        console.error(`[API] Background download ${downloadId} failed:`, err);
      }
    });

    res.json({
      downloadId,
      title: info.title,
      thumbnail: info.thumbnail,
      platform: info.platform,
      filename
    });

  } catch (error) {
    console.error('[API] Error in /api/download:', error);
    res.status(500).json({ error: error.message || 'Failed to start download.' });
  }
});

/**
 * 3. Poll download progress
 */
app.get('/api/progress/:downloadId', (req, res) => {
  const { downloadId } = req.params;
  const download = activeDownloads[downloadId];

  if (!download) {
    return res.status(404).json({ error: 'Download session not found or expired.' });
  }

  res.json({
    status: download.status,
    percent: download.percent,
    speed: download.speed,
    size: download.size,
    error: download.error
  });
});

/**
 * 4. Retrieve completed file
 */
app.get('/api/files/:downloadId', (req, res) => {
  const { downloadId } = req.params;
  const download = activeDownloads[downloadId];

  if (!download) {
    return res.status(404).json({ error: 'Download session not found or expired.' });
  }

  if (download.status !== 'completed') {
    return res.status(400).json({ error: `File is not ready. Status: ${download.status}` });
  }

  if (!fs.existsSync(download.filePath)) {
    return res.status(404).json({ error: 'File not found on disk.' });
  }

  res.download(download.filePath, download.filename, (err) => {
    if (err) {
      console.error(`[API] Error sending file ${downloadId}:`, err);
    } else {
      console.log(`[API] File ${downloadId} sent successfully.`);
      setTimeout(() => {
        fs.unlink(download.filePath, () => {
          console.log(`[API] Cleaned up: ${download.filename}`);
        });
        delete activeDownloads[downloadId];
      }, 60 * 1000);
    }
  });
});

// Start server
async function init() {
  try {
    console.log('[Server] Starting initialization...');

    cleanup.ensureDownloadsDir();
    await downloader.ensureYtDlp();
    cleanup.startCleanupTask();

    app.listen(PORT, '0.0.0.0', () => {
      console.log(`==================================================`);
      console.log(`🚀 Server running on port ${PORT}`);
      console.log(`🔗 http://localhost:${PORT}`);
      console.log(`==================================================`);
    });
  } catch (err) {
    console.error('❌ Failed to initialize server:', err);
    process.exit(1);
  }
}

init();
