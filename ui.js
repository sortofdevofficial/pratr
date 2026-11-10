'use strict';

/* ui: rendering, modals and stored-data displays — loaded after app.js */

/* ---------- rendering ---------- */
function renderAll() { renderRail(); renderSide(); renderMain(); renderMembers(); }

function renderRail() {
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
    const server = S.view === 'server' && S.server;
    const title = $('side-title');
    title.textContent = server ? S.server.name : S.view === 'discover' ? 'Discover' : 'Home';
    const accent = server ? ink(S.server.accent || '') : '';
    title.style.background = accent ? `linear-gradient(90deg, ${accent}, ${accent})` : '';
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
            const it = h('div', 'ch-item' + (c.id === S.channelId && !S.oc ? ' active' : ''));
            it.tabIndex = 0; it.setAttribute('role', 'button');
                    it.innerHTML = c.kind === 'v' ? ICON.speaker : ICON.hash;
            const un = c.kind === 't' && S.unread.channels[c.id];
            it.append(h('span', c.id === S.channelId && !S.oc ? '' : (un ? 'unread' : ''), c.name));
            if (un && un.pings) it.append(h('em', 'ping-badge', String(un.pings)));
            else if (un) it.append(h('i', 'unread-dot'));
            if (isOwner()) {
                const del = h('button', 'ch-del'); del.innerHTML = ICON.trash; del.title = 'Delete channel';
                del.onclick = (e) => { e.stopPropagation(); deleteChannel(c); };
                it.append(del);
            }
            it._ctx = [['Open channel', () => selectChannel(c.id)], ['Copy link', () => copy(location.origin + '/channels/' + S.server.id + '/' + c.id)], ['Copy name', () => copy(c.name)], ...idItem('channel', c.id), ...(isOwner() ? ['-', ['Delete channel', () => deleteChannel(c), true]] : [])];
            it.onclick = () => selectChannel(c.id);
            it.onkeydown = (e) => { if (e.key === 'Enter') selectChannel(c.id); };
            list.append(it);
            if (c.kind === 'v') (S.voice[c.id] || []).forEach(p => list.append(voiceRow(p)));
        });
    });

    const ocSec = h('div', 'sec-title'); ocSec.append(h('span', '', 'Overclocks'));
    list.append(ocSec);
    const oc = h('div', 'ch-item oc-item' + (S.oc ? ' active' : ''));
    oc.tabIndex = 0; oc.setAttribute('role', 'button');
    oc.append(h('span', 'oc-star', '✦'), h('span', '', 'Server overclock'), h('em', 'oc-count', String(S.server.boosts || 0)));
    oc.title = `${S.server.boosts || 0} overclocks · ${S.server.tier || 0} perk tiers — perks, art, free emoji and stickers`;
    oc.onclick = () => openBoosts();
    oc.onkeydown = (e) => { if (e.key === 'Enter') openBoosts(); };
    list.append(oc);
}

