'use strict';

/* app-extra: profile settings, right-click menu, presence, login background, Pratr Plus and unread alerts. Loaded after app.js. */

/* ---------- profile ---------- */
$('dev-toggle').onchange = (e) => {
    try { localStorage.setItem('dev', e.target.checked ? '1' : '0'); } catch {}
    S.sig = ''; renderAll(); if (S.view !== 'home') loadMessages(true); // rebuild so right-click menus pick up the change
};
const pend = {}; // pending image URL per upload widget (pf = profile, sv = server); ac/pg = picked Plus colours
const ACCENTS = ['#ffd36b', '#ff8fa3', '#7ee2b8', '#7cc4ff', '#b99bff', '#ffab6b', '#5ee0d6', '#f0e9db', '#ff5a4e', '#f472d0', '#8ef58a', '#6ea8ff', '#ffe45e', '#c6a4ff', '#ff9f43', '#9be7ff']; // must match api/auth.js
const paint = (k, name) => { const el = $(k + '-ava'); el.textContent = pend[k] ? '' : ini(name); el.style.background = bg(pend[k], name); };

async function uploadImage(file, kind, transform = 'c_fill,g_auto,w_256,h_256') {
    const sig = await post({ action: 'upload-sign', kind });
    if (!sig.res.ok) { toast(sig.data.error || 'Upload unavailable.', true); return ''; }
    const { cloud, key, timestamp, signature, folder } = sig.data, fd = new FormData();
    Object.entries({ file, api_key: key, timestamp, signature, folder }).forEach(([k, v]) => fd.append(k, v));
    try {
        const r = await fetch(`https://api.cloudinary.com/v1_1/${cloud}/image/upload`, { method: 'POST', body: fd });
        if (!r.ok) throw 0;
        return (await r.json()).secure_url.replace('/upload/', `/upload/${transform},f_auto,q_auto/`);
    } catch { toast('Upload failed.', true); return ''; }
}
function wireUpload(k, kind, nameOf) {
    $(k + '-pick').onclick = $(k + '-ava').onclick = () => $(k + '-file').click();
    $(k + '-clear').onclick = () => { pend[k] = ''; paint(k, nameOf()); };
    $(k + '-file').onchange = async (e) => {
        const f = e.target.files[0]; e.target.value = '';
        if (!f) return;
        if (f.size > 5e6) return toast('Image must be under 5 MB.', true);
        const label = $(k + '-pick'), old = label.textContent;
        label.textContent = 'Uploading…'; label.disabled = true;
        const url = await uploadImage(f, kind);
        label.textContent = old; label.disabled = false;
        if (url) { pend[k] = url; paint(k, nameOf()); }
    };
}
wireUpload('pf', 'avatars', () => $('profile-name').value);
wireUpload('sv', 'servers', () => $('sv-name').value);
$('profile-name').oninput = () => paint('pf', $('profile-name').value);
$('sv-name').oninput = () => paint('sv', $('sv-name').value);
$('edit-btn').onclick = $('hp-edit').onclick = () => openProfile();

/* ---------- context menu (replaces the browser's) ---------- */
const ctx = $('ctx-menu');
const copy = (t) => navigator.clipboard.writeText(t).then(() => toast('Copied.'), () => toast('Copy failed.', true));
const dev = () => { try { return localStorage.getItem('dev') === '1'; } catch { return false; } };
const idItem = (label, v) => dev() ? [[`Copy ${label} ID`, () => copy(String(v))]] : [];
function userItems(u) {
    if (!u) return [];
    const mine = S.me && u.id === S.me.id, f = S.friends.find(x => x.id === u.id);
    return [...(mine ? [] : [f ? ['Message', () => openDM(f)] : ['Add friend', () => addFriend(u.username || u.email)], ['Copy username', () => copy(u.username || u.email)]]), ...idItem('user', u.id)];
}
document.querySelector('.user-panel')._ctx = () => [['Edit profile', openProfile], ['Copy username', () => copy(S.me.username)], ...idItem('user', S.me.id), '-', ...statusItems(), '-', ['Log out', () => $('logout-btn').click(), true]];

