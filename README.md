# Social Video Downloader Backend

Backend API for downloading videos from social media platforms using yt-dlp.

## Features
- Analyze video URLs (YouTube, Instagram, TikTok, Facebook, etc.)
- Background download with progress tracking
- Auto-downloads yt-dlp on first run
- File cleanup every 10 minutes

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/` | Health check |
| POST | `/api/analyze` | Analyze video URL |
| POST | `/api/download` | Start background download |
| GET | `/api/progress/:id` | Poll download progress |
| GET | `/api/files/:id` | Download completed file |

## Local Development

```bash
npm install
npm run dev
```

Server runs on `http://localhost:4000`

## Deploy on Render

1. Push this repo to GitHub
2. Go to [render.com](https://render.com) → New → Web Service
3. Connect your GitHub repo
4. Set these settings:
   - **Environment:** Node
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
5. Deploy!

> ⚠️ yt-dlp is auto-downloaded on first start. May take ~30 seconds on cold boot.
