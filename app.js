'use strict';
const $ = (id) => document.getElementById(id);
const h = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const svg = (d) => `<svg class="ic" viewBox="0 0 24 24"><path d="${d}"/></svg>`;
const ICON = {
    hash: svg('M5 9h14M5 15h14M10 3 8 21M16 3l-2 18'),
    trash: svg('M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6'),
    plus: svg('M12 5v14M5 12h14'),
    chat: svg('M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z')
};

const S = {
    token: localStorage.getItem('token') || '',
    me: null, servers: [], friends: [], view: 'home',
    server: null, channels: [], channelId: null, dm: null, members: [],
    last: {}, chLoaded: false, sig: '', sending: false, membersOn: (() => { try { const v = localStorage.getItem('members'); if (v) return v === '1'; } catch {} return window.innerWidth > 760; })(),
    login: true, t1: null, t2: null, maxId: {}
};

/* ---------- helpers ---------- */
const color = (s) => { let x = 0; for (const c of String(s)) x = (x * 31 + c.charCodeAt(0)) % 360; return `hsl(${x} 55% 48%)`; };
const ini = (s) => (Array.from(String(s || '?'))[0] || '?').toUpperCase();
const dotCls = (st) => 'dot' + (st === 'idle' ? ' idle' : st === 'dnd' ? ' dnd' : st === 'online' || !st ? '' : ' off');
const dot = (st) => h('i', dotCls(st));
function statEl(on, total) { const s = h('small', 'stat'); s.append(h('i', 'pdot'), `${on} online`, h('i', 'pdot off'), `${total - on} offline`); return s; }
const bg = (url, name) => url ? `center/cover url("${url}")` : color(name || '?');
function avatar(name, cls = '', url = '') { const a = h('div', 'ava ' + cls, url ? '' : ini(name)); a.style.background = bg(url, name); return a; }
const isOwner = () => !!(S.me && S.server && S.server.owner === S.me.id);
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

async function post(payload) {
    const headers = { 'Content-Type': 'application/json' };
    if (S.token) headers.Authorization = `Bearer ${S.token}`;
    try {
        const res = await fetch('/api/auth', { method: 'POST', headers, body: JSON.stringify(payload) });
        const data = await res.json().catch(() => ({}));
        if (res.status === 401 && S.token && !['login', 'register', 'verify'].includes(payload.action)) clearSession();
        return { res, data };
    } catch {
        return { res: { ok: false, status: 0 }, data: { error: 'Network error.' } };
    }
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
    clearInterval(S.t1); clearInterval(S.t2);
    S.token = ''; S.me = null; S.servers = []; S.friends = []; S.view = 'home';
    S.server = null; S.dm = null; S.channels = []; S.channelId = null; S.sig = '';
    localStorage.removeItem('token'); localStorage.removeItem('email');
    closeModals(); closeNav(); $('server-menu').classList.add('hidden');
    $('app').classList.add('hidden');
    $('auth-screen').classList.remove('hidden');
}
$('logout-btn').onclick = async () => { await post({ action: 'logout' }); clearSession(); };

/* ---------- boot ---------- */
function setMe(u) {
    const name = u.username || 'user';
    const letter = u.avatar ? '' : ini(name);
    $('me-name').textContent = $('hp-name').textContent = name;
    $('me-email').textContent = $('hp-email').textContent = u.email || '';
    $('hp-bio').textContent = u.bio || '';
    $('me-ava').querySelector('.dot').className = dotCls(u.status);
    $('me-initial').textContent = $('hp-ava').textContent = letter;
    $('me-ava').style.background = $('hp-ava').style.background = bg(u.avatar, name);
}

async function boot() {
    $('auth-screen').classList.add('hidden');
    $('app').classList.remove('hidden');
    const email = localStorage.getItem('email') || '';
    setMe({ username: email.split('@')[0], email });
    renderAll();
    const me = await post({ action: 'me' });
    if (!me.res.ok) return;
    S.me = me.data;
    setMe(me.data);
    await Promise.all([loadServers(), loadFriends()]);
    renderAll();
    startTimers();
    handleInvite();
}