function showMenu(items, x, y, above = false) {
    ctx.textContent = '';
    items.forEach(it => {
        if (it === '-') return ctx.append(document.createElement('hr'));
        const b = h('button', it[2] ? 'danger' : '', it[0]);
        b.onclick = () => { ctx.classList.add('hidden'); it[1](); };
        ctx.append(b);
    });
    ctx.classList.remove('hidden');
    ctx.style.left = Math.max(8, Math.min(x, innerWidth - 228)) + 'px';
    ctx.style.top = Math.max(8, above ? y - ctx.offsetHeight : Math.min(y, innerHeight - ctx.offsetHeight - 8)) + 'px';
}

/* ---------- presence / status ---------- */
const STATUS = [['online', 'Online', '●'], ['idle', 'Idle', '◐'], ['dnd', 'Do not disturb', '●'], ['invisible', 'Invisible', '○']];
const SLABEL = { online: 'Online', idle: 'Idle', dnd: 'Do not disturb' };
const statusItems = () => STATUS.map(([k, label, g]) => [`${g} ${label}${(S.me?.status || 'online') === k ? '  ✓' : ''}`, () => setStatus(k)]);
async function setStatus(k) {
    const out = await post({ action: 'presence-set', status: k });
    if (!out.res.ok) return toast(out.data.error || 'Could not change status.', true);
    S.me.status = k; setMe(S.me); loadMembers();
}
$('me-ava').onclick = (e) => { const r = e.currentTarget.getBoundingClientRect(); showMenu(statusItems(), r.left, r.top - 8, true); };

document.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    let items = null;
    for (let n = e.target; n && !items; n = n.parentElement) if (n._ctx) items = typeof n._ctx === 'function' ? n._ctx() : n._ctx;
    if (!items || !items.length || $('app').classList.contains('hidden')) return ctx.classList.add('hidden');
    showMenu(items, e.clientX, e.clientY);
});
document.addEventListener('pointerdown', (e) => { if (!e.target.closest('#ctx-menu')) ctx.classList.add('hidden'); });
addEventListener('resize', () => ctx.classList.add('hidden'));
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') ctx.classList.add('hidden');
    const k = e.key.toLowerCase(), mod = e.ctrlKey || e.metaKey;
    if (e.key === 'F12' || (mod && ((e.shiftKey || e.altKey) && 'ijc'.includes(k) || k === 'u'))) e.preventDefault();
}, true);