function renderFriends() {
    renderRequests();
    $('friend-count').textContent = S.friends.length;
    const grid = $('friend-grid');
    grid.textContent = '';
    if (!S.friends.length) { grid.style.display = 'block'; grid.append(h('div', 'empty-note', 'No friends yet — add someone above to start a conversation.')); return; }
    grid.style.display = '';
    S.friends.forEach(u => {
        const c = h('div', 'friend-card');
        if (u.glow) { c.classList.add('glow'); c.style.setProperty('--pg', u.glow); }
        const meta = h('div', 'meta');
        const nm = h('strong', '', u.username || u.email); nm.style.color = nameColour(u);
        meta.append(nm);
        if (u.statusText) { const st = h('small', '', u.statusText); st.style.color = u.plus && u.accent ? ink(u.accent) : ''; meta.append(st); }
        meta.append(h('small', '', u.bio || u.email || ''), h('small', 'stats', `${fmtDur(u.voice || 0)} in voice · ${u.msgs || 0} messages`));
        const btn = h('button', 'btn ghost', 'Message');
        btn.onclick = () => openDM(u);
        c._ctx = [['Copy link', () => copy(location.origin + '/dm/' + encodeURIComponent(u.username || u.id))], ...userItems(u)];
        const av = userAva(u); av.append(dot(u.status));
        c.append(av, meta, btn);
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
    const ch = isServer ? curChannel() : null;
    const icon = $('chat-icon');
    icon.textContent = '';
    if (oc) {
        icon.textContent = '✦';
        $('chat-name').textContent = 'Server overclock';
        $('chat-name').style.color = S.server.accent ? ink(S.server.accent) : '';
        $('chat-sub').textContent = S.server.name;
    } else if (isServer) {
        if (S.server.logo && !(ch && ch.kind === 'v')) {
            const im = h('img', 'topbar-logo'); im.src = S.server.logo; im.alt = ''; icon.append(im);
        } else icon.innerHTML = ch && ch.kind === 'v' ? ICON.speaker : ICON.hash;
        $('chat-name').textContent = ch ? ch.name : S.server.name;
        $('chat-name').style.color = ink(S.server.accent || '');
        $('chat-sub').textContent = ch ? S.server.name : '';
    } else {
        const n = S.dm.username || S.dm.email;
        icon.append(avatar(n, 'sm', S.dm.avatar));
        $('chat-name').textContent = n;
        $('chat-name').style.color = '';
        $('chat-sub').textContent = '';
    }
    const tb = document.querySelector('#view-chat .topbar');
    if (tb) {
        tb.classList.toggle('has-banner', isServer && !!S.server.banner);
        tb.style.backgroundImage = isServer && S.server.banner ? `linear-gradient(90deg, rgba(6,12,25,.55), rgba(6,12,25,.85)), url("${S.server.banner}")` : '';
    }
    $('invite-btn').classList.toggle('hidden', !isServer || oc);
    $('members-btn').classList.toggle('hidden', oc);
    $('members-btn').title = isServer ? 'Members' : 'Profile';
    $('members-btn').classList.toggle('on', S.membersOn);
    $('chat-body').classList.toggle('members-on', isServer && S.membersOn);
    $('chat-body').classList.toggle('dm-on', !isServer && S.membersOn);
    $('chat-body').classList.toggle('hidden', oc);
    $('oc-page').classList.toggle('hidden', !oc);
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
    const u = S.dm, card = $('dm-card');
    if (!u) return;
    card.classList.toggle('glow', !!u.glow);
    if (u.glow) card.style.setProperty('--pg', u.glow); else card.style.removeProperty('--pg');
    const n = u.username || u.email, body = h('div', 'dm-body'), about = h('div', 'dm-about');
    about.append(h('h5', '', 'About me'), h('p', '', u.bio || 'No bio yet.'));
    const nm = h('strong', '', n); nm.style.color = nameColour(u);
    body.append(nm, h('span', 'badge', 'FRIEND'));
    if (u.statusText) { const st = h('small', 'muted', u.statusText); st.style.color = u.plus && u.accent ? ink(u.accent) : ''; body.append(st); }
    body.append(h('small', 'muted', SLABEL[u.status] || 'Offline'), h('small', 'stats', `${fmtDur(u.voice || 0)} in voice · ${u.msgs || 0} messages`), about);
    card.textContent = '';
    card.append(h('div', 'dm-banner'), userAva(u, 'xl'), body);
}

function renderMembers() {
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
            const label = h('div', 'mem-name'), nm = h('span', '', m.username || 'Member'); nm.style.color = nameColour(m); label.append(nm);
            if (m.statusText) label.append(h('small', 'mem-st', m.statusText));
            r.append(a, label, h('small', 'mem-stats', `${fmtDur(m.voice || 0)} · ${m.msgs || 0} msgs`));
            if (S.server && m.id === S.server.owner) r.append(h('em', 'badge', 'OWNER'));
            if (m.plus) r.append(h('em', 'badge plus', '✦'));
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
        if (same) gutter.textContent = fmtTime(m.t); else gutter.append(userAva(m.author));
        const body = h('div', 'body');
        if (!same) {
            const head = h('div', 'head');
            const name = h('strong', '', m.author.username);
            name.style.color = nameColour(m.author);
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
    $('new-channel-kind').value = cat === 'VOICE CHANNELS' ? 'v' : 't';
    $('new-channel-name').value = '';
    openModal('modal-channel');
}
$('channel-create-form').onsubmit = async (e) => {
    e.preventDefault();
    if (!S.server) return;
    const out = await post({ action: 'channel-create', id: S.server.id, channelName: $('new-channel-name').value, ck: $('new-channel-kind').value, category: (() => { const c = $('new-channel-cat').value.trim(), v = $('new-channel-kind').value === 'v'; return v && (!c || c === 'TEXT CHANNELS') ? 'VOICE CHANNELS' : c || 'TEXT CHANNELS'; })() });
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

/* ---------- emoji picker (every Unicode emoji, drawn as images) ---------- */
const pop = $('emoji-pop');
// Skin tones are generated from the base gestures/people instead of being stored one by one.
const TONES = ['🏻', '🏼', '🏽', '🏾', '🏿'];
const SKIN_BASE = '👋 🤚 🖐️ ✋ 🖖 🫱 🫲 🫳 🫴 🫵 🫷 🫸 👌 🤌 🤏 ✌️ 🤞 🫰 🤟 🤘 🤙 👈 👉 👆 🖕 👇 ☝️ 🫶 👍 👎 ✊ 👊 🤛 🤜 👏 🙌 👐 🤲 🤝 🙏 ✍️ 💅 🤳 💪 🦵 🦶 👂 👃 👶 🧒 👦 👧 🧑 👱 👨 🧔 👩 🧓 👴 👵 🙍 🙎 🙅 🙆 💁 🙋 🙇 🤦 🤷 🚶 🧍 🧎 🏃 💃 🕺 🧖 🧗 🏇 🏂 🏌️ 🏄 🚣 🏊 ⛹️ 🏋️ 🚴 🚵 🤸 🤼 🤽 🤾 🤹 🧘 🛀 🛌';
const flag = (code) => String.fromCodePoint(...[...code].map(c => 0x1F1E6 + c.charCodeAt(0) - 65));
const flagSet = new Set((window.FLAG_CODES || '').split(' ').filter(Boolean).map(flag));
const flagsGroup = (window.EMOJI_GROUPS || []).find(g => g && g.n === 'Flags');
if (flagsGroup) flagsGroup.e.split(' ').forEach(e => flagSet.add(e));
const RECENT_KEY = 'emoji-recent';
let recents = [];
try { recents = (JSON.parse(localStorage.getItem(RECENT_KEY)) || []).filter(e => typeof e === 'string' && e); } catch { recents = []; }
const SHORT = { 'Smileys & emotion': 'Smileys', 'People & body': 'People', 'Animals & nature': 'Nature', 'Food & drink': 'Food', 'Travel & places': 'Travel', 'Activities': 'Activity', 'Objects': 'Objects', 'Symbols': 'Symbols', 'Flags': 'Flags' };
const GICON = { 'Recent': '🕘', 'Smileys & emotion': '😀', 'People & body': '👋', 'Animals & nature': '🐻', 'Food & drink': '🍔', 'Travel & places': '✈️', 'Activities': '⚽', 'Objects': '💡', 'Symbols': '❤️', 'Flags': '🏳️' };
const BASE_GROUPS = [
    { n: 'Recent', icon: GICON.Recent, list: () => recents },
    ...(window.EMOJI_GROUPS || []).map(g => ({
        n: g.n, icon: GICON[g.n],
        list: () => g.n === 'People & body'
            ? [...new Set(g.e.split(' ').concat(SKIN_BASE.split(' ').flatMap(b => TONES.map(t => b + t))))]
            : g.n === 'Flags' ? [...flagSet] : g.e.split(' ')
    }))
];
let EMOJI_GROUPS = [...BASE_GROUPS];
const customEmoji = new Map();
let customStickers = [];
function rebuildEmojiGroups() {
    customEmoji.clear();
    customStickers = [];
    const s = S.server;
    if (s) {
        (s.emoji || []).forEach(e => { if (e && e.n && e.u) customEmoji.set(e.n, e.u); });
        customStickers = (s.stickers || []).filter(e => e && e.n && e.u);
    }
    EMOJI_GROUPS = [
        ...BASE_GROUPS,
        ...(customEmoji.size ? [{ n: 'Server', icon: '🖼️', kind: 'custom', list: () => [...customEmoji.keys()] }] : []),
        ...(customStickers.length ? [{ n: 'Stickers', icon: '🏷️', kind: 'sticker', list: () => customStickers.map(x => x.n) }] : [])
    ];
}
const head = h('div', 'emoji-head');
const countEl = h('span', 'emoji-count', '');
const searchEl = h('input', 'emoji-search');
searchEl.type = 'search'; searchEl.placeholder = 'Search emoji'; searchEl.autocomplete = 'off'; searchEl.spellcheck = false;
head.append(h('strong', '', 'Emoji'), countEl, searchEl);
const tabs = h('div', 'emoji-tabs'), body = h('div', 'emoji-body');
pop.textContent = '';
pop.append(head, tabs, body);
let activeEmoji = 0, emojiQuery = '', searchAll = null, searchResults = [];
const groupCache = new Map();
function groupList(i) {
    const g = EMOJI_GROUPS[i];
    if (!g) return [];
    if (g.n === 'Recent') return recents;
    if (g.kind) return g.list();
    if (!groupCache.has(i)) groupCache.set(i, [...new Set(g.list())]);
    return groupCache.get(i);
}
function allEmoji() {
    if (searchAll) return searchAll;
    const seen = new Set();
    EMOJI_GROUPS.forEach((g, i) => { if (g.n !== 'Recent') groupList(i).forEach(e => seen.add(e)); });
    return (searchAll = [...seen]);
}
function addRecent(e) {
    recents = [e, ...recents.filter(x => x !== e)].slice(0, 24);
    try { localStorage.setItem(RECENT_KEY, JSON.stringify(recents)); } catch {}
    if (activeEmoji === 0 && !emojiQuery) paintBody();
}
function insertText(t) { input.setRangeText(t, input.selectionStart, input.selectionEnd, 'end'); input.focus(); autosize(); }
function insertEmoji(e) {
    insertText(e); addRecent(e);
}
function sendSticker(u) {
    pop.classList.add('hidden');
    if (!input || S.sending) return;
    input.value = `[[sk:${u}]]`;
    autosize();
    const form = $('chat-form');
    if (typeof form.requestSubmit === 'function') form.requestSubmit(); else form.dispatchEvent(new Event('submit', { cancelable: true }));
}
function emojiCell(e) {
    const g = EMOJI_GROUPS[activeEmoji];
    const b = h('button', 'emoji-cell');
    b.type = 'button'; b.tabIndex = -1;
    if (g && g.kind === 'custom') {
        b.classList.add('cust'); b.title = `:${e}:`; b.setAttribute('aria-label', e);
        const img = h('img'); img.src = customEmoji.get(e); img.alt = e; img.loading = 'lazy';
        b.append(img);
        b.onclick = () => insertText(`:${e}: `);
        return b;
    }
    if (g && g.kind === 'sticker') {
        const st = customStickers.find(x => x.n === e);
        b.classList.add('cust'); b.title = `${e} — send sticker`; b.setAttribute('aria-label', e);
        const img = h('img'); img.src = st ? st.u : ''; img.alt = e; img.loading = 'lazy';
        b.append(img);
        b.onclick = () => { if (st) sendSticker(st.u); };
        return b;
    }
    const name = emojiArt.nameOf(e);
    b.title = name ? `${name} — ${e}` : e;
    b.setAttribute('aria-label', name || e);
    b.append(emojiArt.node(e, 'tile'));
    b.onclick = () => insertEmoji(e);
    return b;
}
function paintBody() {
    body.textContent = '';
    const q = emojiQuery;
    const list = q ? searchResults : groupList(activeEmoji);
    const title = q ? `Results for “${emojiQuery}”` : activeEmoji === 0 ? 'Recently used' : SHORT[EMOJI_GROUPS[activeEmoji].n] || EMOJI_GROUPS[activeEmoji].n;
    countEl.textContent = list.length ? String(list.length) : '';
    const sec = h('div', 'emoji-sec');
    sec.append(h('span', '', title), h('small', '', list.length ? `${list.length}` : ''));
    body.append(sec);
    if (!list.length) {
        body.append(h('div', 'side-empty', q ? 'No emoji match that search.' : 'Pick an emoji and it will show up here.'));
        return;
    }
    const grid = h('div', 'emoji-grid');
    list.forEach(e => grid.append(emojiCell(e)));
    body.append(grid);
}
function paintEmoji(i) {
    activeEmoji = i;
    [...tabs.children].forEach((t, x) => t.classList.toggle('on', x === i));
    paintBody();
}
function runSearch() {
    const q = searchEl.value.trim().toLowerCase();
    emojiQuery = q;
    searchResults = q ? allEmoji().filter(e => emojiArt.words(e).includes(q)).slice(0, 500) : [];
    if (!q) {
        [...tabs.children].forEach((t, x) => t.classList.toggle('on', x === activeEmoji));
    } else {
        [...tabs.children].forEach(t => t.classList.remove('on'));
    }
    body.scrollTop = 0;
    paintBody();
}
searchEl.addEventListener('input', runSearch);
searchEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && emojiQuery && searchResults[0]) { e.preventDefault(); insertEmoji(searchResults[0]); }
    if (e.key === 'Escape') { e.stopPropagation(); if (searchEl.value) { searchEl.value = ''; runSearch(); } else { pop.classList.add('hidden'); } }
});
function rebuildEmojiTabs() {
    rebuildEmojiGroups();
    if (activeEmoji >= EMOJI_GROUPS.length) activeEmoji = 0;
    tabs.textContent = '';
    EMOJI_GROUPS.forEach((g, i) => {
        const t = h('button', 'emoji-tab' + (i === activeEmoji ? ' on' : ''));
        t.type = 'button'; t.tabIndex = -1; t.title = g.n; t.setAttribute('aria-label', g.n);
        t.append(emojiArt.node(g.icon, 'tab-e'));
        t.onclick = () => { searchEl.value = ''; emojiQuery = ''; paintEmoji(i); body.scrollTop = 0; };
        tabs.append(t);
    });
    paintEmoji(activeEmoji);
}
rebuildEmojiTabs();

function openProfile(tab) {
    $('profile-msg').textContent = '';
    const plus = !!(S.me && S.me.plus);
    $('profile-stats').textContent = S.me ? `${fmtDur(S.me.voice || 0)} in voice across all servers · ${S.me.msgs || 0} messages sent` : '';
    $('profile-name').value = S.me ? S.me.username : '';
    $('profile-bio').maxLength = plus ? 400 : 160;
    $('profile-bio').value = S.me?.bio || ''; syncBioCount();
    $('profile-status').value = S.me?.statusText || '';
    $('plus-lock').classList.toggle('hidden', plus);
    $('glow-plus').classList.toggle('hidden', plus);
    $('ac-plus').classList.toggle('hidden', plus);
    pend.ac = plus ? (S.me?.accent || '') : '';
    pend.pg = plus ? (S.me?.glow || '') : '';
    paintAccents(plus);
    paintGlow(plus);
    syncStatusTtl();
    $('pf-ava').classList.toggle('glow', plus && !!pend.pg);
    pend.pf = S.me?.avatar || ''; paint('pf', $('profile-name').value);
    $('dev-toggle').checked = dev();
    openModal('modal-profile');
    settingsTab(tab || 'profile');
}
function syncBioCount() { $('bio-count').textContent = `${$('profile-bio').value.length}/${$('profile-bio').maxLength}`; }
function paintAccents(plus) {
    const box = $('accent-pick'); box.textContent = '';
    ACCENTS.forEach(c => {
        const b = h('button', 'accent-swatch' + (pend.ac === c ? ' on' : ''), '');
        b.type = 'button'; b.title = c; b.style.background = c;
        b.style.opacity = plus ? '' : '.45';
        b.onclick = () => { if (!plus) return; pend.ac = pend.ac === c ? '' : c; paintAccents(plus); };
        box.append(b);
    });
}
function paintGlow(plus) {
    const box = $('glow-pick'); box.textContent = '';
    ACCENTS.forEach(c => {
        const b = h('button', 'accent-swatch' + (pend.pg === c ? ' on' : ''), '');
        b.type = 'button'; b.title = c; b.style.background = c;
        b.style.opacity = plus ? '' : '.45';
        b.onclick = () => { if (!plus) return; pend.pg = pend.pg === c ? '' : c; paintGlow(plus); paintGlowPreview(plus); };
        box.append(b);
    });
    const inp = $('glow-custom');
    inp.value = /^#[0-9a-f]{6}$/i.test(pend.pg) ? pend.pg : '#ffd36b';
    inp.disabled = !plus;
    inp.style.opacity = plus ? '' : '.45';
    paintGlowPreview(plus);
}
function paintGlowPreview(plus) {
    const a = $('pf-ava');
    a.classList.toggle('glow', plus && !!pend.pg);
    if (plus && pend.pg) a.style.setProperty('--pg', pend.pg); else a.style.removeProperty('--pg');
}
$('glow-custom').oninput = () => { if (!(S.me && S.me.plus)) return; pend.pg = $('glow-custom').value; paintGlow(true); };

/* status expiry: the select stores a TTL in seconds; "custom" reads the hours box */
function statusSeconds() {
    const v = $('status-ttl').value;
    if (v === 'custom') return Math.max(1, Math.round(Number($('status-custom').value) || 1)) * 3600;
    return Math.round(Number(v) || 0);
}
function paintStatusHint() {
    const text = $('profile-status').value.trim(), secs = statusSeconds();
    $('status-expiry').textContent = !text
        ? 'No status set — everyone can set one, free.'
        : !secs
            ? 'Your status stays until you change it.'
            : `Your status will clear itself in ${fmtDur(secs)}.`;
}
function syncStatusTtl() {
    const until = (S.me && S.me.statusUntil) || 0;
    const left = until ? Math.max(0, until - Math.floor(Date.now() / 1000)) : 0;
    const fixed = ['1800', '3600', '14400', '28800', '86400', '259200', '604800'];
    let val = '0';
    if (left) {
        const exact = fixed.find(v => Math.abs(Number(v) - left) < 90);
        if (exact) val = exact;
        else { val = 'custom'; $('status-custom').value = String(Math.max(1, Math.round(left / 3600))); }
    }
    $('status-ttl').value = val;
    $('status-custom-wrap').classList.toggle('hidden', val !== 'custom');
    paintStatusHint();
}
$('status-ttl').onchange = () => { $('status-custom-wrap').classList.toggle('hidden', $('status-ttl').value !== 'custom'); paintStatusHint(); };
$('status-custom').oninput = paintStatusHint;
$('profile-status').oninput = paintStatusHint;
$('profile-bio').addEventListener('input', syncBioCount);
function settingsTab(name) {
    document.querySelectorAll('#pf-tabs .tab').forEach(t => t.classList.toggle('on', t.dataset.tab === name));
    $('tab-profile').classList.toggle('hidden', name !== 'profile');
    $('tab-security').classList.toggle('hidden', name !== 'security');
    if (name === 'security') openSecurity();
}
$('pf-tabs').onclick = (e) => { const b = e.target.closest('.tab'); if (b) settingsTab(b.dataset.tab); };
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
    const plus = !!(S.me && S.me.plus);
    const out = await post({ action: 'profile-update', username: $('profile-name').value, avatar: pend.pf, bio: $('profile-bio').value, st: $('profile-status').value, sx: statusSeconds(), ac: plus ? (pend.ac || '') : '', pg: plus ? (pend.pg || '') : '' });
    if (!out.res.ok) { $('profile-msg').textContent = out.data.error || 'Could not save.'; return; }
    Object.assign(S.me, { username: out.data.username, avatar: out.data.avatar, bio: out.data.bio, statusText: out.data.statusText || '', statusUntil: out.data.statusUntil || 0, accent: out.data.accent || '', glow: out.data.glow || '' });
    setMe(S.me);
    closeModals(); toast('Profile updated.');
    loadMessages(true); loadMembers();
};

