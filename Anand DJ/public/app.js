// DJ Music System — Portable Web Audio Engine & YouTube Full Songs Controller
document.addEventListener('DOMContentLoaded', () => {
    let audioCtx = null;
    let masterGain = null;
    let masterAnalyser = null;

    class DeckChannel {
        constructor(id, audioEl, isDeckA = true) {
            this.id = id;
            this.audio = audioEl;
            this.isDeckA = isDeckA;
            this.track = null;
            this.isPlaying = false;
            this.cuePosition = 0;
            this.loop = { active: false, beats: 4, start: 0, end: 0 };
            this.pitch = 0;
            this.baseBpm = 120;
            this.jogAngle = 0;
            this.isDraggingJog = false;

            this.sourceNode = null;
            this.trimGain = null;
            this.hiFilter = null;
            this.midFilter = null;
            this.lowFilter = null;
            this.channelGain = null;
            this.deckFaderGain = null;
            this.analyser = null;

            this.kills = { hi: false, mid: false, low: false };
        }

        initNodes(ctx) {
            this.sourceNode = ctx.createMediaElementSource(this.audio);
            
            this.trimGain = ctx.createGain();
            this.trimGain.gain.value = 1.0;

            this.lowFilter = ctx.createBiquadFilter();
            this.lowFilter.type = 'lowshelf';
            this.lowFilter.frequency.value = 100;
            this.lowFilter.gain.value = 0;

            this.midFilter = ctx.createBiquadFilter();
            this.midFilter.type = 'peaking';
            this.midFilter.frequency.value = 1000;
            this.midFilter.Q.value = 1.0;
            this.midFilter.gain.value = 0;

            this.hiFilter = ctx.createBiquadFilter();
            this.hiFilter.type = 'highshelf';
            this.hiFilter.frequency.value = 10000;
            this.hiFilter.gain.value = 0;

            this.deckFaderGain = ctx.createGain();
            this.deckFaderGain.gain.value = 0.9;

            this.channelGain = ctx.createGain();
            this.channelGain.gain.value = 1.0;

            this.analyser = ctx.createAnalyser();
            this.analyser.fftSize = 64;

            this.sourceNode.connect(this.trimGain);
            this.trimGain.connect(this.lowFilter);
            this.lowFilter.connect(this.midFilter);
            this.midFilter.connect(this.hiFilter);
            this.hiFilter.connect(this.deckFaderGain);
            this.deckFaderGain.connect(this.channelGain);
            this.channelGain.connect(this.analyser);
            this.analyser.connect(masterGain);
        }

        async loadTrack(track) {
            this.track = track;
            this.baseBpm = track.bpm || 120;
            this.cuePosition = 0;
            this.loop.active = false;
            
            const prefix = this.isDeckA ? 'deck-a' : 'deck-b';
            const titleEl = document.getElementById(`${prefix}-title`);
            const artistEl = document.getElementById(`${prefix}-artist`);

            if (track.isYouTube) {
                titleEl.textContent = 'CONNECTING TO YOUTUBE AUDIO...';
                artistEl.textContent = track.title;
                try {
                    const streamRes = await fetch(`/api/youtube/stream?id=${encodeURIComponent(track.ytId)}`);
                    const streamData = await streamRes.json();
                    if (streamData.streamUrl) {
                        this.audio.src = streamData.streamUrl;
                    } else {
                        throw new Error(streamData.error || 'Failed to fetch YouTube audio stream');
                    }
                } catch (streamErr) {
                    titleEl.textContent = 'STREAM ERROR';
                    artistEl.textContent = streamErr.message;
                    return;
                }
            } else if (track.isOnline) {
                this.audio.src = track.previewUrl;
            } else {
                this.audio.src = `/audio/${encodeURIComponent(track.relativePath)}`;
            }

            this.audio.playbackRate = 1 + (this.pitch / 100);
            this.audio.load();

            this.updateUi();
            saveSessionStateDebounced();
        }

        updateUi() {
            const prefix = this.isDeckA ? 'deck-a' : 'deck-b';
            const titleEl = document.getElementById(`${prefix}-title`);
            const artistEl = document.getElementById(`${prefix}-artist`);
            const bpmEl = document.getElementById(`${prefix}-bpm`);

            if (this.track) {
                const sourceTag = this.track.isYouTube ? '▶ YOUTUBE' : (this.track.isOnline ? '🌐 CLOUD' : '💾 USB');
                titleEl.textContent = this.track.title;
                artistEl.textContent = `${this.track.artist} • [${sourceTag} • ${this.track.category}]`;
                const dynamicBpm = (this.baseBpm * (1 + this.pitch / 100)).toFixed(1);
                bpmEl.textContent = dynamicBpm;
            } else {
                titleEl.textContent = 'NO TRACK LOADED';
                artistEl.textContent = 'Search any YouTube DJ remix or song below';
                bpmEl.textContent = '---.--';
            }
        }

        play() {
            initAudioContext();
            if (!this.track) return;
            this.audio.play().then(() => {
                this.isPlaying = true;
                const btn = document.getElementById(this.isDeckA ? 'deck-a-play' : 'deck-b-play');
                btn.classList.add('playing');
                btn.innerHTML = '❚❚ PAUSE';
                if (!this.track.isOnline && !this.track.isYouTube) {
                    fetch('/api/history/log', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            trackId: this.track.id,
                            deck: this.isDeckA ? 'Deck A' : 'Deck B',
                            duration: this.audio.duration || 0
                        })
                    }).catch(() => {});
                }
            }).catch(e => console.error('Play error:', e));
        }

        pause() {
            this.audio.pause();
            this.isPlaying = false;
            const btn = document.getElementById(this.isDeckA ? 'deck-a-play' : 'deck-b-play');
            btn.classList.remove('playing');
            btn.innerHTML = '▶ PLAY';
        }

        togglePlay() {
            if (this.isPlaying) this.pause();
            else this.play();
        }

        cueDown() {
            initAudioContext();
            if (!this.track) return;
            if (this.isPlaying) {
                this.pause();
                this.audio.currentTime = this.cuePosition;
            } else {
                this.cuePosition = this.audio.currentTime;
                this.play();
            }
        }

        cueUp() {
            if (this.isPlaying) {
                this.pause();
                this.audio.currentTime = this.cuePosition;
            }
        }

        setPitch(val) {
            this.pitch = parseFloat(val);
            if (this.audio) {
                this.audio.playbackRate = Math.max(0.5, Math.min(2.0, 1 + (this.pitch / 100)));
            }
            const prefix = this.isDeckA ? 'deck-a' : 'deck-b';
            const pitchValEl = document.getElementById(`${prefix}-pitch-val`);
            const bpmEl = document.getElementById(`${prefix}-bpm`);
            pitchValEl.textContent = `${this.pitch >= 0 ? '+' : ''}${this.pitch.toFixed(1)}%`;
            if (this.track) {
                bpmEl.textContent = (this.baseBpm * (1 + this.pitch / 100)).toFixed(1);
            }
        }

        setLoopBeats(beats) {
            this.loop.beats = parseFloat(beats);
            if (this.loop.active && this.isPlaying) {
                const beatDuration = 60 / (this.baseBpm * (1 + this.pitch / 100));
                this.loop.start = this.audio.currentTime;
                this.loop.end = this.loop.start + (beatDuration * this.loop.beats);
            }
        }

        toggleLoop() {
            this.loop.active = !this.loop.active;
            const prefix = this.isDeckA ? 'deck-a' : 'deck-b';
            const btn = document.getElementById(`${prefix}-loop-toggle`);
            if (this.loop.active) {
                btn.style.background = '#00e676';
                btn.style.color = '#000';
                btn.textContent = 'ACTIVE';
                const beatDuration = 60 / (this.baseBpm * (1 + this.pitch / 100));
                this.loop.start = this.audio.currentTime;
                this.loop.end = this.loop.start + (beatDuration * this.loop.beats);
            } else {
                btn.style.background = 'transparent';
                btn.style.color = '#4facfe';
                btn.textContent = 'LOOP';
            }
        }

        checkLoop() {
            if (this.loop.active && this.isPlaying) {
                if (this.audio.currentTime >= this.loop.end) {
                    this.audio.currentTime = this.loop.start;
                }
            }
        }
    }

    const deckA = new DeckChannel('A', document.getElementById('audio-deck-a'), true);
    const deckB = new DeckChannel('B', document.getElementById('audio-deck-b'), false);

    function initAudioContext() {
        if (!audioCtx) {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            audioCtx = new AudioContext();

            masterGain = audioCtx.createGain();
            masterGain.gain.value = 0.9;

            masterAnalyser = audioCtx.createAnalyser();
            masterAnalyser.fftSize = 64;

            masterGain.connect(masterAnalyser);
            masterAnalyser.connect(audioCtx.destination);

            deckA.initNodes(audioCtx);
            deckB.initNodes(audioCtx);

            updateCrossfader(document.getElementById('crossfader').value);
            startVuAndWaveformAnimation();
            populateAudioOutputDevices();
        }
        if (audioCtx.state === 'suspended') {
            audioCtx.resume();
        }
    }

    async function populateAudioOutputDevices() {
        const select = document.getElementById('audio-device-select');
        if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) return;
        try {
            const devices = await navigator.mediaDevices.enumerateDevices();
            const audioOutputs = devices.filter(d => d.kind === 'audiooutput');
            if (audioOutputs.length > 0) {
                select.innerHTML = '';
                audioOutputs.forEach((dev, idx) => {
                    const opt = document.createElement('option');
                    opt.value = dev.deviceId;
                    opt.textContent = dev.label || `Audio Output ${idx + 1}`;
                    select.appendChild(opt);
                });
            }
        } catch (e) {
            console.warn('Enumerate audio devices failed:', e);
        }
    }

    function updateCrossfader(val) {
        const x = parseFloat(val);
        const gainA = Math.cos(x * 0.5 * Math.PI);
        const gainB = Math.sin(x * 0.5 * Math.PI);

        if (deckA.channelGain && audioCtx) deckA.channelGain.gain.setTargetAtTime(gainA, audioCtx.currentTime, 0.01);
        if (deckB.channelGain && audioCtx) deckB.channelGain.gain.setTargetAtTime(gainB, audioCtx.currentTime, 0.01);
    }

    let saveTimeout = null;
    function saveSessionStateDebounced() {
        clearTimeout(saveTimeout);
        saveTimeout = setTimeout(() => {
            const state = {
                deckA: {
                    trackId: deckA.track ? deckA.track.id : null,
                    currentTime: deckA.audio ? deckA.audio.currentTime : 0,
                    isPlaying: deckA.isPlaying
                },
                deckB: {
                    trackId: deckB.track ? deckB.track.id : null,
                    currentTime: deckB.audio ? deckB.audio.currentTime : 0,
                    isPlaying: deckB.isPlaying
                },
                crossfader: document.getElementById('crossfader').value,
                lastPlayed: deckA.track || deckB.track
            };
            fetch('/api/session/state', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(state)
            }).catch(() => {});
        }, 1000);
    }

    function syncDecks(targetDeck, sourceDeck) {
        if (!sourceDeck.track || !targetDeck.track) return;
        const sourceCurrentBpm = sourceDeck.baseBpm * (1 + sourceDeck.pitch / 100);
        const targetPitchNeeded = ((sourceCurrentBpm / targetDeck.baseBpm) - 1) * 100;
        const clampedPitch = Math.max(-16, Math.min(16, targetPitchNeeded));
        
        targetDeck.setPitch(clampedPitch);
        const prefix = targetDeck.isDeckA ? 'deck-a' : 'deck-b';
        document.getElementById(`${prefix}-pitch`).value = clampedPitch;
    }

    const canvasA = document.getElementById('waveform-deck-a');
    const ctxA = canvasA.getContext('2d');
    const canvasB = document.getElementById('waveform-deck-b');
    const ctxB = canvasB.getContext('2d');

    const meterA = document.getElementById('meter-deck-a');
    const meterB = document.getElementById('meter-deck-b');
    const vuMasterL = document.getElementById('vu-master-l');
    const vuMasterR = document.getElementById('vu-master-r');

    function drawWaveform(deck, canvas, ctx, colorHex) {
        const w = canvas.width;
        const h = canvas.height;
        ctx.clearRect(0, 0, w, h);

        ctx.strokeStyle = '#1a2233';
        ctx.beginPath();
        ctx.moveTo(0, h / 2);
        ctx.lineTo(w, h / 2);
        ctx.stroke();

        const duration = deck.audio.duration || 180;
        const currentTime = deck.audio.currentTime || 0;
        const progress = Math.min(1, Math.max(0, currentTime / duration));

        const numBars = 65;
        const barWidth = w / numBars;
        for (let i = 0; i < numBars; i++) {
            const barProgress = i / numBars;
            const seed = Math.sin(i * 0.45) * 0.5 + Math.cos(i * 1.3) * 0.3 + 0.5;
            const barH = Math.max(5, seed * (h - 16));

            ctx.fillStyle = barProgress <= progress ? colorHex : '#232f46';
            ctx.fillRect(i * barWidth + 1, (h - barH) / 2, barWidth - 2, barH);
        }

        const cursorX = progress * w;
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(cursorX, 0);
        ctx.lineTo(cursorX, h);
        ctx.stroke();

        if (deck.cuePosition > 0) {
            const cueX = (deck.cuePosition / duration) * w;
            ctx.fillStyle = '#ffab00';
            ctx.beginPath();
            ctx.moveTo(cueX - 4, 0);
            ctx.lineTo(cueX + 4, 0);
            ctx.lineTo(cueX, 8);
            ctx.closePath();
            ctx.fill();
        }
    }

    function formatTime(sec) {
        if (isNaN(sec) || sec < 0) sec = 0;
        const m = Math.floor(sec / 60);
        const s = Math.floor(sec % 60);
        return `${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;
    }

    function startVuAndWaveformAnimation() {
        const dataArrA = new Uint8Array(deckA.analyser.frequencyBinCount);
        const dataArrB = new Uint8Array(deckB.analyser.frequencyBinCount);
        const dataArrM = new Uint8Array(masterAnalyser.frequencyBinCount);

        function render() {
            drawWaveform(deckA, canvasA, ctxA, '#00f2fe');
            drawWaveform(deckB, canvasB, ctxB, '#ff7a18');

            document.getElementById('deck-a-elapsed').textContent = formatTime(deckA.audio.currentTime);
            document.getElementById('deck-a-remaining').textContent = '-' + formatTime((deckA.audio.duration || 0) - deckA.audio.currentTime);
            document.getElementById('deck-b-elapsed').textContent = formatTime(deckB.audio.currentTime);
            document.getElementById('deck-b-remaining').textContent = '-' + formatTime((deckB.audio.duration || 0) - deckB.audio.currentTime);

            if (deckA.isPlaying && !deckA.isDraggingJog) {
                deckA.jogAngle = (deckA.jogAngle + 2.5 * deckA.audio.playbackRate) % 360;
                document.getElementById('jog-marker-a').style.transform = `rotate(${deckA.jogAngle}deg)`;
            }
            if (deckB.isPlaying && !deckB.isDraggingJog) {
                deckB.jogAngle = (deckB.jogAngle + 2.5 * deckB.audio.playbackRate) % 360;
                document.getElementById('jog-marker-b').style.transform = `rotate(${deckB.jogAngle}deg)`;
            }

            deckA.checkLoop();
            deckB.checkLoop();

            deckA.analyser.getByteFrequencyData(dataArrA);
            deckB.analyser.getByteFrequencyData(dataArrB);
            masterAnalyser.getByteFrequencyData(dataArrM);

            const avgA = deckA.isPlaying ? dataArrA.reduce((a, b) => a + b, 0) / dataArrA.length : 0;
            const avgB = deckB.isPlaying ? dataArrB.reduce((a, b) => a + b, 0) / dataArrB.length : 0;
            const avgM = (deckA.isPlaying || deckB.isPlaying) ? dataArrM.reduce((a, b) => a + b, 0) / dataArrM.length : 0;

            meterA.style.height = `${Math.min(100, (avgA / 128) * 100)}%`;
            meterB.style.height = `${Math.min(100, (avgB / 128) * 100)}%`;
            vuMasterL.style.height = `${Math.min(100, (avgM / 128) * 95)}%`;
            vuMasterR.style.height = `${Math.min(100, (avgM / 128) * 100)}%`;

            requestAnimationFrame(render);
        }
        requestAnimationFrame(render);
    }

    function setupWaveformClick(canvas, deck) {
        canvas.addEventListener('click', (e) => {
            if (!deck.audio.duration) return;
            const rect = canvas.getBoundingClientRect();
            const clickX = e.clientX - rect.left;
            const pct = Math.max(0, Math.min(1, clickX / rect.width));
            deck.audio.currentTime = pct * deck.audio.duration;
            saveSessionStateDebounced();
        });
    }
    setupWaveformClick(canvasA, deckA);
    setupWaveformClick(canvasB, deckB);

    function setupJogWheel(jogEl, markerEl, deck) {
        let isDown = false;
        let lastX = 0;

        jogEl.addEventListener('mousedown', (e) => {
            initAudioContext();
            isDown = true;
            deck.isDraggingJog = true;
            lastX = e.clientX;
        });

        window.addEventListener('mousemove', (e) => {
            if (!isDown) return;
            const deltaX = e.clientX - lastX;
            lastX = e.clientX;
            deck.jogAngle = (deck.jogAngle + deltaX * 1.5) % 360;
            markerEl.style.transform = `rotate(${deck.jogAngle}deg)`;
            
            if (deck.audio.duration) {
                deck.audio.currentTime = Math.max(0, Math.min(deck.audio.duration, deck.audio.currentTime + (deltaX * 0.05)));
            }
        });

        window.addEventListener('mouseup', () => {
            if (isDown) {
                isDown = false;
                deck.isDraggingJog = false;
            }
        });
    }
    setupJogWheel(document.getElementById('jog-a'), document.getElementById('jog-marker-a'), deckA);
    setupJogWheel(document.getElementById('jog-b'), document.getElementById('jog-marker-b'), deckB);

    // Transport buttons
    document.getElementById('deck-a-play').addEventListener('click', () => deckA.togglePlay());
    document.getElementById('deck-a-cue').addEventListener('mousedown', () => deckA.cueDown());
    document.getElementById('deck-a-cue').addEventListener('mouseup', () => deckA.cueUp());
    document.getElementById('deck-a-sync').addEventListener('click', () => syncDecks(deckA, deckB));

    document.getElementById('deck-b-play').addEventListener('click', () => deckB.togglePlay());
    document.getElementById('deck-b-cue').addEventListener('mousedown', () => deckB.cueDown());
    document.getElementById('deck-b-cue').addEventListener('mouseup', () => deckB.cueUp());
    document.getElementById('deck-b-sync').addEventListener('click', () => syncDecks(deckB, deckA));

    // Pitch
    document.getElementById('deck-a-pitch').addEventListener('input', (e) => deckA.setPitch(e.target.value));
    document.getElementById('deck-b-pitch').addEventListener('input', (e) => deckB.setPitch(e.target.value));

    document.getElementById('deck-a-nudge-down').addEventListener('click', () => {
        const el = document.getElementById('deck-a-pitch');
        el.value = (parseFloat(el.value) - 0.2).toFixed(1);
        deckA.setPitch(el.value);
    });
    document.getElementById('deck-a-nudge-up').addEventListener('click', () => {
        const el = document.getElementById('deck-a-pitch');
        el.value = (parseFloat(el.value) + 0.2).toFixed(1);
        deckA.setPitch(el.value);
    });
    document.getElementById('deck-b-nudge-down').addEventListener('click', () => {
        const el = document.getElementById('deck-b-pitch');
        el.value = (parseFloat(el.value) - 0.2).toFixed(1);
        deckB.setPitch(el.value);
    });
    document.getElementById('deck-b-nudge-up').addEventListener('click', () => {
        const el = document.getElementById('deck-b-pitch');
        el.value = (parseFloat(el.value) + 0.2).toFixed(1);
        deckB.setPitch(el.value);
    });

    // Loops
    document.querySelectorAll('.btn-loop').forEach(btn => {
        btn.addEventListener('click', () => {
            const deck = btn.dataset.deck === 'A' ? deckA : deckB;
            const parent = btn.parentElement;
            parent.querySelectorAll('.btn-loop').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            deck.setLoopBeats(btn.dataset.beats);
        });
    });
    document.getElementById('deck-a-loop-toggle').addEventListener('click', () => deckA.toggleLoop());
    document.getElementById('deck-b-loop-toggle').addEventListener('click', () => deckB.toggleLoop());

    // EQ
    function setupEqControls(deck, prefix) {
        document.getElementById(`${prefix}-gain`).addEventListener('input', (e) => {
            initAudioContext();
            deck.trimGain.gain.value = parseFloat(e.target.value);
        });

        document.getElementById(`${prefix}-hi`).addEventListener('input', (e) => {
            initAudioContext();
            if (!deck.kills.hi) deck.hiFilter.gain.value = parseFloat(e.target.value);
        });
        document.getElementById(`${prefix}-mid`).addEventListener('input', (e) => {
            initAudioContext();
            if (!deck.kills.mid) deck.midFilter.gain.value = parseFloat(e.target.value);
        });
        document.getElementById(`${prefix}-low`).addEventListener('input', (e) => {
            initAudioContext();
            if (!deck.kills.low) deck.lowFilter.gain.value = parseFloat(e.target.value);
        });

        document.getElementById(`${prefix}-kill-hi`).addEventListener('click', (e) => {
            initAudioContext();
            deck.kills.hi = !deck.kills.hi;
            e.target.classList.toggle('active', deck.kills.hi);
            deck.hiFilter.gain.value = deck.kills.hi ? -70 : parseFloat(document.getElementById(`${prefix}-hi`).value);
        });
        document.getElementById(`${prefix}-kill-mid`).addEventListener('click', (e) => {
            initAudioContext();
            deck.kills.mid = !deck.kills.mid;
            e.target.classList.toggle('active', deck.kills.mid);
            deck.midFilter.gain.value = deck.kills.mid ? -70 : parseFloat(document.getElementById(`${prefix}-mid`).value);
        });
        document.getElementById(`${prefix}-kill-low`).addEventListener('click', (e) => {
            initAudioContext();
            deck.kills.low = !deck.kills.low;
            e.target.classList.toggle('active', deck.kills.low);
            deck.lowFilter.gain.value = deck.kills.low ? -70 : parseFloat(document.getElementById(`${prefix}-low`).value);
        });

        document.getElementById(`${prefix}-fader`).addEventListener('input', (e) => {
            initAudioContext();
            deck.deckFaderGain.gain.value = parseFloat(e.target.value);
        });
    }
    setupEqControls(deckA, 'deck-a');
    setupEqControls(deckB, 'deck-b');

    document.getElementById('master-vol').addEventListener('input', (e) => {
        initAudioContext();
        masterGain.gain.value = parseFloat(e.target.value);
    });
    document.getElementById('crossfader').addEventListener('input', (e) => {
        initAudioContext();
        updateCrossfader(e.target.value);
        saveSessionStateDebounced();
    });

    document.getElementById('audio-device-select').addEventListener('change', async (e) => {
        const deviceId = e.target.value;
        try {
            if (typeof deckA.audio.setSinkId === 'function') {
                await deckA.audio.setSinkId(deviceId);
                await deckB.audio.setSinkId(deviceId);
            }
        } catch (err) {
            console.warn('Cannot set sink id:', err);
        }
    });

    // Modals
    const emModal = document.getElementById('emergency-modal');
    const checklistModal = document.getElementById('checklist-modal');

    document.getElementById('btn-toggle-emergency').addEventListener('click', () => {
        emModal.classList.remove('hidden');
        refreshEmergencyInfo();
    });
    document.getElementById('btn-close-emergency').addEventListener('click', () => {
        emModal.classList.add('hidden');
    });

    document.getElementById('btn-open-checklist').addEventListener('click', () => {
        checklistModal.classList.remove('hidden');
    });
    document.getElementById('btn-close-checklist').addEventListener('click', () => {
        checklistModal.classList.add('hidden');
    });

    // Interactive Checklist Logic
    const checklistBoxes = document.querySelectorAll('.chk-step');
    const checklistBanner = document.getElementById('checklist-status-banner');
    const checklistText = document.getElementById('checklist-progress-text');

    checklistBoxes.forEach(chk => {
        chk.addEventListener('change', () => {
            chk.closest('.check-item').classList.toggle('checked', chk.checked);
            const total = checklistBoxes.length;
            const checkedCount = document.querySelectorAll('.chk-step:checked').length;
            checklistText.textContent = `Checklist Progress: ${checkedCount} / ${total} Completed`;
            
            if (checkedCount === total) {
                checklistBanner.classList.add('completed');
                checklistText.innerHTML = '✅ 100% GIG READY: ALL SAFETY PROTOCOLS VERIFIED';
            } else {
                checklistBanner.classList.remove('completed');
            }
        });
    });

    document.getElementById('em-load-deck-a').addEventListener('click', () => {
        if (lastKnownTrack) {
            deckA.loadTrack(lastKnownTrack);
            emModal.classList.add('hidden');
        }
    });
    document.getElementById('em-load-deck-b').addEventListener('click', () => {
        if (lastKnownTrack) {
            deckB.loadTrack(lastKnownTrack);
            emModal.classList.add('hidden');
        }
    });

    document.getElementById('btn-emergency-resume').addEventListener('click', () => {
        initAudioContext();
        const targetTrack = lastKnownTrack || (allTracks.length > 0 ? allTracks[0] : null);
        if (targetTrack) {
            deckA.loadTrack(targetTrack);
            document.getElementById('crossfader').value = 0.0;
            updateCrossfader(0.0);
            document.getElementById('master-vol').value = 1.0;
            masterGain.gain.value = 1.0;
            document.getElementById('deck-a-fader').value = 1.0;
            deckA.deckFaderGain.gain.value = 1.0;
            
            setTimeout(() => {
                deckA.play();
                emModal.classList.add('hidden');
            }, 100);
        }
    });

    let lastKnownTrack = null;
    let allTracks = [];
    let youtubeResults = [];
    let onlineResults = [];
    let currentCategory = 'All';

    async function refreshEmergencyInfo() {
        try {
            const res = await fetch('/api/system/status');
            const data = await res.json();
            document.getElementById('em-lib-status').textContent = `● READY (${data.trackCount} TRACKS)`;
            const devSelect = document.getElementById('audio-device-select');
            const devName = devSelect.options[devSelect.selectedIndex]?.text || 'Default Audio';
            document.getElementById('em-audio-status').textContent = `● [${devName}]`;

            if (data.lastSessionState && data.lastSessionState.lastPlayed) {
                lastKnownTrack = data.lastSessionState.lastPlayed;
                document.getElementById('em-track-title').textContent = lastKnownTrack.title;
                document.getElementById('em-track-artist').textContent = `${lastKnownTrack.artist} • [${lastKnownTrack.category}]`;
                document.getElementById('em-track-time').textContent = `Restored Track (BPM: ${lastKnownTrack.bpm})`;
            } else if (allTracks.length > 0) {
                lastKnownTrack = allTracks[0];
                document.getElementById('em-track-title').textContent = lastKnownTrack.title;
                document.getElementById('em-track-artist').textContent = `${lastKnownTrack.artist} • [${lastKnownTrack.category}]`;
            }
        } catch (e) {
            console.error('Failed to load emergency info:', e);
        }
    }

    // --- Search & YouTube Integration ---
    const searchInput = document.getElementById('library-search');
    const searchYtBtn = document.getElementById('btn-search-youtube');
    const statusBar = document.getElementById('search-status-bar');
    const statusText = document.getElementById('search-status-text');

    async function searchYouTubeCatalog(term) {
        if (!term || term.trim().length < 2) return;
        statusBar.classList.remove('hidden');
        statusText.innerHTML = `▶ Searching YouTube for full songs & remixes: "<b>${term}</b>"...`;
        
        try {
            const res = await fetch(`/api/youtube/search?query=${encodeURIComponent(term)}`);
            const data = await res.json();
            youtubeResults = data.results || [];
            
            if (youtubeResults.length > 0) {
                statusText.innerHTML = `✅ Found <b>${youtubeResults.length}</b> full duration YouTube tracks for "<b>${term}</b>"! Click <b>LOAD A/B</b> to play full song live, or <b>SAVE TO USB</b>.`;
                currentCategory = '_youtube';
                document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
                const tabYt = document.getElementById('tab-youtube');
                if (tabYt) tabYt.classList.add('active');
                renderTrackTable(youtubeResults);
            } else {
                statusText.innerHTML = `❌ No YouTube songs found for "<b>${term}</b>". Try another search query.`;
            }
        } catch (err) {
            statusText.innerHTML = `⚠️ YouTube search error: ${err.message}`;
        }
    }

    searchYtBtn.addEventListener('click', () => {
        searchYouTubeCatalog(searchInput.value);
    });

    searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            searchYouTubeCatalog(searchInput.value);
        }
    });

    async function loadTracks() {
        try {
            const search = searchInput.value;
            let url = `/api/tracks?category=${encodeURIComponent(currentCategory)}&search=${encodeURIComponent(search)}`;
            
            if (currentCategory === '_youtube') {
                renderTrackTable(youtubeResults);
                return;
            } else if (currentCategory === '_online') {
                renderTrackTable(onlineResults);
                return;
            } else if (currentCategory === '_favorites') {
                const favRes = await fetch('/api/favorites');
                const favData = await favRes.json();
                const favSet = new Set(favData.favorites);
                renderTrackTable(allTracks.filter(t => favSet.has(t.id)));
                return;
            } else if (currentCategory === '_history') {
                const histRes = await fetch('/api/history');
                const histData = await histRes.json();
                renderHistoryTable(histData.history);
                return;
            } else if (currentCategory === '_playlists') {
                const plRes = await fetch('/api/playlists');
                const plData = await plRes.json();
                renderPlaylistsView(plData.playlists);
                return;
            }

            const res = await fetch(url);
            const data = await res.json();
            if (currentCategory === 'All' && !search) {
                allTracks = data.tracks;
            }
            renderTrackTable(data.tracks);
        } catch (e) {
            console.error('Error loading tracks:', e);
        }
    }

    async function renderTrackTable(tracks) {
        const tbody = document.getElementById('track-table-body');
        tbody.innerHTML = '';

        if (!tracks || tracks.length === 0) {
            tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:24px; color:#627494;">
                No songs in this view. Type in the search bar above and click <b>▶ SEARCH YOUTUBE</b> for full songs & DJ remixes!
            </td></tr>`;
            return;
        }

        const favRes = await fetch('/api/favorites');
        const favData = await favRes.json();
        const favSet = new Set(favData.favorites || []);

        tracks.forEach(track => {
            const tr = document.createElement('tr');
            const isFav = favSet.has(track.id);
            const isYouTube = !!track.isYouTube;
            const isOnline = !!track.isOnline && !isYouTube;

            const artworkHtml = track.thumbnail 
                ? `<img src="${track.thumbnail}" class="track-thumb" alt="art">` 
                : (track.artwork 
                    ? `<img src="${track.artwork}" class="track-thumb" alt="art">` 
                    : `<span class="track-thumb" style="display:flex;align-items:center;justify-content:center;font-size:12px;">🎵</span>`);

            const durStr = track.durationFormatted || (track.duration ? formatTime(track.duration) : '03:30');
            const tagClass = isYouTube ? 'category-tag youtube' : (isOnline ? 'category-tag online' : 'category-tag');
            const tagLabel = isYouTube ? '▶ YT ' + track.category : (isOnline ? '🌐 ' + track.category : track.category);

            tr.innerHTML = `
                <td>
                    <button class="btn-fav ${isFav ? 'active' : ''}" data-id="${track.id}">
                        ${isFav ? '★' : '☆'}
                    </button>
                </td>
                <td>
                    <button class="btn-load-a" data-id="${track.id}">LOAD A</button>
                    <button class="btn-load-b" data-id="${track.id}">LOAD B</button>
                    ${(isYouTube || isOnline) ? `<button class="btn-save-usb" data-id="${track.id}">💾 SAVE</button>` : ''}
                </td>
                <td>
                    <div class="track-title-cell">
                        ${artworkHtml}
                        <span style="font-weight:600; color:#fff;" title="${track.title}">${track.title}</span>
                    </div>
                </td>
                <td>${track.artist}</td>
                <td><span class="${tagClass}">${tagLabel}</span></td>
                <td style="font-family:'JetBrains Mono',monospace;">${track.bpm || 128}</td>
                <td style="font-family:'JetBrains Mono',monospace; font-weight:700; color:#38bdf8;">${durStr}</td>
            `;

            tr.querySelector('.btn-load-a').addEventListener('click', async (e) => {
                const btn = e.target;
                const prevText = btn.textContent;
                btn.textContent = 'LOADING...';
                await deckA.loadTrack(track);
                btn.textContent = prevText;
            });

            tr.querySelector('.btn-load-b').addEventListener('click', async (e) => {
                const btn = e.target;
                const prevText = btn.textContent;
                btn.textContent = 'LOADING...';
                await deckB.loadTrack(track);
                btn.textContent = prevText;
            });

            if (isYouTube) {
                const saveBtn = tr.querySelector('.btn-save-usb');
                saveBtn.addEventListener('click', async () => {
                    saveBtn.textContent = 'DOWNLOADING...';
                    saveBtn.disabled = true;
                    try {
                        const saveRes = await fetch('/api/youtube/download', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                ytId: track.ytId,
                                category: track.category || 'DJ'
                            })
                        });
                        const saveJson = await saveRes.json();
                        if (saveJson.success) {
                            saveBtn.textContent = '✔ SAVED';
                            saveBtn.classList.add('saved');
                            initSystemStatus();
                        } else {
                            saveBtn.textContent = 'FAILED';
                            saveBtn.disabled = false;
                        }
                    } catch (err) {
                        saveBtn.textContent = 'ERROR';
                        saveBtn.disabled = false;
                    }
                });
            } else if (isOnline) {
                const saveBtn = tr.querySelector('.btn-save-usb');
                saveBtn.addEventListener('click', async () => {
                    saveBtn.textContent = 'SAVING...';
                    saveBtn.disabled = true;
                    try {
                        const saveRes = await fetch('/api/tracks/save-online', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(track)
                        });
                        const saveJson = await saveRes.json();
                        if (saveJson.success) {
                            saveBtn.textContent = '✔ SAVED';
                            saveBtn.classList.add('saved');
                            initSystemStatus();
                        } else {
                            saveBtn.textContent = 'FAILED';
                            saveBtn.disabled = false;
                        }
                    } catch (err) {
                        saveBtn.textContent = 'ERROR';
                        saveBtn.disabled = false;
                    }
                });
            }

            tr.querySelector('.btn-fav').addEventListener('click', async (e) => {
                const res = await fetch('/api/favorites/toggle', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ trackId: track.id })
                });
                const resData = await res.json();
                e.target.classList.toggle('active', resData.isFavorite);
                e.target.textContent = resData.isFavorite ? '★' : '☆';
            });

            tbody.appendChild(tr);
        });
    }

    function renderHistoryTable(historyList) {
        const tbody = document.getElementById('track-table-body');
        tbody.innerHTML = '';
        if (historyList.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:20px; color:#627494;">No tracks played yet in this session.</td></tr>';
            return;
        }
        historyList.forEach(item => {
            const tr = document.createElement('tr');
            const timeStr = new Date(item.timestamp).toLocaleTimeString();
            tr.innerHTML = `
                <td>⏱</td>
                <td colspan="2" style="font-weight:600; color:#fff;">${item.title}</td>
                <td>${item.artist}</td>
                <td><span class="category-tag">${item.category}</span></td>
                <td style="color:var(--deck-a);">${item.deck}</td>
                <td style="font-family:'JetBrains Mono',monospace;">${timeStr}</td>
            `;
            tbody.appendChild(tr);
        });
    }

    function renderPlaylistsView(playlists) {
        const tbody = document.getElementById('track-table-body');
        tbody.innerHTML = '';
        playlists.forEach(pl => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>📋</td>
                <td colspan="3" style="font-weight:700; color:#4facfe;">${pl.name} (${pl.tracks.length} tracks)</td>
                <td colspan="2">${pl.description}</td>
                <td>
                    <button class="btn-load-a" style="padding:4px 10px;">QUEUE ALL</button>
                </td>
            `;
            tbody.appendChild(tr);
        });
    }

    // Local file import
    const filePicker = document.getElementById('local-file-picker');
    const importBtn = document.getElementById('btn-import-local');

    importBtn.addEventListener('click', () => {
        filePicker.click();
    });

    filePicker.addEventListener('change', async (e) => {
        const files = Array.from(e.target.files);
        if (files.length === 0) return;

        statusBar.classList.remove('hidden');
        statusText.textContent = `Importing ${files.length} audio file(s) into USB Music folder...`;

        for (const file of files) {
            try {
                const base64 = await readFileAsBase64(file);
                await fetch('/api/tracks/import-file', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        filename: file.name,
                        base64Data: base64,
                        category: currentCategory.startsWith('_') ? 'DJ' : currentCategory
                    })
                });
            } catch (err) {
                console.error('Import file error:', err);
            }
        }

        statusText.textContent = `✅ Successfully imported ${files.length} file(s) to USB!`;
        initSystemStatus();
        loadTracks();
    });

    function readFileAsBase64(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
                const result = reader.result;
                const base64 = result.split(',')[1];
                resolve(base64);
            };
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    }

    window.addEventListener('dragover', (e) => e.preventDefault());
    window.addEventListener('drop', async (e) => {
        e.preventDefault();
        const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('audio/') || /\.(mp3|wav|m4a|mp4|webm|aac|flac|ogg)$/i.test(f.name));
        if (files.length === 0) return;

        statusBar.classList.remove('hidden');
        statusText.textContent = `Importing ${files.length} dragged file(s) to USB...`;

        for (const file of files) {
            const base64 = await readFileAsBase64(file);
            await fetch('/api/tracks/import-file', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    filename: file.name,
                    base64Data: base64,
                    category: 'DJ'
                })
            });
        }
        statusText.textContent = `✅ Imported ${files.length} track(s) from your computer to the USB library!`;
        initSystemStatus();
        loadTracks();
    });

    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentCategory = btn.dataset.cat;
            statusBar.classList.add('hidden');
            loadTracks();
        });
    });

    document.getElementById('btn-scan-library').addEventListener('click', async () => {
        const btn = document.getElementById('btn-scan-library');
        btn.textContent = 'SCANNING...';
        await fetch('/api/tracks/scan', { method: 'POST' });
        await initSystemStatus();
        await loadTracks();
        btn.textContent = '🔄 RESCAN USB';
    });

    async function initSystemStatus() {
        try {
            const res = await fetch('/api/system/status');
            const data = await res.json();
            document.getElementById('val-usb-root').textContent = `${data.driveLetter} (PORTABLE)`;
            document.getElementById('val-track-count').textContent = `${data.trackCount} TRACKS`;

            if (data.lastSessionState && data.lastSessionState.lastPlayed) {
                lastKnownTrack = data.lastSessionState.lastPlayed;
            }
        } catch (e) {
            console.error('System status query failed:', e);
        }
    }

    initSystemStatus();
    loadTracks();
});