/* ---------- login background: cursor trail over a dot grid ---------- */
(() => {
    const cv = $('gravity'), c = cv && cv.getContext('2d');
    if (!c) return;
    const m = { x: -999, y: -999 }, R = 130, R2 = R * R, GAP = 30, PUSH = 12, N = 14;
    const trail = Array.from({ length: N }, () => ({ x: -999, y: -999 }));
    let dots = [], w = 0, ht = 0, raf = 0, last = 0;
    const seed = () => {
        const dpr = devicePixelRatio || 1; w = innerWidth; ht = innerHeight;
        cv.width = w * dpr; cv.height = ht * dpr; c.setTransform(dpr, 0, 0, dpr, 0, 0);
        dots = [];
        for (let x = GAP / 2; x < w; x += GAP) for (let y = GAP / 2; y < ht; y += GAP) dots.push({ hx: x, hy: y, x, y });
    };
    addEventListener('resize', seed); seed();
    addEventListener('pointermove', (e) => { m.x = e.clientX; m.y = e.clientY; }, { passive: true });
    document.addEventListener('pointerleave', () => { m.x = m.y = -999; });
    const dot = (x, y, r, a) => { c.fillStyle = `rgba(239,232,218,${a})`; c.beginPath(); c.arc(x, y, r, 0, 6.283); c.fill(); };
    function tick(now) {
        raf = 0;
        if ($('auth-screen').classList.contains('hidden')) return; // stop completely while logged in
        if (now - last >= 32) { // 30fps is plenty for a background effect and halves the CPU cost
            last = now;
            c.clearRect(0, 0, w, ht);
            trail.forEach((p, i) => { const t = i ? trail[i - 1] : m, k = i ? 0.32 : 0.45; p.x += (t.x - p.x) * k; p.y += (t.y - p.y) * k; });
            for (const d of dots) { // each grid dot leans a few px toward the nearest trail point, then eases back: no clumping
                let best = null, bd2 = R2;
                for (const p of trail) {
                    if (p.x < -500) continue;
                    const dx = p.x - d.hx, dy = p.y - d.hy, q = dx * dx + dy * dy;
                    if (q < bd2) { bd2 = q; best = p; }
                }
                const bd = Math.sqrt(bd2), near = best ? 1 - bd / R : 0;
                const tx = best ? d.hx + (best.x - d.hx) / (bd || 1) * near * PUSH : d.hx;
                const ty = best ? d.hy + (best.y - d.hy) / (bd || 1) * near * PUSH : d.hy;
                d.x += (tx - d.x) * 0.2; d.y += (ty - d.y) * 0.2;
                dot(d.x, d.y, 1.4 + near * 1.6, 0.3 + near * 0.6);
            }
            trail.forEach((p, i) => { if (p.x > -500) { const f = 1 - i / N; dot(p.x, p.y, 1.5 + f * 5, 0.15 + f * 0.85); } });
        }
        raf = requestAnimationFrame(tick);
    }
    window.startGravity = () => { if (!raf) { last = 0; raf = requestAnimationFrame(tick); } };
    window.startGravity();
})();
/* ---------- Pratr Plus ---------- */
const plusDate = (t) => t ? new Date(t * 1000).toLocaleDateString([], { year: 'numeric', month: 'short', day: 'numeric' }) : '';
async function loadPlusHistory() {
    const box = $('plus-history');
    box.textContent = 'Loading…';
    const out = await post({ action: 'boost-history' });
    box.textContent = '';
    if (!out.res.ok) return void box.append(h('div', 'side-empty', out.data.error || 'Could not load history.'));
    if (!out.data.history.length) return void box.append(h('div', 'side-empty', 'Nothing yet. Plan and overclock events are saved here forever.'));
    const LABEL = { plus_grant: 'Plus plan', plus_expire: 'Plan ended', boost_grant: 'Overclocks', server_boost: 'Server overclock' };
    out.data.history.forEach(l => {
        const r = h('div', 'logrow');
        r.append(h('time', '', stamp(l.t)), h('span', '', `${LABEL[l.ty] || l.ty} — ${l.x || ''}${l.server ? ` · ${l.server}` : ''}`));
        box.append(r);
    });
}
function openPlus() {
    const me = S.me || {}, has = !!me.plus, overclocks = me.boosts || 0;
    const plan = $('plus-plan');
    plan.textContent = '';
    const line = (k, v) => { const r = h('div', 'plan-row'); r.append(h('span', '', k), h('b', '', v)); plan.append(r); };
    line('Plan', '1 month · $1');
    if (has) {
        if (me.plusUntil) line('Active until', plusDate(me.plusUntil));
        line('Overclocks available', String(overclocks));
        if (me.nextBoosts) line('Next +2 overclocks', plusDate(me.nextBoosts));
    } else {
        if (me.plusUntil) line('Ended on', plusDate(me.plusUntil));
        line('Overclocks kept', String(overclocks));
    }
    $('plus-state').textContent = has
        ? 'Your perks are active. Renewing adds another month and keeps every overclock you already own.'
        : me.plusUntil ? 'Your plan has ended, so Plus perks are paused. Your overclocks, history and saved customisations are still here and come back when you renew.' : '';
    $('plus-buy').classList.toggle('hidden', has);
    $('plus-customize').classList.toggle('hidden', !has);
    $('plus-admin').classList.toggle('hidden', !(S.me && S.me.admin));
    if (S.me && S.me.admin && !$('flare-user').value) $('flare-user').value = S.me.username || S.me.email || '';
    $('plus-msg').textContent = '';
    $('plus-msg').style.color = '';
    openModal('modal-plus');
    loadPlusHistory();
}
$('plus-btn').onclick = openPlus;
$('plus-customize').onclick = () => { closeModals(); openProfile(); };
$('plus-buy-btn').onclick = async () => {
    const out = await post({ action: 'hq-join' });
    if (!out.res.ok) { $('plus-msg').textContent = out.data.error || 'Could not open Headquarters.'; return; }
    closeModals(); await loadServers(); openServer(out.data.server.id);
    toast('Welcome to Headquarters! Tell us you want Pratr Plus.');
};
async function refreshMe() {
    const me = await post({ action: 'me' });
    if (!me.res.ok) return;
    S.me = me.data; setMe(me.data); renderAll();
}
async function plusGrant(on) {
    const u = $('plus-user').value.trim();
    if (!u) return;
    const days = Math.max(1, Math.min(366, Math.round(Number($('plus-days').value) || 30)));
    const out = await post({ action: 'plus-grant', username: u, on, days });
    if (!out.res.ok) { $('plus-msg').style.color = ''; $('plus-msg').textContent = out.data.error || 'Failed.'; return; }
    const msg = out.data.plus
        ? `${out.data.username}: Plus active until ${plusDate(out.data.until)} · ${out.data.boosts} overclocks${out.data.granted ? ` (+${out.data.granted} this month)` : ''}.`
        : `${out.data.username}: Plus removed. Their ${out.data.boosts || 0} overclocks are kept.`;
    if (S.me && (u === S.me.username || (S.me.email && u.toLowerCase() === S.me.email.toLowerCase()))) {
        await refreshMe(); openPlus(); // openPlus clears the message box, so fill it afterwards
    }
    $('plus-msg').style.color = 'var(--bone)';
    $('plus-msg').textContent = msg;
}
$('plus-act').onclick = async () => {
    const u = $('plus-user').value.trim(), box = $('plus-log');
    if (!u) return;
    const out = await post({ action: 'activity', username: u });
    box.classList.remove('hidden'); box.textContent = '';
    if (!out.res.ok) return void box.append(h('div', 'side-empty', out.data.error || 'Failed.'));
    box.append(h('div', 'side-empty', `${out.data.username}: ${fmtDur(out.data.voice)} in voice, ${out.data.msgs} messages · ${out.data.boosts || 0} overclocks${out.data.plus ? ` · Plus until ${plusDate(out.data.plusUntil)}` : ''}`));
    out.data.logs.forEach(l => { const r = h('div', 'logrow'); r.append(h('time', '', stamp(l.t)), h('span', '', logText(l))); box.append(r); });
};
$('plus-on').onclick = () => plusGrant(true);
$('plus-off').onclick = () => plusGrant(false);

