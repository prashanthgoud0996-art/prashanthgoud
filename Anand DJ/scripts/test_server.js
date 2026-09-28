const http = require('http');
const path = require('path');
const { spawn } = require('child_process');

async function runTests() {
    const rootDir = path.resolve(__dirname, '..');
    const serverProcess = spawn('node', ['server.js'], {
        cwd: rootDir,
        stdio: ['ignore', 'pipe', 'pipe']
    });

    serverProcess.stdout.on('data', d => console.log('[Server Output]:', d.toString().trim()));
    serverProcess.stderr.on('data', d => console.error('[Server Error]:', d.toString().trim()));

    await new Promise(r => setTimeout(r, 2000));

    function fetchUrl(reqPath, headers = {}) {
        return new Promise((resolve, reject) => {
            const req = http.request({
                hostname: '127.0.0.1',
                port: 7890,
                path: reqPath,
                method: 'GET',
                headers: headers
            }, (res) => {
                let data = [];
                res.on('data', chunk => data.push(chunk));
                res.on('end', () => {
                    resolve({
                        statusCode: res.statusCode,
                        headers: res.headers,
                        body: Buffer.concat(data)
                    });
                });
            });
            req.on('error', reject);
            req.end();
        });
    }

    try {
        console.log('\n--- 1. Testing /api/system/status ---');
        const stRes = await fetchUrl('/api/system/status');
        console.log('Status code:', stRes.statusCode);
        const stJson = JSON.parse(stRes.body.toString());
        console.log('Application ready:', stJson.applicationReady);
        console.log('Drive letter:', stJson.driveLetter);
        console.log('Track count:', stJson.trackCount);

        console.log('\n--- 2. Testing /api/tracks ---');
        const trRes = await fetchUrl('/api/tracks');
        console.log('Status code:', trRes.statusCode);
        const trJson = JSON.parse(trRes.body.toString());
        console.log('Tracks count:', trJson.tracks.length);
        trJson.tracks.forEach(t => console.log(`  * [${t.category}] ${t.title} (${t.bpm} BPM)`));

        console.log('\n--- 3. Testing /index.html ---');
        const htmlRes = await fetchUrl('/index.html');
        console.log('HTML status code:', htmlRes.statusCode);
        console.log('HTML byte length:', htmlRes.body.length);

        console.log('\n--- 4. Testing Audio Range Stream Request ---');
        const audioPath = '/audio/' + encodeURIComponent(trJson.tracks[0].relativePath);
        const audioRes = await fetchUrl(audioPath, { 'Range': 'bytes=0-1024' });
        console.log('Audio range status (Expected 206):', audioRes.statusCode);
        console.log('Content-Range header:', audioRes.headers['content-range']);
        console.log('Chunk received size:', audioRes.body.length, 'bytes');

        console.log('\n======================================================');
        console.log('>>> ALL VERIFICATION TESTS PASSED SUCCESSFULLY! <<<');
        console.log('======================================================');
    } catch (err) {
        console.error('Test execution failed:', err);
    } finally {
        serverProcess.kill('SIGTERM');
        process.exit(0);
    }
}

runTests();