function startTimers() {
    clearInterval(S.t1); clearInterval(S.t2);
    S.t1 = setInterval(() => { if (!document.hidden && S.view !== 'home') loadMessages(false); }, 3000);
    S.t2 = setInterval(async () => {
        if (document.hidden) return;
        await loadServers(); await loadFriends();
        if (S.view === 'server' && S.server) {
            const before = S.channelId, old = S.channels.map(c => c.id);
            await loadChannels();
            loadMembers();
            const fresh = S.channels.filter(c => !old.includes(c.id));
            if (fresh.length && old.length) toast(`New channel #${fresh[0].name}`);
            if (before !== S.channelId) { renderAll(); loadMessages(true); } else renderSide();
        }
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
    const out = await post({ action: 'messages', kind: isServer ? 'server' : 'dm', id: isServer ? S.server.id : S.dm.id, ...(isServer ? { channelId: S.channelId } : {}) });
    if (chatKey() !== key) return; // user navigated away
    if (out.res.status === 404 && isServer) { await loadChannels(); renderAll(); return; }
    if (!out.res.ok) return;
    renderMessages(out.data.messages || [], force);
}

/* ---------- navigation ---------- */
function closeNav() { document.body.classList.remove('nav-open'); }
document.querySelectorAll('[data-menu]').forEach(b => b.onclick = () => document.body.classList.toggle('nav-open'));
$('scrim').onclick = closeNav;
$('rail-home').onclick = () => { goHome(); closeNav(); };
$('nav-friends').onclick = () => { goHome(); closeNav(); };
$('rail-discover').onclick = () => {
    S.view = 'discover'; S.server = null; S.dm = null; S.channels = []; S.channelId = null; S.members = []; S.sig = '';
    renderAll(); loadDiscover(); closeNav();
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
        btn.onclick = async () => {
            if (!s.joined) {
                const j = await post({ action: 'server-join-public', id: s.id });
                if (!j.res.ok) return toast(j.data.error || 'Could not join.', true);
                await loadServers(); toast(`Joined ${s.name}`);
            }
            openServer(s.id);
        };
        b.append(h('strong', '', s.name), h('p', '', s.desc || 'No description yet.'), statEl(s.online || 0, s.count), btn);
        c.append(h('div', 'disc-top'), avatar(s.name, 'xl', s.icon), b);
        grid.append(c);
    });
}
$('disc-q').oninput = () => { clearTimeout(discT); discT = setTimeout(loadDiscover, 250); };

function goHome() {
    S.view = 'home'; S.server = null; S.dm = null; S.channels = []; S.channelId = null; S.members = []; S.sig = '';
    renderAll();
}
async function openServer(id) {
    const s = S.servers.find(x => x.id === id);
    if (!s) return;
    S.view = 'server'; S.server = s; S.dm = null; S.chLoaded = false; S.channels = []; S.channelId = null; S.members = []; S.sig = '';
    $('messages').textContent = '';
    renderAll();
    await loadChannels(true);
    renderAll();
    loadMembers();
    loadMessages(true);
    closeNav();
}
function openDM(user) {
    S.view = 'dm'; S.dm = user; S.server = null; S.channels = []; S.channelId = null; S.sig = '';
    $('messages').textContent = '';
    renderAll();
    loadMessages(true);
    closeNav();
    $('chat-input').focus();
}
function selectChannel(id) {
    S.channelId = id; S.last[S.server.id] = id; S.sig = '';
    $('messages').textContent = '';
    renderSide(); renderMain();
    loadMessages(true);
    closeNav();
}

/* ---------- rendering ---------- */
function renderAll() { renderRail(); renderSide(); renderMain(); renderMembers(); }

function renderRail() {
    $('rail-home').classList.toggle('active', S.view === 'home' || S.view === 'dm');
    $('rail-discover').classList.toggle('active', S.view === 'discover');
    const box = $('rail-servers');
    box.textContent = '';
    S.servers.forEach(s => {
        const b = h('button', 'rail-btn' + (S.server && S.server.id === s.id ? ' active' : ''), s.icon ? '' : ini(s.name));
        if (s.icon) b.style.background = bg(s.icon);
        b.title = s.name;
        b._ctx = () => [...(s.owner === S.me?.id ? [['Server settings', () => openServer(s.id).then(openServerSettings)]] : []), ['Copy server name', () => copy(s.name)], ...idItem('server', s.id)];
        b.onclick = () => openServer(s.id);
        box.append(b);
    });
}

function renderSide() {
    const server = S.view === 'server' && S.server;
    $('side-title').textContent = server ? S.server.name : S.view === 'discover' ? 'Discover' : 'Home';
    $('server-menu-btn').classList.toggle('hidden', !server);
    $('home-list').classList.toggle('hidden', !!server);
    $('server-list').classList.toggle('hidden', !server);
    $('nav-friends').classList.toggle('active', S.view === 'home');

    const dms = $('dm-list');
    dms.textContent = '';
    if (!S.friends.length) dms.append(h('div', 'side-empty', 'Add a friend to start chatting.'));
    S.friends.forEach(u => {
        const b = h('button', 'dm-item' + (S.view === 'dm' && S.dm && S.dm.id === u.id ? ' active' : ''));
        const da = avatar(u.username || u.email, 'sm', u.avatar); da.append(dot(u.status));
        b.append(da, h('span', '', u.username || u.email));
        b.onclick = () => openDM(u);
        b._ctx = userItems(u);
        dms.append(b);
    });

    const list = $('channel-list');
    list.textContent = '';
    if (!server) return;
    if (!S.channels.length) list.append(h('div', 'side-empty', 'No text channels yet.'));
    const cats = {};
    S.channels.forEach(c => (cats[c.category || 'TEXT CHANNELS'] = cats[c.category || 'TEXT CHANNELS'] || []).push(c));
    Object.entries(cats).forEach(([cat, chans]) => {
        const t = h('div', 'sec-title');
        t.append(h('span', '', cat));
        if (isOwner()) {
            const add = h('button', 'icon-btn'); add.innerHTML = ICON.plus; add.title = 'Create channel';
            add.onclick = () => openChannelModal(cat);
            t.append(add);
        }
        list.append(t);
        chans.forEach(c => {
            const it = h('div', 'ch-item' + (c.id === S.channelId ? ' active' : ''));
            it.tabIndex = 0; it.setAttribute('role', 'button');
            it.innerHTML = ICON.hash;
            it.append(h('span', '', c.name));
            if (isOwner()) {
                const del = h('button', 'ch-del'); del.innerHTML = ICON.trash; del.title = 'Delete channel';
                del.onclick = (e) => { e.stopPropagation(); deleteChannel(c); };
                it.append(del);
            }
            it._ctx = [['Open channel', () => selectChannel(c.id)], ['Copy name', () => copy(c.name)], ...idItem('channel', c.id), ...(isOwner() ? ['-', ['Delete channel', () => deleteChannel(c), true]] : [])];
            it.onclick = () => selectChannel(c.id);
            it.onkeydown = (e) => { if (e.key === 'Enter') selectChannel(c.id); };
            list.append(it);
        });
    });
}

