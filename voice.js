/* ---------- voice channels (WebRTC mesh; signalling goes through the polling API) ---------- */
async function loadVoice() {
    if (S.view !== 'server' || !S.server) return;
    const sid = S.server.id;
    const out = await post({ action: 'voice-list', id: sid });
    if (!out.res.ok || !S.server || S.server.id !== sid) return;
    const keep = V.on && V.sid === sid ? S.voice[V.chId] : null; // our own sync is fresher
    S.voice = out.data.voice || {};
    if (keep) S.voice[V.chId] = keep;
    refreshVoiceUI();
}
function refreshVoiceUI(force) {
    const sig = JSON.stringify([S.voice, V.on, V.chId, V.muted, V.deaf, S.channelId, S.view]);
    if (!force && sig === V.sig) return;
    V.sig = sig;
    renderSide(); renderVoiceStage(); renderVoiceBar();
}
function voiceFlag(p) { if (!p.df && !p.mu) return null; const i = h('i', 'vflag'); i.innerHTML = p.df ? ICON.headphones : ICON.micOff; i.title = p.df ? 'Deafened' : 'Muted'; return i; }
function voiceAva(p, cls) { const a = avatar(p.username, cls, p.avatar); a.dataset.vu = p.id; a.classList.toggle('speaking', V.speak.has(p.id)); return a; }
function voiceRow(p) {
    const r = h('div', 'vrow');
    r.append(voiceAva(p, 'xs'), userLink(p));
    const f = voiceFlag(p); if (f) r.append(f);
    return r;
}
function renderVoiceBar() {
    $('voice-bar').classList.toggle('hidden', !V.on);
    if (!V.on) return;
    $('vb-sub').textContent = `${V.name} / ${V.sname}`;
    const m = $('vb-mute'), d = $('vb-deaf');
    m.innerHTML = V.muted ? ICON.micOff : ICON.mic; m.title = V.muted ? 'Unmute' : 'Mute'; m.classList.toggle('off', V.muted);
    d.innerHTML = ICON.headphones; d.title = V.deaf ? 'Undeafen' : 'Deafen'; d.classList.toggle('off', V.deaf);
    $('vb-leave').innerHTML = ICON.x;
}
function renderVoiceStage() {
    const box = $('voice-stage'), ch = curChannel();
    if (!box || !ch || ch.kind !== 'v' || S.view !== 'server') return;
    const list = S.voice[ch.id] || [], here = V.on && V.chId === ch.id;
    box.textContent = '';
    const grid = h('div', 'vgrid');
    if (!list.length) grid.append(h('div', 'vempty', 'Nobody is in this voice channel yet.'));
    list.forEach(p => {
        const t = h('div', 'vtile'), n = h('div', 'vname');
        n.append(userLink(p));
        const f = voiceFlag(p); if (f) n.append(f);
        t.append(voiceAva(p, 'xl'), n);
        grid.append(t);
    });
    const bar = h('div', 'vctl');
    if (here) {
        const m = h('button', 'btn ghost' + (V.muted ? ' off' : '')); m.innerHTML = (V.muted ? ICON.micOff : ICON.mic) + (V.muted ? 'Unmute' : 'Mute'); m.onclick = toggleMute;
        const d = h('button', 'btn ghost' + (V.deaf ? ' off' : '')); d.innerHTML = ICON.headphones + (V.deaf ? 'Undeafen' : 'Deafen'); d.onclick = toggleDeaf;
        const l = h('button', 'btn primary'); l.textContent = 'Disconnect'; l.onclick = () => leaveVoice();
        bar.append(m, d, l);
    } else {
        const j = h('button', 'btn primary', 'Join voice'); j.onclick = () => joinVoice(ch);
        bar.append(j);
    }
    box.append(grid, bar);
}

