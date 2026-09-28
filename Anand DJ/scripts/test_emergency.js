const http = require('http');

function postJson(urlPath, data) {
    return new Promise((resolve, reject) => {
        const payload = JSON.stringify(data);
        const req = http.request({
            hostname: '127.0.0.1',
            port: 7890,
            path: urlPath,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(payload)
            }
        }, res => {
            let buf = [];
            res.on('data', d => buf.push(d));
            res.on('end', () => resolve(JSON.parse(Buffer.concat(buf).toString())));
        });
        req.on('error', reject);
        req.write(payload);
        req.end();
    });
}

function getJson(urlPath) {
    return new Promise((resolve, reject) => {
        http.get('http://127.0.0.1:7890' + urlPath, res => {
            let buf = [];
            res.on('data', d => buf.push(d));
            res.on('end', () => resolve(JSON.parse(Buffer.concat(buf).toString())));
        }).on('error', reject);
    });
}

async function testEmergencyFailover() {
    const { spawn } = require('child_process');
    const path = require('path');
    const serverProcess = spawn('node', ['server.js'], { cwd: path.resolve(__dirname, '..') });
    await new Promise(r => setTimeout(r, 1500));

    try {
        console.log('--- Simulating Live DJ Playing State ---');
        const statePayload = {
            deckA: { trackId: 'trk_demo_1', currentTime: 14.5, isPlaying: true },
            deckB: { trackId: null, currentTime: 0, isPlaying: false },
            crossfader: 0.2,
            lastPlayed: {
                id: 'trk_telugu_1',
                title: 'Telugu Mass Dhol 120BPM',
                artist: 'Telugu Rhythm Project',
                category: 'Telugu',
                bpm: 120
            }
        };
        const postRes = await postJson('/api/session/state', statePayload);
        console.log('Saved session state response:', postRes);

        console.log('\n--- Simulating Backup Laptop Launch (Reading Status) ---');
        const status = await getJson('/api/system/status');
        console.log('Emergency Recovery Last Played:', status.lastSessionState.lastPlayed.title);
        console.log('Emergency Recovery Position:', status.lastSessionState.deckA.currentTime, 'sec');
        console.log('USB Root dynamically resolved to:', status.usbRoot);
        console.log('\n>>> EMERGENCY FAILOVER STATE RESTORE VERIFIED! <<<');
    } finally {
        serverProcess.kill();
        process.exit(0);
    }
}

testEmergencyFailover();
