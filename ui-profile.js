'use strict';

/* ui-profile: profile settings, colour tools, audit log, overclocks, reactions, forwarding and security. Loaded last. */

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
    $('font-plus').classList.toggle('hidden', plus);
    pend.ac = plus ? (S.me?.accent || '') : '';
    pend.pg = plus ? (S.me?.glow || '') : '';
    pend.nf = plus ? (S.me?.nameFont || '') : '';
    paintAccents(plus);
    paintGlow(plus);
    paintNameFonts(plus);
    syncStatusTtl();
    pend.pf = S.me?.avatar || ''; paint('pf', $('profile-name').value);
    paintProfilePreview(plus);
    $('dev-toggle').checked = dev();
    openModal('modal-profile');
    settingsTab(tab || 'profile');
}
function syncBioCount() { $('bio-count').textContent = `${$('profile-bio').value.length}/${$('profile-bio').maxLength}`; }
function paintSwatches(boxId, active, plus, pick) {
    const box = $(boxId); box.textContent = '';
    ACCENTS.forEach(c => {
        const b = h('button', 'accent-swatch' + (active === c ? ' on' : ''), '');
        b.type = 'button'; b.title = c; b.style.background = c;
        b.style.opacity = plus ? '' : '.45';
        b.onclick = () => { if (plus) pick(active === c ? '' : c); };
        box.append(b);
    });
}
/* Every colour field gets the same 🎨 picker plus a hex box, so a shade can be typed or eyedropped. */
function paintColourTools(boxId, value, plus, pick) {
    const wrap = $(boxId); wrap.textContent = '';
    wrap.style.opacity = plus ? '' : '.45';
    const valid = /^#[0-9a-f]{6}$/i.test(value || '');
    const custom = h('label', 'colour-btn');
    custom.title = 'Pick any colour';
    custom.innerHTML = '<span class="pick-emoji" aria-hidden="true">🎨</span>';
    const inp = h('input');
    inp.type = 'color'; inp.className = 'colour-input mini';
    inp.value = valid ? value : '#5865f2'; inp.disabled = !plus;
    inp.oninput = () => { if (plus) pick(inp.value.toLowerCase()); };
    custom.append(inp);
    const hex = h('input', 'hexinput');
    hex.type = 'text'; hex.placeholder = '#5865f2'; hex.maxLength = 7; hex.autocomplete = 'off'; hex.spellcheck = false;
    hex.value = valid ? value : ''; hex.disabled = !plus;
    hex.onchange = () => {
        if (!plus) return;
        const v = hex.value.trim().toLowerCase();
        if (/^#[0-9a-f]{6}$/.test(v)) pick(v); else hex.value = valid ? value : '';
    };
    wrap.append(custom, hex);
}
function setPend(kind, colour, plus) {
    pend[kind] = colour;
    const box = kind === 'ac' ? 'accent-pick' : 'glow-pick';
    paintSwatches(box, colour, plus, (c) => setPend(kind, c, plus));
    const tools = $(kind === 'ac' ? 'accent-tools' : 'glow-tools');
    const hex = tools && tools.querySelector('.hexinput');
    if (hex) hex.value = /^#[0-9a-f]{6}$/i.test(colour || '') ? colour : '';
    if (typeof paintProfilePreview === 'function') paintProfilePreview(plus);
}
function paintAccents(plus) {
    paintSwatches('accent-pick', pend.ac, plus, (c) => setPend('ac', c, plus));
    paintColourTools('accent-tools', pend.ac, plus, (c) => setPend('ac', c, plus));
}
function paintGlow(plus) {
    paintSwatches('glow-pick', pend.pg, plus, (c) => setPend('pg', c, plus));
    paintColourTools('glow-tools', pend.pg, plus, (c) => setPend('pg', c, plus));
}
function paintNameFonts(plus) {
    const box = $('name-font-pick'); box.textContent = '';
    box.style.opacity = plus ? '' : '.45';
    [['', 'Default'], ['rounded', 'Rounded'], ['serif', 'Serif'], ['mono', 'Mono'], ['wide', 'Wide']].forEach(([k, label]) => {
        const b = h('button', 'font-opt' + ((pend.nf || '') === k ? ' on' : ''), label);
        b.type = 'button'; b.style.fontFamily = fontOf(k); b.disabled = !plus;
        b.onclick = () => { if (!plus) return; pend.nf = k; paintNameFonts(plus); paintProfilePreview(plus); };
        box.append(b);
    });
}
/* The settings modal shows the real card, so glow, accent, font and photo are visible before saving. */
function paintProfilePreview(plus) {
    const card = $('pf-preview');
    if (!card) return;
    const name = ($('profile-name').value || '').trim() || (S.me ? S.me.username : 'you');
    const bio = ($('profile-bio').value || '').trim();
    const st = ($('profile-status').value || '').trim();
    const accent = plus ? (pend.ac || '') : '';
    const glow = plus ? (pend.pg || '') : '';
    card.classList.toggle('glow', !!glow);
    if (glow) card.style.setProperty('--pg', glow); else card.style.removeProperty('--pg');
    const av = $('pfp-ava');
    av.textContent = pend.pf ? '' : ini(name);
    av.style.background = bg(pend.pf, name);
    av.classList.toggle('plus', plus && !!(glow || accent));
    if (plus && (glow || accent)) av.style.setProperty('--ac', glow || accent); else av.style.removeProperty('--ac');
    const n = $('pfp-name');
    n.textContent = name; n.className = plus ? 'plus-name' : '';
    n.style.color = plus ? ink(accent || '#ffd36b') : '';
    n.style.fontFamily = plus ? fontOf(pend.nf) : '';
    const s = $('pfp-status');
    s.textContent = st; s.classList.toggle('hidden', !st);
    s.style.color = plus && accent ? ink(accent) : '';
    const b = $('pfp-bio');
    b.textContent = bio || 'No bio yet.'; b.style.opacity = bio ? '' : '.55';
    $('pfp-stats').textContent = S.me ? `${fmtDur(S.me.voice || 0)} in voice · ${S.me.msgs || 0} messages` : '';
    $('pfp-badge').classList.toggle('hidden', !plus);
}
['profile-name', 'profile-bio', 'profile-status'].forEach(id => $(id).addEventListener('input', () => paintProfilePreview(!!(S.me && S.me.plus))));

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
    const out = await post({ action: 'profile-update', username: $('profile-name').value, avatar: pend.pf, bio: $('profile-bio').value, st: $('profile-status').value, sx: statusSeconds(), ac: plus ? (pend.ac || '') : '', pg: plus ? (pend.pg || '') : '', font: plus ? (pend.nf || '') : '' });
    if (!out.res.ok) { $('profile-msg').textContent = out.data.error || 'Could not save.'; return; }
    Object.assign(S.me, { username: out.data.username, avatar: out.data.avatar, bio: out.data.bio, statusText: out.data.statusText || '', statusUntil: out.data.statusUntil || 0, accent: out.data.accent || '', glow: out.data.glow || '', nameFont: out.data.nameFont || '' });
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
            btn.onclick = () => setPerk(p, !active, p.k === 'accent' ? (d.accent || ACCENTS[0]) : '', p.k === 'accent' ? (d.font || '') : '');
            side.append(btn);
            if (p.k === 'accent') side.append(accentPicker(d.accent, active, (c, f) => setPerk(p, true, c, f), d.font));
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

function accentPicker(current, active, pick, font) {
    const wrap = h('div', 'accent-tools');
    const box = h('div', 'accent-pick mini');
    ACCENTS.forEach(c => {
        const b = h('button', 'accent-swatch' + (active && current === c ? ' on' : ''));
        b.type = 'button'; b.title = c; b.style.background = c;
        b.onclick = () => pick(c, font || '');
        box.append(b);
    });
    const custom = h('label', 'colour-btn');
    custom.title = 'Pick any hex colour';
    custom.innerHTML = '<span class="pick-emoji" aria-hidden="true">🎨</span>';
    const inp = h('input');
    inp.type = 'color'; inp.className = 'colour-input mini';
    inp.value = /^#[0-9a-f]{6}$/i.test(current || '') ? current : '#5865f2';
    inp.oninput = () => pick(inp.value.toLowerCase(), font || '');
    custom.append(inp);
    box.append(custom);
    const hex = h('input', 'hexinput');
    hex.type = 'text'; hex.placeholder = '#5865f2'; hex.maxLength = 7; hex.autocomplete = 'off'; hex.spellcheck = false;
    hex.value = /^#[0-9a-f]{6}$/i.test(current || '') ? current : '';
    hex.onchange = () => { const v = hex.value.trim().toLowerCase(); if (/^#[0-9a-f]{6}$/.test(v)) pick(v, font || ''); else hex.value = /^#[0-9a-f]{6}$/i.test(current || '') ? current : ''; };
    wrap.append(box, hex);
    const fonts = h('div', 'font-pick');
    [['', 'Default'], ['rounded', 'Rounded'], ['serif', 'Serif'], ['mono', 'Mono'], ['wide', 'Wide']].forEach(([k, label]) => {
        const b = h('button', 'font-opt' + ((font || '') === k ? ' on' : ''), label);
        b.type = 'button'; b.style.fontFamily = fontOf(k);
        b.onclick = () => pick(current || ACCENTS[0], k);
        fonts.append(b);
    });
    wrap.append(h('small', 'font-label', 'Name font'), fonts);
    return wrap;
}
async function setPerk(p, on, colour, font) {
    const out = await post({ action: 'server-perk', id: S.server.id, perk: p.k, on, colour: on ? (colour || '') : '', font: on ? (font || '') : '' });
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
