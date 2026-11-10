'use strict';
const $ = (id) => document.getElementById(id);
const h = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const svg = (d) => `<svg class="ic" viewBox="0 0 24 24"><path d="${d}"/></svg>`;
const ICON = {
    hash: svg('M5 9h14M5 15h14M10 3 8 21M16 3l-2 18'),
    trash: svg('M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6'),
    plus: svg('M12 5v14M5 12h14'),
    chat: svg('M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z'),
    speaker: svg('M11 5 6 9H2v6h4l5 4zM15.5 8.5a5 5 0 0 1 0 7M19 5a9 9 0 0 1 0 14'),
    mic: svg('M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3zM19 10v2a7 7 0 0 1-14 0v-2M12 19v3'),
    micOff: svg('M2 2l20 20M9 9v3a3 3 0 0 0 5.1 2.1M15 9.3V5a3 3 0 0 0-5.9-.8M19 10v2a7 7 0 0 1-.9 3.4M5 10v2a7 7 0 0 0 11.5 5.4M12 19v3'),
    headphones: svg('M3 18v-6a9 9 0 0 1 18 0v6M21 19a2 2 0 0 1-2 2h-1v-6h3zM3 19a2 2 0 0 0 2 2h1v-6H3z'),
    x: svg('M18 6 6 18M6 6l12 12'),
    reply: svg('M9 17 4 12l5-5M4 12h10a6 6 0 0 1 6 6v1'),
    forward: svg('M15 7l5 5-5 5M20 12H9a5 5 0 0 0-5 5v1'),
    smile: svg('M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM8 14s1.5 2 4 2 4-2 4-2M9 9h.01M15 9h.01')
};

const S = {
    token: localStorage.getItem('token') || '',
    me: null, servers: [], friends: [], requests: { in: [], out: [] }, view: 'home',
    server: null, channels: [], channelId: null, dm: null, members: [],
    last: {}, chLoaded: false, sig: '', sending: false, membersOn: (() => { try { const v = localStorage.getItem('members'); if (v) return v === '1'; } catch {} return window.innerWidth > 760; })(),
    login: true, t1: null, t2: null, t3: null, t4: null, maxId: {}, fullAt: {}, voice: {}, reply: null, oc: false
};
const V = { on: false, sid: null, chId: null, name: '', sname: '', stream: null, peers: new Map(), watch: new Map(), speak: new Set(), early: {}, cool: {}, joined: {}, ice: [], muted: false, deaf: false, mutedBefore: false, sig: '', ctx: null };

