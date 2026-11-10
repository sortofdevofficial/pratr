'use strict';

/* ui: rendering, modals and stored-data displays — loaded after app.js */

/* ---------- rendering ---------- */
/* Background polls run every few seconds. Comparing a signature first means an unchanged poll
   costs one stringify instead of rebuilding the rail, sidebar, member list or friend grid. */
const paintSig = new Map();
function paintOnce(key, sig, build) {
    if (paintSig.get(key) === sig) return;
    paintSig.set(key, sig);
    build();
}
function resetRenderMemo() { paintSig.clear(); }

function renderAll() { renderRail(); renderSide(); renderMain(); renderMembers(); }

function renderRail() {
    paintOnce('rail', JSON.stringify([S.servers, S.server && S.server.id, S.view, S.me && S.me.id]), paintRail);
}
function paintRail() {
    $('rail-home').classList.toggle('active', S.view === 'home' || S.view === 'dm');
    $('rail-discover').classList.toggle('active', S.view === 'discover');
    const box = $('rail-servers');
    box.textContent = '';
    S.servers.forEach(s => {
        const art = s.logo || s.icon;
        const b = h('button', 'rail-btn' + (S.server && S.server.id === s.id ? ' active' : ''), art ? '' : ini(s.name));
        if (art) b.style.background = bg(art);
        if (s.accent) b.style.boxShadow = `inset 0 0 0 2px ${s.accent}`;
        if (s.boosts) { const star = h('i', 'rail-boost', '✦'); star.title = `${s.boosts} overclocks`; b.append(star); }
        b.title = s.name + (s.boosts ? ` · ${s.boosts} overclocks` : '');
        b._ctx = () => [...(s.owner === S.me?.id ? [['Server settings', () => openServer(s.id).then(openServerSettings)]] : []), ['Server overclock', () => { openServer(s.id).then(openBoosts); }], ['Copy server link', () => copy(location.origin + '/channels/' + s.id)], ['Copy server name', () => copy(s.name)], ...idItem('server', s.id)];
        b.onclick = () => openServer(s.id);
        box.append(b);
    });
}

function renderSide() {
    paintOnce('side', JSON.stringify([S.view, S.server, S.channels, S.cats, S.friends, S.unread, S.voice, S.channelId, S.dm && S.dm.id, S.oc, S.statsOpen, S.stats && [S.stats.members, S.stats.online], S.me && S.me.id]), paintSide);
}
function paintSide() {
    const server = S.view === 'server' && S.server;
    const title = $('side-title');
    title.textContent = server ? S.server.name : S.view === 'discover' ? 'Discover' : 'Home';
    const accent = server ? ink(S.server.accent || '') : '';
    title.style.background = '';
    title.style.color = accent || '';
    title.style.fontFamily = server ? fontOf(S.server.font) : '';
    const sh = $('side-head');
    let logoEl = sh.querySelector('.side-logo');
    if (server && S.server.logo) {
        if (!logoEl) { logoEl = h('img', 'side-logo'); logoEl.alt = ''; sh.insertBefore(logoEl, title); }
        logoEl.src = S.server.logo;
    } else if (logoEl) logoEl.remove();
    sh.classList.toggle('has-banner', !!(server && S.server.banner));
    sh.style.backgroundImage = server && S.server.banner ? `linear-gradient(180deg, rgba(6,12,25,.2), rgba(6,12,25,.78)), url("${S.server.banner}")` : '';
    const chip = $('srv-boosts');
    chip.classList.toggle('hidden', !server);
    if (server) {
        chip.textContent = `✦ ${S.server.boosts || 0}`;
        chip.title = `${S.server.boosts || 0} overclocks · ${S.server.tier || 0} perk tiers — open Server overclock`;
        chip.onclick = openBoosts;
    }
    $('server-menu-btn').classList.toggle('hidden', !server);
    $('home-list').classList.toggle('hidden', !!server);
    $('server-list').classList.toggle('hidden', !server);
    $('nav-friends').classList.toggle('active', S.view === 'home');

    const dms = $('dm-list');
    dms.textContent = '';
    if (!S.friends.length) dms.append(h('div', 'side-empty', 'Add a friend to start chatting.'));
    [...S.friends].sort((a, b) => (S.unread.dms[b.id] ? 1 : 0) - (S.unread.dms[a.id] ? 1 : 0)).forEach(u => {
        const dun = S.unread.dms[u.id];
        const b = h('button', 'dm-item' + (S.view === 'dm' && S.dm && S.dm.id === u.id ? ' active' : '') + (dun ? ' has-unread' : ''));
        const da = userAva(u, 'sm'); da.append(dot(u.status));
        b.append(da, h('span', dun ? 'unread' : '', u.username || u.email));
        if (dun) b.append(h('em', 'ping-badge', String(dun.pings)));
        b.onclick = () => openDM(u);
        b._ctx = [['Copy link', () => copy(location.origin + '/dm/' + encodeURIComponent(u.username || u.id))], ...userItems(u)];
        dms.append(b);
    });

    paintChannelList();
}

