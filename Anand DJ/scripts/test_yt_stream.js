const { exec } = require('child_process');

function getStreamUrl(ytId) {
    return new Promise((resolve, reject) => {
        const cmd = `python -m yt_dlp --extractor-args "youtube:player_client=android" -g -f "ba/b" "https://www.youtube.com/watch?v=${ytId}"`;
        exec(cmd, { maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
            if (err) return reject(err);
            const urls = stdout.trim().split('\n').filter(u => u.startsWith('http'));
            resolve(urls[0]);
        });
    });
}

getStreamUrl('LpJ-D9DYAnM').then(url => {
    console.log('Stream URL extracted successfully!');
    console.log('URL starts with:', url.slice(0, 60) + '...');
}).catch(err => console.error('Error:', err.message));