function renderFriends() {
    $('friend-count').textContent = S.friends.length;
    const grid = $('friend-grid');
    grid.textContent = '';
    if (!S.friends.length) { grid.style.display = 'block'; grid.append(h('div', 'empty-note', 'No friends yet — add someone above to start a conversation.')); return; }
    grid.style.display = '';
    S.friends.forEach(u => {
        const c = h('div', 'friend-card');
        const meta = h('div', 'meta');
        meta.append(h('strong', '', u.username || u.email), h('small', '', u.bio || u.email || ''));
        const btn = h('button', 'btn ghost', 'Message');
        btn.onclick = () => openDM(u);
        c._ctx = userItems(u);
        const av = avatar(u.username || u.email, '', u.avatar); av.append(dot(u.status));
        c.append(av, meta, btn);
        grid.append(c);
    });
}

function renderMain() {
    const home = S.view === 'home', disc = S.view === 'discover';
    $('view-home').classList.toggle('hidden', !home);
    $('view-discover').classList.toggle('hidden', !disc);
    $('view-chat').classList.toggle('hidden', home || disc);
    if (home) { renderFriends(); return; }
    if (disc) return;
    const isServer = S.view === 'server';
    const ch = isServer ? curChannel() : null;
    const icon = $('chat-icon');
    icon.textContent = '';
    if (isServer) {
        icon.innerHTML = ICON.hash;
        $('chat-name').textContent = ch ? ch.name : S.server.name;
        $('chat-sub').textContent = ch ? S.server.name : '';
    } else {
        const n = S.dm.username || S.dm.email;
        icon.append(avatar(n, 'sm', S.dm.avatar));
        $('chat-name').textContent = n;
        $('chat-sub').textContent = '';
    }
    $('invite-btn').classList.toggle('hidden', !isServer);
    $('members-btn').classList.remove('hidden');
    $('members-btn').title = isServer ? 'Members' : 'Profile';
    $('members-btn').classList.toggle('on', S.membersOn);
    $('chat-body').classList.toggle('members-on', isServer && S.membersOn);
    $('chat-body').classList.toggle('dm-on', !isServer && S.membersOn);
    if (!isServer) renderDmCard();

    const none = isServer && S.chLoaded && !ch;
    $('messages').classList.toggle('hidden', none);
    $('composer-wrap').classList.toggle('hidden', isServer && !ch);
    $('chat-empty').classList.toggle('hidden', !none);
    if (none) renderEmpty();
    $('chat-input').placeholder = isServer ? (ch ? `Message #${ch.name}` : '') : `Message @${S.dm.username || S.dm.email}`;
}

function renderEmpty() {
    const box = $('chat-empty');
    box.textContent = '';
    const big = h('div', 'big'); big.innerHTML = ICON.hash;
    box.append(big, h('h2', '', 'No text channels'));
    if (isOwner()) {
        box.append(h('p', '', 'This server has no text channels yet. Create one so people can start talking.'));
        const b = h('button', 'btn primary', 'Create channel');
        b.onclick = () => openChannelModal();
        box.append(b);
    } else {
        box.append(h('p', '', 'The owner hasn\'t created a text channel yet. Messaging is disabled until they do.'));
    }
}

function renderDmCard() {
    const u = S.dm, card = $('dm-card');
    if (!u) return;
    const n = u.username || u.email, body = h('div', 'dm-body'), about = h('div', 'dm-about');
    about.append(h('h5', '', 'About me'), h('p', '', u.bio || 'No bio yet.'));
    body.append(h('strong', '', n), h('span', 'badge', 'FRIEND'), h('small', 'muted', SLABEL[u.status] || 'Offline'), about);
    card.textContent = '';
    card.append(h('div', 'dm-banner'), avatar(n, 'xl', u.avatar), body);
}

