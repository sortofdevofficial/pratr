'use strict';

/* ui-channels: the server sidebar list — grouped channels, drag-to-reorder, category rename and the server pages. */

/* Categories keep the order saved on the server, then any category that only exists on a channel is appended. */
function channelGroups() {
    const groups = new Map();
    (Array.isArray(S.cats) ? S.cats : []).forEach(n => { if (!groups.has(n)) groups.set(n, []); });
    [...S.channels].sort((a, b) => (a.order || 0) - (b.order || 0) || a.id - b.id).forEach(c => {
        const n = c.category || 'TEXT CHANNELS';
        if (!groups.has(n)) groups.set(n, []);
        groups.get(n).push(c);
    });
    return [...groups.entries()].map(([name, chans]) => ({ name, chans }));
}

/* The layout payload the server expects: [{ n: category, ids: [channelId, ...] }] in display order. */
function layoutModel() { return channelGroups().map(g => ({ n: g.name, ids: g.chans.map(c => c.id) })); }

function applyLayout(model) {
    const pos = new Map();
    model.forEach((cat, ci) => cat.ids.forEach((id, i) => pos.set(id, { category: cat.n, order: ci * 1000 + i })));
    S.channels.forEach(c => { const p = pos.get(c.id); if (p) { c.category = p.category; c.order = p.order; } });
    S.cats = model.map(c => c.n);
    paintSig.delete('side');
    paintSide();
}

async function saveLayout(model) {
    if (!S.server) return;
    const before = S.channels.map(c => ({ id: c.id, category: c.category, order: c.order })), oldCats = S.cats;
    applyLayout(model); // optimistic: the sidebar moves immediately, the server confirms right after
    const out = await post({ action: 'layout-save', id: S.server.id, cats: model });
    if (!out.res.ok) {
        S.cats = oldCats;
        before.forEach(b => { const c = S.channels.find(x => x.id === b.id); if (c) { c.category = b.category; c.order = b.order; } });
        paintSig.delete('side'); paintSide();
        return toast(out.data.error || 'Could not save the layout.', true);
    }
    S.cats = out.data.cats || model.map(c => c.n);
    (out.data.channels || []).forEach(f => { const c = S.channels.find(x => x.id === f.id); if (c) { c.category = f.category; c.order = f.order; } });
    paintSig.delete('side'); paintSide();
}

/* ---------- drag and drop ---------- */
let chDrag = null; // { kind: 'ch' | 'cat', id | name }
function clearDrop() { document.querySelectorAll('.drop-on, .drop-end, .drop-before, .drop-after').forEach(e => e.classList.remove('drop-on', 'drop-end', 'drop-before', 'drop-after')); }

function dropChannel(cat, index) {
    const d = chDrag; chDrag = null; clearDrop();
    if (!d || d.kind !== 'ch') return;
    const model = layoutModel();
    let src = null, from = -1;
    model.forEach(g => { const i = g.ids.indexOf(d.id); if (i >= 0) { src = g; from = i; } });
    if (!src) return;
    let at = index;
    if (src.n === cat && from < index) at--; // removing the dragged row first shifts every later target one left
    src.ids.splice(from, 1);
    let dest = model.find(g => g.n === cat);
    if (!dest) { dest = { n: cat, ids: [] }; model.push(dest); }
    dest.ids.splice(Math.max(0, Math.min(at, dest.ids.length)), 0, d.id);
    if (src !== dest && !src.ids.length) model.splice(model.indexOf(src), 1); // an emptied category disappears
    saveLayout(model);
}

function dropCategory(target) {
    const d = chDrag; chDrag = null; clearDrop();
    if (!d || d.kind !== 'cat' || d.name === target) return;
    const model = layoutModel();
    const from = model.findIndex(g => g.n === d.name), to = model.findIndex(g => g.n === target);
    if (from < 0 || to < 0) return;
    const [g] = model.splice(from, 1);
    model.splice(to, 0, g);
    saveLayout(model);
}

function renameCategory(name) {
    const next = (prompt('Category name', name) || '').trim().replace(/\s+/g, ' ').slice(0, 40).toUpperCase();
    if (!next || next === name) return;
    const model = layoutModel(), src = model.find(g => g.n === name);
    if (!src) return;
    const clash = model.find(g => g.n === next);
    if (clash) { clash.ids.push(...src.ids); model.splice(model.indexOf(src), 1); } // rename onto an existing category merges them
    else src.n = next;
    saveLayout(model);
}

