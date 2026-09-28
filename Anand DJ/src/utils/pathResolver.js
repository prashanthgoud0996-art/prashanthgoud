const path = require('path');
const fs = require('fs');

/**
 * Portable USB Root Resolver
 * Dynamically resolves paths relative to the portable application root,
 * ensuring complete drive-letter independence (e.g. D:\, E:\, F:\ or C:\).
 */
class PathResolver {
    constructor(baseDir) {
        // Use provided baseDir or directory of this app
        this.usbRoot = baseDir || path.resolve(__dirname, '..', '..');
    }

    getRoot() {
        return this.usbRoot;
    }

    getDataDir() {
        return path.join(this.usbRoot, 'Data');
    }

    getMusicDir() {
        return path.join(this.usbRoot, 'Music');
    }

    getArtworkDir() {
        return path.join(this.usbRoot, 'Artwork');
    }

    getSettingsDir() {
        return path.join(this.usbRoot, 'Settings');
    }

    getLogsDir() {
        return path.join(this.usbRoot, 'Logs');
    }

    getDbPath() {
        return path.join(this.getDataDir(), 'djmusic.db');
    }

    /**
     * Converts an absolute system path to a portable relative path.
     * e.g. "E:\DJ-MUSIC-USB\Music\Telugu\song.mp3" -> "Music/Telugu/song.mp3"
     */
    toPortablePath(absolutePath) {
        const relative = path.relative(this.usbRoot, absolutePath);
        return relative.replace(/\\/g, '/');
    }

    /**
     * Resolves a portable relative path to the current machine's absolute path.
     * e.g. "Music/Telugu/song.mp3" -> "D:\DJ-MUSIC-USB\Music\Telugu\song.mp3"
     */
    toAbsolutePath(portablePath) {
        const normalized = portablePath.replace(/\//g, path.sep);
        return path.join(this.usbRoot, normalized);
    }
}

module.exports = PathResolver;