function renderFriends() {
    paintOnce('friends', JSON.stringify([S.friends, S.requests]), paintFriends);
}
function paintFriends() {
    renderRequests();
    $('friend-count').textContent = S.friends.length;
    const grid = $('friend-grid');
    grid.textContent = '';
    if (!S.friends.length) { grid.style.display = 'block'; grid.append(h('div', 'empty-note', 'No friends yet — add someone above to start a conversation.')); return; }
    grid.style.display = '';
    S.friends.forEach(u => {
        const c = h('div', 'friend-card');
        if (u.plus && (u.glow || u.accent)) { c.classList.add('glow'); c.style.setProperty('--pg', u.glow || u.accent); }
        const meta = h('div', 'meta');
        const nm = h('strong', u.plus ? 'plus-name' : '', u.username || u.email); nm.style.color = nameColour(u); nm.style.fontFamily = u.plus ? fontOf(u.nameFont) : '';
        meta.append(nm);
        if (u.statusText) { const st = h('small', '', u.statusText); st.style.color = u.plus && u.accent ? ink(u.accent) : ''; meta.append(st); }
        meta.append(h('small', '', u.bio || u.email || ''), h('small', 'stats', `${fmtDur(u.voice || 0)} in voice · ${u.msgs || 0} messages`));
        const btn = h('button', 'btn ghost', 'Message');
        btn.onclick = (e) => { e.stopPropagation(); openDM(u); };
        c._ctx = [['Copy link', () => copy(location.origin + '/dm/' + encodeURIComponent(u.username || u.id))], ...userItems(u)];
        const av = userAva(u); av.append(dot(u.status));
        c.append(av, meta, btn);
        c.onclick = () => openUserCard(u);
        grid.append(c);
    });
}