/* ---------- helpers ---------- */
const color = (s) => { let x = 0; for (const c of String(s)) x = (x * 31 + c.charCodeAt(0)) % 360; return `hsl(${x} 55% 48%)`; };
const ini = (s) => (Array.from(String(s || '?'))[0] || '?').toUpperCase();
const dotCls = (st) => 'dot' + (st === 'idle' ? ' idle' : st === 'dnd' ? ' dnd' : st === 'online' || !st ? '' : ' off');
const dot = (st) => h('i', dotCls(st));
function statEl(on, total) { const s = h('small', 'stat'); s.append(h('i', 'pdot'), `${on} online`, h('i', 'pdot off'), `${total - on} offline`); return s; }
const bg = (url, name) => url ? `center/cover url("${url}")` : color(name || '?');
function avatar(name, cls = '', url = '') { const a = h('div', 'ava ' + cls, url ? '' : ini(name)); a.style.background = bg(url, name); return a; }
function userAva(u, cls = '') { const a = avatar(u.username || u.email, cls, u.avatar); if (u.plus) { a.classList.add('plus'); const c = u.glow || u.accent; if (c) a.style.setProperty('--ac', c); } return a; }
const nameColour = (u) => u.plus && u.accent ? ink(u.accent) : u.plus ? '#ffd36b' : color(u.username || u.email).replace('48%', '70%');
// Accent colours are picked freely, so lighten near-black ones before using them as text.
function ink(c) {
    const s = String(c || '');
    if (!/^#[0-9a-f]{6}$/i.test(s)) return s;
    let r = parseInt(s.slice(1, 3), 16), g = parseInt(s.slice(3, 5), 16), b = parseInt(s.slice(5, 7), 16);
    for (let i = 0; i < 12 && 0.2126 * r + 0.7152 * g + 0.0722 * b < 165; i++) { r += (255 - r) * 0.12; g += (255 - g) * 0.12; b += (255 - b) * 0.12; }
    const hx = (v) => Math.round(v).toString(16).padStart(2, '0');
    return `#${hx(r)}${hx(g)}${hx(b)}`;
}
const isOwner = () => !!(S.me && S.server && S.server.owner === S.me.id);
const SERVER_FONT = {
    rounded: '"Segoe UI Rounded", "Nunito", "Trebuchet MS", system-ui, sans-serif',
    serif: 'Georgia, "Times New Roman", serif',
    mono: 'ui-monospace, "Cascadia Code", Consolas, monospace',
    wide: '"Trebuchet MS", "Segoe UI", system-ui, sans-serif'
};
const fontOf = (key) => SERVER_FONT[key] || '';
const curChannel = () => S.channels.find(c => c.id === S.channelId) || null;
const fmtTime = (t) => new Date(t * 1000).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
function fmtDay(t) {
    const d = new Date(t * 1000), n = new Date();
    if (d.toDateString() === n.toDateString()) return 'Today';
    n.setDate(n.getDate() - 1);
    if (d.toDateString() === n.toDateString()) return 'Yesterday';
    return d.toLocaleDateString([], { month: 'long', day: 'numeric', year: 'numeric' });
}
function toast(text, err = false) {
    const el = h('div', 'toast' + (err ? ' err' : ''), text);
    $('toast-stack').append(el);
    setTimeout(() => el.remove(), 3500);
}
function chatKey() {
    if (S.view === 'server' && S.server) return `s${S.server.id}c${S.channelId}`;
    if (S.view === 'dm' && S.dm) return `d${S.dm.id}`;
    return '';
}

let inFlight = 0;
function bar(on) {
    inFlight = Math.max(0, inFlight + (on ? 1 : -1));
    const lb = document.getElementById('loadbar');
    if (lb) lb.classList.toggle('on', inFlight > 0);
}
let quietPosts = 0; // background polls set this so they never flash the loading bar
const quiet = (fn) => { quietPosts++; try { return fn(); } finally { quietPosts--; } };
async function post(payload) {
    const headers = { 'Content-Type': 'application/json' };
    if (S.token) headers.Authorization = `Bearer ${S.token}`;
    // A fast request should not flicker the bar; only show it if the round trip is slow.
    let shown = false;
    const timer = quietPosts ? 0 : setTimeout(() => { shown = true; bar(true); }, 150);
    try {
        const res = await fetch('/api/auth', { method: 'POST', headers, body: JSON.stringify(payload) });
        const data = await res.json().catch(() => ({}));
        if (res.status === 401 && S.token && !['login', 'register', 'verify'].includes(payload.action)) clearSession();
        return { res, data };
    } catch {
        return { res: { ok: false, status: 0 }, data: { error: 'Network error.' } };
    } finally { clearTimeout(timer); if (shown) bar(false); }
}

/* ---------- auth ---------- */
function setAuthMode(login) {
    S.login = login;
    $('title').textContent = login ? 'Log in to pratr' : 'Create your pratr account';
    $('subtitle').textContent = login ? 'Pick up where you left off.' : 'Takes a few seconds.';
    $('btn').textContent = login ? 'Log in' : 'Create account';
    $('toggle-text').textContent = login ? 'New here?' : 'Already have an account?';
    $('toggle').textContent = login ? 'Create an account' : 'Log in';
    $('username-wrap').classList.toggle('hidden', login);
    $('password').autocomplete = login ? 'current-password' : 'new-password';
    $('msg').textContent = '';
}
$('toggle').onclick = () => setAuthMode(!S.login);

$('form').onsubmit = async (e) => {
    e.preventDefault();
    const email = $('email').value.trim(), password = $('password').value;
    if (!email || !password) { $('msg').textContent = 'Email and password required.'; return; }
    $('msg').textContent = '';
    $('btn').disabled = true;
    const out = await post({ action: S.login ? 'login' : 'register', email, password, username: S.login ? '' : $('username').value.trim() });
    $('btn').disabled = false;
    if (!out.res.ok) { $('msg').textContent = out.data.error || 'Request failed.'; return; }
    if (S.login) return finishLogin(out.data);
    $('form').classList.add('hidden');
    $('otp-form').classList.remove('hidden');
    $('otp-note').textContent = `We sent a 6-digit code to ${email}.`;
    $('otp').focus();
};
$('otp-form').onsubmit = async (e) => {
    e.preventDefault();
    const out = await post({ action: 'verify', email: $('email').value.trim(), otp: $('otp').value.trim() });
    if (out.res.ok) finishLogin(out.data); else $('msg').textContent = out.data.error || 'Invalid code.';
};
$('resend').onclick = async () => {
    const out = await post({ action: 'register', email: $('email').value.trim(), password: $('password').value, username: $('username').value.trim() });
    if (out.res.ok) toast('New code sent.'); else $('msg').textContent = out.data.error || 'Could not resend.';
};
$('otp-back').onclick = () => { $('otp-form').classList.add('hidden'); $('form').classList.remove('hidden'); $('msg').textContent = ''; };

$('pw-toggle').onclick = () => {
    const show = $('password').type === 'password';
    $('password').type = show ? 'text' : 'password';
    $('pw-toggle').classList.toggle('on', show); $('pw-toggle').setAttribute('aria-label', show ? 'Hide password' : 'Show password');
};

function finishLogin(data) {
    S.token = data.token;
    localStorage.setItem('token', S.token);
    localStorage.setItem('email', data.email);
    $('form').classList.remove('hidden');
    $('otp-form').classList.add('hidden');
    $('password').value = ''; $('otp').value = '';
    // peak-end: check-mark on the CTA, then the card lifts away into the app
    const cta = document.querySelector('#auth-card form:not(.hidden) .btn.primary'), label = cta.textContent;
    cta.textContent = '✓'; $('auth-card').classList.add('leave');
    setTimeout(() => { boot(); $('auth-card').classList.remove('leave'); cta.textContent = label; setAuthMode(true); }, 450);
}

function clearSession() {
    clearInterval(S.t1); clearInterval(S.t2); clearInterval(S.t3); clearInterval(S.t4);
    leaveVoice(true);
    S.token = ''; S.me = null; S.servers = []; S.friends = []; S.view = 'home';
    S.server = null; S.dm = null; S.channels = []; S.channelId = null; S.sig = '';
    localStorage.removeItem('token'); localStorage.removeItem('email');
    if (typeof resetRenderMemo === 'function') resetRenderMemo();
    closeModals(); closeNav(); $('server-menu').classList.add('hidden');
    $('app').classList.add('hidden');
    $('auth-screen').classList.remove('hidden');
    if (window.startGravity) window.startGravity(); // the background stops while logged in
}
$('logout-btn').onclick = async () => { await post({ action: 'logout' }); clearSession(); };

/* ---------- boot ---------- */
function setMe(u) {
    $('chat-input').maxLength = u && u.plus ? 4000 : 2000; // Pratr Plus: longer messages
    const name = u.username || 'user';
    const letter = u.avatar ? '' : ini(name);
    $('me-name').textContent = $('hp-name').textContent = name;
    $('me-name').style.color = $('hp-name').style.color = u.plus ? ink(u.accent || '#ffd36b') : '';
    $('me-name').style.fontFamily = $('hp-name').style.fontFamily = u.plus ? fontOf(u.nameFont) : '';
    $('me-email').textContent = $('hp-email').textContent = u.email || '';
    $('hp-status').textContent = u.statusText || '';
    $('hp-status').title = u.statusText && u.statusUntil ? `Expires ${new Date(u.statusUntil * 1000).toLocaleString()}` : '';
    $('hp-status').classList.toggle('hidden', !u.statusText);
    $('hp-bio').textContent = u.bio || '';
    $('hp-bio').classList.toggle('hidden', !u.bio);
    $('hp-stats').textContent = u.voice || u.msgs ? `${fmtDur(u.voice || 0)} in voice · ${u.msgs || 0} messages` : '';
    $('me-ava').querySelector('.dot').className = dotCls(u.status);
    $('me-initial').textContent = $('hp-ava').textContent = letter;
    $('me-ava').style.background = $('hp-ava').style.background = bg(u.avatar, name);
    // Plus glow belongs to the profile card, never to the avatar icon.
    const card = document.querySelector('.profile-card');
    if (card) { const glow = !!(u.plus && u.glow); card.classList.toggle('glow', glow); if (glow) card.style.setProperty('--pg', u.glow); else card.style.removeProperty('--pg'); }
}

async function boot() {
    $('auth-screen').classList.add('hidden');
    $('app').classList.remove('hidden');
    const email = localStorage.getItem('email') || '';
    setMe({ username: email.split('@')[0], email });
    renderAll();
    const [me] = await Promise.all([post({ action: 'me' }), loadServers(), loadFriends()]);
    if (!me.res.ok) return;
    S.me = me.data;
    setMe(me.data);
    renderAll();
    startTimers();
    if (location.pathname !== '/' && location.pathname !== '/friends') await restoreRoute();
    handleInvite();
}

function startTimers() {
    clearInterval(S.t1); clearInterval(S.t2); clearInterval(S.t3);
    S.t3 = setInterval(() => { if (!document.hidden) quiet(loadVoice); }, 2500);
    clearInterval(S.t4); S.t4 = setInterval(() => quiet(pollUnread), 5000); quiet(pollUnread); // also runs hidden, for notifications
    S.t1 = setInterval(() => { if (!document.hidden && S.view !== 'home' && !S.oc) quiet(() => loadMessages(false)); }, 3000);
    S.t2 = setInterval(() => {
        if (document.hidden) return;
        quiet(async () => {
            await Promise.all([loadServers(), loadFriends()]);
            if (S.view === 'server' && S.server) {
                const before = S.channelId, old = S.channels.map(c => c.id);
                await Promise.all([loadChannels(), loadMembers()]);
                if (V.on && V.sid === S.server.id && !S.channels.some(c => c.id === V.chId)) leaveVoice(true);
                const fresh = S.channels.filter(c => !old.includes(c.id));
                if (fresh.length && old.length) toast(`New channel #${fresh[0].name}`);
                if (before !== S.channelId) { renderAll(); loadMessages(true); } else renderSide();
            }
        });
    }, 5000);
}
/* ---------- data ---------- */
async function loadServers() {
    const out = await post({ action: 'servers' });
    if (!out.res.ok) return;
    S.servers = out.data.servers || [];
    if (S.server) {
        const fresh = S.servers.find(s => s.id === S.server.id);
        if (fresh) S.server = fresh; else if (S.view === 'server') { goHome(); return; }
    }
    renderRail();
}
async function loadFriends() {
    const out = await post({ action: 'friends' });
    if (!out.res.ok) return;
    S.friends = out.data.friends || [];
    const prevIn = new Set(S.requests.in.map(u => u.id));
    S.requests = { in: out.data.incoming || [], out: out.data.outgoing || [] };
    if (S.me) S.requests.in.forEach(u => { if (!prevIn.has(u.id)) toast(`${u.username} sent you a friend request`); });
    if (S.dm) { S.dm = S.friends.find(x => x.id === S.dm.id) || S.dm; if (S.view === 'dm') renderDmCard(); }
    renderSide();
    if (S.view === 'home') renderFriends();
}
async function loadChannels(reset = false) {
    if (!S.server) return;
    const out = await post({ action: 'channels', id: S.server.id });
    if (!out.res.ok) return;
    S.channels = out.data.channels || [];
    S.chLoaded = true;
    if (reset || !S.channels.some(c => c.id === S.channelId)) {
        const rem = S.channels.find(c => c.id === S.last[S.server.id]);
        const pick = rem || S.channels[0];
        S.channelId = pick ? pick.id : null;
    }
}
async function loadMembers() {
    if (!S.server) return;
    const sid = S.server.id;
    const out = await post({ action: 'members', id: sid });
    if (!out.res.ok || !S.server || S.server.id !== sid) return;
    const prevNames = S.members.map(m => m.username).join();
    S.members = out.data.members || [];
    S.server.owner = out.data.owner;
    renderMembers();
    if (S.members.map(m => m.username).join() !== prevNames) { S.sig = ''; loadMessages(false); }
}
async function loadMessages(force = false) {
    const key = chatKey();
    if (!key) return;
    const isServer = S.view === 'server';
    if (isServer && S.channelId == null) return;
    if (isServer && (curChannel() || {}).kind === 'v') return;
    const after = S.maxId[key];
    const full = force || after == null || Date.now() - (S.fullAt[key] || 0) > 30000; // periodic full resync catches reactions/deletes on older messages
    const out = await post({ action: 'messages', kind: isServer ? 'server' : 'dm', id: isServer ? S.server.id : S.dm.id, ...(isServer ? { channelId: S.channelId } : {}), ...(!full ? { afterId: after } : {}) });
    if (chatKey() !== key) return; // user navigated away
    if (out.res.status === 404 && isServer) { await loadChannels(); renderAll(); return; }
    if (!out.res.ok) return;
    const fresh = out.data.messages || [];
    if (full) { S.fullAt[key] = Date.now(); renderMessages(fresh, force); markRead(); return; }
    if (!fresh.length) { markRead(); return; }
    let list = S_curMsgs;
    for (const f of fresh) list = list.filter(p => !(p.pending && p.text === f.text && p.author.id === f.author.id)); // real message arrived, drop its optimistic twin
    renderMessages([...list, ...fresh].slice(-100), false);
    markRead(); // now we have a real cursor, so an open conversation clears its badge
}

/* ---------- navigation ---------- */
function closeNav() { document.body.classList.remove('nav-open'); }
document.querySelectorAll('[data-menu]').forEach(b => b.onclick = () => document.body.classList.toggle('nav-open'));
$('scrim').onclick = closeNav;
$('rail-home').onclick = () => { goHome(); closeNav(); };
$('nav-friends').onclick = () => { goHome(); closeNav(); };
$('rail-discover').onclick = () => {
    S.view = 'discover'; S.server = null; S.dm = null; S.channels = []; S.channelId = null; S.members = []; S.sig = '';
    renderAll(); loadDiscover(); syncUrl(); closeNav();
};

/* ---------- discover ---------- */
let discT;
async function loadDiscover() {
    const out = await post({ action: 'discover', q: $('disc-q').value });
    if (!out.res.ok || S.view !== 'discover') return;
    const grid = $('disc-grid'), list = out.data.servers || [];
    grid.textContent = '';
    if (!list.length) grid.append(h('div', 'empty-note', 'No public servers found. Owners can list theirs in Server settings.'));
    list.forEach(s => {
        const c = h('div', 'disc-card'), b = h('div', 'disc-body'), btn = h('button', 'btn ' + (s.joined ? 'ghost' : 'primary'), s.joined ? 'Open' : 'Join');
        if (s.banner) { c.classList.add('has-banner'); c.style.setProperty('--banner', `url("${s.banner}")`); }
        btn.onclick = async () => {
            if (!s.joined) {
                const j = await post({ action: 'server-join-public', id: s.id });
                if (!j.res.ok) return toast(j.data.error || 'Could not join.', true);
                await loadServers(); toast(`Joined ${s.name}`);
            }
            openServer(s.id);
        };
        const name = h('strong', '', s.name);
        if (s.accent) name.style.color = ink(s.accent);
        if (s.font && fontOf(s.font)) name.style.fontFamily = fontOf(s.font);
        if (s.boosts) { const star = h('em', 'badge boost', `✦ ${s.boosts}`); star.title = `${s.boosts} overclocks · ${s.tier || 0} perk tiers`; name.append(' ', star); }
        b.append(name, h('p', '', s.desc || 'No description yet.'), statEl(s.online || 0, s.count), btn);
        c.append(h('div', 'disc-top'), avatar(s.name, 'xl', s.logo || s.icon), b);
        grid.append(c);
    });
}
$('disc-q').oninput = () => { clearTimeout(discT); discT = setTimeout(loadDiscover, 250); };

function goHome() {
    S.view = 'home'; S.server = null; S.dm = null; S.channels = []; S.channelId = null; S.members = []; S.sig = ''; S.oc = false;
    renderAll(); syncUrl();
}
async function openServer(id) {
    const s = S.servers.find(x => x.id === id);
    if (!s) return;
    S.view = 'server'; S.server = s; S.dm = null; S.chLoaded = false; S.channels = []; S.channelId = null; S.members = []; S.sig = ''; S.oc = false;
    $('messages').textContent = '';
    renderAll();
    await loadChannels(true);
    renderAll();
    loadMembers();
    loadMessages(true);
    syncUrl();
    closeNav();
}
function openDM(user) {
    S.view = 'dm'; S.dm = user; S.server = null; S.channels = []; S.channelId = null; S.sig = ''; S.oc = false;
    $('messages').textContent = '';
    renderAll();
    loadMessages(true); // it marks the conversation read once the real cursor is known
    syncUrl();
    closeNav();
    $('chat-input').focus();
}
function selectChannel(id) {
    S.channelId = id; S.last[S.server.id] = id; S.sig = ''; S.oc = false;
    $('messages').textContent = '';
    renderSide(); renderMain();
    loadMessages(true); // it marks the conversation read once the real cursor is known
    syncUrl();
    closeNav();
    const vc = curChannel();
    if (vc && vc.kind === 'v') joinVoice(vc);
}

/* ---------- per-area URLs ---------- */
let navSilent = false; // true while the current view came from the address bar, so we do not push it again
function routePath() {
    if (S.view === 'discover') return '/discover';
    if (S.view === 'dm' && S.dm) return '/dm/' + encodeURIComponent(S.dm.username || S.dm.id);
    if (S.view === 'server' && S.server) return '/channels/' + S.server.id + (S.oc ? '/overclock' : S.channelId != null ? '/' + S.channelId : '');
    return '/friends';
}
function syncUrl(replace) {
    if (navSilent || !S.me) return;
    const p = routePath();
    if (location.pathname === p) return;
    try { history[replace ? 'replaceState' : 'pushState']({ p }, '', p); } catch {}
}
async function goLink(path) {
    const parts = String(path || '').split('/').filter(Boolean);
    if (parts[0] === 'dm' && parts[1]) {
        const key = decodeURIComponent(parts[1]).toLowerCase();
        const u = S.friends.find(f => String(f.username || '').toLowerCase() === key || String(f.id) === key);
        if (!u) return toast('That conversation is not available — you may not be friends yet.', true);
        return openDM(u);
    }
    if (parts[0] === 'channels' && parts[1]) {
        const sid = Number(parts[1]);
        if (!S.servers.some(s => s.id === sid)) return toast('You are not a member of that server.', true);
        await openServer(sid);
        if (parts[2] === 'overclock') return openBoosts();
        const cid = Number(parts[2]);
        const c = S.channels.find(x => x.id === cid);
        if (!c) return;
        if (c.kind === 'v') { S.channelId = cid; S.last[sid] = cid; S.sig = ''; renderSide(); renderMain(); } // share a voice channel without forcing a join
        else selectChannel(cid);
        return;
    }
    if (parts[0] === 'discover') {
        S.view = 'discover'; S.server = null; S.dm = null; S.channels = []; S.channelId = null; S.members = []; S.sig = ''; S.oc = false;
        renderAll(); loadDiscover(); syncUrl();
        return;
    }
    goHome();
}
async function restoreRoute() {
    navSilent = true;
    try {
        await goLink(location.pathname);
        if (routePath() !== location.pathname) history.replaceState({}, '', routePath()); // bad link or not available: show a clean URL
    } finally { navSilent = false; }
}
window.addEventListener('popstate', () => { if (S.token && S.me) restoreRoute(); });
$('oc-back').onclick = () => closeBoosts();
$('share-btn').onclick = () => copy(location.origin + routePath());

/* ---------- composer ---------- */
const input = $('chat-input');
const autosize = () => { input.style.height = 'auto'; input.style.height = Math.min(input.scrollHeight, 160) + 'px'; };
input.addEventListener('input', autosize);
input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); sendMessage(); }
});
$('chat-form').onsubmit = (e) => { e.preventDefault(); sendMessage(); };
$('rb-x').onclick = () => { cancelReply(); input.focus(); };

