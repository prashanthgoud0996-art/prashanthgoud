const fs = require('fs');
const path = require('path');

class PortableDatabase {
    constructor(pathResolver) {
        this.resolver = pathResolver;
        this.dbFile = path.join(this.resolver.getDataDir(), 'djmusic.json');
        this.sqliteDbFile = path.join(this.resolver.getDataDir(), 'djmusic.db');
        this.stateFile = path.join(this.resolver.getSettingsDir(), 'last_session_state.json');
        this.settingsFile = path.join(this.resolver.getSettingsDir(), 'audio_settings.json');
        
        this.data = {
            tracks: [],
            categories: ['Telugu', 'Hindi', 'English', 'DJ', 'Band', 'New-Releases'],
            playlists: [
                {
                    id: 'pl_emergency_safe',
                    name: 'EMERGENCY EVENT SAFE LIST',
                    description: 'High-reliability emergency backup tracks guaranteed to keep crowd energized',
                    trackIds: []
                },
                {
                    id: 'pl_primetime',
                    name: 'Main Prime-Time Event Set',
                    description: 'Curated high-energy hits for prime event slots',
                    trackIds: []
                }
            ],
            favorites: [],
            history: [],
            settings: {
                audioDevice: 'default',
                masterVolume: 0.85,
                crossfaderCurve: 'equal_power',
                bufferLatency: 'low'
            }
        };

        this.init();
    }

    init() {
        // Ensure directories exist
        const dirs = [
            this.resolver.getDataDir(),
            this.resolver.getMusicDir(),
            this.resolver.getArtworkDir(),
            this.resolver.getSettingsDir(),
            this.resolver.getLogsDir(),
            path.join(this.resolver.getDataDir(), 'playlists'),
            path.join(this.resolver.getDataDir(), 'favorites'),
            path.join(this.resolver.getDataDir(), 'history')
        ];
        for (const dir of dirs) {
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        }

        // Load existing database if available
        if (fs.existsSync(this.dbFile)) {
            try {
                const raw = fs.readFileSync(this.dbFile, 'utf8');
                const parsed = JSON.parse(raw);
                this.data = { ...this.data, ...parsed };
            } catch (err) {
                console.error('Error loading db file, reinitializing:', err.message);
            }
        }

        // Scan music directory initially
        this.scanMusicDirectory();
        this.save();
    }

    save() {
        try {
            fs.writeFileSync(this.dbFile, JSON.stringify(this.data, null, 2), 'utf8');
            // Write a simulated SQLite compatible binary/header mirror into djmusic.db
            const header = Buffer.from(`-- DJ Music System Portable Database (SQLite Sync Mirror)\n-- Auto-generated: ${new Date().toISOString()}\n-- Tracks count: ${this.data.tracks.length}\n`);
            const payload = Buffer.from(JSON.stringify(this.data));
            fs.writeFileSync(this.sqliteDbFile, Buffer.concat([header, payload]));
        } catch (err) {
            console.error('Failed to save database:', err.message);
        }
    }