async function joinVoice(ch) {
    if (!S.server || !ch || ch.kind !== 'v' || V.joining) return;
    if (V.on && V.chId === ch.id) return;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return toast('Voice needs HTTPS and a browser with microphone support.', true);
    V.joining = true;
    try {
        if (V.on) await leaveVoice(true);
        let stream;
        try { stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } }); }
        catch { return toast('Microphone access was blocked. Allow it in your browser to join voice.', true); }
        const ice = await post({ action: 'voice-ice' });
        V.ice = (ice.data && ice.data.iceServers) || [{ urls: 'stun:stun.l.google.com:19302' }];
        const out = await post({ action: 'voice-join', id: S.server.id, channelId: ch.id, mu: V.muted, df: V.deaf });
        if (!out.res.ok) { stream.getTracks().forEach(t => t.stop()); return toast(out.data.error || 'Could not join voice.', true); }
        Object.assign(V, { on: true, sid: S.server.id, chId: ch.id, name: ch.name, sname: S.server.name, stream, peers: new Map(), early: {}, cool: {}, joined: {} });
        stream.getAudioTracks().forEach(t => { t.enabled = !V.muted; });
        watchAudio(S.me.id, stream);
        S.voice[ch.id] = out.data.peers || [];
        clearInterval(V.timer); clearInterval(V.spTimer);
        V.timer = setInterval(voiceSync, 1000);
        V.spTimer = setInterval(tickSpeak, 120);
        refreshVoiceUI(true);
        voiceSync();
    } finally { V.joining = false; }
}

async function leaveVoice(quiet) {
    if (!V.on) return;
    V.on = false;
    clearInterval(V.timer); clearInterval(V.spTimer);
    [...V.peers.keys()].forEach(dropPeer);
    V.watch.forEach(w => { try { w.src.disconnect(); } catch {} });
    V.watch.clear(); V.speak = new Set();
    if (V.stream) V.stream.getTracks().forEach(t => t.stop());
    V.stream = null;
    if (S.me && S.voice[V.chId]) S.voice[V.chId] = S.voice[V.chId].filter(p => p.id !== S.me.id);
    post({ action: 'voice-leave' });
    refreshVoiceUI(true);
}

function applyAudio() {
    if (V.stream) V.stream.getAudioTracks().forEach(t => { t.enabled = !V.muted; });
    V.peers.forEach(r => { if (r.audio) r.audio.muted = V.deaf; });
    const me = (S.voice[V.chId] || []).find(p => S.me && p.id === S.me.id);
    if (me) { me.mu = V.muted; me.df = V.deaf; }
    refreshVoiceUI();
    voiceSync();
}
function toggleMute() { if (V.deaf) { V.deaf = false; V.muted = false; } else V.muted = !V.muted; applyAudio(); }
function toggleDeaf() { if (V.deaf) { V.deaf = false; V.muted = V.mutedBefore || false; } else { V.mutedBefore = V.muted; V.deaf = true; V.muted = true; } applyAudio(); }
$('vb-mute').onclick = toggleMute;
$('vb-deaf').onclick = toggleDeaf;
$('vb-leave').onclick = () => leaveVoice();

async function voiceSync() {
    if (!V.on || V.busy) return;
    V.busy = true;
    let out;
    try { out = await post({ action: 'voice-sync', mu: V.muted, df: V.deaf }); } finally { V.busy = false; }
    if (!V.on) return;
    if (!out.res.ok) {
        if (out.res.status === 404) { toast('Disconnected from voice.', true); leaveVoice(true); }
        return;
    }
    const peers = out.data.peers || [], myId = S.me.id;
    S.voice[V.chId] = peers;
    const ids = new Set(peers.map(p => p.id));
    peers.forEach(p => { if (V.joined[p.id] && V.joined[p.id] !== p.j) dropPeer(p.id); V.joined[p.id] = p.j; }); // they left and rejoined
    [...V.peers.keys()].forEach(id => { if (!ids.has(id)) dropPeer(id); });
    for (const s of out.data.signals || []) { try { await onSignal(s.from, s.sig); } catch (e) { console.warn('signal', e); } }
    for (const p of peers) {
        if (p.id === myId || V.peers.has(p.id) || myId > p.id || (V.cool[p.id] || 0) > Date.now()) continue; // lower id makes the offer
        makePeer(p.id);
        try { await offerTo(p.id); } catch (e) { console.warn('offer', e); dropPeer(p.id); }
    }
    refreshVoiceUI();
}