function renderMembers() {
    $('members-count').textContent = S.members.length;
    const box = $('members-list');
    box.textContent = '';
    const online = S.members.filter(m => m.status !== 'offline'), offline = S.members.filter(m => !online.includes(m));
    [['Online', online], ['Offline', offline]].forEach(([title, list]) => {
        if (!list.length) return;
        box.append(h('div', 'mem-sec', `${title} — ${list.length}`));
        list.forEach(m => {
            const r = h('div', 'mem' + (title === 'Offline' ? ' off' : '')), a = avatar(m.username, 'sm', m.avatar);
            a.append(dot(m.status));
            r._ctx = userItems(m); r.title = m.bio || '';
            r.append(a, h('span', '', m.username || 'Member'));
            if (S.server && m.id === S.server.owner) r.append(h('em', 'badge', 'OWNER'));
            box.append(r);
        });
    });
}

function renderMessages(list, force) {
    const box = $('messages');
    const sig = list.map(m => m.id).join(',');
    if (sig === S.sig && !force) return;
    const key = chatKey(), prevMax = S.maxId[key];
    const stick = force || box.scrollTop + box.clientHeight >= box.scrollHeight - 100;
    box.textContent = '';

    const start = h('div', 'msg-start');
    const big = h('div', 'big');
    if (S.view === 'server') {
        big.innerHTML = ICON.hash;
        const ch = curChannel();
        start.append(big, h('h2', '', `Welcome to #${ch ? ch.name : ''}`), h('p', '', `This is the start of the #${ch ? ch.name : ''} channel.`));
    } else {
        const n = S.dm.username || S.dm.email;
        big.innerHTML = ICON.chat;
        start.append(big, h('h2', '', n), h('p', '', `This is the beginning of your conversation with ${n}.`));
    }
    box.append(start);

    let prev = null, prevDay = '';
    list.forEach(m => {
        const day = new Date(m.t * 1000).toDateString();
        if (day !== prevDay) { box.append(h('div', 'day-div', fmtDay(m.t))); prevDay = day; prev = null; }
        const same = prev && prev.author.id === m.author.id && m.t - prev.t < 300;
        const row = h('div', 'msg' + (same ? '' : ' first'));
        const gutter = h('div', 'gutter');
        if (same) gutter.textContent = fmtTime(m.t); else gutter.append(avatar(m.author.username, '', m.author.avatar));
        const body = h('div', 'body');
        if (!same) {
            const head = h('div', 'head');
            const name = h('strong', '', m.author.username);
            name.style.color = color(m.author.username).replace('48%', '70%');
            const time = h('time', '', fmtTime(m.t));
            head.append(name, time);
            body.append(head);
        }
        const [txt, mentionsMe] = richText(m.text);
        body.append(txt);
        if (mentionsMe) row.classList.add('mentioned');
        if (prevMax != null && m.id > prevMax && !m.mine && mentionsMe) toast(`${m.author.username} mentioned you`);
        [...new Set([...m.text.matchAll(/#invite=([a-z0-9]{5,48})/gi)].map(x => x[1].toLowerCase()))].forEach(code => body.append(inviteEmbed(code)));
        row._ctx = [...userItems(m.author), ['Copy message', () => copy(m.text)], ...idItem('message', m.id), ...(m.mine || isOwner() ? ['-', ['Delete message', () => delMsg(m), true]] : [])];
        row.append(gutter, body);
        box.append(row);
        prev = m;
    });
    S.sig = sig;
    S.maxId[key] = list.length ? Math.max(...list.map(m => m.id)) : (prevMax ?? 0);
    if (stick) box.scrollTop = box.scrollHeight;
}

/* ---------- composer ---------- */
const input = $('chat-input');
const autosize = () => { input.style.height = 'auto'; input.style.height = Math.min(input.scrollHeight, 160) + 'px'; };
input.addEventListener('input', autosize);
input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); sendMessage(); }
});
$('chat-form').onsubmit = (e) => { e.preventDefault(); sendMessage(); };

async function sendMessage() {
    const text = input.value.trim();
    if (!text || S.sending) return;
    const isServer = S.view === 'server';
    if (isServer && S.channelId == null) return toast('This server has no text channel yet.', true);
    S.sending = true; $('chat-send').disabled = true;
    const out = await post({ action: 'send', kind: isServer ? 'server' : 'dm', id: isServer ? S.server.id : S.dm.id, text, ...(isServer ? { channelId: S.channelId } : {}) });
    S.sending = false; $('chat-send').disabled = false;
    if (out.res.ok) { input.value = ''; autosize(); await loadMessages(true); }
    else toast(out.data.error || 'Message failed.', true);
    input.focus();
}

