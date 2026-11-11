'use strict';

/* ui-stats: the built-in Server overview — growth charts, live counts and leaderboards. */

async function openOverview() {
    if (!S.server) return;
    S.statsOpen = true; S.oc = false;
    renderAll();
    syncUrl();
    closeNav();
    await loadStats();
    renderMain();
}
function closeOverview() {
    if (!S.statsOpen) return;
    S.statsOpen = false;
    renderAll();
    syncUrl();
    $('chat-input').focus();
}

function renderOverview() {
    const st = S.stats || {};
    const key = [S.server && S.server.id, S.server && S.server.accent, st.day, st.members, st.online, st.voice, st.weekMsgs, st.boosts, st.tier, st.weekVoice,
        (st.series || []).length, (st.msgSeries || []).length, (st.topChatters || []).length, (st.topBoosters || []).length, (st.topVoice || []).length,
        (st.memberList || []).map(m => `${m.id}:${m.status}`).join(','), (st.activity || []).map(a => a.t).join(',')].join('|');
    paintOnce('overview', key, paintOverview);
}

function paintOverview() {
    const box = $('sp-body');
    box.textContent = '';
    const st = S.stats;
    if (!st) {
        $('sp-sub').textContent = 'Reading this server’s numbers…';
        box.append(h('div', 'stat-loading', 'Reading this server’s numbers…'));
        return;
    }
    const colour = (S.server && cleanHex(S.server.accent)) || '#ff5a4e';
    $('sp-sub').textContent = `${st.name || S.server.name} · ${st.members} member${st.members === 1 ? '' : 's'} · refreshed every 30 seconds`;

    const head = h('div', 'stat-head');
    const big = h('div', 'stat-big');
    big.append(h('span', 'stat-label', 'Members'), h('strong', '', String(st.members || 0)), h('small', '', `${st.online || 0} online now · ${st.voice || 0} in voice · ${deltaLabel(st, 'm')} in the last 30 days`));
    head.append(big);
    const actions = h('div', 'stat-head-actions');
    const chip = h('span', 'stat-live'); chip.innerHTML = '<i class="pdot on"></i>Live';
    const ocBtn = h('button', 'btn ghost sm', 'Server overclock'); ocBtn.type = 'button';
    ocBtn.innerHTML = ICON.bolt + 'Server overclock';
    ocBtn.onclick = () => openBoosts();
    actions.append(chip, ocBtn);
    head.append(actions);

    const tiles = h('div', 'stat-tiles');
    tiles.append(
        statTile('user', 'Members', st.members || 0),
        statTile('user', 'Online now', `${st.online || 0}/${st.members || 0}`),
        statTile('speaker', 'In voice', st.voice || 0),
        statTile('chat', 'Messages this week', st.weekMsgs || 0),
        statTile('bolt', 'Overclocks', st.boosts || 0),
        statTile('chart', 'Perk tier', `${st.tier || 0}/6`)
    );

    const charts = h('div', 'sp-charts');
    charts.append(
        chartCard('Member growth', series30(st, 'm'), colour, 'No members yet — the chart fills in as people join.'),
        chartCard('Messages per day', msgSeries(st), colour, 'No messages in the last 30 days.'),
        chartCard('Overclock growth', series30(st, 'o'), colour, 'No overclocks yet — overclock the server to start the line.')
    );

    const community = h('div', 'sp-community');
    community.append(memberCard(st), activityCard(st));

    const boards = h('div', 'sp-boards');
    boards.append(
        peopleCard('Top boosters this month', (st.topBoosters || []).map(b => ({ name: b.username, value: `${b.n} ✦` })), 'No overclocks this month yet.'),
        peopleCard('Most time in voice', (st.topVoice || []).map(v => ({ name: v.username, value: fmtDur(v.t || 0) })), 'No voice sessions yet.'),
        peopleCard('Top chatters this week', (st.topChatters || []).map(c => ({ name: c.username, value: `${c.n} message${c.n === 1 ? '' : 's'}` })), 'No messages this week yet.')
    );

    const foot = h('p', 'stat-foot');
    foot.append(h('span', '', `Updated ${fmtTime(Math.floor(Date.now() / 1000))} · refreshes every 30 seconds`));
    box.append(head, tiles, charts, community, boards, foot);
}

function memberCard(st) {
    const card = h('section', 'stat-card');
    const head = h('div', 'stat-card-head');
    head.append(h('h3', '', 'Members'), h('small', 'hint', `${st.members || 0} total · ${st.online || 0} online`));
    card.append(head);
    const list = [...(st.memberList || [])].sort((a, b) =>
        ((b.id === st.owner) - (a.id === st.owner)) || ((b.online ? 1 : 0) - (a.online ? 1 : 0)) ||
        String(a.username || '').localeCompare(String(b.username || ''), undefined, { sensitivity: 'base' }));
    if (!list.length) { card.append(h('p', 'hint', 'No members yet.')); return card; }
    const grid = h('div', 'sp-roster');
    list.forEach(m => {
        const row = h('button', 'sp-member');
        row.type = 'button';
        const a = userAva(m, 'sm'); a.append(dot(m.status));
        const nm = h('span', m.plus ? 'plus-name' : '', m.username || 'Member');
        nm.style.color = nameColour(m);
        nm.style.fontFamily = m.plus ? fontOf(m.nameFont) : '';
        row.append(a, nm);
        if (m.id === st.owner) row.append(h('em', 'badge', 'OWNER'));
        if (m.plus) row.append(h('em', 'badge plus', '✦'));
        row.title = [m.statusText, m.bio].filter(Boolean).join(' · ') || `Open ${m.username || 'member'}`;
        row.onclick = () => openUserCard(m);
        grid.append(row);
    });
    card.append(grid);
    return card;
}