const snip = (t) => String(t || '').replace(/\s+/g, ' ').trim().slice(0, 90);
function startReply(m) {
    S.reply = { key: chatKey(), m };
    paintReplyBar();
    input.focus();
}
function cancelReply() {
    S.reply = null;
    paintReplyBar();
}
function paintReplyBar() {
    const bar = $('reply-bar');
    if (!bar) return;
    const r = S.reply;
    if (r && r.key !== chatKey()) S.reply = null;
    if (!S.reply) { bar.classList.add('hidden'); return; }
    $('rb-name').textContent = S.reply.m.author.username;
    $('rb-snip').textContent = snip(S.reply.m.text);
    bar.classList.remove('hidden');
}

async function sendMessage() {
    const text = input.value.trim();
    if (!text || S.sending) return;
    const isServer = S.view === 'server';
    if (isServer && S.channelId == null) return toast('This server has no text channel yet.', true);
    const key = chatKey();
    const replied = S.reply && S.reply.key === key ? S.reply.m : null;
    input.value = ''; autosize(); input.focus();
    if (replied) cancelReply();
    const temp = { id: -Date.now(), mine: true, pending: true, text, t: Math.floor(Date.now() / 1000), rx: [], reply: replied ? { id: replied.id, username: replied.author.username, text: snip(replied.text) } : null, author: { id: S.me.id, username: S.me.username, avatar: S.me.avatar, plus: S.me.plus, accent: S.me.accent, glow: S.me.glow, nameFont: S.me.nameFont } };
    renderMessages([...S_curMsgs, temp], true); // paint now, confirm with the server's echo
    const out = await post({ action: 'send', kind: isServer ? 'server' : 'dm', id: isServer ? S.server.id : S.dm.id, text, ...(isServer ? { channelId: S.channelId } : {}), ...(replied ? { replyId: replied.id } : {}) });
    if (chatKey() !== key) return; // user navigated away while it was sending
    if (out.res.ok) { S.sig = ''; if (S.me) S.me.msgs = (S.me.msgs || 0) + 1; renderMessages([...S_curMsgs.filter(m => m.id !== temp.id && m.id !== out.data.message.id), out.data.message], true); }
    else { renderMessages(S_curMsgs.filter(m => m.id !== temp.id), true); input.value = text; autosize(); toast(out.data.error || 'Message failed.', true); }
}