/* ---------- audit log, voice time, kick ---------- */
const fmtDur = (s) => { s = Math.max(0, Math.round(s)); const hh = Math.floor(s / 3600), mm = Math.floor(s % 3600 / 60), ss = s % 60; return hh ? `${hh}h ${mm}m` : mm ? `${mm}m ${ss}s` : `${ss}s`; };
const stamp = (t) => new Date(t * 1000).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
function logText(l) {
    const a = l.an || 'Someone', u = l.un || 'someone';
    switch (l.ty) {
        case 'server_create': return `${a} created the server “${l.x}”`;
        case 'server_update': return `${a} updated the server: ${l.x}`;
        case 'channel_create': return `${a} created the ${l.x} channel ${l.cn}`;
        case 'channel_delete': return `${a} deleted the ${l.x} channel ${l.cn}`;
        case 'member_join': return `${a} joined (${l.x})`;
        case 'member_leave': return `${a} left the server`;
        case 'member_kick': return `${a} kicked ${u}`;
        case 'server_transfer': return `${a} transferred ownership to ${u}`;
        case 'invite_create': return `${a} created invite ${l.x}`;
        case 'message_delete': return `${a} deleted ${l.an === l.un ? 'their' : u + '’s'} message in #${l.cn}: “${l.x}”`;
        case 'voice_join': return `${a} joined voice channel ${l.cn}`;
        case 'voice_state': return `${a} ${l.x} themselves in voice`;
        case 'signup': return `${a} created their account${l.x ? ` (${l.x})` : ''}`;
        case 'login': return `${a} logged in${l.x ? ` (${l.x})` : ''}`;
        case 'login_fail': return `Failed login attempt${l.x ? ` (${l.x})` : ''}`;
        case 'logout': return `${a} logged out`;
        case 'session_revoke': return `${a} signed out a device${l.x ? ` (${l.x})` : ''}`;
        case 'password_change': return `${a} changed their password${l.x ? ` (${l.x})` : ''}`;
        case 'react': return `${a} reacted ${l.x} to ${u}’s message`;
        case 'unreact': return `${a} removed ${l.x} from ${u}’s message`;
        case 'profile': return `${a} updated their profile: ${l.x}`;
        case 'friend_add': return `${a} added ${u} as a friend`;
        case 'friend_request': return `${a} sent ${u} a friend request`;
        case 'friend_accept': return `${a} accepted ${u}’s friend request`;
        case 'friend_deny': return `${a} declined ${u}’s friend request`;
        case 'friend_cancel': return `${a} cancelled a friend request to ${u}`;
        case 'status': return `${a} set their status to ${l.x}`;
        case 'plus_grant': return `${a} turned Pratr Plus ${l.x} for ${u}`;
        case 'plus_expire': return `${a}’s Plus plan ended (${l.x})`;
        case 'boost_grant': return `${a} received ${l.x}`;
        case 'server_boost': return `${a} overclocked the server: ${l.x}`;
        case 'server_perk': return `${a} changed a server perk: ${l.x}`;
        case 'voice_leave': return `${a} left voice channel ${l.cn} after ${fmtDur(l.d)}`;
        default: return `${a}: ${l.ty}`;
    }
}
async function loadAudit() {
    const box = $('audit-list');
    box.textContent = 'Loading…';
    const out = await post({ action: 'audit-log', id: S.server.id, q: $('audit-filter').value });
    box.textContent = '';
    if (!out.res.ok) return void box.append(h('div', 'side-empty', out.data.error || 'Could not load the log.'));
    if (!out.data.logs.length) box.append(h('div', 'side-empty', 'Nothing logged yet.'));
    out.data.logs.forEach(l => { const r = h('div', 'logrow'); r.append(h('time', '', stamp(l.t)), h('span', '', logText(l))); box.append(r); });
}
function openAudit() {
    if (!isOwner()) return;
    $('transfer-list').classList.add('hidden');
    $('transfer-list').textContent = '';
    $('audit-transfer').classList.remove('hidden');
    openModal('modal-audit');
    loadAudit();
}
$('audit-filter').onchange = loadAudit;
function openTransfer() {
    if (!isOwner()) return;
    const box = $('transfer-list');
    box.textContent = '';
    box.classList.remove('hidden');
    const others = S.members.filter(m => S.me && m.id !== S.me.id);
    if (!others.length) { box.append(h('div', 'side-empty', 'No other members to transfer to.')); return; }
    box.append(h('div', 'side-empty', 'Pick the new owner. You stay a member but lose owner controls.'));
    others.forEach(m => {
        const r = h('div', 'logrow');
        const b = h('button', 'btn ghost sm', 'Make owner');
        b.type = 'button';
        b.onclick = async () => {
            if (!confirm(`Transfer ownership of ${S.server.name} to ${m.username}? You will lose owner controls.`)) return;
            const out = await post({ action: 'server-transfer', id: S.server.id, to: m.id });
            if (!out.res.ok) return toast(out.data.error || 'Could not transfer.', true);
            S.server.owner = out.data.owner;
            closeModals(); renderAll();
            toast(`Ownership transferred to ${out.data.username}.`);
        };
        r.append(avatar(m.username, 'sm', m.avatar), h('span', '', m.username || 'Member'), b);
        box.append(r);
    });
}
$('audit-transfer').onclick = openTransfer;
async function openVoiceTime() {
    openModal('modal-vtime');
    const box = $('vtime-list'), hist = $('vhist-list');
    box.textContent = 'Loading…'; hist.textContent = '';
    const out = await post({ action: 'voice-stats', id: S.server.id });
    box.textContent = '';
    if (out.res.ok) $('vtime-me').textContent = `You: ${fmtDur(out.data.mine.voice)} in voice across all servers · ${out.data.mine.msgs} messages sent`;
    if (!out.res.ok) box.append(h('div', 'side-empty', out.data.error || 'Could not load voice time.'));
    else if (!out.data.stats.length) box.append(h('div', 'side-empty', 'Nobody has spent time in voice yet.'));
    else out.data.stats.forEach((s, i) => {
        const r = h('div', 'logrow');
        r.append(h('b', '', `${i + 1}.`), h('span', '', `${s.username}${s.plus ? ' ✦' : ''} — ${fmtDur(s.seconds)} over ${s.sessions} session${s.sessions === 1 ? '' : 's'}`), h('time', '', `last ${stamp(s.last)}`));
        box.append(r);
    });
    const hs = await post({ action: 'voice-history', id: S.server.id });
    if (!hs.res.ok || !hs.data.sessions.length) return void hist.append(h('div', 'side-empty', hs.res.ok ? 'No sessions yet.' : (hs.data.error || 'Could not load your sessions.')));
    hs.data.sessions.forEach(x => { const r = h('div', 'logrow'); r.append(h('time', '', stamp(x.t)), h('span', '', `${x.cn || 'voice'} for ${fmtDur(x.d)}`)); hist.append(r); });
}
async function kickMember(m) {
    if (!confirm(`Kick ${m.username} from ${S.server.name}? They can rejoin with an invite.`)) return;
    const out = await post({ action: 'member-kick', id: S.server.id, to: m.id });
    if (!out.res.ok) return toast(out.data.error || 'Could not kick.', true);
    toast(`${m.username} was kicked.`); loadMembers();
}