/* ---------- friends ---------- */
async function addFriend(q) {
    const out = await post({ action: 'friend-add', username: q });
    if (out.res.ok) { toast('Friend added!'); loadFriends(); }
    else toast(out.data.error || 'Could not add friend.', true);
    return out.res.ok;
}
$('friend-add-form').onsubmit = async (e) => {
    e.preventDefault();
    if (await addFriend($('friend-add-input').value)) $('friend-add-input').value = '';
};

/* ---------- modals ---------- */
function openModal(id) { closeModals(); $(id).classList.remove('hidden'); const f = $(id).querySelector('input'); if (f) setTimeout(() => f.focus(), 30); }
function closeModals() { document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden')); }
document.querySelectorAll('[data-close]').forEach(b => b.onclick = closeModals);
document.querySelectorAll('.modal').forEach(m => m.addEventListener('mousedown', (e) => { if (e.target === m) closeModals(); }));
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { closeModals(); $('server-menu').classList.add('hidden'); closeNav(); } });

$('server-create').onclick = () => openModal('modal-server');
$('server-join-btn').onclick = () => openModal('modal-join');

$('server-create-form').onsubmit = async (e) => {
    e.preventDefault();
    const out = await post({ action: 'server-create', name: $('server-name').value.trim() });
    if (!out.res.ok) return toast(out.data.error || 'Could not create server.', true);
    closeModals(); $('server-name').value = '';
    await loadServers();
    openServer(out.data.server.id);
    toast('Server created!');
};

function parseInvite(v) { const s = String(v).trim(), m = s.match(/invite=([a-z0-9]{5,48})/i) || s.match(/^([a-z0-9]{5,48})$/i); return m ? m[1].toLowerCase() : ''; }
async function joinWithCode(code) {
    const out = await post({ action: 'server-join', code });
    if (!out.res.ok) { toast(out.data.error || 'Invalid invite.', true); return false; }
    closeModals();
    await loadServers();
    openServer(out.data.server.id);
    toast(`Joined ${out.data.server.name}`);
    return true;
}

/* invite links posted in chat render as a server card */
const INV = {};
function inviteEmbed(code) {
    const box = h('div', 'embed');
    const paint = (i) => {
        box.textContent = '';
        if (i.error || i.expired) { box.className = 'embed dead'; box.textContent = i.error ? 'This invite is invalid.' : `The invite to ${i.name} has expired.`; return; }
        const meta = h('div', 'meta'), btn = h('button', 'btn ' + (i.joined ? 'ghost' : 'primary'), i.joined ? 'Open' : 'Join');
        meta.append(h('strong', '', i.name), statEl(i.online || 0, i.count));
        btn.onclick = async () => { if (i.joined) return openServer(i.id); if (await joinWithCode(code)) i.joined = true; };
        box.append(avatar(i.name, 'sm', i.icon), meta, btn);
    };
    if (INV[code] && Date.now() - INV[code].t < 30000) paint(INV[code]);
    else { box.textContent = 'Loading invite…'; post({ action: 'invite-info', code }).then(o => { INV[code] = { ...(o.res.ok ? o.data : { error: true }), t: Date.now() }; paint(INV[code]); }); }
    return box;
}
async function delMsg(m) {
    if (!confirm('Delete this message?')) return;
    const out = await post({ action: 'message-delete', id: m.id });
    if (!out.res.ok) return toast(out.data.error || 'Could not delete.', true);
    loadMessages(true);
}
$('server-join-form').onsubmit = (e) => {
    e.preventDefault();
    const code = parseInvite($('join-code').value);
    if (!code) return toast('That doesn\'t look like a valid invite.', true);
    $('join-code').value = '';
    joinWithCode(code);
};
function handleInvite() {
    const code = parseInvite(location.hash.startsWith('#invite=') ? location.hash : '');
    if (!code) return;
    history.replaceState(null, '', location.pathname);
    joinWithCode(code);
}

function openChannelModal(cat) {
    if (!isOwner()) return;
    $('channel-modal-msg').textContent = '';
    $('cat-options').textContent = '';
    [...new Set(S.channels.map(c => c.category))].forEach(c => { const o = document.createElement('option'); o.value = c; $('cat-options').append(o); });
    $('new-channel-cat').value = cat || 'TEXT CHANNELS';
    $('new-channel-name').value = '';
    openModal('modal-channel');
}
$('channel-create-form').onsubmit = async (e) => {
    e.preventDefault();
    if (!S.server) return;
    const out = await post({ action: 'channel-create', id: S.server.id, channelName: $('new-channel-name').value, category: $('new-channel-cat').value.trim() || 'TEXT CHANNELS' });
    if (!out.res.ok) { $('channel-modal-msg').textContent = out.data.error || 'Could not create channel.'; return; }
    closeModals();
    await loadChannels();
    S.channelId = out.data.channel.id; S.last[S.server.id] = S.channelId; S.sig = '';
    renderAll(); loadMessages(true);
    toast('Channel created.');
};
async function deleteChannel(c) {
    if (!confirm(`Delete #${c.name}? It will be hidden; its messages stay on record.`)) return;
    const out = await post({ action: 'channel-delete', channelId: c.id });
    if (!out.res.ok) return toast(out.data.error || 'Could not delete channel.', true);
    await loadChannels(c.id === S.channelId);
    S.sig = ''; renderAll(); loadMessages(true);
}

