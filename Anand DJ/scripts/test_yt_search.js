const { exec } = require('child_process');

function searchYouTube(query) {
    return new Promise((resolve, reject) => {
        const cmd = `python -m yt_dlp "ytsearch5:${query}" --dump-json --flat-playlist --skip-download`;
        exec(cmd, { maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
            if (err) return reject(err);
            const lines = stdout.trim().split('\n').filter(Boolean);
            const results = lines.map(line => {
                try {
                    const item = JSON.parse(line);
                    return {
                        id: item.id,
                        title: item.title,
                        channel: item.channel,
                        duration: item.duration,
                        durationString: item.duration_string
                    };
                } catch(e) { return null; }
            }).filter(Boolean);
            resolve(results);
        });
    });
}

searchYouTube('Telugu Mass DJ Song 2026').then(res => {
    console.log('YouTube search returned', res.length, 'results:');
    res.forEach(r => console.log(` * [${r.durationString}] ${r.title} (${r.channel})`));
}).catch(err => console.error('Error:', err.message));