/* ---------- overclocks & perks ---------- */
let boostData = null;
async function openBoosts() {
    if (!S.server) return;
    $('boost-msg').textContent = '';
    $('boost-msg').style.color = '';
    S.oc = true;
    renderAll();
    syncUrl();
    closeNav();
    await loadBoosts();
}
function closeBoosts() {
    if (!S.oc) return;
    S.oc = false;
    renderAll();
    syncUrl();
    $('chat-input').focus();
}
async function loadBoosts() {
    if (!S.server) return;
    const sid = S.server.id;
    const out = await post({ action: 'boost-info', id: sid });
    if (!S.server || S.server.id !== sid) return;
    if (!out.res.ok) { $('boost-sub').textContent = out.data.error || 'Could not load overclocks.'; return; }
    boostData = out.data;
    paintBoosts();
}
function pickImage(cb) {
    const inp = h('input');
    inp.type = 'file'; inp.accept = 'image/*'; inp.style.display = 'none';
    document.body.append(inp);
    inp.onchange = () => { const f = inp.files[0]; inp.remove(); if (f) cb(f); };
    inp.click();
}
function paintBoosts() {
    const d = boostData;
    if (!d) return;
    const admin = !!(S.me && S.me.admin);
    $('boost-sub').textContent = `${d.server} · overclocks are permanent and never expire`;
    $('boost-count').textContent = String(d.boosts);
    $('boost-tier').textContent = String(d.tier);
    $('boost-mine').textContent = String(d.mine);
    const locked = d.available.filter(p => p.at > d.boosts).sort((a, b) => a.at - b.at);
    const target = locked.length ? locked[0].at : Math.max(...d.available.map(p => p.at));
    $('oc-fill').style.width = Math.min(100, Math.round((d.boosts / target) * 100)) + '%';
    $('boost-next').textContent = !d.plus
        ? 'Pratr Plus gives you 2 overclocks every month. Overclocks you already own are kept forever.'
        : locked.length
            ? `Next perk: ${locked[0].n} at ${locked[0].at} overclocks — ${locked[0].at - d.boosts} more to go. You get +2 overclocks every month${d.nextBoosts ? `, next on ${plusDate(d.nextBoosts)}` : ''}.`
            : `Every perk is unlocked. You get +2 overclocks every month${d.nextBoosts ? `, next on ${plusDate(d.nextBoosts)}` : ''}.`;
    $('boost-1').disabled = d.mine < 1;
    $('boost-2').disabled = d.mine < 2;
    $('boost-1').textContent = 'Overclock ×1';
    $('boost-2').textContent = 'Overclock ×2';
    $('boost-1').title = $('boost-2').title = d.mine ? `${d.mine} available` : 'No overclocks available';

    // Admins can apply a big batch at once after topping up their own balance.
    const acts = document.querySelector('#oc-page .boost-actions');
    let big = $('boost-100');
    if (!big && acts) {
        big = h('button', 'btn ghost hidden', 'Overclock ×100');
        big.id = 'boost-100'; big.type = 'button';
        big.onclick = () => spendBoosts(100);
        acts.append(big);
    }
    if (big) { big.classList.toggle('hidden', !admin); big.disabled = d.mine < 100; big.title = admin ? `${d.mine} available` : ''; }

    const box = $('boost-perks');
    box.textContent = '';
    const on = new Set(d.perks || []), owner = d.owner === S.me?.id;
    d.available.forEach(p => {
        const unlocked = d.boosts >= p.at, active = on.has(p.k);
        const row = h('div', 'perk-row' + (unlocked ? '' : ' locked') + (active ? ' on' : ''));
        const info = h('div', 'perk-info');
        info.append(h('strong', '', p.n), h('small', '', p.d));
        const side = h('div', 'perk-side');
        const tier = h('em', 'perk-tier', `${p.at} overclock${p.at === 1 ? '' : 's'}`);
        side.append(tier);
        if (!unlocked) side.append(h('span', 'perk-lock', `${p.at - d.boosts} more`));
        else if (owner) {
            const btn = h('button', 'btn ghost sm', active ? 'Disable' : 'Enable');
            btn.type = 'button';
            btn.onclick = () => setPerk(p, !active, p.k === 'accent' ? (d.accent || ACCENTS[0]) : '');
            side.append(btn);
            if (p.k === 'accent') side.append(accentPicker(d.accent, active, (c) => setPerk(p, true, c)));
        } else side.append(h('span', active ? 'perk-on' : 'perk-off', active ? 'Enabled' : 'Available'));
        row.append(info, side);
        box.append(row);
    });

    $('boost-admin').classList.toggle('hidden', !admin);
    if (admin) { const who = $('boost-admin-user'); if (!who.value) who.value = (S.me && S.me.username) || ''; }
    renderBoostAssets(d);

    const hist = $('boost-hist');
    hist.textContent = '';
    if (!d.history.length) hist.append(h('div', 'side-empty', 'No overclocks yet. Be the first to overclock this server.'));
    else d.history.forEach(x => { const r = h('div', 'logrow'); r.append(h('time', '', stamp(x.t)), h('span', '', `Overclocked ×${x.n || 1} by ${x.by}`)); hist.append(r); });

    const grants = $('boost-grants');
    grants.textContent = '';
    if (!d.grants.length) grants.append(h('div', 'side-empty', 'Your +2 monthly overclocks will be saved here.'));
    else d.grants.forEach(x => { const r = h('div', 'logrow'); r.append(h('time', '', stamp(x.t)), h('span', '', x.x || '+2 overclocks')); grants.append(r); });
}