function renderRequests() {
    const inc = S.requests.in, out = S.requests.out;
    $('req-count').textContent = inc.length;
    $('req-panel').classList.toggle('hidden', !inc.length && !out.length);
    const ib = $('req-in'), ob = $('req-out');
    ib.textContent = ''; ob.textContent = '';
    inc.forEach(u => {
        const r = h('div', 'logrow reqrow'), a = h('button', 'btn primary sm', 'Accept'), d = h('button', 'btn ghost sm', 'Deny');
        a.type = d.type = 'button';
        a.onclick = () => answerFriend(u, 'friend-accept', `You and ${u.username} are now friends`);
        d.onclick = () => answerFriend(u, 'friend-deny', 'Request declined.');
        r.append(avatar(u.username, 'sm', u.avatar), h('span', '', `${u.username} wants to be friends${u.t ? ` · ${stamp(u.t)}` : ''}`), a, d);
        ib.append(r);
    });
    out.forEach(u => {
        const r = h('div', 'logrow reqrow'), c = h('button', 'btn ghost sm', 'Cancel');
        c.type = 'button';
        c.onclick = () => answerFriend(u, 'friend-deny', 'Request cancelled.');
        r.append(avatar(u.username, 'sm', u.avatar), h('span', '', `Waiting for ${u.username}${u.t ? ` · sent ${stamp(u.t)}` : ''}`), c);
        ob.append(r);
    });
}
async function answerFriend(u, action, okText) {
    const out = await post({ action, id: u.id });
    if (!out.res.ok) return toast(out.data.error || 'Could not update the request.', true);
    toast(okText);
    await loadFriends();
}
function renderMain() {
    const home = S.view === 'home', disc = S.view === 'discover';
    $('view-home').classList.toggle('hidden', !home);
    $('view-discover').classList.toggle('hidden', !disc);
    $('view-chat').classList.toggle('hidden', home || disc);
    if (home) { renderFriends(); return; }
    if (disc) return;
    const isServer = S.view === 'server';
    const oc = isServer && S.oc;
    const sp = isServer && S.statsOpen;
    const ch = isServer ? curChannel() : null;
    const icon = $('chat-icon');
    icon.textContent = '';
    if (oc) {
        icon.textContent = '✦';
        $('chat-name').textContent = 'Server overclock';
        $('chat-name').style.color = S.server.accent ? ink(S.server.accent) : '';
        $('chat-name').style.fontFamily = fontOf(S.server.font);
        $('chat-sub').textContent = S.server.name;
    } else if (sp) {
        icon.innerHTML = ICON.chart;
        $('chat-name').textContent = 'Server overview';
        $('chat-name').style.color = S.server.accent ? ink(S.server.accent) : '';
        $('chat-name').style.fontFamily = fontOf(S.server.font);
        $('chat-sub').textContent = S.server.name;
    } else if (isServer) {
        if (S.server.logo && !(ch && ch.kind === 'v')) {
            const im = h('img', 'topbar-logo'); im.src = S.server.logo; im.alt = ''; icon.append(im);
        } else icon.innerHTML = ch && ch.kind === 'v' ? ICON.speaker : ICON.hash;
        $('chat-name').textContent = ch ? ch.name : S.server.name;
        $('chat-name').style.color = ink(S.server.accent || '');
        $('chat-name').style.fontFamily = ch ? '' : fontOf(S.server.font);
        $('chat-sub').textContent = ch ? S.server.name : '';
    } else {
        const n = S.dm.username || S.dm.email;
        icon.append(avatar(n, 'sm', S.dm.avatar));
        $('chat-name').textContent = n;
        $('chat-name').style.color = '';
        $('chat-name').style.fontFamily = '';
        $('chat-sub').textContent = '';
    }
    const tb = document.querySelector('#view-chat .topbar');
    if (tb) {
        tb.classList.toggle('has-banner', isServer && !!S.server.banner);
        tb.style.backgroundImage = isServer && S.server.banner ? `linear-gradient(90deg, rgba(6,12,25,.55), rgba(6,12,25,.85)), url("${S.server.banner}")` : '';
    }
    $('invite-btn').classList.toggle('hidden', !isServer || oc || sp);
    $('members-btn').classList.toggle('hidden', oc || sp);
    $('members-btn').title = isServer ? 'Members' : 'Profile';
    $('members-btn').classList.toggle('on', S.membersOn);
    $('chat-body').classList.toggle('members-on', isServer && S.membersOn);
    $('chat-body').classList.toggle('dm-on', !isServer && S.membersOn);
    $('chat-body').classList.toggle('hidden', oc || sp);
    $('oc-page').classList.toggle('hidden', !oc);
    $('sp-page').classList.toggle('hidden', !sp);
    if (sp) renderOverview();
    if (!isServer) renderDmCard();

    const none = isServer && S.chLoaded && !ch;
    const isVoice = !!(ch && ch.kind === 'v');
    const longOk = (S.me && S.me.plus) || (isServer && S.server && (S.server.perks || []).includes('longmsg'));
    $('chat-input').maxLength = longOk ? 4000 : 2000;
    $('messages').classList.toggle('hidden', none || isVoice);
    $('composer-wrap').classList.toggle('hidden', isServer && (!ch || isVoice));
    $('voice-stage').classList.toggle('hidden', !isVoice);
    if (isVoice) renderVoiceStage();
    $('chat-empty').classList.toggle('hidden', !none);
    if (none) renderEmpty();
    $('chat-input').placeholder = isServer ? (ch ? `Message #${ch.name}` : '') : `Message @${S.dm.username || S.dm.email}`;
    paintReplyBar();
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
    if (!S.dm) return;
    paintOnce('dmcard', JSON.stringify(S.dm), paintDmCard);
}
function paintDmCard() {
    const u = S.dm, card = $('dm-card');
    if (!u) return;
    const glow = !!(u.plus && (u.glow || u.accent));
    card.classList.toggle('glow', glow);
    if (glow) card.style.setProperty('--pg', u.glow || u.accent); else card.style.removeProperty('--pg');
    const n = u.username || u.email, body = h('div', 'dm-body'), about = h('div', 'dm-about');
    about.append(h('h5', '', 'About me'), h('p', '', u.bio || 'No bio yet.'));
    const nm = h('strong', u.plus ? 'plus-name' : '', n); nm.style.color = nameColour(u); nm.style.fontFamily = u.plus ? fontOf(u.nameFont) : '';
    body.append(nm, h('span', 'badge', 'FRIEND'));
    if (u.statusText) { const st = h('small', 'muted', u.statusText); st.style.color = u.plus && u.accent ? ink(u.accent) : ''; body.append(st); }
    body.append(h('small', 'muted', SLABEL[u.status] || 'Offline'), h('small', 'stats', `${fmtDur(u.voice || 0)} in voice · ${u.msgs || 0} messages`), about);
    card.textContent = '';
    card.append(h('div', 'dm-banner'), userAva(u, 'xl'), body);
    card.onclick = () => openUserCard(u);
}

