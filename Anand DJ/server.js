const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

const PathResolver = require('./src/utils/pathResolver');
const PortableDatabase = require('./src/db/database');
const YouTubeService = require('./src/utils/youtube');

const PORT = process.env.PORT || 7890;
const resolver = new PathResolver(path.resolve(__dirname));
const db = new PortableDatabase(resolver);
const ytService = new YouTubeService(resolver.getMusicDir());

const MIME_TYPES = {
    '.html': 'text/html; charset=UTF-8',
    '.css': 'text/css; charset=UTF-8',
    '.js': 'application/javascript; charset=UTF-8',
    '.json': 'application/json; charset=UTF-8',
    '.wav': 'audio/wav',
    '.mp3': 'audio/mpeg',
    '.m4a': 'audio/mp4',
    '.mp4': 'video/mp4',
    '.webm': 'audio/webm',
    '.aac': 'audio/aac',
    '.flac': 'audio/flac',
    '.ogg': 'audio/ogg',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon'
};

function sendJson(res, statusCode, data) {
    res.writeHead(statusCode, {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
    });
    res.end(JSON.stringify(data));
}

function parseBody(req) {
    return new Promise((resolve, reject) => {
        let body = '';
        req.on('data', chunk => {
            body += chunk;
            if (body.length > 50 * 1024 * 1024) {
                req.destroy();
                reject(new Error('Payload too large'));
            }
        });
        req.on('end', () => {
            try {
                resolve(body ? JSON.parse(body) : {});
            } catch (err) {
                resolve({});
            }
        });
        req.on('error', reject);
    });
}

function downloadHttpFile(fileUrl, destPath) {
    return new Promise((resolve, reject) => {
        const client = fileUrl.startsWith('https') ? https : http;
        const fileStream = fs.createWriteStream(destPath);
        client.get(fileUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                return downloadHttpFile(res.headers.location, destPath).then(resolve).catch(reject);
            }
            if (res.statusCode !== 200) {
                fileStream.close();
                fs.unlink(destPath, () => {});
                return reject(new Error(`Download failed with status ${res.statusCode}`));
            }
            res.pipe(fileStream);
            fileStream.on('finish', () => {
                fileStream.close(resolve);
            });
        }).on('error', (err) => {
            fileStream.close();
            fs.unlink(destPath, () => {});
            reject(err);
        });
    });
}