/* banner, logo, custom emoji and stickers — all managed here by the owner */
function renderBoostAssets(d) {
    const box = $('boost-assets');
    box.textContent = '';
    if (!d) return;
    const owner = d.owner === S.me?.id, on = new Set(d.perks || []);
    const sec = h('div', 'sec-title'); sec.append(h('span', '', 'Server art'));
    box.append(sec);
    [['banner', 'Animated banner', 2, 'Wide strip behind your server name. It pans slowly.'],
     ['logo', 'Server logo', 4, 'Square logo with a glowing ring next to your server name.']].forEach(([key, label, at, blurb]) => {
        const unlocked = d.boosts >= at, enabled = on.has(key);
        const row = h('div', 'asset-row');
        const prev = h('div', 'asset-prev' + (key === 'banner' ? ' wide' : ''));
        if (d[key]) prev.style.background = `center/cover url("${d[key]}")`; else prev.textContent = key === 'banner' ? 'No banner' : 'No logo';
        const info = h('div', 'asset-info');
        info.append(h('strong', '', label), h('small', '', enabled ? blurb : unlocked ? `${label} is unlocked — enable the perk to use it.` : `${label} unlocks at ${at} overclocks.`));
        const btns = h('div', 'asset-btns');
        if (owner && unlocked && !enabled) {
            const en = h('button', 'btn primary sm', 'Enable');
            en.type = 'button';
            en.onclick = () => setPerk({ k: key, n: label }, true);
            btns.append(en);
        }
        if (owner) {
            const up = h('button', 'btn ghost sm', 'Upload');
            up.type = 'button'; up.disabled = !enabled;
            up.onclick = () => pickImage(async (f) => {
                if (f.size > 5e6) return toast('Image must be under 5 MB.', true);
                const label0 = up.textContent; up.textContent = 'Uploading…'; up.disabled = true;
                const url = await uploadImage(f, 'servers', key === 'banner' ? 'c_fill,g_auto,w_1200,h_400' : 'c_fill,g_auto,w_256,h_256');
                up.textContent = label0; up.disabled = !enabled;
                if (!url) return;
                const out = await post({ action: 'server-asset', id: S.server.id, field: key, icon: url });
                if (!out.res.ok) return toast(out.data.error || 'Could not save.', true);
                Object.assign(S.server, out.data.server); d[key] = out.data.server[key];
                await loadServers(); renderAll(); renderBoostAssets(d);
                toast(`${label} updated.`);
            });
            btns.append(up);
            if (d[key]) {
                const rm = h('button', 'linkbtn', 'Remove'); rm.type = 'button';
                rm.onclick = async () => {
                    const out = await post({ action: 'server-asset', id: S.server.id, field: key, icon: '' });
                    if (!out.res.ok) return toast(out.data.error || 'Failed.', true);
                    Object.assign(S.server, out.data.server); d[key] = '';
                    await loadServers(); renderAll(); renderBoostAssets(d);
                    toast(`${label} removed.`);
                };
                btns.append(rm);
            }
        }
        row.append(prev, info, btns);
        box.append(row);
    });
    box.append(assetSection('Custom emoji', d.emoji || [], 'emoji', owner, d));
    box.append(assetSection('Stickers', d.stickers || [], 'sticker', owner, d));
}
function assetSection(title, list, kind, owner, d) {
    const wrap = h('div'), cap = kind === 'emoji' ? 50 : 10;
    const sec = h('div', 'sec-title');
    sec.append(h('span', '', `${title} — ${list.length}/${cap} · free`));
    wrap.append(sec);
    if (list.length) {
        const grid = h('div', 'asset-grid');
        list.forEach(x => {
            const cell = h('div', 'asset-cell');
            const img = h('img'); img.src = x.u; img.alt = x.n; img.loading = 'lazy'; img.title = kind === 'emoji' ? `:${x.n}:` : x.n;
            cell.append(img, h('small', '', kind === 'emoji' ? `:${x.n}:` : x.n));
            if (owner) {
                const rm = h('button', 'asset-x', '×'); rm.type = 'button'; rm.title = 'Remove';
                rm.onclick = async () => {
                    const out = await post({ action: `${kind}-remove`, id: S.server.id, name: x.n });
                    if (!out.res.ok) return toast(out.data.error || 'Failed.', true);
                    d.emoji = out.data.emoji; d.stickers = out.data.stickers;
                    Object.assign(S.server, { emoji: d.emoji, stickers: d.stickers });
                    renderBoostAssets(d); toast('Removed.');
                };
                cell.append(rm);
            }
            grid.append(cell);
        });
        wrap.append(grid);
    } else wrap.append(h('div', 'side-empty', `No ${title.toLowerCase()} yet.`));
    if (owner) {
        const form = h('div', 'asset-add');
        const nm = h('input');
        nm.placeholder = kind === 'emoji' ? 'emoji_name' : 'sticker_name';
        nm.maxLength = 20; nm.autocomplete = 'off'; nm.spellcheck = false;
        const add = h('button', 'btn primary sm', 'Upload + add');
        add.type = 'button';
        add.onclick = () => {
            const name = nm.value.trim().toLowerCase().replace(/[^a-z0-9_]/g, '');
            if (!name) return toast('Give it a name first (letters, numbers, underscores).', true);
            pickImage(async (f) => {
                if (f.size > 5e6) return toast('Image must be under 5 MB.', true);
                add.textContent = 'Uploading…'; add.disabled = true;
                const url = await uploadImage(f, 'servers', kind === 'emoji' ? 'c_fit,w_128,h_128' : 'c_fit,w_256,h_256');
                add.textContent = 'Upload + add'; add.disabled = false;
                if (!url) return;
                const out = await post({ action: `${kind}-add`, id: S.server.id, name, icon: url });
                if (!out.res.ok) return toast(out.data.error || 'Could not add.', true);
                d.emoji = out.data.emoji; d.stickers = out.data.stickers;
                Object.assign(S.server, { emoji: d.emoji, stickers: d.stickers });
                renderBoostAssets(d);
                toast(`${kind === 'emoji' ? 'Emoji' : 'Sticker'} added.`);
            });
        };
        form.append(nm, add);
        wrap.append(form);
    }
    return wrap;
}

