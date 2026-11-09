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
    smile: svg('M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM8 14s1.5 2 4 2 4-2 4-2M9 9h.01M15 9h.01')
};

const S = {
    token: localStorage.getItem('token') || '',
    me: null, servers: [], friends: [], requests: { in: [], out: [] }, view: 'home',
    server: null, channels: [], channelId: null, dm: null, members: [],
    last: {}, chLoaded: false, sig: '', sending: false, membersOn: (() => { try { const v = localStorage.getItem('members'); if (v) return v === '1'; } catch {} return window.innerWidth > 760; })(),
    login: true, t1: null, t2: null, t3: null, t4: null, maxId: {}, fullAt: {}, voice: {}
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

let inFlight = 0;
function bar(on) {
    inFlight = Math.max(0, inFlight + (on ? 1 : -1));
    const lb = document.getElementById('loadbar');
    if (lb) lb.classList.toggle('on', inFlight > 0);
}
async function post(payload) {
    const headers = { 'Content-Type': 'application/json' };
    if (S.token) headers.Authorization = `Bearer ${S.token}`;
    bar(true);
    try {
        const res = await fetch('/api/auth', { method: 'POST', headers, body: JSON.stringify(payload) });
        const data = await res.json().catch(() => ({}));
        if (res.status === 401 && S.token && !['login', 'register', 'verify'].includes(payload.action)) clearSession();
        return { res, data };
    } catch {
        return { res: { ok: false, status: 0 }, data: { error: 'Network error.' } };
    } finally { bar(false); }
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
    closeModals(); closeNav(); $('server-menu').classList.add('hidden');
    $('app').classList.add('hidden');
    $('auth-screen').classList.remove('hidden');
}
$('logout-btn').onclick = async () => { await post({ action: 'logout' }); clearSession(); };

/* ---------- boot ---------- */
function setMe(u) {
    $('chat-input').maxLength = u && u.plus ? 4000 : 2000; // Pratr Plus: longer messages
    const name = u.username || 'user';
    const letter = u.avatar ? '' : ini(name);
    $('me-name').textContent = $('hp-name').textContent = name;
    $('me-email').textContent = $('hp-email').textContent = u.email || '';
    $('hp-bio').textContent = u.bio || '';
    $('hp-stats').textContent = u.voice || u.msgs ? `${fmtDur(u.voice || 0)} in voice · ${u.msgs || 0} messages` : '';
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
    const [me] = await Promise.all([post({ action: 'me' }), loadServers(), loadFriends()]);
    if (!me.res.ok) return;
    S.me = me.data;
    setMe(me.data);
    renderAll();
    startTimers();
    handleInvite();
}

function startTimers() {
    clearInterval(S.t1); clearInterval(S.t2); clearInterval(S.t3);
    S.t3 = setInterval(() => { if (!document.hidden) loadVoice(); }, 2500);
    clearInterval(S.t4); S.t4 = setInterval(() => { if (!document.hidden) pollUnread(); }, 4000); pollUnread();
    S.t1 = setInterval(() => { if (!document.hidden && S.view !== 'home') loadMessages(false); }, 3000);
    S.t2 = setInterval(async () => {
        if (document.hidden) return;
        await Promise.all([loadServers(), loadFriends()]);
        if (S.view === 'server' && S.server) {
            const before = S.channelId, old = S.channels.map(c => c.id);
            await Promise.all([loadChannels(), loadMembers()]);
            if (V.on && V.sid === S.server.id && !S.channels.some(c => c.id === V.chId)) leaveVoice(true);
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
    loadMessages(true); // it marks the conversation read once the real cursor is known
    closeNav();
    $('chat-input').focus();
}
function selectChannel(id) {
    S.channelId = id; S.last[S.server.id] = id; S.sig = '';
    $('messages').textContent = '';
    renderSide(); renderMain();
    loadMessages(true); // it marks the conversation read once the real cursor is known
    closeNav();
    const vc = curChannel();
    if (vc && vc.kind === 'v') joinVoice(vc);
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
    const key = chatKey();
    input.value = ''; autosize(); input.focus();
    const temp = { id: -Date.now(), mine: true, pending: true, text, t: Math.floor(Date.now() / 1000), rx: [], author: { id: S.me.id, username: S.me.username, avatar: S.me.avatar, plus: S.me.plus } };
    renderMessages([...S_curMsgs, temp], true); // paint now, confirm with the server's echo
    const out = await post({ action: 'send', kind: isServer ? 'server' : 'dm', id: isServer ? S.server.id : S.dm.id, text, ...(isServer ? { channelId: S.channelId } : {}) });
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
function richText(text, canAll) { // returns [element, mentionsMe]; text nodes only, so no HTML injection
    const t = h('div', 'text'), mine = (S.me?.username || '').toLowerCase();
    let me = false;
    segments(text, canAll ? [...mnames(), 'everyone', 'here'] : mnames()).forEach(s => {
        if (typeof s === 'string') return t.append(s);
        const all = canAll && /^(everyone|here)$/i.test(s.who), hit = all || s.who.toLowerCase() === mine; if (hit) me = true;
        t.append(h('span', 'mention' + (hit ? ' me' : '') + (all ? ' all' : ''), s.m));
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
/* ---------- Pratr Plus ---------- */
function openPlus() {
    const has = !!(S.me && S.me.plus);
    $('plus-state').textContent = has ? 'You have Pratr Plus. Thank you for supporting pratr! ✦' : '';
    $('plus-buy').classList.toggle('hidden', has);
    $('plus-admin').classList.toggle('hidden', !(S.me && S.me.admin));
    $('plus-msg').textContent = '';
    openModal('modal-plus');
}
$('plus-btn').onclick = openPlus;
$('plus-buy-btn').onclick = async () => {
    const out = await post({ action: 'hq-join' });
    if (!out.res.ok) { $('plus-msg').textContent = out.data.error || 'Could not open Headquarters.'; return; }
    closeModals(); await loadServers(); openServer(out.data.server.id);
    toast('Welcome to Headquarters! Tell us you want Pratr Plus.');
};
async function plusGrant(on) {
    const u = $('plus-user').value.trim();
    if (!u) return;
    const out = await post({ action: 'plus-grant', username: u, on });
    $('plus-msg').style.color = out.res.ok ? 'var(--bone)' : '';
    $('plus-msg').textContent = out.res.ok ? `${out.data.username}: Plus ${out.data.plus ? 'activated' : 'removed'}.` : (out.data.error || 'Failed.');
}
$('plus-act').onclick = async () => {
    const u = $('plus-user').value.trim(), box = $('plus-log');
    if (!u) return;
    const out = await post({ action: 'activity', username: u });
    box.classList.remove('hidden'); box.textContent = '';
    if (!out.res.ok) return void box.append(h('div', 'side-empty', out.data.error || 'Failed.'));
    box.append(h('div', 'side-empty', `${out.data.username}: ${fmtDur(out.data.voice)} in voice, ${out.data.msgs} messages`));
    out.data.logs.forEach(l => { const r = h('div', 'logrow'); r.append(h('time', '', stamp(l.t)), h('span', '', logText(l))); box.append(r); });
};
$('plus-on').onclick = () => plusGrant(true);
$('plus-off').onclick = () => plusGrant(false);

/* ---------- unread / ping tracking (no per-message alerts; only pings badge, servers only) ---------- */
S.unread = { channels: {}, dms: {} };
async function pollUnread() {
    if (!S.token) return;
    const out = await post({ action: 'unreads' });
    if (!out.res.ok) return;
    S.unread = out.data;
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