function deleteCategory(name) {
    const g = layoutModel().find(x => x.n === name);
    if (!g) return;
    if (g.ids.length) return toast('Move its channels out before deleting the category.', true);
    if (!confirm(`Delete the empty category “${name}”?`)) return;
    saveLayout(layoutModel().filter(x => x.n !== name));
}

function newCategory() {
    const name = (prompt('New category name', 'NEW CATEGORY') || '').trim().replace(/\s+/g, ' ').slice(0, 40).toUpperCase();
    if (!name || !S.server) return;
    const model = layoutModel();
    if (model.some(g => g.n === name)) return renameCategory(name);
    model.push({ n: name, ids: [] });
    saveLayout(model);
}

function moveChannel(c, dir) {
    const model = layoutModel(), g = model.find(x => x.n === (c.category || 'TEXT CHANNELS'));
    if (!g) return;
    const i = g.ids.indexOf(c.id), j = i + dir;
    if (i < 0 || j < 0 || j >= g.ids.length) return;
    [g.ids[i], g.ids[j]] = [g.ids[j], g.ids[i]];
    saveLayout(model);
}
function moveCategory(name, dir) {
    const model = layoutModel(), i = model.findIndex(g => g.n === name), j = i + dir;
    if (i < 0 || j < 0 || j >= model.length) return;
    [model[i], model[j]] = [model[j], model[i]];
    saveLayout(model);
}

/* ---------- paint ---------- */
function channelItem(c, group, index, owner) {
    const active = c.id === S.channelId && !S.oc && !S.statsOpen;
    const it = h('div', 'ch-item' + (active ? ' active' : ''));
    it.tabIndex = 0; it.setAttribute('role', 'button');
    it.innerHTML = c.kind === 'v' ? ICON.speaker : ICON.hash;
    const un = c.kind === 't' && S.unread.channels[c.id];
    it.append(h('span', active ? '' : (un ? 'unread' : ''), c.name));
    if (un && un.pings) it.append(h('em', 'ping-badge', String(un.pings)));
    else if (un) it.append(h('i', 'unread-dot'));
    if (owner) {
        const del = h('button', 'ch-del'); del.innerHTML = ICON.trash; del.title = 'Delete channel';
        del.onclick = (e) => { e.stopPropagation(); deleteChannel(c); };
        it.append(del);
        it.draggable = true;
        it.title = 'Drag to reorder';
        it.ondragstart = (e) => {
            chDrag = { kind: 'ch', id: c.id };
            it.classList.add('dragging');
            e.dataTransfer.effectAllowed = 'move';
            try { e.dataTransfer.setData('text/plain', String(c.id)); } catch {}
        };
        it.ondragend = () => { chDrag = null; it.classList.remove('dragging'); clearDrop(); };
        it.ondragover = (e) => {
            if (!chDrag || chDrag.kind !== 'ch' || chDrag.id === c.id) return;
            e.preventDefault(); e.stopPropagation();
            const r = it.getBoundingClientRect(), after = e.clientY > r.top + r.height / 2;
            it.classList.toggle('drop-after', after);
            it.classList.toggle('drop-before', !after);
        };
        it.ondragleave = () => it.classList.remove('drop-before', 'drop-after');
        it.ondrop = (e) => {
            e.preventDefault(); e.stopPropagation();
            const r = it.getBoundingClientRect();
            dropChannel(group, index + (e.clientY > r.top + r.height / 2 ? 1 : 0));
        };
    }
    it._ctx = [
        ['Open channel', () => selectChannel(c.id)],
        ['Copy link', () => copy(location.origin + '/channels/' + S.server.id + '/' + c.id)],
        ['Copy name', () => copy(c.name)],
        ...idItem('channel', c.id),
        ...(owner ? ['-', ['Move up', () => moveChannel(c, -1)], ['Move down', () => moveChannel(c, 1)]] : []),
        ...(owner ? [['Delete channel', () => deleteChannel(c), true]] : [])
    ];
    it.onclick = () => selectChannel(c.id);
    it.onkeydown = (e) => { if (e.key === 'Enter') selectChannel(c.id); };
    return it;
}