function accentPicker(current, active, pick) {
    const box = h('div', 'accent-pick mini');
    ACCENTS.forEach(c => {
        const b = h('button', 'accent-swatch' + (active && current === c ? ' on' : ''));
        b.type = 'button'; b.title = c; b.style.background = c;
        b.onclick = () => pick(c);
        box.append(b);
    });
    return box;
}
async function setPerk(p, on, colour) {
    const out = await post({ action: 'server-perk', id: S.server.id, perk: p.k, on, colour: on ? (colour || '') : '' });
    if (!out.res.ok) { $('boost-msg').style.color = ''; $('boost-msg').textContent = out.data.error || 'Could not update the perk.'; return; }
    $('boost-msg').textContent = '';
    Object.assign(S.server, out.data.server);
    await loadServers();
    renderAll();
    await loadBoosts();
    toast(`${p.n} ${on ? 'enabled' : 'disabled'}.`);
}
async function spendBoosts(n) {
    if (!S.server) return;
    $('boost-msg').textContent = '';
    $('boost-msg').style.color = '';
    const out = await post({ action: 'server-boost', id: S.server.id, count: n });
    if (!out.res.ok) { $('boost-msg').textContent = out.data.error || 'Could not overclock.'; return; }
    $('boost-msg').style.color = 'var(--bone)';
    $('boost-msg').textContent = `Nice — ${n} overclock${n === 1 ? '' : 's'} added. This server now has ${out.data.boosts}.`;
    if (S.server) Object.assign(S.server, { boosts: out.data.boosts, tier: out.data.tier, perks: out.data.perks, accent: out.data.accent, banner: out.data.banner || '', logo: out.data.logo || '', emoji: out.data.emoji || [], stickers: out.data.stickers || [] });
    await refreshMe();
    await loadServers();
    renderAll();
    await loadBoosts();
    toast(`+${n} overclock${n === 1 ? '' : 's'} applied.`);
}
async function adminOverclocks(sign) {
    const u = $('boost-admin-user').value.trim() || (S.me && S.me.username);
    if (!u) return;
    const n = Math.max(1, Math.min(1000000, Math.round(Number($('boost-admin-count').value) || 100))) * sign;
    const out = await post({ action: 'flare-grant', username: u, count: n });
    if (!out.res.ok) { $('boost-msg').style.color = ''; $('boost-msg').textContent = out.data.error || 'Failed.'; return; }
    $('boost-msg').style.color = 'var(--bone)';
    $('boost-msg').textContent = `${out.data.username} now has ${out.data.boosts} overclocks (${n > 0 ? '+' : ''}${n}).`;
    const mine = S.me && (u.toLowerCase() === String(S.me.username || '').toLowerCase() || u.toLowerCase() === String(S.me.email || '').toLowerCase());
    if (mine) await refreshMe();
    await loadBoosts();
}
$('boost-1').onclick = () => spendBoosts(1);
$('boost-2').onclick = () => spendBoosts(2);
$('boost-refresh').onclick = loadBoosts;
$('boost-admin-give').onclick = () => adminOverclocks(1);
$('boost-admin-take').onclick = () => adminOverclocks(-1);

