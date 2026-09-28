const fs = require('fs');
const path = require('path');

function createWavBuffer(sampleRate, durationSec, noteGenerator) {
    const numChannels = 2;
    const bytesPerSample = 2; // 16-bit PCM
    const totalSamples = Math.floor(sampleRate * durationSec);
    const blockAlign = numChannels * bytesPerSample;
    const byteRate = sampleRate * blockAlign;
    const dataSize = totalSamples * blockAlign;
    const buffer = Buffer.alloc(44 + dataSize);

    buffer.write('RIFF', 0);
    buffer.writeUInt32LE(36 + dataSize, 4);
    buffer.write('WAVE', 8);

    buffer.write('fmt ', 12);
    buffer.writeUInt32LE(16, 16);
    buffer.writeUInt16LE(1, 20);
    buffer.writeUInt16LE(numChannels, 22);
    buffer.writeUInt32LE(sampleRate, 24);
    buffer.writeUInt32LE(byteRate, 28);
    buffer.writeUInt16LE(blockAlign, 32);
    buffer.writeUInt16LE(16, 34);

    buffer.write('data', 36);
    buffer.writeUInt32LE(dataSize, 40);

    let offset = 44;
    for (let i = 0; i < totalSamples; i++) {
        const t = i / sampleRate;
        const [left, right] = noteGenerator(t, i, totalSamples);
        const lInt = Math.max(-32768, Math.min(32767, Math.floor(left * 32767)));
        const rInt = Math.max(-32768, Math.min(32767, Math.floor(right * 32767)));
        buffer.writeInt16LE(lInt, offset);
        buffer.writeInt16LE(rInt, offset + 2);
        offset += 4;
    }
    return buffer;
}

const sampleRate = 44100;
const musicDir = path.join(__dirname, '..', 'Music');

const demoTracks = [
    {
        category: 'DJ',
        filename: 'Club_EDM_Drop_128BPM.wav',
        title: 'Neon Pulse (Club Mix)',
        artist: 'DJ Antigravity',
        bpm: 128,
        duration: 15,
        generator: (t) => {
            const beat = (t * 128 / 60) % 1;
            const kickEnv = Math.max(0, 1 - beat * 4);
            const kickFreq = 150 * Math.exp(-beat * 15) + 40;
            const kick = Math.sin(2 * Math.PI * kickFreq * t) * kickEnv * 0.8;
            const offbeat = ((t * 128 / 60) + 0.5) % 1;
            const hatEnv = Math.max(0, 1 - offbeat * 10);
            const hat = (Math.random() * 2 - 1) * hatEnv * 0.2;
            const bassNote = 55 * (1 + Math.floor((t * 128 / 60) % 4) * 0.25);
            const bass = Math.sin(2 * Math.PI * bassNote * t) * 0.3;
            const val = kick + hat + bass;
            return [val * 0.7, val * 0.7];
        }
    },
    {
        category: 'Telugu',
        filename: 'Telugu_Mass_Dhol_120BPM.wav',
        title: 'Hyderabad Dhol Beats',
        artist: 'Telugu Rhythm Project',
        bpm: 120,
        duration: 15,
        generator: (t) => {
            const beat = (t * 120 / 60) % 1;
            const dholEnv = Math.max(0, 1 - beat * 3);
            const dhol = Math.sin(2 * Math.PI * 75 * t) * dholEnv * 0.7;
            const clickPos = ((t * 120 / 60) * 2) % 1;
            const clickEnv = Math.max(0, 1 - clickPos * 12);
            const click = Math.sin(2 * Math.PI * 440 * t) * clickEnv * 0.35;
            const drone = Math.sin(2 * Math.PI * 220 * t) * 0.15;
            return [(dhol + click + drone) * 0.65, (dhol - click + drone) * 0.65];
        }
    },
    {
        category: 'Hindi',
        filename: 'Bollywood_Party_Groove_125BPM.wav',
        title: 'Mumbai Night Grooves',
        artist: 'Bollywood Sound Lab',
        bpm: 125,
        duration: 15,
        generator: (t) => {
            const beat = (t * 125 / 60) % 1;
            const kickEnv = Math.max(0, 1 - beat * 3.5);
            const kick = Math.sin(2 * Math.PI * 90 * t) * kickEnv * 0.75;
            const shaker = (Math.sin(2 * Math.PI * 1800 * t) + Math.random() * 0.5) * 0.15;
            const brass = Math.sin(2 * Math.PI * 330 * t) * 0.25 * ((Math.floor(t * 125 / 60) % 2 === 0) ? 1 : 0);
            return [(kick + shaker + brass) * 0.6, (kick - shaker + brass) * 0.6];
        }
    },
    {
        category: 'English',
        filename: 'Festival_Anthem_115BPM.wav',
        title: 'Electric Horizons',
        artist: 'Starlight Collective',
        bpm: 115,
        duration: 15,
        generator: (t) => {
            const beat = (t * 115 / 60) % 1;
            const kick = Math.sin(2 * Math.PI * (120 * Math.exp(-beat * 8) + 45) * t) * Math.max(0, 1 - beat * 4) * 0.8;
            const synthArp = Math.sin(2 * Math.PI * (440 + ((Math.floor(t * 4) % 4) * 110)) * t) * 0.25;
            return [(kick + synthArp) * 0.65, (kick + synthArp * 0.9) * 0.65];
        }
    },
    {
        category: 'Band',
        filename: 'Live_Pad_Rhythm_100BPM.wav',
        title: 'Acoustic Pad Celebration',
        artist: 'Event Brass Band',
        bpm: 100,
        duration: 15,
        generator: (t) => {
            const beat = (t * 100 / 60) % 1;
            const padBass = Math.sin(2 * Math.PI * 65 * t) * Math.max(0, 1 - beat * 2) * 0.6;
            const rimshot = ((Math.floor(t * 100 / 60) % 2 === 1) ? Math.max(0, 1 - beat * 12) * Math.sin(2 * Math.PI * 800 * t) * 0.5 : 0);
            const padWarmth = Math.sin(2 * Math.PI * 196 * t) * 0.2;
            return [(padBass + rimshot + padWarmth) * 0.65, (padBass + rimshot + padWarmth) * 0.65];
        }
    },
    {
        category: 'New-Releases',
        filename: 'Summer_Remix_2026_130BPM.wav',
        title: 'Sunrise Euphoria (2026 Edit)',
        artist: 'Future Beat Project',
        bpm: 130,
        duration: 15,
        generator: (t) => {
            const beat = (t * 130 / 60) % 1;
            const punch = Math.sin(2 * Math.PI * 110 * t) * Math.max(0, 1 - beat * 5) * 0.8;
            const lead = Math.sin(2 * Math.PI * 587.33 * t) * 0.2;
            const noise = (Math.random() * 2 - 1) * Math.max(0, 1 - beat * 8) * 0.15;
            return [(punch + lead + noise) * 0.7, (punch + lead - noise) * 0.7];
        }
    }
];

for (const track of demoTracks) {
    const catDir = path.join(musicDir, track.category);
    if (!fs.existsSync(catDir)) fs.mkdirSync(catDir, { recursive: true });
    const filePath = path.join(catDir, track.filename);
    const wav = createWavBuffer(sampleRate, track.duration, track.generator);
    fs.writeFileSync(filePath, wav);
    console.log(`Generated: ${track.category}/${track.filename}`);
}
console.log('ALL DEMO TRACKS GENERATED');