/* admins can top up any balance (including their own) in one go */
async function flareGrant(sign) {
    const u = $('flare-user').value.trim() || (S.me && S.me.username);
    if (!u) return;
    const n = Math.max(1, Math.min(1000000, Math.round(Number($('flare-count').value) || 10))) * sign;
    const out = await post({ action: 'flare-grant', username: u, count: n });
    if (!out.res.ok) { $('plus-msg').style.color = ''; $('plus-msg').textContent = out.data.error || 'Failed.'; return; }
    const mine = S.me && (u.toLowerCase() === String(S.me.username || '').toLowerCase() || u.toLowerCase() === String(S.me.email || '').toLowerCase());
    if (mine) await refreshMe();
    $('plus-msg').style.color = 'var(--bone)';
    const applied = Number(out.data.delta) || 0;
    $('plus-msg').textContent = `${out.data.username} now has ${out.data.boosts} overclocks (${applied > 0 ? '+' : ''}${applied}).`;
}
$('flare-give').onclick = () => flareGrant(1);
$('flare-take').onclick = () => flareGrant(-1);

/* ---------- unread / ping tracking, notifications and sounds ---------- */
S.unread = { channels: {}, dms: {} };
S.pingSeen = null; // previous counts, so we only alert on new messages
let audioCtx = null;
function pingSound() {
    try {
        audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
        const t = audioCtx.currentTime;
        [880, 1320].forEach((f, i) => {
            const o = audioCtx.createOscillator(), g = audioCtx.createGain();
            o.type = 'sine'; o.frequency.value = f;
            g.gain.setValueAtTime(0.0001, t + i * 0.12);
            g.gain.exponentialRampToValueAtTime(0.09, t + i * 0.12 + 0.015);
            g.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.12 + 0.22);
            o.connect(g).connect(audioCtx.destination);
            o.start(t + i * 0.12); o.stop(t + i * 0.12 + 0.24);
        });
    } catch {}
}
function notify(title, body, tag) {
    try { if ('Notification' in window && Notification.permission === 'granted' && document.hidden) new Notification(title, { body, tag, icon: '/favicon.png' }); } catch {}
}
document.addEventListener('pointerdown', () => {
    if (S.token && 'Notification' in window && Notification.permission === 'default') Notification.requestPermission().catch(() => {});
}, { once: true });
async function pollUnread() {
    if (!S.token) return;
    const out = await post({ action: 'unreads' });
    if (!out.res.ok) return;
    S.unread = out.data;
    const dms = out.data.dms || {}, chans = out.data.channels || {};
    const prev = S.pingSeen;
    const seen = { dms: {}, channels: {} };
    let total = 0;
    Object.entries(dms).forEach(([id, d]) => { seen.dms[id] = d.pings || 1; total += d.pings || 1; });
    Object.entries(chans).forEach(([id, c]) => { seen.channels[id] = c.pings || 0; total += c.pings || 0; });
    S.pingSeen = seen;
    if (prev) {
        Object.entries(seen.dms).forEach(([id, n]) => {
            if (n <= (prev.dms[id] || 0)) return;
            if (S.view === 'dm' && S.dm && S.dm.id === Number(id)) return;
            const f = S.friends.find(x => x.id === Number(id));
            const who = f ? (f.username || f.email) : 'Someone';
            pingSound(); notify(`${who} messaged you`, 'Open Pratr to reply.', `dm-${id}`);
            if (!document.hidden) toast(`${who} messaged you`);
        });
        Object.entries(seen.channels).forEach(([id, n]) => {
            if (n <= (prev.channels[id] || 0)) return;
            if (S.view === 'server' && S.channelId === Number(id)) return;
            const ch = S.channels.find(c => c.id === Number(id));
            const label = ch ? `#${ch.name}` : 'a channel';
            pingSound(); notify(`New ping in ${label}`, 'Someone mentioned you.', `ch-${id}`);
            if (!document.hidden) toast(`New ping in ${label}`);
        });
    }
    document.title = total ? `(${total}) pratr` : 'pratr';
    renderSide();
    markRead(); // a message that arrived in the open conversation is read once messages catch up
}
function hasUnread() {
    if (S.view === 'server' && S.server && S.channelId != null) return !!S.unread.channels[S.channelId];
    if (S.view === 'dm' && S.dm) return !!S.unread.dms[S.dm.id];
    return false;
}
function markRead() {
    const key = chatKey(), lastId = S.maxId[key];
    if (!key || lastId == null || !hasUnread()) return; // wait for messages to load so we send a real cursor, and skip when already read
    if (S.view === 'server') {
        delete S.unread.channels[S.channelId];
        post({ action: 'mark-read', kind: 'server', id: S.server.id, channelId: S.channelId, lastId });
    } else {
        delete S.unread.dms[S.dm.id];
        post({ action: 'mark-read', kind: 'dm', id: S.dm.id, lastId });
    }
    renderSide();
}