/* ---------- reactions ---------- */
const QUICK = ['👍', '❤️', '😂', '😮', '😢', '🙏', '🔥', '🎉', '👀', '💯', '😍', '🥰', '😎', '🤔', '😭', '😡', '🤯', '🥳', '👏', '🙌', '💀', '✅', '❌', '⚡'];
async function react(m, e) {
    const row = S_curMsgs.find(x => x.id === m.id) || m;
    let r = row.rx.find(x => x.e === e);
    if (r) { r.me = !r.me; r.n += r.me ? 1 : -1; if (r.n <= 0) row.rx = row.rx.filter(x => x !== r); }
    else row.rx = [...row.rx, { e, n: 1, me: true }];
    S.sig = ''; renderMessages(S_curMsgs, false); // instant local update, no network wait
    const out = await post({ action: 'react', id: m.id, text: e });
    if (!out.res.ok) { toast(out.data.error || 'Could not react.', true); S.sig = ''; loadMessages(true); } // roll back by refetching on failure
}
function reactRow(m) {
    const d = h('div', 'rxs');
    m.rx.forEach(r => { const b = h('button', 'rx' + (r.me ? ' me' : '')); b.type = 'button'; b.append(emojiArt.node(r.e, 'rx-e'), h('span', 'rx-n', String(r.n))); b.onclick = () => react(m, r.e); d.append(b); });
    return d;
}
function toolBtn(icon, title, fn) {
    const b = h('button', 'icon-btn'); b.type = 'button'; b.innerHTML = icon; b.title = title;
    b.onclick = (ev) => { ev.stopPropagation(); fn(); };
    return b;
}
function reactTools(m) {
    const t = h('div', 'msg-tools'), b = h('button', 'icon-btn');
    b.type = 'button'; b.innerHTML = ICON.smile; b.title = 'Add reaction';
    b.onclick = (ev) => {
        ev.stopPropagation();
        document.querySelectorAll('.rx-pop').forEach(x => x.remove());
        const p = h('div', 'rx-pop');
        QUICK.forEach(e => { const x = h('button', ''); x.type = 'button'; x.append(emojiArt.node(e, 'rx-e')); x.onclick = () => { p.remove(); react(m, e); }; p.append(x); });
        t.append(p);
    };
    t.append(toolBtn(ICON.reply, 'Reply', () => startReply(m)), toolBtn(ICON.forward, 'Forward', () => openForward(m)), b);
    return t;
}
document.addEventListener('click', () => document.querySelectorAll('.rx-pop').forEach(x => x.remove()));

