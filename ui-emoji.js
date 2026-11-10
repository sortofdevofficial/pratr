'use strict';

/* ui-emoji: the curated emoji picker. Loaded after ui.js. */

/* ---------- emoji picker (curated set, drawn as images) ---------- */
const pop = $('emoji-pop');
// A hand-picked set of the emoji people actually use. The full Unicode table is mostly
// glyphs that a lot of systems still cannot draw, which is what made the old picker unusable.
const MAIN_EMOJI = [
    { n: 'Smileys', icon: '😀', e: '😀 😃 😄 😁 😆 😅 🤣 😂 🙂 🙃 😉 😊 😇 🥰 😍 🤩 😘 😋 😛 😜 🤪 😝 🤑 🤗 🤭 🤫 🤔 🤐 🤨 😐 😑 😶 😏 😒 🙄 😬 😌 😔 😪 🤤 😴 😷 🤒 🤕 🤢 🤮 🤧 🥵 🥶 🥴 😵 🤯 🤠 🥳 🥸 😎 🤓 🧐 😕 😟 🙁 😮 😯 😲 😳 🥺 😦 😧 😨 😰 😥 😢 😭 😱 😖 😣 😞 😓 😩 😫 🥱 😤 😡 😠 🤬 😈 👿 💀 💩 🤡 👹 👺 👻 👽 👾 🤖 😺 😸 😹 😻 😼 😽 🙀 😿 😾' },
    { n: 'People', icon: '👋', e: '👋 🤚 🖐️ ✋ 🖖 👌 🤌 🤏 ✌️ 🤞 🤟 🤘 🤙 👈 👉 👆 👇 ☝️ 👍 👎 ✊ 👊 🤛 🤜 👏 🙌 👐 🤲 🤝 🙏 ✍️ 💅 🤳 💪 🦵 🦶 👂 👃 👀 👶 🧒 👦 👧 🧑 👨 👩 🧓 👴 👵 🙍 🙎 🙅 🙆 💁 🙋 🙇 🤦 🤷 🚶 🏃 💃 🕺 🕴️ 👯 🧎 🧗 🏂 🏊 🚴 🤸 🤹 🧘 🫶 👫 👭 👬 💏 💑' },
    { n: 'Nature', icon: '🐻', e: '🐶 🐱 🐭 🐹 🐰 🦊 🐻 🐼 🐨 🐯 🦁 🐮 🐷 🐸 🐵 🐔 🐧 🐦 🐤 🦆 🦅 🦉 🦄 🐝 🦋 🐌 🐞 🐢 🐍 🐙 🦑 🦀 🐟 🐬 🐳 🦈 🐊 🐘 🦒 🦓 🦌 🐑 🐐 🐕 🐈 🐓 🐲 🌵 🎄 🌲 🌴 🌱 🌿 ☘️ 🍀 🍁 🍂 🍃 🌸 🌼 🌻 🌹 🌷 🌺 💐 🌾 🌳' },
    { n: 'Food', icon: '🍔', e: '🍏 🍎 🍐 🍊 🍋 🍌 🍉 🍇 🍓 🫐 🍒 🍑 🥭 🍍 🥥 🥝 🍅 🍆 🥑 🥦 🌽 🥕 🍞 🥐 🥨 🧀 🍖 🍗 🍔 🍟 🍕 🌭 🌮 🌯 🍜 🍣 🍤 🍦 🍩 🍪 🎂 🍰 🍫 🍬 🍿 ☕ 🍵 🍺 🍻 🥂 🍷 🍸 🥃 🧊' },
    { n: 'Travel', icon: '✈️', e: '🚗 🚕 🚙 🚌 🚎 🏎️ 🚓 🚑 🚒 🚐 🚚 🚛 🚜 🛴 🚲 🛵 🏍️ ✈️ 🚀 🛸 🚁 ⛵ 🚤 🚢 🚂 🚄 🚅 🚉 🚆 🏠 🏡 🏢 🏥 🏦 🏨 🏰 🗼 🗽 🎡 🎢 🎠 ⛲ ⛱️ 🏖️ 🏝️ 🏔️ 🌋 🗻 🏕️ 🌍 🌎 🌏 🗺️ 🧭' },
    { n: 'Activity', icon: '⚽', e: '⚽ 🏀 🏈 ⚾ 🥎 🎾 🏐 🏉 🥏 🎱 🏓 🏸 🥅 🏒 🏑 🥍 🏏 🥊 🥋 🎽 🛹 🛼 🥿 👟 🎿 ⛷️ 🏆 🥇 🥈 🥉 🎯 🎮 🕹️ 🎲 🧩 🎨 🎬 🎤 🎧 🎸 🎹 🥁 🎺 🎻 🎪 🎟️ 🎫 🎭 🩰' },
    { n: 'Objects', icon: '💡', e: '⌚ 📱 💻 ⌨️ 🖥️ 🖨️ 🖱️ 💾 💿 📀 📷 📸 📹 🎥 📞 ☎️ 📟 📠 📺 📻 🎙️ ⏰ ⏳ 💡 🔦 🕯️ 🧯 🛢️ 💸 💵 💰 💳 🧾 💎 🔧 🔨 ⚙️ 🧲 🔫 🧪 🧬 🔬 🔭 💉 💊 🩹 🚪 🛏️ 🛋️ 🧸 🖼️ 🛍️ 🎁 🎈 🎉 🎊 ✉️ 📦 📚 📖 📝 ✏️ ✒️ 🔒 🔑 🧰 🪄 🪙 🔮 🧿' },
    { n: 'Symbols', icon: '❤️', e: '❤️ 🧡 💛 💚 💙 💜 🖤 🤍 🤎 💔 ❤️‍🔥 💯 💢 💥 💫 💦 💨 💬 🗯️ 💭 💤 ⭐ 🌟 ✨ ⚡ 🔥 🌈 ☀️ 🌤️ ⛅ 🌧️ ⛈️ ❄️ ☃️ 💧 🌊 🎵 🎶 ✅ ❌ ❗ ❓ ⚠️ ♻️ 🔞 💲 ➕ ➖ ➗ 🆗 🆕 🆒 🆓 🔝 🔜 🏳️ 🏴 🏁 🚩' },
    { n: 'Flags', icon: '🏳️', e: '🇺🇸 🇬🇧 🇨🇦 🇦🇺 🇩🇪 🇫🇷 🇪🇸 🇮🇹 🇯🇵 🇰🇷 🇨🇳 🇮🇳 🇧🇷 🇲🇽 🇳🇱 🇸🇪 🇸🇬 🇿🇦 🇦🇪 🇹🇷 🇷🇺 🇺🇦 🇵🇱 🇵🇹 🇮🇪 🇳🇿 🇦🇷 🇨🇱 🇨🇴 🇵🇭 🇮🇩 🇲🇾 🇹🇭 🇻🇳 🇸🇦 🇮🇱 🇪🇬 🇳🇬 🇰🇪' }
];
const RECENT_KEY = 'emoji-recent';
let recents = [];
try { recents = (JSON.parse(localStorage.getItem(RECENT_KEY)) || []).filter(e => typeof e === 'string' && e); } catch { recents = []; }
const BASE_GROUPS = [
    { n: 'Recent', icon: '🕘', list: () => recents },
    ...MAIN_EMOJI.map(g => ({ n: g.n, icon: g.icon, list: () => g.e.split(' ') }))
];
let EMOJI_GROUPS = [...BASE_GROUPS];
let customEmoji = new Map();
function rebuildEmojiGroups() {
    const sources = [];
    if (S.server) sources.push(S.server);
    if (S.me && S.me.plus) (S.servers || []).forEach(s => { if (!S.server || s.id !== S.server.id) sources.push(s); });
    const emoji = [], stickers = [];
    customEmoji = new Map();
    sources.forEach(s => {
        (s.emoji || []).forEach(e => {
            if (!e || !e.n || !e.u) return;
            if (!customEmoji.has(e.n)) customEmoji.set(e.n, e.u);
            emoji.push({ n: e.n, u: e.u, k: 'emoji', s: s.name });
        });
        (s.stickers || []).forEach(e => { if (e && e.n && e.u) stickers.push({ n: e.n, u: e.u, k: 'sticker', s: s.name }); });
    });
    EMOJI_GROUPS = [
        ...BASE_GROUPS,
        ...(emoji.length ? [{ n: sources.length > 1 ? 'Emoji' : 'Server', icon: '🖼️', kind: 'files', list: () => emoji }] : []),
        ...(stickers.length ? [{ n: 'Stickers', icon: '🏷️', kind: 'files', list: () => stickers }] : [])
    ];
    searchAll = null;
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
    const seen = new Set(), out = [];
    EMOJI_GROUPS.forEach((g, i) => {
        if (g.n === 'Recent') return;
        groupList(i).forEach(e => {
            const key = typeof e === 'string' ? e : `${e.k}:${e.n}:${e.u}`;
            if (seen.has(key)) return;
            seen.add(key); out.push(e);
        });
    });
    return (searchAll = out);
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
function activateEmoji(e) {
    if (e && typeof e === 'object') {
        if (e.k === 'sticker') sendSticker(e.u);
        else insertText(`:${e.n}: `);
        return;
    }
    insertEmoji(e);
}
function emojiCell(e) {
    const b = h('button', 'emoji-cell');
    b.type = 'button'; b.tabIndex = -1;
    if (e && typeof e === 'object') {
        b.classList.add('cust');
        const where = e.s ? ` · ${e.s}` : '';
        b.setAttribute('aria-label', e.n);
        const img = h('img'); img.src = e.u; img.alt = e.n; img.loading = 'lazy';
        b.append(img);
        b.title = e.k === 'sticker' ? `${e.n} — sticker${where}` : `:${e.n}:${where}`;
        b.onclick = () => activateEmoji(e);
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
    const g = EMOJI_GROUPS[activeEmoji];
    const title = q ? `Results for “${emojiQuery}”` : activeEmoji === 0 ? 'Recently used' : g ? g.n : '';
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
    searchResults = q ? allEmoji().filter(e => typeof e === 'string'
        ? emojiArt.words(e).includes(q) || e === q
        : e.n.toLowerCase().includes(q) || String(e.s || '').toLowerCase().includes(q)
    ).slice(0, 200) : [];
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
    if (e.key === 'Enter' && emojiQuery && searchResults[0]) { e.preventDefault(); activateEmoji(searchResults[0]); }
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