function paintChannelList() {
    const list = $('channel-list');
    list.textContent = '';
    if (S.view !== 'server' || !S.server) return;
    const owner = isOwner(), groups = channelGroups();
    if (!groups.length) list.append(h('div', 'side-empty', 'No text channels yet.'));

    groups.forEach(g => {
        const wrap = h('div', 'ch-group');
        const head = h('div', 'sec-title ch-head');
        head.append(h('span', '', g.name));
        if (owner) {
            const rename = h('button', 'icon-btn'); rename.innerHTML = ICON.edit; rename.title = 'Rename category';
            rename.onclick = (e) => { e.stopPropagation(); renameCategory(g.name); };
            const add = h('button', 'icon-btn'); add.innerHTML = ICON.plus; add.title = `Create channel in ${g.name}`;
            add.onclick = (e) => { e.stopPropagation(); openChannelModal(g.name); };
            head.append(rename, add);
            head.draggable = true;
            head.title = 'Drag to reorder this category';
            head._ctx = [['Rename category', () => renameCategory(g.name)], ['Move up', () => moveCategory(g.name, -1)], ['Move down', () => moveCategory(g.name, 1)], '-', ['New channel here', () => openChannelModal(g.name)], ['New category', newCategory], ...(g.chans.length ? [] : ['-', ['Delete empty category', () => deleteCategory(g.name), true]])];
            head.ondragstart = (e) => {
                chDrag = { kind: 'cat', name: g.name };
                head.classList.add('dragging');
                e.dataTransfer.effectAllowed = 'move';
                try { e.dataTransfer.setData('text/plain', g.name); } catch {}
            };
            head.ondragend = () => { chDrag = null; head.classList.remove('dragging'); clearDrop(); };
            head.ondragover = (e) => { if (chDrag && chDrag.kind === 'cat' && chDrag.name !== g.name) { e.preventDefault(); head.classList.add('drop-on'); } };
            head.ondragleave = () => head.classList.remove('drop-on');
            head.ondrop = (e) => {
                e.preventDefault(); e.stopPropagation();
                if (chDrag && chDrag.kind === 'ch') return dropChannel(g.name, g.chans.length); // dropping on a header appends to that category
                dropCategory(g.name);
            };
        }
        wrap.append(head);
        g.chans.forEach((c, i) => {
            wrap.append(channelItem(c, g.name, i, owner));
            if (c.kind === 'v') (S.voice[c.id] || []).forEach(p => wrap.append(voiceRow(p)));
        });
        if (owner) {
            wrap.ondragover = (e) => { if (chDrag && chDrag.kind === 'ch') { e.preventDefault(); wrap.classList.add('drop-end'); } };
            wrap.ondragleave = (e) => { if (!wrap.contains(e.relatedTarget)) wrap.classList.remove('drop-end'); };
            wrap.ondrop = (e) => { e.preventDefault(); dropChannel(g.name, g.chans.length); };
        }
        list.append(wrap);
    });

    if (owner && groups.length) {
        const addCat = h('button', 'ghost-row');
        addCat.type = 'button';
        addCat.innerHTML = ICON.plus + '<span>New category</span>';
        addCat.title = 'Add an empty category you can drag channels into';
        addCat.onclick = newCategory;
        list.append(addCat);
    }

    const sec = h('div', 'sec-title'); sec.append(h('span', '', 'Server'));
    list.append(sec);

    const sp = h('div', 'ch-item sp-item' + (S.statsOpen ? ' active' : ''));
    sp.tabIndex = 0; sp.setAttribute('role', 'button');
    sp.innerHTML = ICON.chart;
    sp.append(h('span', '', 'Server overview'));
    if (S.stats) sp.append(h('em', 'ch-count', `${S.stats.members}`));
    sp.title = S.stats ? `${S.stats.members} members · ${S.stats.online} online right now` : 'Members, activity and growth';
    sp.onclick = () => openOverview();
    sp.onkeydown = (e) => { if (e.key === 'Enter') openOverview(); };
    list.append(sp);

    const oc = h('div', 'ch-item oc-item' + (S.oc ? ' active' : ''));
    oc.tabIndex = 0; oc.setAttribute('role', 'button');
    oc.append(h('span', 'oc-star', '✦'), h('span', '', 'Server overclock'), h('em', 'oc-count', String(S.server.boosts || 0)));
    oc.title = `${S.server.boosts || 0} overclocks · ${S.server.tier || 0} perk tiers — perks, art, free emoji and stickers`;
    oc.onclick = () => openBoosts();
    oc.onkeydown = (e) => { if (e.key === 'Enter') openBoosts(); };
    list.append(oc);
}