function activityCard(st) {
    const card = h('section', 'stat-card');
    const head = h('div', 'stat-card-head');
    head.append(h('h3', '', 'Welcome & leaves'), h('small', 'hint', `${st.joinedWeek || 0} joined · ${st.leftWeek || 0} left this week`));
    card.append(head);
    const list = st.activity || [];
    if (!list.length) { card.append(h('p', 'hint', 'No joins or leaves yet — invites show up here as they happen.')); return card; }
    const feed = h('div', 'sp-events');
    list.forEach(ev => {
        const row = h('div', 'sp-event ' + (ev.type === 'join' ? 'in' : 'out'));
        row.append(
            h('span', 'sp-event-ic', ev.type === 'join' ? '+' : '−'),
            h('span', 'sp-event-name', ev.username || 'Member'),
            h('span', 'sp-event-what', ev.type === 'join' ? 'joined' : ev.type === 'kick' ? 'was removed' : 'left'),
            h('time', 'sp-event-time', ago(ev.t))
        );
        feed.append(row);
    });
    card.append(feed);
    return card;
}

function ago(t) {
    const s = Math.max(0, Math.floor(Date.now() / 1000) - (Number(t) || 0));
    if (s < 60) return 'just now';
    if (s < 3600) return `${Math.floor(s / 60)}m ago`;
    if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
    const d = Math.floor(s / 86400);
    return d === 1 ? 'yesterday' : `${d}d ago`;
}

function statTile(icon, label, value) {
    const t = h('div', 'stat-tile');
    const ic = h('span', 'stat-ic'); ic.innerHTML = ICON[icon] || ICON.chart;
    t.append(ic, h('small', '', label), h('strong', '', value == null ? '—' : String(value)));
    return t;
}

function cleanHex(c) { return /^#[0-9a-f]{6}$/i.test(String(c || '')) ? c : ''; }

/* Fill the last 30 days, carrying the newest known value forward, so growth lines are continuous. */
function series30(st, key) {
    const byDay = new Map((st.series || []).map(r => [r.d, Number(r[key]) || 0]));
    const out = [];
    let last = 0;
    for (let d = st.day - 29; d <= st.day; d++) {
        if (byDay.has(d)) last = byDay.get(d);
        out.push({ d, v: last });
    }
    return out;
}

/* Message counts are per day, so empty days are real zeros instead of carried values. */
function msgSeries(st) {
    const byDay = new Map((st.msgSeries || []).map(r => [r.d, Number(r.n) || 0]));
    const out = [];
    for (let d = st.day - 29; d <= st.day; d++) out.push({ d, v: byDay.get(d) || 0 });
    return out;
}

function deltaLabel(st, key) {
    const pts = series30(st, key);
    const start = pts[0].v, end = pts[pts.length - 1].v, diff = end - start;
    return diff > 0 ? `+${diff}` : diff < 0 ? String(diff) : 'steady';
}

function chartCard(title, pts, colour, empty) {
    const card = h('section', 'stat-card');
    card.append(h('h3', '', title));
    if (!pts.some(p => p.v > 0)) { card.append(h('p', 'hint', empty)); return card; }
    const wrap = h('div', 'spark-wrap'); wrap.innerHTML = sparkSVG(pts, colour, `${S.server.id}-${title.replace(/\W+/g, '')}`);
    const min = Math.min(...pts.map(p => p.v)), max = Math.max(...pts.map(p => p.v));
    const scale = h('div', 'spark-scale');
    scale.append(h('span', '', `${min}`), h('span', '', `${max}`));
    card.append(wrap, scale);
    return card;
}

function sparkSVG(points, colour, id) {
    const w = 600, gh = 150, pad = 10;
    const vs = points.map(p => p.v), min = Math.min(...vs), max = Math.max(...vs), span = Math.max(1, max - min);
    const px = (i) => pad + i * (w - 2 * pad) / Math.max(1, points.length - 1);
    const py = (v) => gh - pad - (v - min) / span * (gh - 2 * pad);
    const line = points.map((p, i) => `${i ? 'L' : 'M'}${px(i).toFixed(1)} ${py(p.v).toFixed(1)}`).join('');
    const area = `${line}L${px(points.length - 1).toFixed(1)} ${gh - pad}L${px(0).toFixed(1)} ${gh - pad}Z`;
    const dot = points.length - 1;
    return `<svg class="spark" viewBox="0 0 ${w} ${gh}" preserveAspectRatio="none" role="img" aria-label="growth chart">
      <defs><linearGradient id="sg-${id}" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="${colour}" stop-opacity=".38"/><stop offset="1" stop-color="${colour}" stop-opacity="0"/></linearGradient></defs>
      <path d="${area}" fill="url(#sg-${id})"/>
      <path d="${line}" fill="none" stroke="${colour}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
      <circle cx="${px(dot).toFixed(1)}" cy="${py(points[dot].v).toFixed(1)}" r="4" fill="${colour}"/>
    </svg>`;
}

function peopleCard(title, rows, empty) {
    const card = h('section', 'stat-card');
    card.append(h('h3', '', title));
    if (!rows.length) { card.append(h('p', 'hint', empty || 'Nobody yet.')); return card; }
    const list = h('div', 'stat-people');
    rows.forEach((r, i) => {
        const row = h('div', 'stat-person');
        row.append(h('em', 'stat-rank', String(i + 1)), h('span', '', r.name || 'Member'), h('strong', '', r.value));
        list.append(row);
    });
    card.append(list);
    return card;
}