/* ---------- friends ---------- */
async function addFriend(q) {
    const out = await post({ action: 'friend-add', username: q });
    if (out.res.ok) { toast(out.data.accepted ? `You and ${out.data.friend.username} are now friends` : 'Friend request sent.'); loadFriends(); }
    else toast(out.data.error || 'Could not send the request.', true);
    return out.res.ok;
}
$('friend-add-form').onsubmit = async (e) => {
    e.preventDefault();
    if (await addFriend($('friend-add-input').value)) $('friend-add-input').value = '';
};

/* ---------- mentions ---------- */
const mnames = () => S.view === 'server' ? S.members.map(m => m.username).filter(Boolean) : [S.me?.username, S.dm?.username].filter(Boolean);
function segments(text, names) { // split text into plain strings and {m, who} mention objects (known usernames only)
    const out = [], lower = text.toLowerCase(), sorted = [...new Set(names)].sort((x, y) => y.length - x.length);
    let i = 0, last = 0;
    while ((i = text.indexOf('@', i)) !== -1) {
        const n = (i === 0 || !/\w/.test(text[i - 1])) && sorted.find(n => lower.startsWith('@' + n.toLowerCase(), i) && !/\w/.test(text[i + 1 + n.length] || ' '));
        if (n) { if (i > last) out.push(text.slice(last, i)); out.push({ m: text.substr(i, n.length + 1), who: n }); i += n.length + 1; last = i; } else i++;
    }
    if (last < text.length) out.push(text.slice(last));
    return out;
}
/* links: only http(s) is ever turned into an anchor, so nothing else can sneak in */
const URL_RE = /https?:\/\/[^\s<>"']+/g;
const cleanUrl = (s) => String(s).replace(/[.,!?;:)\]]+$/, '');
const urlsIn = (text) => [...String(text || '').matchAll(URL_RE)].map(m => cleanUrl(m[0]));
function linkLabel(u) {
    const host = u.host.replace(/^www\./, ''), tail = (u.pathname === '/' ? '' : u.pathname) + (u.search || '');
    const s = host + tail.replace(/\/$/, '');
    return s.length > 64 ? s.slice(0, 61) + '…' : s;
}
function linkEl(raw) {
    let u; try { u = new URL(raw); } catch { return document.createTextNode(raw); }
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return document.createTextNode(raw);
    const internal = u.origin === location.origin;
    const a = h('a', 'mlink' + (internal ? ' int' : ''), linkLabel(u));
    a.href = raw; a.rel = 'noopener noreferrer';
    if (internal) a.onclick = (e) => { e.preventDefault(); goLink(u.pathname); };
    else a.target = '_blank';
    return a;
}
function appendLinks(el, text) {
    URL_RE.lastIndex = 0;
    let last = 0, m;
    while ((m = URL_RE.exec(text))) {
        if (m.index > last) window.emojiArt.append(el, text.slice(last, m.index));
        const raw = m[0], clean = cleanUrl(raw);
        el.append(linkEl(clean));
        if (clean.length < raw.length) el.append(raw.slice(clean.length)); // keep trailing punctuation out of the link
        last = m.index + raw.length;
    }
    if (last < text.length) window.emojiArt.append(el, text.slice(last));
}
function linkEmbed(path) { // a rich card for pratr links pasted in chat
    const parts = String(path || '').split('/').filter(Boolean);
    const box = h('div', 'embed'), meta = h('div', 'meta');
    const btn = h('button', 'btn primary', 'Open'); btn.type = 'button'; btn.onclick = () => goLink(path);
    if (parts[0] === 'dm' && parts[1]) {
        const key = decodeURIComponent(parts[1]).toLowerCase();
        const u = S.friends.find(f => String(f.username || '').toLowerCase() === key || String(f.id) === key);
        meta.append(h('strong', '', u ? `Direct message with ${u.username}` : 'Direct message'), h('span', 'lnk', 'pratr link'));
        box.append(userAva(u || { username: key }, 'sm'), meta, btn);
        return box;
    }
    if (parts[0] === 'channels' && parts[1]) {
        const sid = Number(parts[1]), cid = Number(parts[2] || 0);
        const s = S.servers.find(x => x.id === sid);
        const ch = s && S.server && S.server.id === sid ? S.channels.find(c => c.id === cid) : null;
        meta.append(h('strong', '', cid ? `#${ch ? ch.name : cid}` : (s ? s.name : 'Server')), h('span', 'lnk', s ? s.name : 'You are not a member'));
        box.append(h('div', 'embed-ic', cid ? '#' : '▤'), meta, s ? btn : h('span', 'lnk', ''));
        return box;
    }
    return null;
}
function customEmojiMap() {
    // Every server the user belongs to, so :name: works in any chat (Discord-style).
    const m = new Map(), add = (s) => { if (s && Array.isArray(s.emoji)) s.emoji.forEach(e => { if (e && e.n && e.u && !m.has(e.n)) m.set(e.n, e.u); }); };
    add(S.server);
    (S.servers || []).forEach(add);
    return m;
}
const CUSTOM_TOKEN = /:([a-z0-9_]{2,20}):/g;
function appendCustomEmoji(el, text, map) {
    if (!map || !map.size) return appendLinks(el, text);
    let last = 0;
    text.replace(CUSTOM_TOKEN, (full, n, i) => {
        const u = map.get(n);
        if (!u) return full;
        if (i > last) appendLinks(el, text.slice(last, i));
        const img = h('img', 'custom-emoji');
        img.src = u; img.alt = `:${n}:`; img.title = `:${n}:`; img.loading = 'lazy';
        el.append(img);
        last = i + full.length;
        return full;
    });
    if (last < text.length) appendLinks(el, text.slice(last));
}
function richText(text, canAll) { // returns [element, mentionsMe]; text nodes only, so no HTML injection
    const t = h('div', 'text'), mine = (S.me?.username || '').toLowerCase();
    const map = customEmojiMap();
    let me = false;
    segments(text, canAll ? [...mnames(), 'everyone', 'here'] : mnames()).forEach(s => {
        if (typeof s === 'string') return appendCustomEmoji(t, s, map);
        const all = canAll && /^(everyone|here)$/i.test(s.who), hit = all || s.who.toLowerCase() === mine; if (hit) me = true;
        const sp = h('span', 'mention' + (hit ? ' me' : '') + (all ? ' all' : ''), s.m);
        sp.onclick = all ? () => { if (typeof openRoleCard === 'function') openRoleCard(s.who.toLowerCase()); }
            : () => { if (typeof openUserCard === 'function') openUserCard(s.who); };
        t.append(sp);
    });
    return [t, me];
}
const mpop = $('mention-pop'); let mSel = 0, mList = [];
function updateMentions() {
    const m = input.value.slice(0, input.selectionStart).match(/(^|\s)@([^\s@]{0,20})$/);
    mList = m ? [...new Set([...mnames(), ...(S.view === 'server' && isOwner() ? ['everyone', 'here'] : [])])].filter(n => n.toLowerCase().startsWith(m[2].toLowerCase())).slice(0, 6) : [];
    if (!mList.length) return mpop.classList.add('hidden');
    mSel = Math.min(mSel, mList.length - 1);
    mpop.textContent = '';
    mList.forEach((n, i) => { const b = h('button', i === mSel ? 'on' : '', '@' + n); b.type = 'button'; b.onmousedown = (e) => { e.preventDefault(); pickMention(n); }; mpop.append(b); });
    mpop.classList.remove('hidden');
}
function pickMention(n) {
    const pos = input.selectionStart, start = input.value.slice(0, pos).replace(/@[^\s@]{0,20}$/, '').length;
    input.setRangeText('@' + n + ' ', start, pos, 'end'); input.focus(); mpop.classList.add('hidden'); autosize();
}
input.addEventListener('input', () => { mSel = 0; updateMentions(); });
input.addEventListener('blur', () => mpop.classList.add('hidden'));
input.addEventListener('keydown', (e) => { // capture: runs before the Enter-to-send handler
    if (mpop.classList.contains('hidden')) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { mSel = (mSel + (e.key === 'ArrowDown' ? 1 : mList.length - 1)) % mList.length; updateMentions(); }
    else if (e.key === 'Enter' || e.key === 'Tab') pickMention(mList[mSel]);
    else if (e.key === 'Escape') mpop.classList.add('hidden');
    else return;
    e.preventDefault(); e.stopImmediatePropagation();
}, true);
$('emoji-btn').onclick = () => {
    if (pop.classList.contains('hidden')) { if (typeof rebuildEmojiTabs === 'function') rebuildEmojiTabs(); pop.classList.remove('hidden'); }
    else pop.classList.add('hidden');
};
document.addEventListener('click', (e) => { if (!e.target.closest('#emoji-pop, #emoji-btn')) pop.classList.add('hidden'); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') pop.classList.add('hidden'); });