function openInvite() {
    if (!S.server) return;
    $('invite-out').classList.add('hidden');
    openModal('modal-invite');
}
$('invite-gen').onclick = async () => {
    const out = await post({ action: 'invite-create', id: S.server.id, ttl: Number($('invite-ttl').value) });
    if (!out.res.ok) return toast(out.data.error || 'Could not create invite.', true);
    $('invite-link').value = `${location.origin}/#invite=${out.data.code}`;
    $('invite-out').classList.remove('hidden');
    $('invite-link').select();
};
$('invite-btn').onclick = openInvite;
$('invite-copy').onclick = async () => {
    try { await navigator.clipboard.writeText($('invite-link').value); toast('Invite link copied!'); }
    catch { $('invite-link').select(); toast('Press Ctrl+C to copy.'); }
};
$('members-btn').onclick = () => { S.membersOn = !S.membersOn; try { localStorage.setItem('members', S.membersOn ? '1' : '0'); } catch {} renderMain(); };

/* ---------- server menu ---------- */
$('server-menu-btn').onclick = (e) => {
    e.stopPropagation();
    const menu = $('server-menu');
    if (!menu.classList.contains('hidden')) return menu.classList.add('hidden');
    $('menu-channel').classList.toggle('hidden', !isOwner());
    $('menu-settings').classList.toggle('hidden', !isOwner());
    $('menu-leave').classList.toggle('hidden', isOwner());
    const r = $('server-menu-btn').getBoundingClientRect();
    menu.style.left = Math.max(8, Math.min(r.right - 220, window.innerWidth - 228)) + 'px';
    menu.style.top = r.bottom + 6 + 'px';
    menu.classList.remove('hidden');
};
document.addEventListener('click', () => $('server-menu').classList.add('hidden'));
$('server-menu').onclick = async (e) => {
    const b = e.target.closest('button[data-act]');
    if (!b) return;
    const act = b.dataset.act;
    if (act === 'invite') openInvite();
    if (act === 'channel') openChannelModal();
    if (act === 'settings') openServerSettings();
    if (act === 'leave' && S.server && confirm(`Leave ${S.server.name}?`)) {
        const out = await post({ action: 'server-leave', id: S.server.id });
        if (!out.res.ok) return toast(out.data.error || 'Could not leave.', true);
        await loadServers(); goHome(); toast('You left the server.');
    }
};

window.addEventListener('hashchange', () => { if (S.token && S.me) handleInvite(); });

