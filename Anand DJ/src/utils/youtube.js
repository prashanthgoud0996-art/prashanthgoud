const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');

function formatDuration(sec) {
    if (!sec || isNaN(sec)) return '--:--';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
}

function detectCategory(title) {
    const t = (title || '').toLowerCase();
    if (/telugu|marfa|dhol|hyderabad|tollywood/i.test(t)) return 'Telugu';
    if (/hindi|bollywood|punjabi|bhangra/i.test(t)) return 'Hindi';
    if (/dj|remix|mix|mashup|club|edm|drop|bass/i.test(t)) return 'DJ';
    if (/band|pad|dholak|brass|live/i.test(t)) return 'Band';
    if (/2026|new|latest|trending/i.test(t)) return 'New-Releases';
    return 'English';
}

class YouTubeService {
    constructor(musicDir) {
        this.musicDir = musicDir;
        this.cache = new Map();
    }

    search(query, limit = 15) {
        return new Promise((resolve, reject) => {
            const cleanQuery = query.replace(/"/g, '');
            const cmd = `python -m yt_dlp "ytsearch${limit}:${cleanQuery}" --dump-json --flat-playlist --skip-download`;
            exec(cmd, { maxBuffer: 15 * 1024 * 1024 }, (err, stdout, stderr) => {
                if (err) return reject(err);
                const lines = stdout.trim().split('\n').filter(Boolean);
                const results = [];
                for (const line of lines) {
                    try {
                        const item = JSON.parse(line);
                        const dur = item.duration || 0;
                        results.push({
                            id: 'yt_' + item.id,
                            ytId: item.id,
                            title: item.title,
                            artist: item.channel || item.uploader || 'YouTube DJ',
                            duration: dur,
                            durationFormatted: item.duration_string || formatDuration(dur),
                            thumbnail: (item.thumbnails && item.thumbnails[0]) ? item.thumbnails[0].url : '',
                            url: `https://www.youtube.com/watch?v=${item.id}`,
                            category: detectCategory(item.title),
                            bpm: 128,
                            isYouTube: true,
                            isOnline: true
                        });
                    } catch (e) {}
                }
                resolve(results);
            });
        });
    }

    getStreamUrl(ytId) {
        if (this.cache.has(ytId)) {
            const cached = this.cache.get(ytId);
            if (Date.now() - cached.time < 3 * 3600 * 1000) { // 3-hour expiry
                return Promise.resolve(cached.url);
            }
        }

        return new Promise((resolve, reject) => {
            const cmd = `python -m yt_dlp --extractor-args "youtube:player_client=android" -g -f "ba/b" "https://www.youtube.com/watch?v=${ytId}"`;
            exec(cmd, { maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
                if (err) return reject(err);
                const urls = stdout.trim().split('\n').filter(u => u.startsWith('http'));
                if (urls.length > 0) {
                    const streamUrl = urls[0];
                    this.cache.set(ytId, { url: streamUrl, time: Date.now() });
                    resolve(streamUrl);
                } else {
                    reject(new Error('No streaming URL returned from YouTube'));
                }
            });
        });
    }

    downloadTrack(ytId, category = 'DJ') {
        return new Promise((resolve, reject) => {
            const catDir = path.join(this.musicDir, category);
            if (!fs.existsSync(catDir)) fs.mkdirSync(catDir, { recursive: true });
            const outTemplate = path.join(catDir, '%(title)s.%(ext)s');
            const cmd = `python -m yt_dlp --extractor-args "youtube:player_client=android" -f "ba/b" -o "${outTemplate}" "https://www.youtube.com/watch?v=${ytId}"`;
            exec(cmd, { maxBuffer: 15 * 1024 * 1024 }, (err, stdout, stderr) => {
                if (err) return reject(err);
                resolve({ success: true, category });
            });
        });
    }
}

module.exports = YouTubeService;
