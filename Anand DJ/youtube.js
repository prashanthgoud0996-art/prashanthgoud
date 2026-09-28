const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const https = require('https');

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
    if (/2026|2025|new|latest|trending/i.test(t)) return 'New-Releases';
    return 'English';
}

// Parse ISO 8601 duration like PT3M45S → seconds
function parseIsoDuration(iso) {
    if (!iso) return 0;
    const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
    if (!m) return 0;
    return (parseInt(m[1] || 0) * 3600) + (parseInt(m[2] || 0) * 60) + parseInt(m[3] || 0);
}

// Fetch a URL and return body as string
function fetchUrl(url, options = {}) {
    return new Promise((resolve, reject) => {
        const req = https.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept-Language': 'en-US,en;q=0.9',
                ...options.headers
            },
            ...options
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve(data));
        });
        req.on('error', reject);
        req.setTimeout(10000, () => { req.destroy(); reject(new Error('Request timeout')); });
    });
}

// POST request for YouTube innertube API
function postJson(url, payload) {
    return new Promise((resolve, reject) => {
        const body = JSON.stringify(payload);
        const parsed = new URL(url);
        const options = {
            hostname: parsed.hostname,
            path: parsed.pathname + parsed.search,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Content-Length': Buffer.byteLength(body),
                'X-YouTube-Client-Name': '1',
                'X-YouTube-Client-Version': '2.20240101'
            }
        };
        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try { resolve(JSON.parse(data)); }
                catch (e) { reject(new Error('Invalid JSON response')); }
            });
        });
        req.on('error', reject);
        req.setTimeout(15000, () => { req.destroy(); reject(new Error('Request timeout')); });
        req.write(body);
        req.end();
    });
}

class YouTubeService {
    constructor(musicDir) {
        this.musicDir = musicDir;
        this.cache = new Map();
    }

    async search(query, limit = 15) {
        try {
            // Use YouTube's innertube search API
            const payload = {
                context: {
                    client: {
                        clientName: 'WEB',
                        clientVersion: '2.20240101',
                        hl: 'en',
                        gl: 'US'
                    }
                },
                query: query,
                params: 'EgIQAQ%3D%3D' // Filter: only videos
            };

            const data = await postJson(
                'https://www.youtube.com/youtubei/v1/search?key=AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8',
                payload
            );

            const results = [];
            const contents =
                data?.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer?.contents || [];

            for (const section of contents) {
                const items = section?.itemSectionRenderer?.contents || [];
                for (const item of items) {
                    const v = item?.videoRenderer;
                    if (!v || !v.videoId) continue;

                    const title = v.title?.runs?.[0]?.text || 'Unknown';
                    const channel = v.ownerText?.runs?.[0]?.text || v.shortBylineText?.runs?.[0]?.text || 'YouTube';
                    const durText = v.lengthText?.simpleText || '';
                    const durParts = durText.split(':').map(Number);
                    let durSec = 0;
                    if (durParts.length === 2) durSec = durParts[0] * 60 + durParts[1];
                    else if (durParts.length === 3) durSec = durParts[0] * 3600 + durParts[1] * 60 + durParts[2];

                    const thumb = v.thumbnail?.thumbnails?.slice(-1)[0]?.url || '';

                    results.push({
                        id: 'yt_' + v.videoId,
                        ytId: v.videoId,
                        title,
                        artist: channel,
                        duration: durSec,
                        durationFormatted: durText || formatDuration(durSec),
                        thumbnail: thumb,
                        url: `https://www.youtube.com/watch?v=${v.videoId}`,
                        category: detectCategory(title),
                        bpm: 128,
                        isYouTube: true,
                        isOnline: true
                    });

                    if (results.length >= limit) break;
                }
                if (results.length >= limit) break;
            }

            // Fallback: scrape YouTube search page if innertube returned nothing
            if (results.length === 0) {
                return await this.searchFallback(query, limit);
            }

            return results;
        } catch (err) {
            console.error('YouTube innertube search error:', err.message);
            return await this.searchFallback(query, limit);
        }
    }

    async searchFallback(query, limit = 15) {
        try {
            const searchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}&sp=EgIQAQ%3D%3D`;
            const html = await fetchUrl(searchUrl);

            // Extract ytInitialData JSON from the page
            const match = html.match(/var ytInitialData = ({.+?});<\/script>/s) ||
                          html.match(/ytInitialData\s*=\s*({.+?});\s*(?:var|window|<\/script>)/s);
            if (!match) return [];

            const ytData = JSON.parse(match[1]);
            const contents =
                ytData?.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer?.contents || [];

            const results = [];
            for (const section of contents) {
                const items = section?.itemSectionRenderer?.contents || [];
                for (const item of items) {
                    const v = item?.videoRenderer;
                    if (!v || !v.videoId) continue;

                    const title = v.title?.runs?.[0]?.text || 'Unknown';
                    const channel = v.ownerText?.runs?.[0]?.text || 'YouTube';
                    const durText = v.lengthText?.simpleText || '';
                    const durParts = durText.split(':').map(Number);
                    let durSec = 0;
                    if (durParts.length === 2) durSec = durParts[0] * 60 + durParts[1];
                    else if (durParts.length === 3) durSec = durParts[0] * 3600 + durParts[1] * 60 + durParts[2];

                    const thumb = v.thumbnail?.thumbnails?.slice(-1)[0]?.url || '';

                    results.push({
                        id: 'yt_' + v.videoId,
                        ytId: v.videoId,
                        title,
                        artist: channel,
                        duration: durSec,
                        durationFormatted: durText || formatDuration(durSec),
                        thumbnail: thumb,
                        url: `https://www.youtube.com/watch?v=${v.videoId}`,
                        category: detectCategory(title),
                        bpm: 128,
                        isYouTube: true,
                        isOnline: true
                    });

                    if (results.length >= limit) break;
                }
                if (results.length >= limit) break;
            }
            return results;
        } catch (err) {
            console.error('YouTube fallback search error:', err.message);
            return [];
        }
    }

    getStreamUrl(ytId) {
        if (this.cache.has(ytId)) {
            const cached = this.cache.get(ytId);
            if (Date.now() - cached.time < 3 * 3600 * 1000) {
                return Promise.resolve(cached.url);
            }
        }

        return new Promise((resolve, reject) => {
            const pyCmd = process.platform === 'win32' ? 'python' : 'python3';
            // Use fast format 18 (progressive MP4/AAC) for instant streaming and seeking, fallback to ba/b
            const cmd = `${pyCmd} -m yt_dlp --no-playlist --no-warnings --extractor-args "youtube:player_client=android" -g -f "18/ba/b" "https://www.youtube.com/watch?v=${ytId}"`;
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