/* ---------- emoji picker (unicode) ---------- */
const EMOJI = {
    'Smileys': '😀 😃 😄 😁 😆 😅 🤣 😂 🙂 🙃 😉 😊 😇 🥰 😍 🤩 😘 😗 😚 😙 😋 😛 😜 🤪 😝 🤑 🤗 🤭 🤫 🤔 🤐 🤨 😐 😑 😶 😏 😒 🙄 😬 🤥 😌 😔 😪 🤤 😴 😷 🤒 🤕 🤢 🤮 🤧 🥵 🥶 🥴 😵 🤯 🤠 🥳 😎 🤓 🧐 😕 😟 🙁 ☹️ 😮 😯 😲 😳 🥺 😦 😧 😨 😰 😥 😢 😭 😱 😖 😣 😞 😓 😩 😫 🥱 😤 😡 😠 🤬 😈 👿 💀 ☠️ 💩 🤡 👹 👺 👻 👽 👾 🤖 😺 😸 😹 😻 😼 😽 🙀 😿 😾',
    'People': '👍 👎 👊 ✊ 🤛 🤜 👏 🙌 👐 🤲 🤝 🙏 ✌️ 🤞 🤟 🤘 👌 🤏 👈 👉 👆 👇 ☝️ ✋ 🤚 🖐️ 🖖 👋 🤙 💪 🖕 ✍️ 💅 🤳 👀 👁️ 👅 👄 🧠 🦴 👶 👦 👧 👨 👩 🧑 👴 👵 🙋 🙆 🙅 🤷 🤦 💁 🙇',
    'Hearts & symbols': '❤️ 🧡 💛 💚 💙 💜 🖤 🤍 🤎 💔 ❣️ 💕 💞 💓 💗 💖 💘 💝 💯 💢 💥 💫 💦 💨 💬 💭 💤 ✨ ⭐ 🌟 ⚡ 🔥 🌈 ☀️ 🌙 ❄️ ☁️ ✅ ❌ ❓ ❗ ‼️ ⚠️ 🚫 ⭕ ✔️ ➕ ➖ ➡️ ⬅️ ⬆️ ⬇️ 🔴 🟠 🟡 🟢 🔵 🟣 ⚫ ⚪ 🔔 🔕 🆗 🆒 🆕 🆓 🔞',
    'Animals & nature': '🐶 🐱 🐭 🐹 🐰 🦊 🐻 🐼 🐨 🐯 🦁 🐮 🐷 🐸 🐵 🙈 🙉 🙊 🐔 🐧 🐦 🐤 🦆 🦅 🦉 🦇 🐺 🐗 🐴 🦄 🐝 🐛 🦋 🐌 🐞 🐜 🕷️ 🐢 🐍 🦎 🐙 🦑 🦐 🦀 🐠 🐟 🐬 🐳 🦈 🐊 🐘 🦒 🦓 🐪 🐑 🐐 🐕 🐈 🐇 🌵 🎄 🌲 🌳 🌴 🌱 🍀 🍁 🍂 🌸 🌹 🌻 🌼 🍄',
    'Food & drink': '🍎 🍐 🍊 🍋 🍌 🍉 🍇 🍓 🍒 🍑 🥭 🍍 🥥 🥝 🍅 🥑 🥦 🥕 🌽 🌶️ 🥔 🍞 🧀 🥚 🍳 🥞 🥓 🥩 🍗 🍖 🌭 🍔 🍟 🍕 🌮 🌯 🥗 🍝 🍜 🍲 🍣 🍱 🍤 🍙 🍚 🍦 🍩 🍪 🎂 🍰 🧁 🍫 🍬 🍭 🍿 ☕ 🍵 🥤 🍺 🍻 🥂 🍷 🍸 🍹 🧃',
    'Activities & objects': '🎮 🕹️ 🎲 🎯 🎳 ⚽ 🏀 🏈 ⚾ 🎾 🏐 🏓 🥊 🎧 🎤 🎵 🎶 🎸 🎹 🥁 🎬 🎨 📷 📱 💻 ⌨️ 🖥️ 🖱️ 💾 📚 📖 ✏️ 📝 📌 📎 🔗 🔒 🔑 💡 🔦 🔧 🔨 ⚙️ 🧲 💣 🎁 🎉 🎊 🎈 🏆 🥇 🥈 🥉 👑 💎 💰 🚀 ✈️ 🚗 🚕 🏍️ 🚲 ⛵ 🌍 🏠 🏰 ⏰ ⌛ 📣 🔮'
};
// Emoji this device can't draw show up as empty boxes (they measure a different width), so hide those.
const canDraw = (() => {
    const c = document.createElement('canvas').getContext('2d');
    c.font = '24px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';
    const ref = c.measureText('😀').width;
    return (e) => Math.abs(c.measureText(e).width - ref) <= ref * 0.2;
})();
const pop = $('emoji-pop'), allEmoji = Object.values(EMOJI).join(' ').split(' ');
const okEmoji = new Set(allEmoji.filter(canDraw)), filterEmoji = okEmoji.size >= allEmoji.length * 0.5; // too few passing = no emoji font detected, don't filter
Object.entries(EMOJI).forEach(([title, list]) => {
    const grid = h('div', 'emoji-grid');
    list.split(' ').filter(e => !filterEmoji || okEmoji.has(e)).forEach(e => { const b = h('button', '', e); b.type = 'button'; b.onclick = () => { input.setRangeText(e, input.selectionStart, input.selectionEnd, 'end'); input.focus(); autosize(); }; grid.append(b); });
    if (grid.children.length) pop.append(h('h5', '', title), grid);
});

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
function richText(text) { // returns [element, mentionsMe]; text nodes only, so no HTML injection
    const t = h('div', 'text'), mine = (S.me?.username || '').toLowerCase();
    let me = false;
    segments(text, mnames()).forEach(s => {
        if (typeof s === 'string') return t.append(s);
        const hit = s.who.toLowerCase() === mine; if (hit) me = true;
        t.append(h('span', 'mention' + (hit ? ' me' : ''), s.m));
    });
    return [t, me];
}
const mpop = $('mention-pop'); let mSel = 0, mList = [];
function updateMentions() {
    const m = input.value.slice(0, input.selectionStart).match(/(^|\s)@([^\s@]{0,20})$/);
    mList = m ? [...new Set(mnames())].filter(n => n.toLowerCase().startsWith(m[2].toLowerCase())).slice(0, 6) : [];
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
$('emoji-btn').onclick = () => pop.classList.toggle('hidden');
document.addEventListener('click', (e) => { if (!e.target.closest('#emoji-pop, #emoji-btn')) pop.classList.add('hidden'); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') pop.classList.add('hidden'); });

/* ---------- profile ---------- */
$('dev-toggle').onchange = (e) => {
    try { localStorage.setItem('dev', e.target.checked ? '1' : '0'); } catch {}
    S.sig = ''; renderAll(); if (S.view !== 'home') loadMessages(true); // rebuild so right-click menus pick up the change
};
const pend = {}; // pending image URL per upload widget (pf = profile, sv = server)
const paint = (k, name) => { const el = $(k + '-ava'); el.textContent = pend[k] ? '' : ini(name); el.style.background = bg(pend[k], name); };

async function uploadImage(file, kind) {
    const sig = await post({ action: 'upload-sign', kind });
    if (!sig.res.ok) { toast(sig.data.error || 'Upload unavailable.', true); return ''; }
    const { cloud, key, timestamp, signature, folder } = sig.data, fd = new FormData();
    Object.entries({ file, api_key: key, timestamp, signature, folder }).forEach(([k, v]) => fd.append(k, v));
    try {
        const r = await fetch(`https://api.cloudinary.com/v1_1/${cloud}/image/upload`, { method: 'POST', body: fd });
        if (!r.ok) throw 0;
        return (await r.json()).secure_url.replace('/upload/', '/upload/c_fill,g_auto,w_256,h_256,f_auto,q_auto/');
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

function openProfile() {
    $('profile-msg').textContent = '';
    $('profile-name').value = S.me ? S.me.username : '';
    pend.pf = S.me?.avatar || ''; paint('pf', $('profile-name').value);
    $('profile-bio').value = S.me?.bio || ''; $('dev-toggle').checked = dev();
    openModal('modal-profile');
}
function openServerSettings() {
    if (!isOwner()) return;
    $('sv-msg').textContent = '';
    $('sv-name').value = S.server.name; $('sv-desc').value = S.server.desc || ''; $('sv-pub').checked = !!S.server.pub;
    pend.sv = S.server.icon || ''; paint('sv', S.server.name);
    openModal('modal-sv');
}
$('sv-form').onsubmit = async (e) => {
    e.preventDefault();
    const out = await post({ action: 'server-update', id: S.server.id, name: $('sv-name').value, icon: pend.sv, desc: $('sv-desc').value, pub: $('sv-pub').checked });
    if (!out.res.ok) { $('sv-msg').textContent = out.data.error || 'Could not save.'; return; }
    await loadServers(); closeModals(); renderAll(); toast('Server updated.');
};
$('profile-form').onsubmit = async (e) => {
    e.preventDefault();
    const out = await post({ action: 'profile-update', username: $('profile-name').value, avatar: pend.pf, bio: $('profile-bio').value });
    if (!out.res.ok) { $('profile-msg').textContent = out.data.error || 'Could not save.'; return; }
    S.me.username = out.data.username; S.me.avatar = out.data.avatar; S.me.bio = out.data.bio; setMe(S.me);
    closeModals(); toast('Profile updated.');
    loadMessages(true); loadMembers();
};

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
    const cv = $('gravity'), c = cv.getContext('2d'), m = { x: -999, y: -999 }, R = 140, GAP = 30, PUSH = 12, N = 24;
    const trail = Array.from({ length: N }, () => ({ x: -999, y: -999 }));
    let dots = [], w, ht;
    const seed = () => {
        const dpr = devicePixelRatio || 1; w = innerWidth; ht = innerHeight;
        cv.width = w * dpr; cv.height = ht * dpr; c.setTransform(dpr, 0, 0, dpr, 0, 0);
        dots = [];
        for (let x = GAP / 2; x < w; x += GAP) for (let y = GAP / 2; y < ht; y += GAP) dots.push({ hx: x, hy: y, x, y });
    };
    addEventListener('resize', seed); seed();
    addEventListener('pointermove', (e) => { m.x = e.clientX; m.y = e.clientY; });
    document.addEventListener('pointerleave', () => { m.x = m.y = -999; });
    const dot = (x, y, r, a) => { c.fillStyle = `rgba(239,232,218,${a})`; c.beginPath(); c.arc(x, y, r, 0, 6.283); c.fill(); };
    (function tick() {
        requestAnimationFrame(tick);
        if ($('auth-screen').classList.contains('hidden')) return;
        c.clearRect(0, 0, w, ht);
        trail.forEach((p, i) => { const t = i ? trail[i - 1] : m, k = i ? 0.32 : 0.45; p.x += (t.x - p.x) * k; p.y += (t.y - p.y) * k; });
        for (const d of dots) { // each grid dot leans a few px toward the nearest trail point, then eases back: no clumping
            let best = null, bd = R;
            for (const p of trail) { const q = Math.hypot(p.x - d.hx, p.y - d.hy); if (q < bd) { bd = q; best = p; } }
            const near = best ? 1 - bd / R : 0, tx = best ? d.hx + (best.x - d.hx) / (bd || 1) * near * PUSH : d.hx, ty = best ? d.hy + (best.y - d.hy) / (bd || 1) * near * PUSH : d.hy;
            d.x += (tx - d.x) * 0.2; d.y += (ty - d.y) * 0.2;
            dot(d.x, d.y, 1.4 + near * 1.6, 0.3 + near * 0.6);
        }
        trail.forEach((p, i) => { const f = 1 - i / N; dot(p.x, p.y, 1.5 + f * 5, 0.15 + f * 0.85); });
    })();
})();

/* ---------- start ---------- */
setAuthMode(true);
if (S.token) boot();