function sendSig(to, sig) { post({ action: 'voice-signal', to, sig: JSON.stringify(sig) }); }
function makePeer(id) {
    const pc = new RTCPeerConnection({ iceServers: V.ice }), rec = { pc, q: [], ready: false, audio: null };
    V.peers.set(id, rec);
    V.stream.getTracks().forEach(t => pc.addTrack(t, V.stream));
    pc.onicecandidate = (e) => { if (e.candidate && V.peers.get(id) === rec) sendSig(id, { t: 'c', c: e.candidate }); };
    pc.ontrack = (e) => {
        const st = e.streams[0];
        if (!st) return;
        if (!rec.audio) { rec.audio = new Audio(); rec.audio.autoplay = true; }
        rec.audio.srcObject = st; rec.audio.muted = V.deaf;
        rec.audio.play().catch(() => {});
        watchAudio(id, st);
    };
    pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'failed' && V.peers.get(id) === rec) { V.cool[id] = Date.now() + 5000; dropPeer(id); }
    };
    return rec;
}
async function offerTo(id) {
    const rec = V.peers.get(id);
    const o = await rec.pc.createOffer();
    await rec.pc.setLocalDescription(o);
    sendSig(id, { t: 'o', s: rec.pc.localDescription });
}
function flushIce(rec) { rec.ready = true; rec.q.splice(0).forEach(c => rec.pc.addIceCandidate(c).catch(() => {})); }
async function onSignal(from, raw) {
    let m; try { m = JSON.parse(raw); } catch { return; }
    if (m.t === 'o') {
        dropPeer(from);
        const rec = makePeer(from);
        rec.q.push(...(V.early[from] || [])); delete V.early[from];
        await rec.pc.setRemoteDescription(m.s);
        flushIce(rec);
        const a = await rec.pc.createAnswer();
        await rec.pc.setLocalDescription(a);
        sendSig(from, { t: 'a', s: rec.pc.localDescription });
    } else if (m.t === 'a') {
        const rec = V.peers.get(from);
        if (!rec || rec.pc.signalingState !== 'have-local-offer') return;
        await rec.pc.setRemoteDescription(m.s);
        flushIce(rec);
    } else if (m.t === 'c') {
        const rec = V.peers.get(from);
        if (rec && rec.ready) rec.pc.addIceCandidate(m.c).catch(() => {});
        else if (rec) rec.q.push(m.c);
        else (V.early[from] = V.early[from] || []).push(m.c);
    }
}
function dropPeer(id) {
    const rec = V.peers.get(id);
    if (rec) { try { rec.pc.close(); } catch {} if (rec.audio) { rec.audio.srcObject = null; } V.peers.delete(id); }
    const w = V.watch.get(id);
    if (w && id !== (S.me && S.me.id)) { try { w.src.disconnect(); } catch {} V.watch.delete(id); }
}

/* speaking indicator: an analyser per stream, no output connection so nothing is played twice */
function watchAudio(id, stream) {
    try {
        V.ctx = V.ctx || new (window.AudioContext || window.webkitAudioContext)();
        if (V.ctx.state === 'suspended') V.ctx.resume().catch(() => {});
        const old = V.watch.get(id); if (old) { try { old.src.disconnect(); } catch {} }
        const src = V.ctx.createMediaStreamSource(stream), an = V.ctx.createAnalyser();
        an.fftSize = 512; src.connect(an);
        V.watch.set(id, { src, an, buf: new Uint8Array(an.fftSize) });
    } catch {}
}
function tickSpeak() {
    const now = new Set();
    V.watch.forEach((w, id) => {
        w.an.getByteTimeDomainData(w.buf);
        let peak = 0; for (const v of w.buf) peak = Math.max(peak, Math.abs(v - 128));
        if (peak > 10 && !(S.me && id === S.me.id && V.muted)) now.add(id);
    });
    if (now.size !== V.speak.size || [...now].some(i => !V.speak.has(i))) {
        V.speak = now;
        document.querySelectorAll('[data-vu]').forEach(e => e.classList.toggle('speaking', now.has(Number(e.dataset.vu))));
    }
}
window.addEventListener('pagehide', () => {
    if (V.on && S.token) { try { fetch('/api/auth', { method: 'POST', keepalive: true, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${S.token}` }, body: JSON.stringify({ action: 'voice-leave' }) }); } catch {} }
});