const server = http.createServer(async (req, res) => {
    if (req.method === 'OPTIONS') {
        res.writeHead(204, {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type'
        });
        return res.end();
    }

    const host = req.headers.host || '127.0.0.1:7890';
    const parsedUrl = new URL(req.url, 'http://' + host);
    const pathname = parsedUrl.pathname;

    // API Routes
    if (pathname.startsWith('/api/')) {
        try {
            if (pathname === '/api/system/status' && req.method === 'GET') {
                const tracks = db.getAllTracks();
                const lastState = db.getLastSessionState();
                return sendJson(res, 200, {
                    status: 'OK',
                    applicationReady: true,
                    libraryReady: true,
                    trackCount: tracks.length,
                    usbRoot: resolver.getRoot(),
                    driveLetter: path.parse(resolver.getRoot()).root,
                    lastSessionState: lastState,
                    categories: db.data.categories,
                    timestamp: new Date().toISOString()
                });
            }

            if (pathname === '/api/tracks' && req.method === 'GET') {
                const tracks = db.getAllTracks();
                const category = parsedUrl.searchParams.get('category');
                const search = (parsedUrl.searchParams.get('search') || '').toLowerCase();
                
                let filtered = tracks;
                if (category && category !== 'All') {
                    filtered = filtered.filter(t => t.category.toLowerCase() === category.toLowerCase());
                }
                if (search) {
                    filtered = filtered.filter(t => 
                        t.title.toLowerCase().includes(search) || 
                        t.artist.toLowerCase().includes(search) ||
                        t.category.toLowerCase().includes(search)
                    );
                }
                return sendJson(res, 200, { tracks: filtered });
            }

            // YOUTUBE SEARCH ENDPOINT (FULL SONGS & REMIXES)
            if (pathname === '/api/youtube/search' && req.method === 'GET') {
                const query = parsedUrl.searchParams.get('query');
                if (!query || query.trim().length < 2) {
                    return sendJson(res, 200, { results: [] });
                }

                try {
                    const results = await ytService.search(query.trim(), 20);
                    return sendJson(res, 200, { results });
                } catch (ytErr) {
                    console.error('YouTube search error:', ytErr.message);
                    return sendJson(res, 500, { error: ytErr.message });
                }
            }

            // YOUTUBE STREAM URL EXTRACTION
            if (pathname === '/api/youtube/stream' && req.method === 'GET') {
                const ytId = parsedUrl.searchParams.get('id');
                if (!ytId) return sendJson(res, 400, { error: 'Missing YouTube id' });

                try {
                    const streamUrl = await ytService.getStreamUrl(ytId);
                    return sendJson(res, 200, { streamUrl });
                } catch (streamErr) {
                    console.error('YouTube stream error:', streamErr.message);
                    return sendJson(res, 500, { error: streamErr.message });
                }
            }

            // YOUTUBE DOWNLOAD FULL SONG TO USB
            if (pathname === '/api/youtube/download' && req.method === 'POST') {
                const body = await parseBody(req);
                if (!body.ytId) return sendJson(res, 400, { error: 'Missing ytId' });

                const category = body.category || 'DJ';
                try {
                    await ytService.downloadTrack(body.ytId, category);
                    db.scanMusicDirectory();
                    return sendJson(res, 200, {
                        success: true,
                        message: 'Full track downloaded to USB!',
                        totalTracks: db.getAllTracks().length
                    });
                } catch (dlErr) {
                    console.error('YouTube download error:', dlErr.message);
                    return sendJson(res, 500, { error: dlErr.message });
                }
            }

            // ITUNES SEARCH ENDPOINT
            if (pathname === '/api/search/online' && req.method === 'GET') {
                const query = parsedUrl.searchParams.get('query');
                if (!query || query.trim().length < 2) {
                    return sendJson(res, 200, { results: [] });
                }

                const searchUrl = 'https://itunes.apple.com/search?term=' + encodeURIComponent(query.trim()) + '&media=music&limit=25';
                https.get(searchUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (apiRes) => {
                    let raw = '';
                    apiRes.on('data', chunk => raw += chunk);
                    apiRes.on('end', () => {
                        try {
                            const parsed = JSON.parse(raw);
                            const results = (parsed.results || [])
                                .filter(r => r.previewUrl)
                                .map(r => ({
                                    id: 'online_' + r.trackId,
                                    title: r.trackName,
                                    artist: r.artistName,
                                    album: r.collectionName,
                                    category: r.primaryGenreName || 'General',
                                    bpm: 124,
                                    duration: Math.round((r.trackTimeMillis || 30000) / 1000),
                                    artwork: r.artworkUrl100 ? r.artworkUrl100.replace('100x100bb', '300x300bb') : null,
                                    previewUrl: r.previewUrl,
                                    isOnline: true
                                }));
                            return sendJson(res, 200, { results });
                        } catch (parseErr) {
                            return sendJson(res, 500, { error: 'Failed to parse search results' });
                        }
                    });
                }).on('error', (err) => {
                    return sendJson(res, 502, { error: 'Search failed: ' + err.message });
                });
                return;
            }

            // IMPORT LOCAL AUDIO FILES DIRECTLY
            if (pathname === '/api/tracks/import-file' && req.method === 'POST') {
                const body = await parseBody(req);
                if (!body.filename || !body.base64Data) {
                    return sendJson(res, 400, { error: 'Missing filename or base64Data' });
                }

                const category = body.category || 'DJ';
                const catDir = path.join(resolver.getMusicDir(), category);
                if (!fs.existsSync(catDir)) fs.mkdirSync(catDir, { recursive: true });

                const safeFilename = body.filename.replace(/[/\\?%*:|"<>]/g, '_');
                const targetPath = path.join(catDir, safeFilename);

                const fileBuffer = Buffer.from(body.base64Data, 'base64');
                fs.writeFileSync(targetPath, fileBuffer);

                db.scanMusicDirectory();
                const relativePath = resolver.toPortablePath(targetPath);
                const imported = db.getAllTracks().find(t => t.relativePath === relativePath);

                return sendJson(res, 200, {
                    success: true,
                    track: imported,
                    totalTracks: db.getAllTracks().length
                });
            }

            if (pathname === '/api/tracks/scan' && req.method === 'POST') {
                db.scanMusicDirectory();
                return sendJson(res, 200, {
                    success: true,
                    trackCount: db.getAllTracks().length
                });
            }

            if (pathname === '/api/playlists' && req.method === 'GET') {
                const playlists = db.getPlaylists();
                const tracks = db.getAllTracks();
                const trackMap = new Map(tracks.map(t => [t.id, t]));
                const enriched = playlists.map(pl => ({
                    ...pl,
                    tracks: (pl.trackIds || []).map(id => trackMap.get(id)).filter(Boolean)
                }));
                return sendJson(res, 200, { playlists: enriched });
            }

            if (pathname === '/api/playlists' && req.method === 'POST') {
                const body = await parseBody(req);
                if (!body.name) return sendJson(res, 400, { error: 'Playlist name required' });
                const pl = db.createPlaylist(body.name, body.description || '');
                return sendJson(res, 201, { playlist: pl });
            }

            if (pathname === '/api/favorites' && req.method === 'GET') {
                return sendJson(res, 200, { favorites: db.getFavorites() });
            }

            if (pathname === '/api/favorites/toggle' && req.method === 'POST') {
                const body = await parseBody(req);
                const isFav = db.toggleFavorite(body.trackId);
                return sendJson(res, 200, { trackId: body.trackId, isFavorite: isFav });
            }

            if (pathname === '/api/history' && req.method === 'GET') {
                return sendJson(res, 200, { history: db.getHistory() });
            }

            if (pathname === '/api/history/log' && req.method === 'POST') {
                const body = await parseBody(req);
                const record = db.logPlayHistory(body.trackId, body.deck, body.duration);
                return sendJson(res, 200, { record });
            }

            if (pathname === '/api/session/state' && req.method === 'GET') {
                return sendJson(res, 200, { state: db.getLastSessionState() });
            }

            if (pathname === '/api/session/state' && req.method === 'POST') {
                const body = await parseBody(req);
                db.saveSessionState(body);
                return sendJson(res, 200, { success: true });
            }

            return sendJson(res, 404, { error: 'API route not found' });
        } catch (apiErr) {
            console.error('API Error:', apiErr);
            return sendJson(res, 500, { error: apiErr.message });
        }
    }

    // Audio file streaming route (/audio/...)
    if (pathname.startsWith('/audio/')) {
        const decodedPath = decodeURIComponent(pathname.replace(/^\/audio\//, ''));
        const fullAudioPath = resolver.toAbsolutePath(decodedPath);

        if (!fs.existsSync(fullAudioPath) || !fs.statSync(fullAudioPath).isFile()) {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            return res.end('Audio file not found: ' + decodedPath);
        }

        const stat = fs.statSync(fullAudioPath);
        const fileSize = stat.size;
        const ext = path.extname(fullAudioPath).toLowerCase();
        const contentType = MIME_TYPES[ext] || 'audio/wav';

        const range = req.headers.range;
        if (range) {
            const parts = range.replace(/bytes=/, "").split("-");
            const start = parseInt(parts[0], 10);
            const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
            const chunksize = (end - start) + 1;
            const fileStream = fs.createReadStream(fullAudioPath, { start, end });
            res.writeHead(206, {
                'Content-Range': `bytes ${start}-${end}/${fileSize}`,
                'Accept-Ranges': 'bytes',
                'Content-Length': chunksize,
                'Content-Type': contentType,
                'Access-Control-Allow-Origin': '*'
            });
            fileStream.pipe(res);
        } else {
            res.writeHead(200, {
                'Content-Length': fileSize,
                'Content-Type': contentType,
                'Accept-Ranges': 'bytes',
                'Access-Control-Allow-Origin': '*'
            });
            fs.createReadStream(fullAudioPath).pipe(res);
        }
        return;
    }

    // Static file serving from public directory
    let reqPath = pathname === '/' ? '/index.html' : pathname;
    const safePath = path.normalize(reqPath).replace(/^(\.\.[\/\\])+/, '');
    const publicFilePath = path.join(__dirname, 'public', safePath);

    if (fs.existsSync(publicFilePath) && fs.statSync(publicFilePath).isFile()) {
        const ext = path.extname(publicFilePath).toLowerCase();
        const contentType = MIME_TYPES[ext] || 'application/octet-stream';
        res.writeHead(200, { 'Content-Type': contentType });
        fs.createReadStream(publicFilePath).pipe(res);
    } else {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('404 Not Found');
    }
});

server.listen(PORT, '0.0.0.0', () => { 
    console.log(`====================================================`);
    console.log(` Anand Goud DJ - PORTABLE USB EDITION`);
    console.log(` Running at: http://127.0.0.1:${PORT}`);
    console.log(` USB Root:   ${resolver.getRoot()}`);
    console.log(` Tracks:     ${db.getAllTracks().length} available`);
    console.log(` YouTube Full Songs & DJ Remixes: ACTIVE`);
    console.log(`====================================================`);
});