    scanMusicDirectory() {
        const musicDir = this.resolver.getMusicDir();
        if (!fs.existsSync(musicDir)) return;

        const supportedExts = new Set(['.mp3', '.wav', '.ogg', '.flac', '.aac', '.m4a', '.mp4', '.webm']);
        const foundTracks = [];

        const scanRecursive = (dir, category = 'General') => {
            const entries = fs.readdirSync(dir, { withFileTypes: true });
            for (const entry of entries) {
                const fullPath = path.join(dir, entry.name);
                if (entry.isDirectory()) {
                    const catName = entry.name;
                    scanRecursive(fullPath, catName);
                } else if (entry.isFile()) {
                    const ext = path.extname(entry.name).toLowerCase();
                    if (supportedExts.has(ext)) {
                        const relativePath = this.resolver.toPortablePath(fullPath);
                        const baseName = path.basename(entry.name, ext);
                        
                        // Parse artist - title if formatted
                        let title = baseName.replace(/_/g, ' ');
                        let artist = 'DJ Library';
                        let bpm = 120;

                        // Try extracting BPM from filename like "Track_128BPM.wav"
                        const bpmMatch = baseName.match(/(\d{2,3})\s*BPM/i);
                        if (bpmMatch) {
                            bpm = parseInt(bpmMatch[1], 10);
                        }

                        // Check if track already exists in db
                        const existing = this.data.tracks.find(t => t.relativePath === relativePath);
                        if (existing) {
                            foundTracks.push(existing);
                        } else {
                            const newTrack = {
                                id: 'trk_' + Buffer.from(relativePath).toString('hex').slice(0, 12),
                                title: title,
                                artist: artist,
                                category: category,
                                bpm: bpm,
                                duration: 15, // default estimated
                                relativePath: relativePath,
                                filename: entry.name,
                                dateAdded: new Date().toISOString()
                            };
                            foundTracks.push(newTrack);
                        }
                    }
                }
            }
        };

        scanRecursive(musicDir);
        this.data.tracks = foundTracks;

        // Populate emergency playlist with first few tracks if empty
        const emergencyPl = this.data.playlists.find(p => p.id === 'pl_emergency_safe');
        if (emergencyPl && (!emergencyPl.trackIds || emergencyPl.trackIds.length === 0)) {
            emergencyPl.trackIds = this.data.tracks.map(t => t.id);
        }
        
        this.save();
    }

    getAllTracks() {
        return this.data.tracks;
    }

    getTrackById(id) {
        return this.data.tracks.find(t => t.id === id);
    }

    getPlaylists() {
        return this.data.playlists;
    }

    createPlaylist(name, description = '') {
        const pl = {
            id: 'pl_' + Date.now().toString(36),
            name,
            description,
            trackIds: [],
            createdAt: new Date().toISOString()
        };
        this.data.playlists.push(pl);
        this.save();
        return pl;
    }

    addTrackToPlaylist(playlistId, trackId) {
        const pl = this.data.playlists.find(p => p.id === playlistId);
        if (pl && !pl.trackIds.includes(trackId)) {
            pl.trackIds.push(trackId);
            this.save();
        }
        return pl;
    }

    getFavorites() {
        return this.data.favorites;
    }

    toggleFavorite(trackId) {
        const idx = this.data.favorites.indexOf(trackId);
        if (idx >= 0) {
            this.data.favorites.splice(idx, 1);
        } else {
            this.data.favorites.push(trackId);
        }
        this.save();
        return this.data.favorites.includes(trackId);
    }

    logPlayHistory(trackId, deckName = 'Deck A', durationPlayed = 0) {
        const track = this.getTrackById(trackId);
        const record = {
            id: 'hist_' + Date.now(),
            trackId,
            title: track ? track.title : 'Unknown',
            artist: track ? track.artist : 'Unknown',
            category: track ? track.category : 'General',
            deck: deckName,
            timestamp: new Date().toISOString(),
            duration: durationPlayed
        };
        this.data.history.unshift(record);
        if (this.data.history.length > 200) this.data.history.pop();
        this.save();
        return record;
    }

    getHistory() {
        return this.data.history;
    }

    saveSessionState(state) {
        try {
            const enriched = {
                ...state,
                updatedAt: new Date().toISOString(),
                usbRoot: this.resolver.getRoot()
            };
            fs.writeFileSync(this.stateFile, JSON.stringify(enriched, null, 2), 'utf8');
            return true;
        } catch (err) {
            console.error('Failed to save session state:', err.message);
            return false;
        }
    }

    getLastSessionState() {
        if (fs.existsSync(this.stateFile)) {
            try {
                return JSON.parse(fs.readFileSync(this.stateFile, 'utf8'));
            } catch (err) {
                console.error('Failed to read last session state:', err.message);
            }
        }
        return null;
    }
}

module.exports = PortableDatabase;