function renderMembers() {
    paintOnce('members', JSON.stringify([S.members, S.server && S.server.owner, S.me && S.me.id]), paintMembers);
}
function paintMembers() {
    const box = $('members-list');
    box.textContent = '';
    const ownerId = S.server ? S.server.owner : null;
    const byName = (a, b) => ((b.id === ownerId) - (a.id === ownerId)) || String(a.username || '').localeCompare(String(b.username || ''), undefined, { sensitivity: 'base' });
    const online = S.members.filter(m => m.status !== 'offline').sort(byName), offline = S.members.filter(m => m.status === 'offline').sort(byName);
    [['Online', online], ['Offline', offline]].forEach(([title, list]) => {
        if (!list.length) return;
        box.append(h('div', 'mem-sec', `${title} — ${list.length}`));
        list.forEach(m => {
            const r = h('div', 'mem' + (title === 'Offline' ? ' off' : '')), a = userAva(m, 'sm');
            a.append(dot(m.status));
            r._ctx = [...userItems(m), ...(isOwner() && S.me && m.id !== S.me.id ? ['-', ['Kick from server', () => kickMember(m), true]] : [])]; r.title = m.statusText || m.bio || '';
            const label = h('div', 'mem-name'), nm = h('span', m.plus ? 'plus-name' : '', m.username || 'Member'); nm.style.color = nameColour(m); nm.style.fontFamily = m.plus ? fontOf(m.nameFont) : ''; label.append(nm);
            if (m.statusText) label.append(h('small', 'mem-st', m.statusText));
            r.append(a, label, h('small', 'mem-stats', `${fmtDur(m.voice || 0)} · ${m.msgs || 0} msgs`));
            if (S.server && m.id === S.server.owner) r.append(h('em', 'badge', 'OWNER'));
            if (m.plus) r.append(h('em', 'badge plus', '✦'));
            r.onclick = () => openUserCard(m);
            box.append(r);
        });
    });
}

