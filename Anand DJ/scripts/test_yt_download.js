const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');

function downloadYouTube(ytId, category = 'DJ') {
    return new Promise((resolve, reject) => {
        const outDir = path.join('C:\\Anand DJ\\Music', category);
        if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
        const outTemplate = path.join(outDir, '%(title)s.%(ext)s');
        const cmd = `python -m yt_dlp --extractor-args "youtube:player_client=android" -f "ba/b" -o "${outTemplate}" "https://www.youtube.com/watch?v=${ytId}"`;
        exec(cmd, { maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
            if (err) return reject(err);
            resolve(stdout);
        });
    });
}

console.log('Downloading test track from YouTube...');
downloadYouTube('LpJ-D9DYAnM', 'DJ').then(out => {
    console.log('Download complete!');
    const files = fs.readdirSync('C:\\Anand DJ\\Music\\DJ');
    console.log('DJ folder contents:', files);
}).catch(err => console.error('Download error:', err.message));