/* ---------- forward ---------- */
async function openForward(m) {
    $('fwd-sub').textContent = `“${snip(m.text)}”`;
    const box = $('fwd-list');
    box.textContent = '';
    openModal('modal-forward');
    const dmHead = h('div', 'sec-title'); dmHead.append(h('span', '', 'Direct messages'));
    box.append(dmHead);
    if (!S.friends.length) box.append(h('div', 'side-empty', 'Add a friend to forward to a direct message.'));
    S.friends.forEach(f => {
        const b = h('button', 'fwd-item');
        b.append(userAva(f, 'sm'), h('span', '', f.username || f.email));
        b.onclick = () => forwardTo('dm', f.id, null, m);
        box.append(b);
    });
    const head = h('div', 'sec-title'); head.append(h('span', '', 'Channels'));
    box.append(head);
    for (const s of S.servers.slice(0, 20)) {
        let chans = s.id === (S.server && S.server.id) && S.chLoaded ? S.channels : null;
        if (!chans) { const out = await post({ action: 'channels', id: s.id }); if (out.res.ok) chans = out.data.channels || []; }
        (chans || []).filter(c => c.kind !== 'v').forEach(c => {
            const b = h('button', 'fwd-item');
            b.append(h('span', 'fwd-hash', '#'), h('span', '', `${s.name} — ${c.name}`));
            b.onclick = () => forwardTo('server', s.id, c.id, m);
            box.append(b);
        });
    }
    if (!box.querySelector('.fwd-item')) box.append(h('div', 'side-empty', 'No channel to forward to yet.'));
}
async function forwardTo(kind, id, channelId, m) {
    const out = await post({ action: 'send', kind, id, text: m.text, ...(kind === 'server' ? { channelId } : {}) });
    if (!out.res.ok) return toast(out.data.error || 'Could not forward.', true);
    closeModals();
    toast('Message forwarded.');
}

/* ---------- security: sessions and password ---------- */
let secData = null, secRevealed = false;
function paintSessions() {
    const sb = $('sec-sessions');
    sb.textContent = '';
    if (!secData) return;
    secData.sessions.forEach(s => {
        const r = h('div', 'logrow');
        const where = secRevealed ? [s.ip, s.place].filter(Boolean).join(' · ') || 'unknown location' : '•••.•••.•.•• — hidden';
        r.append(h('time', '', stamp(s.ls)), h('span', '', `${s.device} — ${where}${secRevealed && s.lastIp && s.lastIp !== s.ip ? ` (now ${s.lastIp})` : ''}, signed in ${stamp(s.t)}${s.current ? ' · THIS DEVICE' : ''}`));
        if (!s.current) { const b = h('button', 'btn ghost', 'Sign out'); b.type = 'button'; b.onclick = async () => { await post({ action: 'session-revoke', id: s.id }); openSecurity(true); }; r.append(b); }
        sb.append(r);
    });
}
$('sec-reveal').onclick = () => { secRevealed = !secRevealed; $('sec-reveal').textContent = secRevealed ? 'Hide IP & location' : 'Show IP & location'; paintSessions(); };
async function openSecurity(skipReset) {
    if (!skipReset) { $('sec-msg').textContent = ''; $('sec-old').value = ''; $('sec-new').value = ''; }
    const hb = $('sec-history');
    const out = await post({ action: 'security' });
    if (!out.res.ok) return void ($('sec-sessions').textContent = '', $('sec-sessions').append(h('div', 'side-empty', out.data.error || 'Could not load.')));
    secData = out.data; paintSessions();
    hb.textContent = '';
    if (!out.data.history.length) hb.append(h('div', 'side-empty', 'Nothing yet.'));
    out.data.history.forEach(l => { const r = h('div', 'logrow'); r.append(h('time', '', stamp(l.t)), h('span', '', logText({ ...l, an: 'You' }))); hb.append(r); });
}
$('sec-others').onclick = async () => { await post({ action: 'sessions-revoke-others' }); toast('Signed out everywhere else.'); openSecurity(true); };
$('sec-pw').onclick = async () => {
    const out = await post({ action: 'password-change', password: $('sec-old').value, npw: $('sec-new').value });
    $('sec-msg').style.color = out.res.ok ? 'var(--bone)' : '';
    $('sec-msg').textContent = out.res.ok ? 'Password changed. Other devices were signed out.' : (out.data.error || 'Could not change password.');
    if (out.res.ok) { $('sec-old').value = ''; $('sec-new').value = ''; }
};

/* ---------- start ---------- */
setAuthMode(true);
if (S.token) boot();