let S_curMsgs = [];
const EMOJI_ONLY = /^(?:\p{Extended_Pictographic}|\p{Emoji_Modifier}|\uFE0F|\u200D|[0-9#*]\uFE0F?\u20E3|\s)+$/u;
const isEmojiOnly = (t) => { const s = String(t || '').trim(); return s.length > 0 && s.length <= 60 && /\p{Extended_Pictographic}/u.test(s) && EMOJI_ONLY.test(s); };
const STICKER_RE = /^\[\[sk:(https:\/\/res\.cloudinary\.com\/[^\]\s]+)\]\]$/;
const stickerUrl = (t) => { const m = STICKER_RE.exec(String(t || '').trim()); return m ? m[1] : ''; };
function renderMessages(list, force) {
    S_curMsgs = list;
    const box = $('messages');
    const sig = list.map(m => m.id + ':' + (m.rx || []).map(r => r.e + r.n + (r.me ? 1 : 0)).join('')).join(',');
    if (sig === S.sig && !force) return;
    const key = chatKey(), prevMax = S.maxId[key];
    const stick = force || box.scrollTop + box.clientHeight >= box.scrollHeight - 100;
    const prevTop = box.scrollTop;
    box.textContent = '';

    const start = h('div', 'msg-start');
    const big = h('div', 'big');
    if (S.view === 'server') {
        if (S.server.logo) { const im = h('img', 'start-logo'); im.src = S.server.logo; im.alt = ''; big.append(im); }
        else big.innerHTML = ICON.hash;
        const ch = curChannel();
        start.append(big, h('h2', '', `Welcome to #${ch ? ch.name : ''}`), h('p', '', `This is the start of the #${ch ? ch.name : ''} channel.`));
    } else {
        const n = S.dm.username || S.dm.email;
        big.innerHTML = ICON.chat;
        start.append(big, h('h2', '', n), h('p', '', `This is the beginning of your conversation with ${n}.`));
    }
    if (S.view === 'server' && S.server && S.server.banner) {
        const bn = h('div', 'chat-banner');
        bn.style.backgroundImage = `url("${S.server.banner}")`;
        box.append(bn);
    }
    box.append(start);

    let prev = null, prevDay = '';
    list.forEach(m => {
        const day = new Date(m.t * 1000).toDateString();
        if (day !== prevDay) { box.append(h('div', 'day-div', fmtDay(m.t))); prevDay = day; prev = null; }
        const same = prev && prev.author.id === m.author.id && m.t - prev.t < 300;
        const row = h('div', 'msg' + (same ? '' : ' first'));
        if (!m.pending) row.id = 'msg-' + m.id;
        if (m.pending) row.classList.add('pending');
        const gutter = h('div', 'gutter');
        if (same) gutter.textContent = fmtTime(m.t);
        else { const av = userAva(m.author); av.onclick = () => openUserCard(m.author); gutter.append(av); }
        const body = h('div', 'body');
        if (!same) {
            const head = h('div', 'head');
            const name = h('strong', '' , m.author.username);
            name.className = m.author.plus ? 'plus-name' : '';
            name.style.color = nameColour(m.author);
            name.style.fontFamily = m.author.plus ? fontOf(m.author.nameFont) : '';
            name.onclick = () => openUserCard(m.author);
            const time = h('time', '', fmtTime(m.t));
            head.append(name, ...(m.author.plus ? [h('span', 'plus-badge', '✦ PLUS')] : []), time);
            body.append(head);
        }
        const sticker = stickerUrl(m.text);
        let txt, mentionsMe = false;
        if (m.reply) {
            const q = h('div', 'reply-quote');
            q.append(h('strong', '', m.reply.username || 'Unknown'), h('span', '', m.reply.text || ''));
            q.title = 'Jump to the replied message';
            q.onclick = () => {
                const el = document.getElementById('msg-' + m.reply.id);
                if (!el) return;
                el.scrollIntoView({ block: 'center', behavior: 'smooth' });
                el.classList.add('flash');
                setTimeout(() => el.classList.remove('flash'), 1300);
            };
            body.append(q);
        }
        if (sticker) {
            txt = h('img', 'sticker-img');
            txt.src = sticker; txt.alt = 'sticker'; txt.loading = 'lazy';
        } else {
            [txt, mentionsMe] = richText(m.text, S.view === 'server' && !!S.server && m.author.id === S.server.owner); // only the server owner can ping @everyone / @here
            if (isEmojiOnly(m.text)) txt.classList.add('emoji-only');
        }
        body.append(txt);
        if (m.rx && m.rx.length) body.append(reactRow(m));
        if (mentionsMe) row.classList.add('mentioned');
        if (prevMax != null && m.id > prevMax && !m.mine && mentionsMe) toast(`${m.author.username} mentioned you`);
        [...new Set([...m.text.matchAll(/#invite=([a-z0-9]{5,48})/gi)].map(x => x[1].toLowerCase()))].forEach(code => body.append(inviteEmbed(code)));
        const internal = urlsIn(m.text).map(u => { try { const x = new URL(u); return x.origin === location.origin ? x.pathname : ''; } catch { return ''; } }).filter(Boolean);
        if (internal.length) { const card = linkEmbed(internal[0]); if (card) body.append(card); }
        row._ctx = m.pending ? [] : [...userItems(m.author), ['Copy message', () => copy(m.text)], ...idItem('message', m.id), ...(m.mine || isOwner() ? ['-', ['Delete message', () => delMsg(m), true]] : [])];
        row.append(gutter, body, m.pending ? h('div', 'msg-tools') : reactTools(m));
        box.append(row);
        prev = m;
    });
    S.sig = sig;
    S.maxId[key] = list.length ? Math.max(...list.map(m => m.id)) : (prevMax ?? 0);
    if (stick) box.scrollTop = box.scrollHeight; else box.scrollTop = prevTop;
}

/* ---------- modals ---------- */
function openModal(id) { closeModals(); $(id).classList.remove('hidden'); const f = $(id).querySelector('input'); if (f) setTimeout(() => f.focus(), 30); }
function closeModals() { document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden')); }
document.querySelectorAll('[data-close]').forEach(b => b.onclick = closeModals);
document.querySelectorAll('.modal').forEach(m => m.addEventListener('mousedown', (e) => { if (e.target === m) closeModals(); }));
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { closeModals(); $('server-menu').classList.add('hidden'); closeNav(); } });

/* ---------- user profile card + mention lists ---------- */
function findUserBy(ref) {
    if (!ref) return null;
    if (typeof ref === 'object') return ref.id != null ? ref : null;
    const name = String(ref).replace(/^@/, '').toLowerCase();
    const pool = [...(S.members || []), ...(S.friends || []), ...(S.dm ? [S.dm] : []), ...(S.requests.in || []), ...(S.requests.out || [])];
    return pool.find(u => String(u.username || '').toLowerCase() === name || String(u.email || '').toLowerCase() === name) || null;
}
function openUserCard(u) {
    u = typeof u === 'object' ? u : findUserBy(u);
    if (!u || u.id == null) return;
    const glow = !!(u.plus && (u.glow || u.accent));
    const card = $('user-card');
    card.classList.toggle('glow', glow);
    if (glow) card.style.setProperty('--pg', u.glow || u.accent); else card.style.removeProperty('--pg');
    $('uc-banner').style.background = u.plus && u.accent ? `linear-gradient(120deg, ${u.accent}66, transparent 70%)` : '';
    const a = userAva(u, 'xl'), av = $('uc-ava');
    av.className = a.className; av.style.cssText = a.style.cssText; av.textContent = a.textContent;
    const nm = $('uc-name');
    nm.textContent = u.username || u.email || 'Member';
    nm.className = u.plus ? 'plus-name' : '';
    nm.style.color = nameColour(u);
    nm.style.fontFamily = u.plus ? fontOf(u.nameFont) : '';
    $('uc-handle').textContent = u.username ? `@${u.username}` : '';
    const st = $('uc-status');
    st.textContent = [u.statusText, SLABEL[u.status] || 'Offline'].filter(Boolean).join(' · ');
    st.style.color = u.plus && u.accent ? ink(u.accent) : '';
    $('uc-badge').classList.toggle('hidden', !u.plus);
    $('uc-stats').textContent = `${fmtDur(u.voice || 0)} in voice · ${u.msgs || 0} messages`;
    $('uc-bio').textContent = u.bio || 'No bio yet.';
    const acts = $('uc-actions'); acts.textContent = '';
    const friend = (S.friends || []).find(f => f.id === u.id);
    if (friend) {
        const b = h('button', 'btn primary', 'Message'); b.type = 'button';
        b.onclick = () => { closeModals(); openDM(friend); };
        acts.append(b);
    } else if (!S.me || u.id !== S.me.id) {
        const b = h('button', 'btn ghost', 'Add friend'); b.type = 'button';
        b.onclick = async () => { if (await addFriend(u.username || u.email)) closeModals(); };
        acts.append(b);
    }
    const cp = h('button', 'btn ghost', 'Copy username'); cp.type = 'button';
    cp.onclick = () => copy(u.username ? '@' + u.username : String(u.email || ''));
    acts.append(cp);
    openModal('modal-user');
}
function openRoleCard(kind) {
    if (!S.server) return;
    const here = kind === 'here';
    const list = (S.members || []).filter(m => here ? m.status !== 'offline' : true)
        .sort((a, b) => String(a.username || '').localeCompare(String(b.username || ''), undefined, { sensitivity: 'base' }));
    $('role-title').textContent = here ? '@here' : '@everyone';
    $('role-sub').textContent = here
        ? `${list.length} online right now in ${S.server.name}`
        : `${list.length} member${list.length === 1 ? '' : 's'} in ${S.server.name}`;
    const box = $('role-list'); box.textContent = '';
    if (!list.length) box.append(h('div', 'side-empty', here ? 'Nobody is online right now.' : 'No members yet.'));
    list.forEach(m => {
        const r = h('div', 'role-row'), a = userAva(m, 'sm'); a.append(dot(m.status));
        const nm = h('span', 'role-name' + (m.plus ? ' plus-name' : ''), m.username || 'Member');
        nm.style.color = nameColour(m);
        nm.style.fontFamily = m.plus ? fontOf(m.nameFont) : '';
        const right = h('small', 'role-right', SLABEL[m.status] || 'Offline');
        r.append(a, nm, right);
        r.onclick = () => openUserCard(m);
        box.append(r);
    });
    openModal('modal-role');
}

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

const DEFAULT_CATS = ['TEXT CHANNELS', 'VOICE CHANNELS'];
function openChannelModal(cat) {
    if (!isOwner()) return;
    $('channel-modal-msg').textContent = '';
    $('cat-options').textContent = '';
    [...new Set([...(S.cats || []), ...S.channels.map(c => c.category)])].filter(Boolean).forEach(c => { const o = document.createElement('option'); o.value = c; $('cat-options').append(o); });
    $('new-channel-cat').value = cat || 'TEXT CHANNELS';
    $('new-channel-kind').value = cat === 'VOICE CHANNELS' ? 'v' : 't';
    $('new-channel-name').value = '';
    openModal('modal-channel');
}
$('new-channel-kind').onchange = () => {
    const cur = $('new-channel-cat').value.trim();
    if (!cur || DEFAULT_CATS.includes(cur)) $('new-channel-cat').value = $('new-channel-kind').value === 'v' ? 'VOICE CHANNELS' : 'TEXT CHANNELS';
};
$('channel-create-form').onsubmit = async (e) => {
    e.preventDefault();
    if (!S.server) return;
    const kind = $('new-channel-kind').value;
    const out = await post({ action: 'channel-create', id: S.server.id, channelName: $('new-channel-name').value, ck: kind, category: $('new-channel-cat').value.trim() || (kind === 'v' ? 'VOICE CHANNELS' : 'TEXT CHANNELS') });
    if (!out.res.ok) { $('channel-modal-msg').textContent = out.data.error || 'Could not create channel.'; return; }
    closeModals();
    await loadChannels();
    S.channelId = out.data.channel.id; S.last[S.server.id] = S.channelId; S.sig = ''; S.oc = false; S.statsOpen = false;
    renderAll();
    syncUrl();
    loadMessages(true);
    toast('Channel created.');
};
async function deleteChannel(c) {
    if (!confirm(`Delete #${c.name}? It will be hidden; its messages stay on record.`)) return;
    const out = await post({ action: 'channel-delete', channelId: c.id });
    if (!out.res.ok) return toast(out.data.error || 'Could not delete channel.', true);
    await loadChannels(c.id === S.channelId);
    S.sig = ''; renderAll(); loadMessages(true);
}

async function loadInvites() {
    const box = $('invite-list');
    box.textContent = 'Loading…';
    const out = await post({ action: 'invite-list', id: S.server.id });
    box.textContent = '';
    if (!out.res.ok) return void box.append(h('div', 'side-empty', out.data.error || 'Could not load invites.'));
    const copyBtn = (code) => { const b = h('button', 'btn ghost sm', 'Copy'); b.type = 'button'; b.onclick = () => copy(`${location.origin}/#invite=${code}`); return b; };
    if (out.data.permanent) {
        const r = h('div', 'logrow');
        r.append(h('span', '', 'Permanent invite — never expires'), copyBtn(out.data.permanent));
        box.append(r);
    }
    if (!out.data.invites.length && !out.data.permanent) return void box.append(h('div', 'side-empty', 'No invites yet.'));
    out.data.invites.forEach(i => {
        const r = h('div', 'logrow');
        const state = i.expired ? 'expired' : i.x ? `expires ${stamp(i.x)}` : 'never expires';
        r.append(h('time', '', stamp(i.t)), h('span', '', `${i.code} — by ${i.by}, used ${i.uses}× · ${state}`), copyBtn(i.code));
        if (i.expired) r.classList.add('off');
        box.append(r);
    });
}
function openInvite() {
    if (!S.server) return;
    $('invite-out').classList.add('hidden');
    openModal('modal-invite');
    loadInvites();
}
$('invite-gen').onclick = async () => {
    const out = await post({ action: 'invite-create', id: S.server.id, ttl: Number($('invite-ttl').value) });
    if (!out.res.ok) return toast(out.data.error || 'Could not create invite.', true);
    $('invite-link').value = `${location.origin}/#invite=${out.data.code}`;
    $('invite-out').classList.remove('hidden');
    $('invite-link').select();
    loadInvites();
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
    $('menu-audit').classList.toggle('hidden', !isOwner());
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
    if (act === 'boosts') openBoosts();
    if (act === 'audit') openAudit();
    if (act === 'vtime') openVoiceTime();
    if (act === 'leave' && S.server && confirm(`Leave ${S.server.name}?`)) {
        const out = await post({ action: 'server-leave', id: S.server.id });
        if (!out.res.ok) return toast(out.data.error || 'Could not leave.', true);
        await loadServers(); goHome(); toast('You left the server.');
    }
};

window.addEventListener('hashchange', () => { if (S.token && S.me) handleInvite(); });
