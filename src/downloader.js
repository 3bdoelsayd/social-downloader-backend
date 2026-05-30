const fs = require('fs');
const path = require('path');
const https = require('https');
const { spawn, execFile } = require('child_process');

const isWindows = process.platform === 'win32';
const isMac = process.platform === 'darwin';

const BIN_DIR = path.join(__dirname, '..', 'bin');
const YT_DLP_FILENAME = isWindows ? 'yt-dlp.exe' : (isMac ? 'yt-dlp_macos' : 'yt-dlp');
const YT_DLP_PATH = path.join(BIN_DIR, YT_DLP_FILENAME);
const YT_DLP_URL = `https://github.com/yt-dlp/yt-dlp/releases/latest/download/${YT_DLP_FILENAME}`;

/**
 * Ensures yt-dlp is downloaded and ready to use.
 */
function ensureYtDlp() {
  return new Promise((resolve, reject) => {
    if (fs.existsSync(YT_DLP_PATH)) {
      console.log(`[Downloader] ${YT_DLP_FILENAME} is already installed at:`, YT_DLP_PATH);
      resolve(YT_DLP_PATH);
      return;
    }

    if (!fs.existsSync(BIN_DIR)) {
      fs.mkdirSync(BIN_DIR, { recursive: true });
    }

    console.log(`[Downloader] Downloading ${YT_DLP_FILENAME} from GitHub...`);
    console.log(`[Downloader] URL: ${YT_DLP_URL}`);

    const file = fs.createWriteStream(YT_DLP_PATH);

    function download(url) {
      https.get(url, (response) => {
        if (response.statusCode === 301 || response.statusCode === 302) {
          download(response.headers.location);
          return;
        }
        if (response.statusCode !== 200) {
          fs.unlink(YT_DLP_PATH, () => {});
          reject(new Error(`Failed to download ${YT_DLP_FILENAME}: HTTP ${response.statusCode}`));
          return;
        }

        response.pipe(file);

        file.on('finish', () => {
          file.close(() => {
            console.log(`[Downloader] ${YT_DLP_FILENAME} downloaded successfully!`);

            if (!isWindows) {
              try {
                fs.chmodSync(YT_DLP_PATH, '755');
                console.log('[Downloader] Set executable permissions (755) on yt-dlp');
              } catch (chmodErr) {
                console.error('[Downloader] Failed to set executable permissions:', chmodErr);
              }
            }

            resolve(YT_DLP_PATH);
          });
        });
      }).on('error', (err) => {
        fs.unlink(YT_DLP_PATH, () => {});
        console.error(`[Downloader] Error downloading ${YT_DLP_FILENAME}:`, err);
        reject(err);
      });
    }

    download(YT_DLP_URL);
  });
}

/**
 * Updates yt-dlp to the latest version.
 */
function updateYtDlp() {
  return new Promise((resolve, reject) => {
    if (!fs.existsSync(YT_DLP_PATH)) {
      return reject(new Error(`${YT_DLP_FILENAME} is not installed yet.`));
    }

    console.log(`[Downloader] Checking for ${YT_DLP_FILENAME} updates...`);
    execFile(YT_DLP_PATH, ['-U'], (error, stdout, stderr) => {
      if (error) {
        console.error('[Downloader] Update error:', error);
        return reject(error);
      }
      console.log('[Downloader] Update output:', stdout);
      resolve(stdout);
    });
  });
}

/**
 * Analyzes a social media link and extracts video metadata.
 */
function analyzeUrl(url) {
  return new Promise((resolve, reject) => {
    if (!fs.existsSync(YT_DLP_PATH)) {
      return reject(new Error('yt-dlp is not ready. Call ensureYtDlp() first.'));
    }

    console.log('[Downloader] Analyzing URL:', url);

    const args = [
      '--dump-json',
      '--no-playlist',
      '--no-warnings',
      url
    ];

    execFile(YT_DLP_PATH, args, { maxBuffer: 10 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) {
        console.error('[Downloader] Analysis error:', stderr || error.message);
        return reject(new Error(stderr || error.message || 'Failed to analyze video link.'));
      }

      try {
        const metadata = JSON.parse(stdout);

        const result = {
          title: metadata.title || 'Social Video',
          description: metadata.description || '',
          duration: metadata.duration || 0,
          thumbnail: metadata.thumbnail || (metadata.thumbnails && metadata.thumbnails.length > 0 ? metadata.thumbnails[metadata.thumbnails.length - 1].url : ''),
          platform: metadata.extractor_key ? metadata.extractor_key.toLowerCase() : (metadata.extractor ? metadata.extractor.toLowerCase() : 'unknown'),
          uploader: metadata.uploader || metadata.channel || '',
          url: url,
          formats: []
        };

        result.formats.push({
          id: 'best_video',
          label: 'High Quality (MP4)',
          formatSpec: 'best[ext=mp4]/best',
          ext: 'mp4',
          type: 'video'
        });

        result.formats.push({
          id: 'medium_video',
          label: 'Medium Quality (MP4)',
          formatSpec: 'worst[ext=mp4]/worst/best',
          ext: 'mp4',
          type: 'video'
        });

        result.formats.push({
          id: 'best_audio',
          label: 'Audio Only (M4A/MP3)',
          formatSpec: 'bestaudio[ext=m4a]/bestaudio',
          ext: 'm4a',
          type: 'audio'
        });

        resolve(result);
      } catch (parseError) {
        console.error('[Downloader] JSON parsing error:', parseError);
        reject(new Error('Failed to parse video metadata.'));
      }
    });
  });
}

/**
 * Downloads a video from a URL and saves it to the downloads folder.
 */
function downloadVideo(url, formatSpec, outputPath, onProgress) {
  return new Promise((resolve, reject) => {
    if (!fs.existsSync(YT_DLP_PATH)) {
      return reject(new Error('yt-dlp is not ready.'));
    }

    console.log(`[Downloader] Starting download for ${url} with format ${formatSpec}`);

    const args = [
      '-f', formatSpec,
      '--no-playlist',
      '--no-warnings',
      '--progress',
      '--newline',
      '-o', outputPath,
      url
    ];

    const child = spawn(YT_DLP_PATH, args);

    let errorOutput = '';

    child.stdout.on('data', (data) => {
      const line = data.toString();
      const progressMatch = line.match(/\[download\]\s+(\d+\.\d+)%\s+of\s+([^\s]+)\s+at\s+([^\s]+)/);
      if (progressMatch && onProgress) {
        const percent = parseFloat(progressMatch[1]);
        const size = progressMatch[2];
        const speed = progressMatch[3];
        onProgress(percent, speed, size);
      }
    });

    child.stderr.on('data', (data) => {
      errorOutput += data.toString();
    });

    child.on('close', (code) => {
      if (code === 0) {
        console.log('[Downloader] Download completed successfully, exit code 0');
        resolve(outputPath);
      } else {
        console.error('[Downloader] Download process failed with code', code);
        console.error('[Downloader] Error output:', errorOutput);
        reject(new Error(errorOutput || `Download failed with exit code ${code}`));
      }
    });
  });
}

module.exports = {
  ensureYtDlp,
  updateYtDlp,
  analyzeUrl,
  downloadVideo
};
